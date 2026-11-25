/**
 * Sponsorship confirmations.
 *
 * The super admin prepares an event Monipack co-sponsors with partner brands (details, poster, banner,
 * money split, materials, terms), then makes personal links:
 *   1. the Monipack Managing Director's link  -> Approve, or Request changes
 *   2. after the MD approves: one link per partner brand representative -> Approve, or Request changes
 * Each link is different, carries the person's name and designation, and opens only with its own 6-digit PIN.
 * An approval needs a ticked agreement, the typed full name and a drawn signature, and is tied to the exact
 * version (SHA-256 fingerprint) the person saw. Decisions are stored once and never changed.
 * Editing after any approval issues a new version that everyone approves again. When all have approved, the
 * event is locked. Every decision notifies the super admins (bell).
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool, { query } from '../db/pool.js';
import { uploadRoot } from '../customers/storage.js';
import { notify } from '../notify/notify.js';
import { DEFAULT_TERMS } from './terms.js';

const PIN_TRIES = 5;
const LOCK_MINUTES = 15;
const SESSION_HOURS = 2;
const FILE_RE = /^[a-f0-9]{32}\.(jpg|png|webp)$/;
const MATERIAL_SUGGESTIONS = ['Roll-up banner', 'Video screening', 'Kiosk', 'Counter', 'Backdrop / stage branding', 'Flyers', 'Product samples', 'Social media posts', 'Standee', 'Giveaways'];

const clean = (v, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanText = (v, max = 20000) => String(v ?? '').replace(/\r/g, '').trim().slice(0, max);
const money = (v) => Math.round((Number(v) || 0) * 1000) / 1000;
const fileUrl = (key) => (key && FILE_RE.test(key) ? `/api/sponsorship-files/${key}` : null);
const dir = () => path.join(uploadRoot(), 'sponsorship');
const isoOrNull = (v) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };

function saveImage(dataUrl) {
  const m = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw Object.assign(new Error('Please choose a JPG, PNG or WebP picture.'), { status: 400 });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 8 * 1024 * 1024) throw Object.assign(new Error('Picture is too large (max 8 MB).'), { status: 400 });
  const ext = m[1] === 'png' ? 'png' : m[1] === 'webp' ? 'webp' : 'jpg';
  const key = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(path.join(dir(), key), buf, { mode: 0o640 });
  return key;
}
async function dropImage(key) {
  if (!key || !FILE_RE.test(key)) return;
  const { rows } = await query('SELECT 1 FROM sponsorship_events WHERE poster_key = $1 OR banner_key = $1 LIMIT 1', [key]);
  if (!rows.length) { try { fs.unlinkSync(path.join(dir(), key)); } catch { /* gone */ } }
}

/** Split the total by share; the last party absorbs rounding so the amounts always add up to the total. */
export function splitAmounts(total, parties) {
  const t = money(total);
  let used = 0;
  return parties.map((p, i) => {
    const amount = i === parties.length - 1 ? money(t - used) : money((t * Number(p.share_pct ?? p.sharePct ?? 0)) / 100);
    used = money(used + amount);
    return amount;
  });
}

async function loadEvent(id, client = { query }) {
  const { rows: [e] } = await client.query('SELECT * FROM sponsorship_events WHERE id = $1', [id]);
  if (!e) return null;
  const [{ rows: parties }, { rows: materials }] = await Promise.all([
    client.query('SELECT * FROM sponsorship_parties WHERE event_id = $1 ORDER BY sort, id', [id]),
    client.query('SELECT * FROM sponsorship_materials WHERE event_id = $1 ORDER BY sort, id', [id]),
  ]);
  return { e, parties, materials };
}

/** The content people approve. Same content = same fingerprint. */
function fingerprintOf({ e, parties, materials }) {
  const body = {
    title: e.title, poster: e.poster_key || '', audience: e.audience, audienceNote: e.audience_note, venue: e.venue,
    address: e.venue_address, map: e.map_url, coordinator: [e.coordinator_name, e.coordinator_phone],
    starts: e.starts_at ? new Date(e.starts_at).toISOString() : '', ends: e.ends_at ? new Date(e.ends_at).toISOString() : '',
    timeNote: e.time_note, promotion: e.promotion, total: money(e.total_amount).toFixed(3), currency: e.currency, terms: e.terms,
    parties: parties.map((p) => [p.kind, p.company, Number(p.share_pct).toFixed(3)]),
    materials: materials.map((m) => [m.name, m.qty, m.provided_by, m.note]),
  };
  return crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

function docOf({ e, parties, materials }) {
  const amounts = splitAmounts(e.total_amount, parties);
  return {
    id: String(e.id),
    title: e.title,
    posterUrl: fileUrl(e.poster_key),
    bannerUrl: fileUrl(e.banner_key),
    audience: e.audience || '',
    audienceNote: e.audience_note || '',
    venue: e.venue || '',
    venueAddress: e.venue_address || '',
    mapUrl: e.map_url || '',
    coordinatorName: e.coordinator_name || '',
    coordinatorPhone: e.coordinator_phone || '',
    startsAt: e.starts_at, endsAt: e.ends_at, timeNote: e.time_note || '',
    promotion: e.promotion || '',
    totalAmount: money(e.total_amount), currency: e.currency,
    terms: e.terms || '',
    parties: parties.map((p, i) => ({ id: String(p.id), kind: p.kind, company: p.company, sharePct: Number(p.share_pct), amount: amounts[i] })),
    materials: materials.map((m) => ({ id: String(m.id), name: m.name, qty: m.qty, providedBy: m.provided_by || '', note: m.note || '' })),
    status: e.status, version: e.version, fingerprint: e.fingerprint,
    approvedAt: e.approved_at, cancelledAt: e.cancelled_at, cancelNote: e.cancel_note || '',
    createdAt: e.created_at, updatedAt: e.updated_at,
  };
}

async function activity(client, eventId, actor, action) {
  await client.query('INSERT INTO sponsorship_activity (event_id, actor, action) VALUES ($1, $2, $3)', [eventId, clean(actor, 160), clean(action, 300)]);
}

/** Latest decision per active link for the current version. */
async function decisionsNow(client, eventId, version) {
  const { rows } = await client.query(
    `SELECT DISTINCT ON (d.link_id) d.link_id, d.decision, d.created_at, d.typed_name, d.comment
       FROM sponsorship_decisions d WHERE d.event_id = $1 AND d.version = $2
      ORDER BY d.link_id, d.created_at DESC`, [eventId, version]);
  return new Map(rows.map((r) => [String(r.link_id), r]));
}

/** Work out the event status from the links and the decisions on the current version. */
async function recompute(client, eventId) {
  const { rows: [e] } = await client.query('SELECT * FROM sponsorship_events WHERE id = $1 FOR UPDATE', [eventId]);
  if (!e || e.status === 'cancelled' || e.status === 'approved') return e?.status;
  const { rows: links } = await client.query("SELECT * FROM sponsorship_links WHERE event_id = $1 AND status <> 'revoked'", [eventId]);
  const { rows: brandParties } = await client.query("SELECT id FROM sponsorship_parties WHERE event_id = $1 AND kind = 'brand'", [eventId]);
  const dec = await decisionsNow(client, eventId, e.version);
  for (const l of links) {
    const d = dec.get(String(l.id));
    const st = d ? d.decision : 'pending';
    if (st !== l.status) await client.query('UPDATE sponsorship_links SET status = $1 WHERE id = $2', [st, l.id]);
    l.status = st;
  }
  const md = links.find((l) => l.role === 'md');
  let status;
  if (!md) status = 'draft';
  else if (md.status === 'changes_requested') status = 'changes_requested';
  else if (md.status !== 'approved') status = 'md_pending';
  else {
    const brandLinks = links.filter((l) => l.role === 'brand');
    if (brandLinks.some((l) => l.status === 'changes_requested')) status = 'changes_requested';
    else if (brandParties.length && brandParties.every((p) => brandLinks.some((l) => String(l.party_id) === String(p.id) && l.status === 'approved'))) status = 'approved';
    else if (!brandParties.length) status = 'approved';
    else status = 'brand_pending';
  }
  if (status !== e.status) {
    await client.query(`UPDATE sponsorship_events SET status = $1::varchar, approved_at = CASE WHEN $1::varchar = 'approved' THEN now() ELSE approved_at END, updated_at = now() WHERE id = $2`, [status, eventId]);
  }
  return status;
}

async function superAdmins() {
  const { rows } = await query("SELECT id FROM users WHERE role = 'super_admin' AND archived_at IS NULL AND is_active");
  return rows.map((r) => r.id);
}

function readEventBody(b) {
  return {
    title: clean(b.title, 200),
    audience: clean(b.audience, 120),
    audienceNote: clean(b.audienceNote, 300),
    venue: clean(b.venue, 200),
    venueAddress: clean(b.venueAddress, 300),
    mapUrl: clean(b.mapUrl, 600),
    coordinatorName: clean(b.coordinatorName, 120),
    coordinatorPhone: clean(b.coordinatorPhone, 40),
    startsAt: isoOrNull(b.startsAt),
    endsAt: isoOrNull(b.endsAt),
    timeNote: clean(b.timeNote, 200),
    promotion: cleanText(b.promotion, 5000),
    totalAmount: money(b.totalAmount),
    terms: cleanText(b.terms, 30000),
    parties: (Array.isArray(b.parties) ? b.parties : []).slice(0, 12).map((p) => ({
      id: p.id ? parseInt(p.id, 10) : null, kind: p.kind === 'monipack' ? 'monipack' : 'brand', company: clean(p.company, 200), sharePct: Math.round((Number(p.sharePct) || 0) * 1000) / 1000,
    })),
    materials: (Array.isArray(b.materials) ? b.materials : []).slice(0, 60).map((m) => ({
      name: clean(m.name, 120), qty: Math.max(1, Math.min(9999, parseInt(m.qty, 10) || 1)), providedBy: clean(m.providedBy, 200), note: clean(m.note, 300),
    })).filter((m) => m.name),
  };
}

function validateEvent(v) {
  if (v.title.length < 3) return 'Write the event name.';
  if (v.mapUrl && !/^https:\/\//i.test(v.mapUrl)) return 'The map link must start with https://';
  if (v.startsAt && v.endsAt && new Date(v.endsAt) < new Date(v.startsAt)) return 'The end time is before the start time.';
  if (v.totalAmount < 0) return 'The amount cannot be negative.';
  const mp = v.parties.filter((p) => p.kind === 'monipack');
  if (mp.length !== 1) return 'Keep Monipack as one of the parties.';
  if (v.parties.some((p) => p.company.length < 2)) return 'Every party needs a company name.';
  if (v.parties.some((p) => p.sharePct < 0 || p.sharePct > 100)) return 'Each share must be between 0 and 100%.';
  const sum = v.parties.reduce((s, p) => s + p.sharePct, 0);
  if (Math.abs(sum - 100) > 0.01) return `The shares add up to ${Math.round(sum * 1000) / 1000}%. They must add up to 100%.`;
  return null;
}

async function writeEvent(client, id, v) {
  await client.query(
    `UPDATE sponsorship_events SET title=$1, audience=$2, audience_note=$3, venue=$4, venue_address=$5, map_url=$6,
       coordinator_name=$7, coordinator_phone=$8, starts_at=$9, ends_at=$10, time_note=$11, promotion=$12,
       total_amount=$13, terms=$14, updated_at=now() WHERE id=$15`,
    [v.title, v.audience, v.audienceNote, v.venue, v.venueAddress, v.mapUrl, v.coordinatorName, v.coordinatorPhone,
      v.startsAt, v.endsAt, v.timeNote, v.promotion, v.totalAmount, v.terms, id]);
  // Parties: keep ids (links point at them), add new, remove dropped (only those without links)
  const { rows: existing } = await client.query('SELECT id FROM sponsorship_parties WHERE event_id = $1', [id]);
  const keep = new Set();
  for (const [i, p] of v.parties.entries()) {
    if (p.id && existing.some((x) => x.id === p.id)) {
      await client.query('UPDATE sponsorship_parties SET kind=$1, company=$2, share_pct=$3, sort=$4 WHERE id=$5', [p.kind, p.company, p.sharePct, i, p.id]);
      keep.add(p.id);
    } else {
      const { rows: [n] } = await client.query('INSERT INTO sponsorship_parties (event_id, kind, company, share_pct, sort) VALUES ($1,$2,$3,$4,$5) RETURNING id', [id, p.kind, p.company, p.sharePct, i]);
      keep.add(n.id);
    }
  }
  for (const x of existing) {
    if (keep.has(x.id)) continue;
    const { rows: hasLink } = await client.query("SELECT 1 FROM sponsorship_links WHERE party_id = $1 AND status <> 'revoked' LIMIT 1", [x.id]);
    if (hasLink.length) throw Object.assign(new Error('Remove that brand\'s approval link first, then remove the brand.'), { status: 409 });
    await client.query('DELETE FROM sponsorship_parties WHERE id = $1', [x.id]);
  }
  await client.query('DELETE FROM sponsorship_materials WHERE event_id = $1', [id]);
  for (const [i, m] of v.materials.entries()) {
    await client.query('INSERT INTO sponsorship_materials (event_id, name, qty, provided_by, note, sort) VALUES ($1,$2,$3,$4,$5,$6)', [id, m.name, m.qty, m.providedBy, m.note, i]);
  }
}

/** After any content change: new fingerprint; if anyone had decided on this version, start a new version. */
async function afterContentChange(client, id, actor) {
  const full = await loadEvent(id, client);
  const fp = fingerprintOf(full);
  if (fp === full.e.fingerprint) return false;
  const { rows: decided } = await client.query('SELECT 1 FROM sponsorship_decisions WHERE event_id = $1 AND version = $2 LIMIT 1', [id, full.e.version]);
  if (decided.length) {
    await client.query('UPDATE sponsorship_events SET version = version + 1, fingerprint = $1 WHERE id = $2', [fp, id]);
    await activity(client, id, actor, `Updated the details: version ${full.e.version + 1} needs everyone's approval again`);
  } else {
    await client.query('UPDATE sponsorship_events SET fingerprint = $1 WHERE id = $2', [fp, id]);
  }
  await recompute(client, id);
  return true;
}

const tx = async (fn) => {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const r = await fn(client); await client.query('COMMIT'); return r; }
  catch (err) { await client.query('ROLLBACK').catch(() => {}); throw err; }
  finally { client.release(); }
};

async function adminView(id) {
  const full = await loadEvent(id);
  if (!full) return null;
  const doc = docOf(full);
  const [{ rows: links }, { rows: decisions }, { rows: acts }] = await Promise.all([
    query('SELECT * FROM sponsorship_links WHERE event_id = $1 ORDER BY created_at', [id]),
    query('SELECT * FROM sponsorship_decisions WHERE event_id = $1 ORDER BY created_at', [id]),
    query('SELECT * FROM sponsorship_activity WHERE event_id = $1 ORDER BY created_at DESC LIMIT 200', [id]),
  ]);
  return {
    ...doc,
    links: links.map((l) => ({
      id: String(l.id), role: l.role, partyId: l.party_id ? String(l.party_id) : null, personName: l.person_name, designation: l.designation || '', phone: l.phone || '',
      path: `/s/${l.token}`, status: l.status, openedAt: l.opened_at, lastSeenAt: l.last_seen_at, lockedUntil: l.locked_until && new Date(l.locked_until) > new Date() ? l.locked_until : null,
      createdAt: l.created_at, revokedAt: l.revoked_at,
    })),
    decisions: decisions.map((d) => ({
      id: String(d.id), linkId: String(d.link_id), decision: d.decision, version: d.version, fingerprint: d.fingerprint, typedName: d.typed_name || '',
      signature: d.signature || '', comment: d.comment || '', ip: d.ip || '', userAgent: d.user_agent || '', createdAt: d.created_at,
    })),
    activity: acts.map((a) => ({ actor: a.actor, action: a.action, at: a.created_at })),
  };
}

/** Every hour: tell the super admins about links waiting 2+ days for an answer (at most once every 2 days each). */
export async function remindPending() {
  const { rows } = await query(`
    SELECT l.id, l.person_name, l.designation, l.opened_at, e.title, e.version
      FROM sponsorship_links l JOIN sponsorship_events e ON e.id = l.event_id
     WHERE l.status = 'pending' AND e.status IN ('md_pending','brand_pending')
       AND l.created_at < now() - interval '2 days'
       AND (l.reminded_at IS NULL OR l.reminded_at < now() - interval '2 days')
       AND NOT (l.role = 'brand' AND e.status = 'md_pending')`);
  if (!rows.length) return 0;
  const admins = await superAdmins();
  for (const r of rows) {
    await notify(admins, { kind: 'sponsorship', title: `Still waiting: ${r.title}`, body: `${r.person_name} (${r.designation}) has ${r.opened_at ? 'opened but not answered' : 'not opened'} the approval link yet.`, link: 'sponsorships' });
    await query('UPDATE sponsorship_links SET reminded_at = now() WHERE id = $1', [r.id]);
  }
  return rows.length;
}
let reminderTimer = null;
export function startSponsorshipReminders() {
  if (reminderTimer || process.env.NODE_ENV === 'test') return;
  reminderTimer = setInterval(() => remindPending().catch((e) => console.error('[sponsorship reminders]', e.message)), 60 * 60 * 1000);
  reminderTimer.unref?.();
}

const makePin = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const makeToken = () => crypto.randomBytes(24).toString('base64url'); // 32 characters, different for every person

export function registerSponsorshipRoutes(app, { authMiddleware, superAdminOnly, viewLimiter, largeJsonParser, jwtSecret }) {
  const admin = [authMiddleware, superAdminOnly];
  // Our own errors (with a status) are safe to show; anything else goes to the central handler
  const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next))
    .catch((err) => (err?.status ? res.status(err.status).json({ error: err.message, code: err.code }) : next(err)));
  const actor = (req) => `${req.user?.name || 'Super admin'} (super admin)`;

  // ---------- Files (random names; images only) ----------
  app.get('/api/sponsorship-files/:name', (req, res) => {
    const name = String(req.params.name || '');
    if (!FILE_RE.test(name)) return res.status(404).end();
    const full = path.join(dir(), name);
    if (!fs.existsSync(full)) return res.status(404).end();
    res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type(name.split('.').pop());
    fs.createReadStream(full).pipe(res);
  });

  // ---------- Super admin ----------
  app.get('/api/sponsorships/meta', ...admin, asyncHandler(async (req, res) => {
    const { rows } = await query("SELECT value FROM settings WHERE key = 'sponsorship_terms_default'");
    const saved = rows[0]?.value?.text;
    res.json({ defaultTerms: saved || DEFAULT_TERMS, builtInTerms: DEFAULT_TERMS, materials: MATERIAL_SUGGESTIONS });
  }));
  app.put('/api/sponsorships/meta/terms', ...admin, asyncHandler(async (req, res) => {
    const text = cleanText(req.body?.text, 30000);
    if (text.length < 20) return res.status(400).json({ error: 'The terms are too short.' });
    await query(`INSERT INTO settings (key, value) VALUES ('sponsorship_terms_default', $1)
                 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [JSON.stringify({ text })]);
    res.json({ ok: true });
  }));

  app.get('/api/sponsorships', ...admin, asyncHandler(async (req, res) => {
    const { rows } = await query(`
      SELECT e.*,
        (SELECT json_agg(json_build_object('kind', p.kind, 'company', p.company, 'sharePct', p.share_pct) ORDER BY p.sort, p.id) FROM sponsorship_parties p WHERE p.event_id = e.id) AS parties,
        (SELECT json_agg(json_build_object('role', l.role, 'name', l.person_name, 'status', l.status) ORDER BY l.created_at) FROM sponsorship_links l WHERE l.event_id = e.id AND l.status <> 'revoked') AS links
      FROM sponsorship_events e ORDER BY COALESCE(e.starts_at, e.created_at) DESC, e.id DESC`);
    res.json(rows.map((e) => ({
      id: String(e.id), title: e.title, posterUrl: fileUrl(e.poster_key), venue: e.venue, startsAt: e.starts_at, endsAt: e.ends_at,
      totalAmount: money(e.total_amount), currency: e.currency, status: e.status, version: e.version,
      parties: (e.parties || []).map((p) => ({ ...p, sharePct: Number(p.sharePct) })), links: e.links || [], updatedAt: e.updated_at,
    })));
  }));

  app.get('/api/sponsorships/:id(\\d+)', ...admin, asyncHandler(async (req, res) => {
    const v = await adminView(parseInt(req.params.id, 10));
    if (!v) return res.status(404).json({ error: 'Event not found.' });
    res.json(v);
  }));

  app.post('/api/sponsorships', ...admin, asyncHandler(async (req, res) => {
    const body = { ...req.body };
    if (!Array.isArray(body.parties) || !body.parties.length) body.parties = [{ kind: 'monipack', company: 'Monipack (Morooj Nizwa International LLC)', sharePct: 100 }];
    if (!cleanText(body.terms)) {
      const { rows } = await query("SELECT value FROM settings WHERE key = 'sponsorship_terms_default'");
      body.terms = rows[0]?.value?.text || DEFAULT_TERMS;
    }
    const v = readEventBody(body);
    const bad = validateEvent(v);
    if (bad) return res.status(400).json({ error: bad });
    const id = await tx(async (c) => {
      const { rows: [e] } = await c.query('INSERT INTO sponsorship_events (title, created_by) VALUES ($1, $2) RETURNING id', [v.title, req.user.id]);
      await writeEvent(c, e.id, v);
      await activity(c, e.id, actor(req), 'Created the event');
      await afterContentChange(c, e.id, actor(req));
      return e.id;
    });
    res.status(201).json(await adminView(id));
  }));

  app.put('/api/sponsorships/:id(\\d+)', ...admin, asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { rows: [e] } = await query('SELECT status FROM sponsorship_events WHERE id = $1', [id]);
    if (!e) return res.status(404).json({ error: 'Event not found.' });
    if (e.status === 'approved') return res.status(409).json({ error: 'Everyone has approved this event, so it is locked and cannot be changed.' });
    if (e.status === 'cancelled') return res.status(409).json({ error: 'This event is cancelled.' });
    const v = readEventBody(req.body || {});
    const bad = validateEvent(v);
    if (bad) return res.status(400).json({ error: bad });
    await tx(async (c) => {
      await writeEvent(c, id, v);
      const changed = await afterContentChange(c, id, actor(req));
      if (changed) await activity(c, id, actor(req), 'Edited the details');
    });
    res.json(await adminView(id));
  }));

  app.put('/api/sponsorships/:id(\\d+)/image', ...admin, largeJsonParser, asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const kind = req.body?.kind === 'banner' ? 'banner' : 'poster';
    const { rows: [e] } = await query('SELECT status, poster_key, banner_key FROM sponsorship_events WHERE id = $1', [id]);
    if (!e) return res.status(404).json({ error: 'Event not found.' });
    if (kind === 'poster' && ['approved', 'cancelled'].includes(e.status)) return res.status(409).json({ error: 'This event is locked.' });
    const key = req.body?.dataUrl ? saveImage(req.body.dataUrl) : null;
    const col = kind === 'banner' ? 'banner_key' : 'poster_key';
    const old = e[col];
    await tx(async (c) => {
      await c.query(`UPDATE sponsorship_events SET ${col} = $1, updated_at = now() WHERE id = $2`, [key, id]);
      await activity(c, id, actor(req), `${key ? 'Changed' : 'Removed'} the ${kind === 'banner' ? 'header banner' : 'event image'}`);
      if (kind === 'poster') await afterContentChange(c, id, actor(req)); // the banner is an advert, not part of the agreement
    });
    await dropImage(old);
    res.json(await adminView(id));
  }));

  app.post('/api/sponsorships/:id(\\d+)/cancel', ...admin, asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const note = clean(req.body?.note, 300);
    const { rowCount } = await query("UPDATE sponsorship_events SET status = 'cancelled', cancelled_at = now(), cancel_note = $1, updated_at = now() WHERE id = $2 AND status <> 'cancelled'", [note, id]);
    if (!rowCount) return res.status(404).json({ error: 'Event not found or already cancelled.' });
    await query("UPDATE sponsorship_links SET status = 'revoked', revoked_at = now() WHERE event_id = $1 AND status <> 'revoked' AND status <> 'approved'", [id]);
    await activity({ query }, id, actor(req), `Cancelled the event${note ? `: ${note}` : ''}`);
    res.json(await adminView(id));
  }));

  app.delete('/api/sponsorships/:id(\\d+)', ...admin, asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { rows: d } = await query('SELECT 1 FROM sponsorship_decisions WHERE event_id = $1 LIMIT 1', [id]);
    if (d.length) return res.status(409).json({ error: 'Someone has already responded to this event, so it is kept as a record. Cancel it instead.' });
    const { rows: [e] } = await query('DELETE FROM sponsorship_events WHERE id = $1 RETURNING poster_key, banner_key', [id]);
    if (!e) return res.status(404).json({ error: 'Event not found.' });
    await dropImage(e.poster_key); await dropImage(e.banner_key);
    res.json({ ok: true });
  }));

  // Copy an event (for a similar event): details, split, materials and terms; no links, no responses
  app.post('/api/sponsorships/:id(\\d+)/duplicate', ...admin, asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const full = await loadEvent(id);
    if (!full) return res.status(404).json({ error: 'Event not found.' });
    const d = docOf(full);
    const v = readEventBody({ ...d, title: `${d.title} (copy)`.slice(0, 200), parties: d.parties.map(({ id: _x, ...p }) => p) });
    const newId = await tx(async (c) => {
      const { rows: [e] } = await c.query('INSERT INTO sponsorship_events (title, created_by) VALUES ($1, $2) RETURNING id', [v.title, req.user.id]);
      await writeEvent(c, e.id, v);
      await activity(c, e.id, actor(req), `Copied from "${d.title}"`);
      await afterContentChange(c, e.id, actor(req));
      return e.id;
    });
    res.status(201).json(await adminView(newId));
  }));

  // Personal links (the PIN is shown once; make a new one any time)
  app.post('/api/sponsorships/:id(\\d+)/links', ...admin, asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const role = req.body?.role === 'brand' ? 'brand' : 'md';
    const personName = clean(req.body?.personName, 120);
    const designation = clean(req.body?.designation, 120);
    const phone = clean(req.body?.phone, 40);
    if (personName.length < 2) return res.status(400).json({ error: 'Write the person\'s name.' });
    if (designation.length < 2) return res.status(400).json({ error: 'Write the person\'s designation.' });
    const pin = makePin();
    const out = await tx(async (c) => {
      const { rows: [e] } = await c.query('SELECT * FROM sponsorship_events WHERE id = $1 FOR UPDATE', [id]);
      if (!e) throw Object.assign(new Error('Event not found.'), { status: 404 });
      if (['approved', 'cancelled'].includes(e.status)) throw Object.assign(new Error('This event is closed.'), { status: 409 });
      let partyId = null;
      if (role === 'md') {
        const { rows: [p] } = await c.query("SELECT id FROM sponsorship_parties WHERE event_id = $1 AND kind = 'monipack'", [id]);
        partyId = p?.id || null;
        const { rows: has } = await c.query("SELECT 1 FROM sponsorship_links WHERE event_id = $1 AND role = 'md' AND status <> 'revoked'", [id]);
        if (has.length) throw Object.assign(new Error('The Managing Director already has a link. Remove it first to make a new one.'), { status: 409 });
      } else {
        partyId = parseInt(req.body?.partyId, 10);
        const { rows: [p] } = await c.query("SELECT id, company FROM sponsorship_parties WHERE id = $1 AND event_id = $2 AND kind = 'brand'", [partyId, id]);
        if (!p) throw Object.assign(new Error('Choose which partner brand this link is for.'), { status: 400 });
        if (e.status !== 'brand_pending' && e.status !== 'changes_requested') throw Object.assign(new Error('The Managing Director must approve first. Then you can make the brand\'s link.'), { status: 409 });
        const { rows: [md] } = await c.query("SELECT status FROM sponsorship_links WHERE event_id = $1 AND role = 'md' AND status <> 'revoked'", [id]);
        if (md?.status !== 'approved') throw Object.assign(new Error('The Managing Director must approve this version first.'), { status: 409 });
        const { rows: has } = await c.query("SELECT 1 FROM sponsorship_links WHERE party_id = $1 AND status <> 'revoked'", [partyId]);
        if (has.length) throw Object.assign(new Error(`${p.company} already has a link. Remove it first to make a new one.`), { status: 409 });
      }
      const token = makeToken();
      const { rows: [l] } = await c.query(
        `INSERT INTO sponsorship_links (event_id, party_id, role, person_name, designation, phone, token, pin_hash, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [id, partyId, role, personName, designation, phone, token, bcrypt.hashSync(pin, 10), req.user.id]);
      await activity(c, id, actor(req), `Made the approval link for ${personName} (${designation})`);
      await recompute(c, id);
      return { linkId: String(l.id), path: `/s/${token}` };
    });
    res.status(201).json({ ...out, pin, event: await adminView(id) });
  }));

  app.post('/api/sponsorship-links/:linkId(\\d+)/pin', ...admin, asyncHandler(async (req, res) => {
    const pin = makePin();
    const { rows: [l] } = await query(
      `UPDATE sponsorship_links SET pin_hash = $1, pin_failures = 0, locked_until = NULL WHERE id = $2 AND status <> 'revoked' RETURNING event_id, person_name`,
      [bcrypt.hashSync(pin, 10), parseInt(req.params.linkId, 10)]);
    if (!l) return res.status(404).json({ error: 'Link not found.' });
    await activity({ query }, l.event_id, actor(req), `Made a new PIN for ${l.person_name}`);
    res.json({ pin });
  }));

  app.post('/api/sponsorship-links/:linkId(\\d+)/revoke', ...admin, asyncHandler(async (req, res) => {
    const lid = parseInt(req.params.linkId, 10);
    const out = await tx(async (c) => {
      const { rows: [l] } = await c.query('SELECT l.*, e.status AS event_status FROM sponsorship_links l JOIN sponsorship_events e ON e.id = l.event_id WHERE l.id = $1', [lid]);
      if (!l) throw Object.assign(new Error('Link not found.'), { status: 404 });
      if (l.event_status === 'approved') throw Object.assign(new Error('Everyone has approved; links stay as the record.'), { status: 409 });
      await c.query("UPDATE sponsorship_links SET status = 'revoked', revoked_at = now() WHERE id = $1", [lid]);
      await activity(c, l.event_id, actor(req), `Removed the link of ${l.person_name}`);
      await recompute(c, l.event_id);
      return l.event_id;
    });
    res.json(await adminView(out));
  }));

  // ---------- The approver's link (no CRM login: link + PIN) ----------
  const linkByToken = async (token) => {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(token || ''))) return null;
    const { rows: [l] } = await query('SELECT * FROM sponsorship_links WHERE token = $1', [token]);
    return l || null;
  };
  const sessionFor = (l) => jwt.sign({ sp: l.id, v: l.pin_hash.slice(-12) }, jwtSecret, { expiresIn: `${SESSION_HOURS}h`, audience: 'sponsorship' });
  const checkSession = (req, l) => {
    const h = String(req.headers.authorization || '');
    const t = h.startsWith('Bearer ') ? h.slice(7) : '';
    try {
      const p = jwt.verify(t, jwtSecret, { audience: 'sponsorship' });
      return p.sp === l.id && p.v === l.pin_hash.slice(-12); // a new PIN ends old sessions
    } catch { return false; }
  };

  async function linkDoc(l, req) {
    const full = await loadEvent(l.event_id);
    const doc = docOf(full);
    const { rows: links } = await query("SELECT * FROM sponsorship_links WHERE event_id = $1 AND status <> 'revoked' ORDER BY created_at", [l.event_id]);
    const dec = await decisionsNow({ query }, l.event_id, full.e.version);
    const md = links.find((x) => x.role === 'md');
    const mine = dec.get(String(l.id));
    let waiting = '';
    if (full.e.status === 'cancelled') waiting = 'This event has been cancelled.';
    else if (l.status === 'revoked') waiting = 'This link is no longer active.';
    else if (l.role === 'brand' && md && dec.get(String(md.id))?.decision !== 'approved') waiting = 'Monipack is reviewing an updated version. You will be able to approve once it is ready.';
    const canAct = !waiting && !mine;
    const { rows: past } = await query('SELECT decision, version, typed_name, comment, created_at FROM sponsorship_decisions WHERE link_id = $1 ORDER BY created_at DESC LIMIT 20', [l.id]);
    return {
      me: { name: l.person_name, designation: l.designation || '', role: l.role, company: full.parties.find((p) => p.id === l.party_id)?.company || '' },
      doc: { ...doc, fingerprint: full.e.fingerprint },
      approvals: links.map((x) => {
        const d = dec.get(String(x.id));
        return { name: x.person_name, designation: x.designation || '', company: full.parties.find((p) => p.id === x.party_id)?.company || '', role: x.role, decision: d?.decision || 'pending', at: d?.created_at || null };
      }),
      myDecision: mine ? { decision: mine.decision, at: mine.created_at, typedName: mine.typed_name || '', comment: mine.comment || '' } : null,
      history: past.map((p) => ({ decision: p.decision, version: p.version, at: p.created_at, comment: p.comment || '' })),
      canAct, waiting,
    };
  }

  app.get('/api/sp/:token', viewLimiter, asyncHandler(async (req, res) => {
    const l = await linkByToken(req.params.token);
    if (!l || l.status === 'revoked') return res.status(404).json({ error: 'This link is not valid. Please ask Monipack for a new one.' });
    const { rows: [e] } = await query('SELECT banner_key, status FROM sponsorship_events WHERE id = $1', [l.event_id]);
    const locked = l.locked_until && new Date(l.locked_until) > new Date();
    if (checkSession(req, l)) return res.json({ unlocked: true, ...(await linkDoc(l, req)) });
    res.json({ unlocked: false, name: l.person_name, designation: l.designation || '', bannerUrl: fileUrl(e?.banner_key), lockedUntil: locked ? l.locked_until : null });
  }));

  app.post('/api/sp/:token/unlock', viewLimiter, asyncHandler(async (req, res) => {
    const l = await linkByToken(req.params.token);
    if (!l || l.status === 'revoked') return res.status(404).json({ error: 'This link is not valid. Please ask Monipack for a new one.' });
    if (l.locked_until && new Date(l.locked_until) > new Date()) {
      return res.status(429).json({ error: `Too many wrong PINs. Try again after ${new Date(l.locked_until).toLocaleTimeString('en-GB', { timeZone: 'Asia/Muscat', hour: '2-digit', minute: '2-digit' })} (Oman time).`, lockedUntil: l.locked_until });
    }
    const pin = String(req.body?.pin || '').replace(/\D/g, '');
    if (pin.length !== 6 || !bcrypt.compareSync(pin, l.pin_hash)) {
      const fails = l.pin_failures + 1;
      const lock = fails >= PIN_TRIES;
      await query('UPDATE sponsorship_links SET pin_failures = $1, locked_until = $2 WHERE id = $3',
        [lock ? 0 : fails, lock ? new Date(Date.now() + LOCK_MINUTES * 60000) : null, l.id]);
      if (lock) {
        await activity({ query }, l.event_id, l.person_name, `Link locked for ${LOCK_MINUTES} minutes after ${PIN_TRIES} wrong PINs`);
        notify(await superAdmins(), { kind: 'sponsorship', title: `Sponsorship link locked: ${l.person_name}`, body: `${PIN_TRIES} wrong PINs were typed on ${l.person_name}'s link.`, link: 'sponsorships' });
        return res.status(429).json({ error: `Too many wrong PINs. The link is locked for ${LOCK_MINUTES} minutes.` });
      }
      return res.status(401).json({ error: `Wrong PIN. ${PIN_TRIES - fails} tr${PIN_TRIES - fails === 1 ? 'y' : 'ies'} left.` });
    }
    const first = !l.opened_at;
    await query('UPDATE sponsorship_links SET pin_failures = 0, locked_until = NULL, opened_at = COALESCE(opened_at, now()), last_seen_at = now() WHERE id = $1', [l.id]);
    if (first) await activity({ query }, l.event_id, l.person_name, 'Opened the approval link');
    res.json({ session: sessionFor(l), unlocked: true, ...(await linkDoc({ ...l, opened_at: l.opened_at || new Date() }, req)) });
  }));

  app.post('/api/sp/:token/decide', viewLimiter, asyncHandler(async (req, res) => {
    const l = await linkByToken(req.params.token);
    if (!l || l.status === 'revoked') return res.status(404).json({ error: 'This link is not valid.' });
    if (!checkSession(req, l)) return res.status(401).json({ error: 'Please enter your PIN again.' });
    const decision = req.body?.decision === 'changes_requested' ? 'changes_requested' : 'approved';
    const typedName = clean(req.body?.typedName, 120);
    const signature = String(req.body?.signature || '');
    const comment = cleanText(req.body?.comment, 2000);
    if (decision === 'approved') {
      if (req.body?.agree !== true) return res.status(400).json({ error: 'Please tick that you agree to the terms and conditions.' });
      if (typedName.length < 3) return res.status(400).json({ error: 'Please type your full name.' });
      if (!/^data:image\/png;base64,[A-Za-z0-9+/=]{800,}$/.test(signature) || signature.length > 400000) return res.status(400).json({ error: 'Please sign in the signature box.' });
    } else if (comment.length < 5) {
      return res.status(400).json({ error: 'Please write what should be changed.' });
    }
    const result = await tx(async (c) => {
      const { rows: [e] } = await c.query('SELECT * FROM sponsorship_events WHERE id = $1 FOR UPDATE', [l.event_id]);
      if (['approved', 'cancelled'].includes(e.status)) throw Object.assign(new Error('This agreement is closed.'), { status: 409 });
      if (req.body?.fingerprint !== e.fingerprint) throw Object.assign(new Error('The details were updated while you were reading. Please review the new version.'), { status: 409, code: 'stale' });
      const doc = await linkDoc(l, req);
      if (!doc.canAct) throw Object.assign(new Error(doc.waiting || 'You have already responded to this version.'), { status: 409 });
      await c.query(
        `INSERT INTO sponsorship_decisions (link_id, event_id, decision, version, fingerprint, typed_name, signature, comment, ip, user_agent)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [l.id, l.event_id, decision, e.version, e.fingerprint, decision === 'approved' ? typedName : null, decision === 'approved' ? signature : null,
          comment || null, String(req.ip || '').slice(0, 64), String(req.headers['user-agent'] || '').slice(0, 300)]);
      await activity(c, l.event_id, `${l.person_name} (${l.designation})`, decision === 'approved' ? `Approved version ${e.version}` : `Asked for changes: ${comment.slice(0, 220)}`);
      const status = await recompute(c, l.event_id);
      return { status, title: e.title };
    });
    const who = `${l.person_name} (${l.designation})`;
    let title; let body;
    if (decision === 'changes_requested') { title = `Changes requested: ${result.title}`; body = `${who}: ${comment.slice(0, 300)}`; }
    else if (result.status === 'approved') { title = `Fully approved: ${result.title}`; body = `${who} approved. Everyone has now approved; the agreement is locked.`; }
    else if (l.role === 'md') { title = `MD approved: ${result.title}`; body = `${who} approved. You can now make the partner brand's link.`; }
    else { title = `Brand approved: ${result.title}`; body = `${who} approved.`; }
    notify(await superAdmins(), { kind: 'sponsorship', title, body, link: 'sponsorships' });
    res.json({ ok: true, unlocked: true, status: result.status, ...(await linkDoc(await linkByToken(req.params.token), req)) });
  }));
}
