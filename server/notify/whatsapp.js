/**
 * WhatsApp alerts + read-only share links.
 *
 * Two ways a message goes out:
 *  - Automatic (Meta WhatsApp Business Cloud API) when these are set in .env:
 *      WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_TEMPLATE (approved template with 2 body variables: {{1}} text, {{2}} link),
 *      WHATSAPP_LANG (default en)
 *  - One-tap (until then): the message is kept as "manual" and the person who made the assignment
 *    sees a "Send on WhatsApp" button that opens their own WhatsApp with the text ready.
 *
 * Read-only links (/v/<token>):
 *  - lead:     the salesman sees the customer, number, notes and history; cannot change anything.
 *              Stops working when the lead is given to someone else; expires after 30 days.
 *  - pipeline: a department manager sees his department's open pipeline; cannot change anything. 30 days.
 *  - task:     the person sees the task. 30 days.
 */
import crypto from 'crypto';
import { query } from '../db/pool.js';
import { LEAD_VALUE } from '../reports/value.js';

const DAY = 86400000;
const PUBLIC_URL = () => (process.env.PUBLIC_URL || 'https://crm.monipack.com').replace(/\/+$/, '');
const apiReady = () => Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID && process.env.WHATSAPP_TEMPLATE);
const SEG_NAME = { b2b: 'B2B', retail: 'Retail' };

/** Oman-friendly international number (digits only) or null. */
export function waNumber(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 8) d = `968${d}`;
  return d.length >= 10 && d.length <= 15 ? d : null;
}

// ---------------- links ----------------
async function makeLink({ kind, leadId = null, taskId = null, segment = null, userId = null, salesmanId = null, days = 30 }) {
  // Reuse a still-fresh link for the same thing and person
  const { rows: ex } = await query(
    `SELECT token FROM view_links WHERE kind = $1 AND revoked_at IS NULL AND expires_at > now() + interval '7 days'
       AND lead_id IS NOT DISTINCT FROM $2 AND task_id IS NOT DISTINCT FROM $3 AND segment IS NOT DISTINCT FROM $4
       AND user_id IS NOT DISTINCT FROM $5 AND salesman_id IS NOT DISTINCT FROM $6
     ORDER BY id DESC LIMIT 1`,
    [kind, leadId, taskId, segment, userId, salesmanId]
  );
  if (ex[0]) return ex[0].token;
  const token = crypto.randomBytes(24).toString('base64url');
  await query(
    `INSERT INTO view_links (token, kind, lead_id, task_id, segment, user_id, salesman_id, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [token, kind, leadId, taskId, segment, userId, salesmanId, new Date(Date.now() + days * DAY)]
  );
  return token;
}
export const linkUrl = (token) => `${PUBLIC_URL()}/v/${token}`;

/** A lead moved to someone else: links given to the previous people stop working. */
export async function revokeLeadLinks(leadId, keepSalesmanId = null) {
  await query(
    `UPDATE view_links SET revoked_at = now() WHERE kind = 'lead' AND lead_id = $1 AND revoked_at IS NULL
       AND salesman_id IS DISTINCT FROM $2`,
    [leadId, keepSalesmanId]
  );
}

/** A staff login was deactivated / deleted / changed role: its links stop working. */
export async function revokeUserLinks(userId) {
  await query('UPDATE view_links SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
}

// ---------------- outbox ----------------
async function queue({ phone, name, userId = null, salesmanId = null, kind, body, token = null, createdBy = null }) {
  const to = waNumber(phone);
  const status = !to ? 'skipped' : apiReady() ? 'pending' : 'manual';
  const { rows } = await query(
    `INSERT INTO outbox_messages (to_phone, to_name, user_id, salesman_id, kind, body, link_token, status, error, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [to, name || null, userId, salesmanId, kind, body, token, status, to ? null : 'No WhatsApp number saved', createdBy]
  );
  if (status === 'pending') setTimeout(() => { flush().catch(() => {}); }, 50);
  return rows[0].id;
}

async function sendViaApi(msg) {
  // The link goes in its own template variable, so leave it out of the text
  const text = msg.body.split('\n').filter((line) => !line.includes('/v/')).join(' · ').replace(/\s{4,}/g, ' ').slice(0, 900);
  const url = msg.link_token ? linkUrl(msg.link_token) : PUBLIC_URL();
  const res = await fetch(`https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: msg.to_phone,
      type: 'template',
      template: {
        name: process.env.WHATSAPP_TEMPLATE,
        language: { code: process.env.WHATSAPP_LANG || 'en' },
        components: [{ type: 'body', parameters: [{ type: 'text', text }, { type: 'text', text: url }] }],
      },
    }),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error(b?.error?.message || `WhatsApp API ${res.status}`);
  }
}

let flushing = false;
/** Send pending messages (automatic mode only). Retries up to 5 times. */
export async function flush() {
  if (!apiReady() || flushing) return;
  flushing = true;
  try {
    const { rows } = await query(
      `SELECT * FROM outbox_messages WHERE status = 'pending' AND attempts < 5
         AND created_at > now() - interval '2 days'
       ORDER BY id LIMIT 20`
    );
    for (const m of rows) {
      try {
        await sendViaApi(m);
        await query("UPDATE outbox_messages SET status = 'sent', sent_at = now(), attempts = attempts + 1, error = NULL WHERE id = $1", [m.id]);
      } catch (e) {
        await query(
          `UPDATE outbox_messages SET attempts = attempts + 1, error = $2,
             status = CASE WHEN attempts + 1 >= 5 THEN 'failed' ELSE 'pending' END WHERE id = $1`,
          [m.id, String(e.message).slice(0, 300)]
        );
      }
    }
  } finally { flushing = false; }
}

// ---------------- alerts ----------------
const one = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

/** Lead given to a salesman: message the salesman (lead link) and his department manager(s) (pipeline link). */
export async function alertLeadAssigned(leadId, actor) {
  const { rows } = await query(
    `SELECT l.*, s.name AS sm_name, s.phone AS sm_phone, lead_segment(l.branch_id, l.salesman_id, l.branch_name) AS seg
       FROM leads l LEFT JOIN salesmen s ON s.id = l.salesman_id WHERE l.id = $1`, [leadId]);
  const l = rows[0];
  if (!l || !l.salesman_id) return;
  await revokeLeadLinks(l.id, l.salesman_id);
  const customerPhone = [l.country_code, l.mobile].filter(Boolean).join(' ') || l.phone || '';
  const product = [l.category, /Needs Intake/.test(l.quantity || '') ? '' : l.quantity].filter(Boolean).map(one).join(' · ');

  // 1) The salesman (his link-salesman phone; logins use their own number when set)
  const { rows: logins } = await query('SELECT id, phone FROM users WHERE salesman_id = $1 AND archived_at IS NULL AND is_active', [l.salesman_id]);
  const smPhone = l.sm_phone || logins.find((u) => u.phone)?.phone;
  const token = await makeLink({ kind: 'lead', leadId: l.id, salesmanId: l.salesman_id });
  const body = [
    `New lead for you – Monipack CRM`,
    `Customer: ${one(l.name)}`,
    customerPhone && `Mobile: ${one(customerPhone)}`,
    product && `Product: ${product}`,
    l.customer_location && `Location: ${one(l.customer_location)}`,
    l.notes && `Notes: ${one(l.notes).slice(0, 300)}`,
    `Given by ${one(actor?.name || 'Monipack')}`,
    `View (read only): ${linkUrl(token)}`,
  ].filter(Boolean).join('\n');
  await queue({ phone: smPhone, name: l.sm_name, salesmanId: l.salesman_id, kind: 'lead_salesman', body, token, createdBy: actor?.id || null });

  // 2) The department manager(s): read-only pipeline of their department
  if (l.seg === 'b2b' || l.seg === 'retail') {
    const role = l.seg === 'b2b' ? 'b2b_manager' : 'retail_manager';
    const { rows: mgrs } = await query('SELECT id, name, phone FROM users WHERE role = $1 AND archived_at IS NULL AND is_active', [role]);
    for (const m of mgrs) {
      if (String(m.id) === String(actor?.id)) continue;
      const pt = await makeLink({ kind: 'pipeline', segment: l.seg, userId: m.id });
      const mb = [
        `New ${SEG_NAME[l.seg]} lead – Monipack CRM`,
        `${one(l.name)} → ${one(l.sm_name)}`,
        product && `Product: ${product}`,
        `Given by ${one(actor?.name || 'Monipack')}`,
        `Your ${SEG_NAME[l.seg]} pipeline (read only): ${linkUrl(pt)}`,
      ].filter(Boolean).join('\n');
      await queue({ phone: m.phone, name: m.name, userId: m.id, kind: 'lead_manager', body: mb, token: pt, createdBy: actor?.id || null });
    }
  }
}

/** Task given to someone: message them with a read-only task link. */
export async function alertTaskAssigned(task, actor) {
  const a = task?.assignee;
  if (!a) return;
  if (a.kind === 'user' && String(a.id) === String(actor?.id)) return;
  let phone = null; let name = a.name; let userId = null; let salesmanId = null;
  if (a.kind === 'user') {
    const { rows } = await query('SELECT id, name, phone FROM users WHERE id = $1', [a.id]);
    phone = rows[0]?.phone; userId = rows[0]?.id || null;
  } else {
    const { rows } = await query('SELECT id, name, phone FROM salesmen WHERE id = $1', [a.id]);
    phone = rows[0]?.phone; salesmanId = rows[0]?.id || null;
    if (!phone) {
      const { rows: u } = await query("SELECT phone FROM users WHERE salesman_id = $1 AND phone IS NOT NULL AND archived_at IS NULL AND is_active LIMIT 1", [a.id]);
      phone = u[0]?.phone;
    }
  }
  const token = await makeLink({ kind: 'task', taskId: Number(task.id), userId, salesmanId });
  const due = task.dueAt ? new Date(task.dueAt).toLocaleString('en-GB', { timeZone: 'Asia/Muscat', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const body = [
    `New task from ${one(actor?.name || 'Monipack')} – Monipack CRM`,
    one(task.title),
    due && `Due: ${due}`,
    task.leadName && `Lead: ${one(task.leadName)}`,
    task.description && one(task.description).slice(0, 300),
    `View: ${linkUrl(token)}`,
  ].filter(Boolean).join('\n');
  await queue({ phone, name, userId, salesmanId, kind: 'task', body, token, createdBy: actor?.id || null });
}

// ---------------- routes ----------------
const STAGE_FALLBACK = { new: 'New', contacted: 'Contacted', quotation_sent: 'Quotation sent', sample_sent: 'Negotiation', won: 'Won', lost: 'Lost' };

export function registerWhatsAppRoutes(app, { authMiddleware, requirePermission, asyncHandler, linkLimiter }) {
  // My messages waiting to be sent by hand (one-tap mode), and the recent log
  app.get('/api/outbox/mine', authMiddleware, asyncHandler(async (req, res) => {
    const all = req.user.role === 'super_admin' && req.query.all === '1';
    const { rows } = await query(
      `SELECT id, to_phone, to_name, kind, body, status, error, created_at, sent_at FROM outbox_messages
        WHERE ${all ? 'TRUE' : 'created_by = $1'} AND created_at > now() - interval '7 days'
        ORDER BY (status = 'manual') DESC, id DESC LIMIT 60`,
      all ? [] : [req.user.id]
    );
    res.json({
      automatic: apiReady(),
      items: rows.map((r) => ({ id: String(r.id), toPhone: r.to_phone, toName: r.to_name || '', kind: r.kind, body: r.body, status: r.status, error: r.error || '', at: r.created_at, sentAt: r.sent_at })),
    });
  }));

  // One-tap mode: the person opened WhatsApp with the text (or dismissed it)
  app.post('/api/outbox/:id/done', authMiddleware, asyncHandler(async (req, res) => {
    const status = req.body?.skip ? 'skipped' : 'sent';
    const { rowCount } = await query(
      `UPDATE outbox_messages SET status = $3::varchar, sent_at = CASE WHEN $3::varchar = 'sent' THEN now() ELSE sent_at END
        WHERE id = $1 AND status = 'manual' AND (created_by = $2 OR $4::boolean)`,
      [parseInt(req.params.id, 10) || 0, req.user.id, status, req.user.role === 'super_admin']
    );
    res.json({ ok: rowCount > 0 });
  }));

  // Public read-only view
  app.get('/api/view/:token', linkLimiter, asyncHandler(async (req, res) => {
    const token = String(req.params.token || '');
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return res.status(404).json({ error: 'This link does not work.' });
    const { rows } = await query('SELECT * FROM view_links WHERE token = $1', [token]);
    const v = rows[0];
    if (!v) return res.status(404).json({ error: 'This link does not work.' });
    if (v.revoked_at) return res.status(410).json({ error: 'This link was switched off (the lead or task was given to someone else).' });
    if (new Date(v.expires_at) < new Date()) return res.status(410).json({ error: 'This link has expired. Ask the office for a new one.' });
    if (v.user_id) {
      const { rows: u } = await query('SELECT is_active, archived_at FROM users WHERE id = $1', [v.user_id]);
      if (!u[0] || !u[0].is_active || u[0].archived_at) return res.status(410).json({ error: 'This link was switched off.' });
    }
    await query('UPDATE view_links SET open_count = open_count + 1, last_opened_at = now() WHERE id = $1', [v.id]);
    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex');

    const { rows: st } = await query('SELECT stage_id AS key, label FROM pipeline_stages ORDER BY sort_order').catch(() => ({ rows: [] }));
    const stageName = (k) => st.find((s) => s.key === k)?.label || STAGE_FALLBACK[k] || k;

    if (v.kind === 'lead') {
      const { rows: lr } = await query(
        `SELECT l.*, s.name AS sm_name, ${LEAD_VALUE} AS val FROM leads l LEFT JOIN salesmen s ON s.id = l.salesman_id WHERE l.id = $1 AND l.archived_at IS NULL`, [v.lead_id]);
      const l = lr[0];
      if (!l || String(l.salesman_id) !== String(v.salesman_id)) return res.status(410).json({ error: 'This lead was given to someone else.' });
      const [{ rows: acts }, { rows: qs }] = await Promise.all([
        query('SELECT type, description, "timestamp" FROM lead_activities WHERE lead_id = $1 ORDER BY "timestamp" DESC LIMIT 40', [l.id]),
        query('SELECT code, grand_total_omr, status, created_at FROM quotations WHERE lead_id = $1 AND archived_at IS NULL ORDER BY created_at DESC LIMIT 10', [l.id]),
      ]);
      return res.json({
        kind: 'lead',
        expiresAt: v.expires_at,
        lead: {
          name: l.name, contactPerson: l.contact_person || '', mobile: [l.country_code, l.mobile].filter(Boolean).join(' ') || l.phone || '',
          email: l.email || '', category: l.category || '', quantity: /Needs Intake/.test(l.quantity || '') ? '' : (l.quantity || ''),
          location: l.customer_location || '', notes: l.notes || '', stage: stageName(l.status), status: l.status,
          value: Number(l.val || 0), salesman: l.sm_name || l.salesman_name || '', branch: l.branch_name || '', date: l.date || l.created_at,
        },
        history: acts.map((a) => ({ type: a.type, text: a.description, at: a.timestamp })),
        quotations: qs.map((q) => ({ code: q.code, total: Number(q.grand_total_omr || 0), status: q.status || '', at: q.created_at })),
      });
    }
    if (v.kind === 'pipeline') {
      const { rows: lr } = await query(
        `SELECT l.id, l.name, l.status, l.category, l.country_code, l.mobile, l.phone, l.created_at, l.updated_at,
                COALESCE(s.name, l.salesman_name) AS sm, ${LEAD_VALUE} AS val
           FROM leads l LEFT JOIN salesmen s ON s.id = l.salesman_id
          WHERE l.archived_at IS NULL AND l.status NOT IN ('won', 'lost') AND lead_segment(l.branch_id, l.salesman_id, l.branch_name) = $1
          ORDER BY l.updated_at DESC NULLS LAST LIMIT 500`, [v.segment]);
      const order = st.map((s) => s.key);
      return res.json({
        kind: 'pipeline',
        segment: v.segment,
        segmentName: SEG_NAME[v.segment] || v.segment,
        expiresAt: v.expires_at,
        stages: [...new Set([...order.filter((k) => !['won', 'lost'].includes(k)), ...lr.map((l) => l.status)])].map((k) => ({ key: k, name: stageName(k) })),
        leads: lr.map((l) => ({
          name: l.name, stage: l.status, category: l.category || '', mobile: [l.country_code, l.mobile].filter(Boolean).join(' ') || l.phone || '',
          salesman: l.sm || '', value: Number(l.val || 0), createdAt: l.created_at, updatedAt: l.updated_at,
        })),
      });
    }
    if (v.kind === 'task') {
      const { rows: tr } = await query(
        `SELECT t.*, l.name AS lead_name, c.name AS customer_name FROM tasks t
           LEFT JOIN leads l ON l.id = t.lead_id LEFT JOIN customers c ON c.id = t.customer_id
          WHERE t.id = $1 AND t.archived_at IS NULL`, [v.task_id]);
      const t = tr[0];
      const sameUser = t && (v.user_id ? String(t.assignee_user_id) === String(v.user_id) : String(t.assignee_salesman_id) === String(v.salesman_id));
      if (!sameUser) return res.status(410).json({ error: 'This task was given to someone else or removed.' });
      return res.json({
        kind: 'task',
        expiresAt: v.expires_at,
        task: {
          title: t.title, description: t.description || '', status: t.status, priority: t.priority, dueAt: t.due_at,
          by: t.created_by_name || '', lead: t.lead_name || '', customer: t.customer_name || '',
        },
      });
    }
    return res.status(404).json({ error: 'This link does not work.' });
  }));

  if (apiReady()) setInterval(() => { flush().catch(() => {}); }, 30000).unref();
}
