import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { query } from '../db/pool.js';
import { newSecret, verifyCode, otpauthUrl, seal, unseal, newRecoveryCodes, hashRecovery } from './totp.js';
import { appendVault } from '../audit/vault.js';

/**
 * 2-step login for the super admin: password, then a 6-digit code from an authenticator app.
 * 8 single-use recovery codes are given once at setup in case the phone is lost.
 */
const CHALLENGE_TTL = '5m';
const fails = new Map(); // userId -> { n, until }

const tooMany = (id) => { const f = fails.get(String(id)); return f && f.until > Date.now(); };
const fail = (id) => {
  const k = String(id); const f = fails.get(k);
  const n = f && !(f.until && f.until <= Date.now()) ? f.n + 1 : 1;
  fails.set(k, { n, until: n >= 5 ? Date.now() + 15 * 60000 : 0 });
  return n;
};

export const twoFactorRequired = (user) => Boolean(user?.totp_enabled);

export function issueChallenge(user, JWT_SECRET) {
  return jwt.sign({ purpose: '2fa', id: String(user.id), tv: user.token_version || 0 }, JWT_SECRET, { expiresIn: CHALLENGE_TTL });
}

export function registerTwoFactorRoutes(app, { authMiddleware, asyncHandler, db, JWT_SECRET, signToken, buildSessionUser }) {
  const ipOf = (req) => req.ip;
  const vault = (req, u, action, status) => appendVault({ actorKind: 'user', actorId: u.id, actorName: u.name, actorRole: u.role, category: 'security', action, method: req.method, path: req.path, status, ip: ipOf(req), device: String(req.headers['user-agent'] || '').slice(0, 160) });

  // Step 2 of sign-in
  app.post('/api/auth/login/2fa', asyncHandler(async (req, res) => {
    let claim;
    try { claim = jwt.verify(String(req.body?.challenge || ''), JWT_SECRET); } catch { claim = null; }
    if (!claim || claim.purpose !== '2fa') return res.status(400).json({ error: 'Your sign-in expired. Enter your email and password again.', code: 'CHALLENGE_EXPIRED' });
    const user = await db.getUserById(claim.id);
    if (!user || !user.is_active || (user.token_version || 0) !== claim.tv) return res.status(400).json({ error: 'Your sign-in expired. Enter your email and password again.', code: 'CHALLENGE_EXPIRED' });
    if (tooMany(user.id)) return res.status(429).json({ error: 'Too many wrong codes. Wait 15 minutes and try again.' });

    const code = String(req.body?.code || '').trim();
    let ok = false; let usedRecovery = false;
    const secret = unseal(user.totp_secret_enc);
    if (/^\d{6}$/.test(code.replace(/\s/g, '')) && secret) {
      const step = verifyCode(secret, code, user.totp_last_step);
      if (step !== null) { ok = true; await query('UPDATE users SET totp_last_step = $1 WHERE id = $2', [step, user.id]); }
    } else if (code.length >= 8) {
      const h = hashRecovery(code);
      const list = Array.isArray(user.totp_recovery) ? user.totp_recovery : [];
      if (list.includes(h)) {
        ok = true; usedRecovery = true;
        await query('UPDATE users SET totp_recovery = $1 WHERE id = $2', [JSON.stringify(list.filter((x) => x !== h)), user.id]);
      }
    }
    if (!ok) {
      const n = fail(user.id);
      await vault(req, user, 'Wrong 2-step login code', 400);
      return res.status(400).json({ error: n >= 5 ? 'Too many wrong codes. Wait 15 minutes and try again.' : 'That code is not right. Use the newest code in your app.' });
    }
    fails.delete(String(user.id));
    await db.recordLogin(user.id);
    await vault(req, user, usedRecovery ? 'Signed in with a recovery code' : 'Passed 2-step login', 200);
    const left = usedRecovery ? (Array.isArray(user.totp_recovery) ? user.totp_recovery.length - 1 : 0) : null;
    res.json({ token: signToken(user), user: buildSessionUser(user), recoveryCodesLeft: left });
  }));

  const superOnly = (req, res, next) => (req.user?.role === 'super_admin' ? next() : res.status(403).json({ error: '2-step login is set up by the super admin only.' }));

  app.get('/api/auth/2fa', authMiddleware, superOnly, asyncHandler(async (req, res) => {
    const u = await db.getUserById(req.user.id);
    res.json({ enabled: Boolean(u.totp_enabled), recoveryCodesLeft: Array.isArray(u.totp_recovery) ? u.totp_recovery.length : 0 });
  }));

  // Start setup: new secret + QR code (not active until a code is confirmed)
  app.post('/api/auth/2fa/setup', authMiddleware, superOnly, asyncHandler(async (req, res) => {
    const u = await db.getUserById(req.user.id);
    if (u.totp_enabled) return res.status(400).json({ error: '2-step login is already on.' });
    const secret = newSecret();
    await query('UPDATE users SET totp_pending_enc = $1 WHERE id = $2', [seal(secret), u.id]);
    const url = otpauthUrl(secret, u.email);
    const qr = await QRCode.toDataURL(url, { margin: 1, width: 220, errorCorrectionLevel: 'M' });
    res.json({ qr, secret: secret.replace(/(.{4})/g, '$1 ').trim() });
  }));

  // Confirm setup with the first code: switches it on and returns recovery codes (shown once)
  app.post('/api/auth/2fa/enable', authMiddleware, superOnly, asyncHandler(async (req, res) => {
    const u = await db.getUserById(req.user.id);
    const secret = unseal(u.totp_pending_enc);
    if (!secret) return res.status(400).json({ error: 'Start the setup again.' });
    const step = verifyCode(secret, req.body?.code);
    if (step === null) return res.status(400).json({ error: 'That code is not right. Check the time on your phone and use the newest code.' });
    const codes = newRecoveryCodes();
    await query(
      `UPDATE users SET totp_secret_enc = $1, totp_pending_enc = NULL, totp_enabled = true, totp_last_step = $2, totp_recovery = $3 WHERE id = $4`,
      [seal(secret), step, JSON.stringify(codes.map(hashRecovery)), u.id]
    );
    await vault(req, u, 'Turned ON 2-step login', 200);
    res.json({ ok: true, recoveryCodes: codes });
  }));

  // Turn off: needs the account password and a current code (or a recovery code)
  app.post('/api/auth/2fa/disable', authMiddleware, superOnly, asyncHandler(async (req, res) => {
    const u = await db.getUserById(req.user.id);
    if (!u.totp_enabled) return res.json({ ok: true });
    if (!bcrypt.compareSync(String(req.body?.password || ''), u.password_hash)) return res.status(400).json({ error: 'Your password is not right.' });
    const code = String(req.body?.code || '').trim();
    const secret = unseal(u.totp_secret_enc);
    const okCode = (secret && verifyCode(secret, code) !== null) || (Array.isArray(u.totp_recovery) && u.totp_recovery.includes(hashRecovery(code)));
    if (!okCode) return res.status(400).json({ error: 'That code is not right.' });
    await query(`UPDATE users SET totp_secret_enc = NULL, totp_pending_enc = NULL, totp_enabled = false, totp_recovery = '[]'::jsonb, totp_last_step = NULL WHERE id = $1`, [u.id]);
    await vault(req, u, 'Turned OFF 2-step login', 200);
    res.json({ ok: true });
  }));

  // New recovery codes (old ones stop working)
  app.post('/api/auth/2fa/recovery', authMiddleware, superOnly, asyncHandler(async (req, res) => {
    const u = await db.getUserById(req.user.id);
    const secret = unseal(u.totp_secret_enc);
    if (!u.totp_enabled || !secret || verifyCode(secret, req.body?.code) === null) return res.status(400).json({ error: 'Enter a current code from your app.' });
    const codes = newRecoveryCodes();
    await query('UPDATE users SET totp_recovery = $1 WHERE id = $2', [JSON.stringify(codes.map(hashRecovery)), u.id]);
    await vault(req, u, 'Made new 2-step recovery codes', 200);
    res.json({ recoveryCodes: codes });
  }));
}
