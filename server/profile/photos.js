import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { query } from '../db/pool.js';
import { uploadRoot } from '../customers/storage.js';

/**
 * Profile photos for staff logins and salesmen.
 * The browser shrinks and crops the photo to a square JPEG before upload (about 30-80 KB).
 * Files get a random name and are served at /api/photos/<name>.jpg (cannot be guessed).
 */
const MAX_BYTES = 700 * 1024;
const DIR = () => path.join(uploadRoot(), 'avatars');
const NAME_RE = /^[a-f0-9]{32}\.(jpg|png|webp)$/;

export const photoUrl = (key) => (key && NAME_RE.test(key) ? `/api/photos/${key}` : null);

function decode(dataUrl) {
  const m = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!m) throw Object.assign(new Error('Send a JPG, PNG or WebP photo.'), { status: 400 });
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > MAX_BYTES) throw Object.assign(new Error('The photo is too large. Try another photo.'), { status: 400 });
  const jpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const png = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!jpg && !png && !webp) throw Object.assign(new Error('That file is not a photo.'), { status: 400 });
  return { buf, ext: jpg ? 'jpg' : png ? 'png' : 'webp' };
}

function store(dataUrl) {
  const { buf, ext } = decode(dataUrl);
  const key = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
  fs.mkdirSync(DIR(), { recursive: true });
  fs.writeFileSync(path.join(DIR(), key), buf, { mode: 0o640 });
  return key;
}
function remove(key) {
  if (key && NAME_RE.test(key)) { try { fs.unlinkSync(path.join(DIR(), key)); } catch { /* already gone */ } }
}

async function setPhoto(table, id, dataUrl) {
  const { rows } = await query(`SELECT photo_key FROM ${table} WHERE id = $1`, [id]);
  if (!rows[0]) throw Object.assign(new Error('Not found.'), { status: 404 });
  const key = dataUrl ? store(dataUrl) : null;
  await query(`UPDATE ${table} SET photo_key = $1, updated_at = now() WHERE id = $2`, [key, id]);
  remove(rows[0].photo_key);
  return photoUrl(key);
}
export const setUserPhoto = (id, dataUrl) => setPhoto('users', parseInt(id, 10), dataUrl);
export const setSalesmanPhoto = (id, dataUrl) => setPhoto('salesmen', parseInt(id, 10), dataUrl);

export function registerPhotoRoutes(app, { authMiddleware, asyncHandler, photoJsonParser }) {
  const send = (res, err) => res.status(err.status || 500).json({ error: err.status ? err.message : 'Could not save the photo.' });
  const superOnly = (req, res, next) => (req.user?.role === 'super_admin' ? next() : res.status(403).json({ error: "Only the super admin can change someone else's photo." }));

  // Serve a photo (random file name; cached for a year because a new photo gets a new name)
  app.get('/api/photos/:name', (req, res) => {
    const name = String(req.params.name || '');
    if (!NAME_RE.test(name)) return res.status(404).end();
    const full = path.join(DIR(), name);
    if (!fs.existsSync(full)) return res.status(404).end();
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type(name.split('.').pop());
    return res.sendFile(full);
  });

  // My own photo (every signed-in person)
  app.put('/api/me/photo', authMiddleware, photoJsonParser, asyncHandler(async (req, res) => {
    try { res.json({ photoUrl: await setUserPhoto(req.user.id, req.body?.photo) }); } catch (e) { send(res, e); }
  }));
  app.delete('/api/me/photo', authMiddleware, asyncHandler(async (req, res) => {
    try { await setUserPhoto(req.user.id, null); res.json({ photoUrl: null }); } catch (e) { send(res, e); }
  }));

  // Super admin: anyone's photo
  app.put('/api/users/:id/photo', authMiddleware, superOnly, photoJsonParser, asyncHandler(async (req, res) => {
    try { res.json({ photoUrl: await setUserPhoto(req.params.id, req.body?.photo) }); } catch (e) { send(res, e); }
  }));
  app.delete('/api/users/:id/photo', authMiddleware, superOnly, asyncHandler(async (req, res) => {
    try { await setUserPhoto(req.params.id, null); res.json({ photoUrl: null }); } catch (e) { send(res, e); }
  }));
  app.put('/api/salesmen/:id/photo', authMiddleware, superOnly, photoJsonParser, asyncHandler(async (req, res) => {
    try { res.json({ photoUrl: await setSalesmanPhoto(req.params.id, req.body?.photo) }); } catch (e) { send(res, e); }
  }));
  app.delete('/api/salesmen/:id/photo', authMiddleware, superOnly, asyncHandler(async (req, res) => {
    try { await setSalesmanPhoto(req.params.id, null); res.json({ photoUrl: null }); } catch (e) { send(res, e); }
  }));
}
