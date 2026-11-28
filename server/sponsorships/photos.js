/**
 * Event photos for a sponsorship event.
 *
 * The super admin makes an upload link (label, expiry date, PIN optional). Anyone with the link (and the PIN, if
 * set) can add photos from a phone or computer: they type their name, pick photos, and the photos upload one by one.
 * The phone shrinks each photo first (max 2560 px) and makes a small preview, so uploads are quick on mobile data.
 * Photos are stored on our own server (uploads/sponsorship, in the daily files backup) and listed in the CRM, where
 * the super admin can view, download one or all (ZIP), add his own, or delete.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';
import { uploadRoot } from '../customers/storage.js';
import { notify } from '../notify/notify.js';

const KEY_RE = /^[a-f0-9]{32}\.(jpg|png|webp)$/;
const MAX_FULL = 12 * 1024 * 1024;
const MAX_THUMB = 1024 * 1024;
const PIN_TRIES = 5;
const LOCK_MINUTES = 15;
const dir = () => path.join(uploadRoot(), 'sponsorship');
const url = (k) => (k && KEY_RE.test(k) ? `/api/sponsorship-files/${k}` : null);
const clean = (v, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Accept only real JPG / PNG / WebP pictures (checked by their first bytes, not by the name). */
function decodeImage(dataUrl, maxBytes) {
  const m = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > maxBytes) return null;
  const jpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const png = buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP';
  if (!jpg && !png && !webp) return null;
  return { buf, ext: jpg ? 'jpg' : png ? 'png' : 'webp' };
}
function write(img) {
  const key = `${crypto.randomBytes(16).toString('hex')}.${img.ext}`;
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(path.join(dir(), key), img.buf, { mode: 0o640 });
  return key;
}
const unlink = (k) => { if (k && KEY_RE.test(k)) { try { fs.unlinkSync(path.join(dir(), k)); } catch { /* gone */ } } };

/** Remove the files of an event's photos (when a draft event is deleted). */
export async function dropEventPhotoFiles(eventId) {
  const { rows } = await query('SELECT file_key, thumb_key FROM sponsorship_photos WHERE event_id = $1', [eventId]);
  rows.forEach((r) => { unlink(r.file_key); unlink(r.thumb_key); });
}

// Plain ZIP (photos are already compressed, so files are stored as they are)
function zipStream(res, files) {
  const central = [];
  let offset = 0;
  const dosTime = (d) => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
  const dosDate = (d) => (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
  const out = (b) => { res.write(b); offset += b.length; };
  for (const f of files) {
    const data = fs.readFileSync(f.path);
    const crc = zlib.crc32(data) >>> 0;
    const name = Buffer.from(f.name, 'utf8');
    const d = f.date || new Date();
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dosTime(d), 10); local.writeUInt16LE(dosDate(d), 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    const at = offset;
    out(local); out(name); out(data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(0, 10);
    c.writeUInt16LE(dosTime(d), 12); c.writeUInt16LE(dosDate(d), 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(data.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(at, 42);
    central.push(Buffer.concat([c, name]));
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  res.write(cd); res.end(end);
}

// Uploads per IP: at most 400 photos an hour (plenty for a whole event team)
const hits = new Map();
const uploadLimiter = (req, res, next) => {
  const ip = req.ip || 'unknown'; const now = Date.now(); const r = hits.get(ip);
  if (!r || now > r.resetAt) hits.set(ip, { n: 1, resetAt: now + 3600000 });
  else if (++r.n > 400) return res.status(429).json({ error: 'Too many uploads from this connection. Please try again later.' });
  if (hits.size > 5000) hits.clear();
  next();
};

export function registerSponsorshipPhotoRoutes(app, { authMiddleware, superAdminOnly, viewLimiter, largeJsonParser, jwtSecret, superAdmins }) {
  const admin = [authMiddleware, superAdminOnly];
  const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next))
    .catch((err) => (err?.status ? res.status(err.status).json({ error: err.message }) : next(err)));
  const fail = (status, message) => Object.assign(new Error(message), { status });
  const activity = (eventId, actor, action) => query('INSERT INTO sponsorship_activity (event_id, actor, action) VALUES ($1,$2,$3)', [eventId, clean(actor, 160), clean(action, 300)]);

  const photoOut = (p) => ({
    id: String(p.id), url: url(p.file_key), thumbUrl: url(p.thumb_key), bytes: p.bytes, width: p.width, height: p.height,
    uploaderName: p.uploader_name, uploaderPhone: p.uploader_phone || '', caption: p.caption || '', linkId: p.link_id ? String(p.link_id) : null,
    byStaff: !!p.uploaded_by_user, createdAt: p.created_at,
  });

  async function savePhoto({ eventId, linkId, body, req, userId }) {
    const full = decodeImage(body?.full, MAX_FULL);
    const thumb = decodeImage(body?.thumb, MAX_THUMB);
    if (!full || !thumb) throw fail(400, 'This file is not a photo we can take (use JPG, PNG or WebP, up to 12 MB).');
    const name = clean(body?.name, 120);
    if (name.length < 2) throw fail(400, 'Please write your name.');
    const fileKey = write(full); const thumbKey = write(thumb);
    try {
      const { rows: [p] } = await query(
        `INSERT INTO sponsorship_photos (event_id, link_id, file_key, thumb_key, bytes, width, height, uploader_name, uploader_phone, caption, ip, user_agent, uploaded_by_user)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [eventId, linkId, fileKey, thumbKey, full.buf.length, parseInt(body?.width, 10) || null, parseInt(body?.height, 10) || null, name,
          clean(body?.phone, 40), clean(body?.caption, 300), String(req.ip || '').slice(0, 64), String(req.headers['user-agent'] || '').slice(0, 300), userId || null]);
      return p;
    } catch (e) { unlink(fileKey); unlink(thumbKey); throw e; }
  }

  // ---------- Super admin ----------
  app.get('/api/sponsorships/:id(\\d+)/photos', ...admin, h(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const [{ rows: links }, { rows: photos }] = await Promise.all([
      query(`SELECT l.*, (SELECT count(*)::int FROM sponsorship_photos p WHERE p.link_id = l.id) AS photos
               FROM sponsorship_upload_links l WHERE l.event_id = $1 ORDER BY l.created_at DESC`, [id]),
      query('SELECT * FROM sponsorship_photos WHERE event_id = $1 ORDER BY created_at DESC', [id]),
    ]);
    res.json({
      links: links.map((l) => ({
        id: String(l.id), label: l.label, path: `/u/${l.token}`, hasPin: !!l.pin_hash, expiresAt: l.expires_at, photos: l.photos, maxPhotos: l.max_photos,
        active: !l.revoked_at && new Date(l.expires_at) > new Date(), revokedAt: l.revoked_at, createdAt: l.created_at,
      })),
      photos: photos.map(photoOut),
      totalBytes: photos.reduce((s, p) => s + (p.bytes || 0), 0),
    });
  }));

  app.post('/api/sponsorships/:id(\\d+)/upload-links', ...admin, h(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { rows: [e] } = await query('SELECT id, title, status, ends_at FROM sponsorship_events WHERE id = $1', [id]);
    if (!e) throw fail(404, 'Event not found.');
    if (e.status === 'cancelled') throw fail(409, 'This event is cancelled.');
    const label = clean(req.body?.label, 120) || 'Event photos';
    let expires = req.body?.expiresAt ? new Date(req.body.expiresAt) : null;
    if (!expires || Number.isNaN(expires.getTime())) expires = e.ends_at ? new Date(new Date(e.ends_at).getTime() + 7 * 86400000) : new Date(Date.now() + 30 * 86400000);
    if (expires < new Date()) throw fail(400, 'The closing date is already past.');
    const pin = req.body?.withPin ? String(crypto.randomInt(0, 1000000)).padStart(6, '0') : null;
    const token = crypto.randomBytes(24).toString('base64url');
    await query('INSERT INTO sponsorship_upload_links (event_id, token, label, pin_hash, expires_at, created_by) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, token, label, pin ? bcrypt.hashSync(pin, 10) : null, expires, req.user.id]);
    await activity(id, `${req.user.name} (super admin)`, `Made a photo upload link "${label}"${pin ? ' with a PIN' : ''}`);
    res.status(201).json({ path: `/u/${token}`, pin, label, expiresAt: expires });
  }));

  app.post('/api/sponsorship-upload-links/:lid(\\d+)/revoke', ...admin, h(async (req, res) => {
    const { rows: [l] } = await query('UPDATE sponsorship_upload_links SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL RETURNING event_id, label', [parseInt(req.params.lid, 10)]);
    if (!l) throw fail(404, 'Link not found.');
    await activity(l.event_id, `${req.user.name} (super admin)`, `Closed the photo upload link "${l.label}"`);
    res.json({ ok: true });
  }));

  app.post('/api/sponsorship-upload-links/:lid(\\d+)/pin', ...admin, h(async (req, res) => {
    const pin = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const { rowCount } = await query('UPDATE sponsorship_upload_links SET pin_hash = $1, pin_failures = 0, locked_until = NULL WHERE id = $2 AND revoked_at IS NULL', [bcrypt.hashSync(pin, 10), parseInt(req.params.lid, 10)]);
    if (!rowCount) throw fail(404, 'Link not found.');
    res.json({ pin });
  }));

  app.post('/api/sponsorships/:id(\\d+)/photos', ...admin, largeJsonParser, h(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { rows: [e] } = await query('SELECT id FROM sponsorship_events WHERE id = $1', [id]);
    if (!e) throw fail(404, 'Event not found.');
    const p = await savePhoto({ eventId: id, linkId: null, body: { ...req.body, name: req.body?.name || req.user.name }, req, userId: req.user.id });
    res.status(201).json(photoOut(p));
  }));

  app.delete('/api/sponsorship-photos/:pid(\\d+)', ...admin, h(async (req, res) => {
    const { rows: [p] } = await query('DELETE FROM sponsorship_photos WHERE id = $1 RETURNING *', [parseInt(req.params.pid, 10)]);
    if (!p) throw fail(404, 'Photo not found.');
    unlink(p.file_key); unlink(p.thumb_key);
    await activity(p.event_id, `${req.user.name} (super admin)`, `Deleted a photo from ${p.uploader_name}`);
    res.json({ ok: true });
  }));

  app.get('/api/sponsorships/:id(\\d+)/photos.zip', ...admin, h(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { rows: [e] } = await query('SELECT title FROM sponsorship_events WHERE id = $1', [id]);
    if (!e) throw fail(404, 'Event not found.');
    const { rows } = await query('SELECT * FROM sponsorship_photos WHERE event_id = $1 ORDER BY created_at', [id]);
    if (!rows.length) throw fail(404, 'No photos yet.');
    const total = rows.reduce((s, r) => s + r.bytes, 0);
    if (total > 3.5 * 1024 ** 3) throw fail(413, 'Too many photos for one ZIP. Download them in smaller groups.');
    const safe = (s) => String(s).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'photo';
    const files = rows.filter((r) => fs.existsSync(path.join(dir(), r.file_key))).map((r, i) => ({
      path: path.join(dir(), r.file_key), date: new Date(r.created_at),
      name: `${String(i + 1).padStart(3, '0')}-${safe(r.uploader_name)}.${r.file_key.split('.').pop()}`,
    }));
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safe(e.title)}-photos.zip"`);
    res.setHeader('Cache-Control', 'no-store');
    zipStream(res, files);
  }));

  // ---------- The upload link (no CRM login) ----------
  const byToken = async (t) => {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(t || ''))) return null;
    const { rows: [l] } = await query(
      `SELECT l.*, e.title, e.poster_key, e.banner_key, e.status AS event_status, e.starts_at, e.venue,
              (SELECT count(*)::int FROM sponsorship_photos p WHERE p.link_id = l.id) AS photos
         FROM sponsorship_upload_links l JOIN sponsorship_events e ON e.id = l.event_id WHERE l.token = $1`, [t]);
    return l || null;
  };
  const closedReason = (l) => (!l ? 'This link is not valid.' : l.revoked_at ? 'This upload link has been closed.' : new Date(l.expires_at) < new Date() ? 'This upload link has expired.' : l.event_status === 'cancelled' ? 'This event was cancelled.' : '');
  const sessionOk = (req, l) => {
    if (!l.pin_hash) return true;
    const t = String(req.headers.authorization || '').replace(/^Bearer /, '');
    try { const p = jwt.verify(t, jwtSecret, { audience: 'spup' }); return p.l === l.id && p.v === l.pin_hash.slice(-12); } catch { return false; }
  };
  const pageInfo = (l, req) => ({
    title: l.title, label: l.label, venue: l.venue || '', startsAt: l.starts_at, posterUrl: url(l.poster_key), bannerUrl: url(l.banner_key),
    needsPin: !!l.pin_hash, unlocked: sessionOk(req, l), expiresAt: l.expires_at, room: Math.max(0, l.max_photos - l.photos),
  });

  app.get('/api/up/:token', viewLimiter, h(async (req, res) => {
    const l = await byToken(req.params.token);
    const why = closedReason(l);
    if (why) return res.status(l ? 410 : 404).json({ error: why, bannerUrl: l ? url(l.banner_key) : null });
    res.json(pageInfo(l, req));
  }));

  app.post('/api/up/:token/unlock', viewLimiter, h(async (req, res) => {
    const l = await byToken(req.params.token);
    const why = closedReason(l);
    if (why) throw fail(l ? 410 : 404, why);
    if (!l.pin_hash) return res.json({ ...pageInfo(l, req), unlocked: true });
    if (l.locked_until && new Date(l.locked_until) > new Date()) throw fail(429, `Too many wrong PINs. Try again in ${LOCK_MINUTES} minutes.`);
    const pin = String(req.body?.pin || '').replace(/\D/g, '');
    if (pin.length !== 6 || !bcrypt.compareSync(pin, l.pin_hash)) {
      const n = l.pin_failures + 1; const lock = n >= PIN_TRIES;
      await query('UPDATE sponsorship_upload_links SET pin_failures = $1, locked_until = $2 WHERE id = $3', [lock ? 0 : n, lock ? new Date(Date.now() + LOCK_MINUTES * 60000) : null, l.id]);
      throw fail(lock ? 429 : 401, lock ? `Too many wrong PINs. The link is locked for ${LOCK_MINUTES} minutes.` : `Wrong PIN. ${PIN_TRIES - n} tr${PIN_TRIES - n === 1 ? 'y' : 'ies'} left.`);
    }
    await query('UPDATE sponsorship_upload_links SET pin_failures = 0, locked_until = NULL WHERE id = $1', [l.id]);
    const session = jwt.sign({ l: l.id, v: l.pin_hash.slice(-12) }, jwtSecret, { audience: 'spup', expiresIn: '12h' });
    res.json({ ...pageInfo(l, req), unlocked: true, session });
  }));

  app.post('/api/up/:token/photos', uploadLimiter, largeJsonParser, h(async (req, res) => {
    const l = await byToken(req.params.token);
    const why = closedReason(l);
    if (why) throw fail(l ? 410 : 404, why);
    if (!sessionOk(req, l)) throw fail(401, 'Please enter the PIN again.');
    if (l.photos >= l.max_photos) throw fail(409, 'This link has reached its photo limit. Ask Monipack for a new link.');
    const name = clean(req.body?.name, 120);
    const { rows: recent } = await query("SELECT 1 FROM sponsorship_photos WHERE link_id = $1 AND lower(uploader_name) = lower($2) AND created_at > now() - interval '2 hours' LIMIT 1", [l.id, name]);
    const p = await savePhoto({ eventId: l.event_id, linkId: l.id, body: req.body, req });
    if (!recent.length) {
      await activity(l.event_id, name, `Started uploading photos (link "${l.label}")`);
      notify(await superAdmins(), { kind: 'sponsorship', title: `Photos arriving: ${l.title}`, body: `${name} is uploading event photos.`, link: 'sponsorships' });
    }
    res.status(201).json({ id: String(p.id), thumbUrl: url(p.thumb_key) });
  }));
}
