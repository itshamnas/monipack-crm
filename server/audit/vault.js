import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, getClient } from '../db/pool.js';

/**
 * Audit vault.
 *  - recordMiddleware: after every request that changes something (and every sensitive download,
 *    login and link session), one row is appended to vault_log. Nobody is skipped, super admin included.
 *  - Rows are hash-chained (SHA-256 of previous hash + row), and the table refuses UPDATE / DELETE.
 *  - The vault is readable only by a super admin who also enters the vault password
 *    (stored as a bcrypt hash in app_secrets). Unlocks give a 15-minute vault token.
 */

const VAULT_TTL = '15m';
const SECRET_FIELDS = /pass(word)?|pin|token|secret|session|authorization|base64|content|data$|image|file/i;
const ZERO = '0'.repeat(64);

// ---------- what happened, in plain words ----------
const RULES = [
  ['POST', /^\/api\/auth\/login$/, 'security', (r) => (r.ok ? 'Signed in' : 'Failed sign-in attempt')],
  ['POST', /^\/api\/auth\/change-password$/, 'security', () => 'Changed own password'],
  ['POST', /^\/api\/users$/, 'staff', () => 'Created a staff login'],
  ['PATCH', /^\/api\/users\/[^/]+\/password$/, 'security', () => 'Reset a staff password'],
  ['PATCH', /^\/api\/users\/[^/]+$/, 'staff', () => 'Changed a staff login'],
  ['DELETE', /^\/api\/users\/[^/]+$/, 'staff', () => 'Deleted a staff login'],
  ['POST', /^\/api\/leads$/, 'leads', () => 'Created a lead'],
  ['PATCH', /^\/api\/leads\/[^/]+$/, 'leads', (r) => (r.body?.status ? `Moved a lead to "${r.body.status}"` : 'Edited a lead')],
  ['DELETE', /^\/api\/leads\/purge-all$/, 'danger', () => 'Purged all leads'],
  ['DELETE', /^\/api\/leads\/[^/]+$/, 'leads', () => 'Deleted a lead'],
  ['POST', /^\/api\/leads\/[^/]+\/activity$/, 'leads', () => 'Added a note / activity to a lead'],
  ['POST', /^\/api\/leads\/bulk-import$/, 'leads', () => 'Imported leads'],
  ['POST', /^\/api\/quotations$/, 'quotations', () => 'Created a quotation'],
  ['PUT', /^\/api\/quotations\/[^/]+$/, 'quotations', () => 'Edited a quotation'],
  ['POST', /^\/api\/quotations\/[^/]+\/status$/, 'quotations', (r) => `Marked a quotation "${r.body?.status || ''}"`],
  ['DELETE', /^\/api\/quotations\/[^/]+$/, 'quotations', () => 'Deleted a quotation'],
  ['POST', /^\/api\/customers$/, 'customers', () => 'Created a customer'],
  ['PATCH', /^\/api\/customers\/[^/]+$/, 'customers', () => 'Edited a customer'],
  ['DELETE', /^\/api\/customers\/[^/]+$/, 'customers', () => 'Deleted a customer'],
  ['POST', /^\/api\/customers\/[^/]+\/approve$/, 'customers', () => 'Approved a customer'],
  ['POST', /^\/api\/customers\/[^/]+\/lock$/, 'customers', () => 'Locked / unlocked a customer'],
  ['POST', /^\/api\/customers\/[^/]+\/files$/, 'customers', () => 'Uploaded a customer document'],
  ['POST', /^\/api\/customers\/import$/, 'customers', () => 'Imported customers'],
  ['POST', /^\/api\/customers\/merge$/, 'customers', () => 'Merged duplicate customers'],
  ['POST', /^\/api\/customers\/transfer$/, 'customers', () => 'Moved customers to another salesman'],
  ['POST', /^\/api\/salesmen$/, 'salesmen', () => 'Created a salesman'],
  ['PATCH', /^\/api\/salesmen\/[^/]+$/, 'salesmen', () => 'Changed a salesman'],
  ['DELETE', /^\/api\/salesmen\/[^/]+$/, 'danger', () => 'Deleted a salesman'],
  ['POST', /^\/api\/salesmen\/[^/]+\/link$/, 'salesmen', (r) => `Salesman link: ${r.body?.action || 'PIN changed'}`],
  ['POST', /^\/api\/tasks$/, 'tasks', () => 'Created a task'],
  ['PATCH', /^\/api\/tasks\/[^/]+$/, 'tasks', (r) => (r.body?.status ? `Task marked "${r.body.status}"` : 'Edited a task')],
  ['DELETE', /^\/api\/tasks\/[^/]+$/, 'tasks', () => 'Deleted a task'],
  ['POST', /^\/api\/tasks\/[^/]+\/comments$/, 'tasks', () => 'Commented on a task'],
  ['POST', /^\/api\/products/, 'settings', () => 'Changed products'],
  ['PATCH', /^\/api\/products/, 'settings', () => 'Edited a product'],
  ['DELETE', /^\/api\/products/, 'settings', () => 'Deleted a product'],
  ['PATCH', /^\/api\/settings$/, 'settings', () => 'Changed company settings'],
  ['POST', /^\/api\/settings\//, 'settings', () => 'Added a setting (branch / category / stage)'],
  ['PATCH', /^\/api\/settings\//, 'settings', () => 'Changed a setting (branch / stage)'],
  ['DELETE', /^\/api\/settings\//, 'settings', () => 'Removed a setting (branch / category / stage)'],
  ['PUT', /^\/api\/sales-targets$/, 'settings', () => 'Changed sales targets'],
  ['POST', /^\/api\/customer-fields$/, 'settings', () => 'Added a customer form field'],
  ['PATCH', /^\/api\/customer-fields\/[^/]+$/, 'settings', () => 'Changed a customer form field'],
  ['POST', /^\/api\/admin\/cleanup$/, 'danger', () => 'Ran data cleanup (deleted data)'],
  ['POST', /^\/api\/link\/[^/]+\/session$/, 'link', (r) => (r.ok ? 'Salesman opened his link' : 'Wrong PIN on a salesman link')],
  ['POST', /^\/api\/link\/[^/]+\/customers$/, 'link', () => 'Salesman added a customer (link)'],
  ['POST', /^\/api\/link\/[^/]+\/customers\/[^/]+\/(complete|submit)$/, 'link', () => 'Salesman filled customer details (link)'],
  ['POST', /^\/api\/link\/[^/]+\/customers\/[^/]+\/files$/, 'link', () => 'Salesman uploaded a document (link)'],
  ['POST', /^\/api\/link\/[^/]+\/leads\/[^/]+$/, 'link', () => 'Salesman updated a lead (link)'],
  ['POST', /^\/api\/link\/[^/]+\/tasks\/[^/]+$/, 'link', () => 'Salesman updated a task (link)'],
  // Sensitive reads
  ['GET', /^\/api\/backup$/, 'export', () => 'Downloaded a full database snapshot'],
  ['GET', /^\/api\/data-centre(\.xlsx)?$/, 'export', () => 'Downloaded Data Centre export'],
  ['GET', /^\/api\/customers\/export$/, 'export', () => 'Exported customers'],
  ['GET', /^\/api\/leads\/export$/, 'export', () => 'Exported leads'],
  ['GET', /^\/api\/customers\/[^/]+\/documents\.pdf$/, 'export', () => 'Downloaded customer documents PDF'],
  ['GET', /^\/api\/customers\/[^/]+\/files\/[^/]+(\/pdf)?$/, 'export', () => 'Opened a customer document'],
  ['GET', /^\/api\/audit-logs$/, 'security', () => 'Viewed the audit trail'],
];

const cleanPath = (p) => String(p || '').replace(/^\/api\/link\/[^/]+/, '/api/link/•••').slice(0, 300);

function redact(value, depth = 0) {
  if (value == null || depth > 3) return undefined;
  if (Array.isArray(value)) return value.length > 10 ? `[${value.length} items]` : value.map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_FIELDS.test(k)) { out[k] = '•••'; continue; }
      const r = redact(v, depth + 1);
      if (r !== undefined) out[k] = r;
    }
    return out;
  }
  if (typeof value === 'string') return value.length > 200 ? `${value.slice(0, 200)}…` : value;
  return value;
}

const device = (ua = '') => {
  const s = String(ua);
  const os = /Android/i.test(s) ? 'Android' : /iPhone|iPad|iOS/i.test(s) ? 'iPhone/iPad' : /Windows/i.test(s) ? 'Windows' : /Mac OS/i.test(s) ? 'Mac' : /Linux/i.test(s) ? 'Linux' : 'Other';
  const br = /Edg\//.test(s) ? 'Edge' : /Chrome\//.test(s) ? 'Chrome' : /Firefox\//.test(s) ? 'Firefox' : /Safari\//.test(s) ? 'Safari' : 'App';
  return `${br} on ${os}`;
};

// ---------- append with hash chain ----------
// Canonical JSON (sorted keys) so the hash is the same after Postgres JSONB reorders keys
const canon = (v) => (v === null || typeof v !== 'object' ? JSON.stringify(v ?? null)
  : Array.isArray(v) ? `[${v.map(canon).join(',')}]`
  : `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`);
const rowHash = (prev, r) => crypto.createHash('sha256').update(prev + canon([r.at, r.actor_kind, r.actor_id, r.actor_name, r.actor_role, r.category, r.action, r.method, r.path, r.status, r.ip, r.device, r.details])).digest('hex');

export async function appendVault(entry) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(424242)');
    const last = await client.query('SELECT hash FROM vault_log ORDER BY id DESC LIMIT 1');
    const prev = last.rows[0]?.hash || ZERO;
    const r = {
      at: new Date().toISOString(),
      actor_kind: entry.actorKind || 'user', actor_id: entry.actorId != null ? String(entry.actorId) : null,
      actor_name: entry.actorName ? String(entry.actorName).slice(0, 160) : null, actor_role: entry.actorRole || null,
      category: entry.category || 'other', action: String(entry.action || '').slice(0, 500),
      method: entry.method || null, path: entry.path || null, status: entry.status ?? null,
      ip: entry.ip ? String(entry.ip).slice(0, 64) : null, device: entry.device || null,
      details: entry.details && Object.keys(entry.details).length ? entry.details : null,
    };
    const hash = rowHash(prev, r);
    await client.query(
      `INSERT INTO vault_log (at, actor_kind, actor_id, actor_name, actor_role, category, action, method, path, status, ip, device, details, prev_hash, hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [r.at, r.actor_kind, r.actor_id, r.actor_name, r.actor_role, r.category, r.action, r.method, r.path, r.status, r.ip, r.device, r.details ? JSON.stringify(r.details) : null, prev, hash]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[vault] could not record:', err.message);
  } finally {
    client.release();
  }
}

/** Express middleware: record every change and every sensitive read, after the response is sent. */
export function recordMiddleware(req, res, next) {
  // These record themselves with clearer wording
  if (!req.path.startsWith('/api/') || /^\/api\/(vault|backup\/|auth\/2fa|auth\/login\/2fa|notifications)/.test(req.path)) return next();
  const rule = RULES.find(([m, re]) => m === req.method && re.test(req.path));
  const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (!rule && !isWrite) return next();
  res.on('finish', async () => {
    const ok = res.statusCode < 400;
    if (!ok && res.statusCode === 404 && !rule) return; // unknown endpoints are not interesting
    const u = req.user; const sm = req.linkSalesman;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const ctx = { ok, body };
    const [, , category, label] = rule || [null, null, 'other', () => `${req.method} ${cleanPath(req.path)}`];
    let action = label(ctx);
    if (!ok && !/^(Failed|Wrong)/.test(action)) action = `${action} (refused: ${res.statusCode})`;
    const details = redact(body) || {};
    const id = req.path.match(/\/api\/[a-z-]+\/(\d+)/)?.[1];
    if (id) details.recordId = id;
    if (req.method === 'POST' && /^\/api\/auth\/login$/.test(req.path)) {
      for (const k of Object.keys(details)) if (k !== 'email') delete details[k];
    }
    // A successful sign-in: show the person's name and role, not just the email typed
    let signedIn = null;
    if (ok && req.method === 'POST' && req.path === '/api/auth/login' && body.email) {
      try {
        const { rows } = await query('SELECT id, name, role FROM users WHERE lower(email) = lower($1) AND archived_at IS NULL LIMIT 1', [String(body.email).trim()]);
        signedIn = rows[0] || null;
      } catch { signedIn = null; }
    }
    if (signedIn) {
      return appendVault({ actorKind: 'user', actorId: signedIn.id, actorName: signedIn.name, actorRole: signedIn.role, category, action, method: req.method, path: cleanPath(req.path), status: res.statusCode, ip: req.ip, device: device(req.headers['user-agent']), details });
    }
    return appendVault({
      actorKind: u ? 'user' : sm ? 'link' : 'anonymous',
      actorId: u?.id ?? sm?.id ?? null,
      actorName: u?.name || (sm ? `${sm.name} (link)` : (body.email ? String(body.email) : 'Not signed in')),
      actorRole: u?.role || (sm ? 'salesman_link' : null),
      category, action, method: req.method, path: cleanPath(req.path), status: res.statusCode,
      ip: req.ip, device: device(req.headers['user-agent']), details,
    });
  });
  next();
}

// ---------- vault routes ----------
const unlockFails = new Map(); // userId -> { n, until }

async function vaultHash() {
  const { rows } = await query("SELECT value_hash FROM app_secrets WHERE key = 'vault_password'");
  return rows[0]?.value_hash || null;
}

export function registerVaultRoutes(app, { authMiddleware, asyncHandler, JWT_SECRET }) {
  const superOnly = (req, res, next) => (req.user?.role === 'super_admin' ? next() : res.status(403).json({ error: 'Only the super admin can open the vault.' }));
  const who = (req) => ({ actorKind: 'user', actorId: req.user.id, actorName: req.user.name, actorRole: req.user.role, ip: req.ip, device: device(req.headers['user-agent']) });
  const vaultGuard = (req, res, next) => {
    try {
      const t = jwt.verify(String(req.headers['x-vault-token'] || ''), JWT_SECRET);
      if (t.purpose !== 'vault' || String(t.uid) !== String(req.user.id)) throw new Error('bad');
      return next();
    } catch {
      return res.status(423).json({ error: 'The vault is locked. Enter the vault password.', code: 'VAULT_LOCKED' });
    }
  };

  app.post('/api/vault/unlock', authMiddleware, superOnly, asyncHandler(async (req, res) => {
    const key = String(req.user.id);
    const f = unlockFails.get(key);
    if (f && f.until > Date.now()) {
      return res.status(429).json({ error: `Too many wrong passwords. Try again in ${Math.ceil((f.until - Date.now()) / 60000)} minutes.` });
    }
    const hash = await vaultHash();
    const ok = Boolean(hash) && bcrypt.compareSync(String(req.body?.password || ''), hash);
    if (!ok) {
      const n = (f && f.until <= Date.now() ? 0 : f?.n || 0) + 1;
      unlockFails.set(key, { n, until: n >= 5 ? Date.now() + 15 * 60000 : 0 });
      await appendVault({ ...who(req), category: 'security', action: 'Wrong vault password', method: 'POST', path: '/api/vault/unlock', status: 400 });
      return res.status(400).json({ error: n >= 5 ? 'Too many wrong passwords. The vault is locked for 15 minutes.' : 'Wrong vault password.' });
    }
    unlockFails.delete(key);
    await appendVault({ ...who(req), category: 'security', action: 'Opened the audit vault', method: 'POST', path: '/api/vault/unlock', status: 200 });
    res.json({ token: jwt.sign({ purpose: 'vault', uid: String(req.user.id) }, JWT_SECRET, { expiresIn: VAULT_TTL }), expiresInSec: 15 * 60 });
  }));

  app.get('/api/vault/log', authMiddleware, superOnly, vaultGuard, asyncHandler(async (req, res) => {
    const where = []; const p = [];
    const { q, category, actor, from, to } = req.query;
    if (q) { p.push(`%${String(q).slice(0, 80)}%`); where.push(`(action ILIKE $${p.length} OR actor_name ILIKE $${p.length} OR path ILIKE $${p.length} OR ip ILIKE $${p.length} OR details::text ILIKE $${p.length})`); }
    if (category) { p.push(String(category)); where.push(`category = $${p.length}`); }
    if (actor) { p.push(String(actor)); where.push(`(actor_kind || ':' || COALESCE(actor_id, '')) = $${p.length}`); }
    if (from && !Number.isNaN(Date.parse(from))) { p.push(new Date(from).toISOString()); where.push(`at >= $${p.length}`); }
    if (to && !Number.isNaN(Date.parse(to))) { const d = new Date(to); d.setHours(23, 59, 59, 999); p.push(d.toISOString()); where.push(`at <= $${p.length}`); }
    const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit, 10) || 200));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [{ rows }, { rows: cnt }] = await Promise.all([
      query(`SELECT id, at, actor_kind, actor_id, actor_name, actor_role, category, action, method, path, status, ip, device, details FROM vault_log ${w} ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`, p),
      query(`SELECT COUNT(*)::int AS n FROM vault_log ${w}`, p),
    ]);
    if (limit >= 1000) await appendVault({ ...who(req), category: 'export', action: `Downloaded the vault report (${rows.length} entries)`, method: 'GET', path: '/api/vault/log', status: 200 });
    res.json({ total: cnt[0].n, rows });
  }));

  app.get('/api/vault/summary', authMiddleware, superOnly, vaultGuard, asyncHandler(async (req, res) => {
    const { rows } = await query(`
      SELECT
        (SELECT COUNT(*)::int FROM vault_log) AS total,
        (SELECT COUNT(*)::int FROM vault_log WHERE at >= date_trunc('day', now())) AS today,
        (SELECT COUNT(DISTINCT actor_kind || COALESCE(actor_id,''))::int FROM vault_log WHERE at >= date_trunc('day', now()) AND actor_kind <> 'anonymous') AS people_today,
        (SELECT COUNT(*)::int FROM vault_log WHERE at >= now() - interval '7 days' AND (action LIKE 'Failed sign-in%' OR action LIKE 'Wrong%')) AS failed_week,
        (SELECT COUNT(*)::int FROM vault_log WHERE at >= now() - interval '7 days' AND category IN ('danger','export')) AS sensitive_week`);
    const actors = await query(`SELECT actor_kind || ':' || COALESCE(actor_id,'') AS key, MAX(actor_name) AS name, MAX(actor_role) AS role, COUNT(*)::int AS n
      FROM vault_log WHERE actor_kind <> 'anonymous' GROUP BY 1 ORDER BY n DESC LIMIT 100`);
    res.json({ ...rows[0], actors: actors.rows });
  }));

  // Recompute the whole chain: proves nothing was edited or removed
  app.get('/api/vault/verify', authMiddleware, superOnly, vaultGuard, asyncHandler(async (req, res) => {
    let prev = ZERO; let n = 0; let lastId = 0; let broken = null;
    for (;;) {
      const { rows } = await query('SELECT * FROM vault_log WHERE id > $1 ORDER BY id LIMIT 5000', [lastId]);
      if (!rows.length) break;
      for (const r of rows) {
        const rec = { ...r, at: new Date(r.at).toISOString() };
        if (r.prev_hash !== prev || rowHash(prev, rec) !== r.hash) { broken = { id: r.id, at: r.at }; break; }
        prev = r.hash; n++; lastId = r.id;
      }
      if (broken) break;
    }
    await appendVault({ ...who(req), category: 'security', action: broken ? `Vault check FAILED at entry #${broken.id}` : `Vault check passed (${n} entries)`, method: 'GET', path: '/api/vault/verify', status: 200 });
    res.json({ ok: !broken, checked: n, broken });
  }));

  app.post('/api/vault/password', authMiddleware, superOnly, vaultGuard, asyncHandler(async (req, res) => {
    const { current, next: nextPw } = req.body || {};
    const hash = await vaultHash();
    if (!hash || !bcrypt.compareSync(String(current || ''), hash)) return res.status(400).json({ error: 'Current vault password is wrong.' });
    if (!nextPw || String(nextPw).length < 8) return res.status(400).json({ error: 'New vault password must be at least 8 characters.' });
    await query("UPDATE app_secrets SET value_hash = $1, updated_at = now() WHERE key = 'vault_password'", [bcrypt.hashSync(String(nextPw), 12)]);
    await appendVault({ ...who(req), category: 'security', action: 'Changed the vault password', method: 'POST', path: '/api/vault/password', status: 200 });
    res.json({ ok: true });
  }));
}
