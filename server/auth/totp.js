import crypto from 'crypto';

/**
 * Time-based one-time codes (RFC 6238, the same codes Google Authenticator / Microsoft Authenticator show).
 * The shared secret is encrypted at rest with AES-256-GCM using a key derived from JWT_SECRET.
 */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf) {
  let bits = 0; let value = 0; let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0; let value = 0; const out = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const newSecret = () => base32Encode(crypto.randomBytes(20));

function hotp(secret, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const off = h[h.length - 1] & 15;
  const code = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 1000000).padStart(6, '0');
}

export const stepNow = (t = Date.now()) => Math.floor(t / 30000);
export const codeAt = (secret, step) => hotp(secret, step);

/** Returns the matched time step (to block reuse) or null. Accepts one step of clock drift either way. */
export function verifyCode(secret, code, lastStep = null) {
  const c = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  const now = stepNow();
  for (const s of [now, now - 1, now + 1]) {
    if (lastStep != null && s <= Number(lastStep)) continue;
    const a = Buffer.from(hotp(secret, s)); const b = Buffer.from(c);
    if (crypto.timingSafeEqual(a, b)) return s;
  }
  return null;
}

export function otpauthUrl(secret, account, issuer = 'Monipack CRM') {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// ---- encryption at rest ----
const key = () => crypto.createHash('sha256').update(`totp:${process.env.JWT_SECRET || 'dev'}`).digest();
export function seal(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return `${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${enc.toString('base64')}`;
}
export function unseal(blob) {
  if (!blob) return null;
  try {
    const [iv, tag, enc] = String(blob).split('.').map((x) => Buffer.from(x, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch { return null; }
}

// ---- recovery codes ----
export function newRecoveryCodes(n = 8) {
  return Array.from({ length: n }, () => {
    const s = crypto.randomBytes(5).toString('hex').toUpperCase();
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}
export const hashRecovery = (code) => crypto.createHash('sha256').update(String(code).toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex');
