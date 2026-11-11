/**
 * Quotation → pipeline. One rule set, used by every quotation route:
 *
 *  1. Every quotation belongs to a lead. No lead picked → match the customer's phone (then exact name)
 *     to an open lead; no match → create a lead in "Quotation Follow-Up", owned by the person who
 *     prepared it if he is a salesman, otherwise left for Customer Care to assign (Inbox).
 *  2. Sent → lead in Quotation Follow-Up, value = quotation total, follow-up in 2 days + a task.
 *  3. Revised (items or total changed after it was sent) → lead to Sample & Negotiation.
 *  4. Accepted → lead Won.   5. Rejected → lead Lost with the same reason
 *     (unless another quotation for that lead is still open).
 *  6. Expired with no answer → a "call the customer" task (+ WhatsApp alert), once.
 */
import { query } from '../db/pool.js';
import db from '../db/index.js';
import { createTask } from '../tasks/tasks.js';
import { alertTaskAssigned } from '../notify/whatsapp.js';
import { notify } from '../notify/notify.js';

const FOLLOW_UP_DAYS = 2;
const DAY = 86400000;
const OPEN = ['new', 'contacted', 'quotation_sent', 'sample_sent'];

// Quotation reject reasons (QuoteStatus.jsx) → lead lost reasons (lostReasons.js)
const REJECT_TO_LOST = [
  [/price/i, 'price'],
  [/competitor/i, 'competitor'],
  [/quantity|minimum/i, 'quantity'],
  [/deliver|logistic/i, 'logistics'],
  [/postpon/i, 'postponed'],
];
export function lostReasonFor(reason) {
  const r = String(reason || '');
  const hit = REJECT_TO_LOST.find(([re]) => re.test(r));
  if (hit) return hit[1];
  const note = r.replace(/^Other:?\s*/i, '').trim();
  return note ? note.slice(0, 200) : 'other';
}

const digits = (s) => String(s || '').replace(/\D/g, '');
const tail8 = (s) => { const d = digits(s); return d.length >= 8 ? d.slice(-8) : ''; };

async function system(name = 'Monipack CRM') {
  return { id: null, name, role: 'super_admin', permissions: ['tasks.assign'] };
}

/** Lead that matches this quotation's customer, if any (phone first, then exact name among open leads). */
async function findLead(q) {
  const t = tail8(q.attn) || tail8(q.phone);
  if (t) {
    const { rows } = await query(
      `SELECT id FROM leads WHERE archived_at IS NULL
         AND (right(regexp_replace(coalesce(mobile, ''), '\\D', '', 'g'), 8) = $1 OR right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 8) = $1)
       ORDER BY (status = ANY($2)) DESC, updated_at DESC LIMIT 1`, [t, OPEN]);
    if (rows[0]) return rows[0].id;
  }
  const name = String(q.customerName || '').trim();
  if (name && name.toLowerCase() !== 'valued customer') {
    const { rows } = await query(
      `SELECT id FROM leads WHERE archived_at IS NULL AND status = ANY($2) AND lower(trim(name)) = lower($1)
       ORDER BY updated_at DESC LIMIT 1`, [name, OPEN]);
    if (rows[0]) return rows[0].id;
  }
  return null;
}

/** Ensure the quotation has a lead. Returns { leadId, created }. */
export async function ensureLead(quote, user) {
  if (quote.leadId) return { leadId: Number(quote.leadId), created: false };
  let leadId = await findLead(quote);
  let created = false;
  if (!leadId) {
    const sid = user?.salesmanId ? Number(user.salesmanId) : null;
    let sm = null;
    if (sid) sm = (await query('SELECT id, name, branch_id FROM salesmen WHERE id = $1', [sid])).rows[0] || null;
    const br = sm?.branch_id ? (await query('SELECT id, name FROM branches WHERE id = $1', [sm.branch_id])).rows[0] : null;
    const phone = digits(quote.attn).length >= 8 ? quote.attn : '';
    const lead = await db.createLead({
      name: quote.customerName || 'Quotation customer',
      contactPerson: phone ? '' : (quote.attn || ''),
      mobile: phone,
      customerLocation: (quote.address || '').replace(/,?\s*Sultanate of Oman\s*$/i, ''),
      status: 'quotation_sent',
      dealValue: Number(quote.grandTotalOMR || 0),
      notes: `Created from quotation ${quote.code}.`,
      source: 'Quotation',
      salesmanId: sm?.id || null,
      salesman: sm?.name || '',
      branchId: br?.id || null,
      branch: br?.name || undefined,
      intakeCompleted: true,
    });
    leadId = Number(lead.id);
    created = true;
    await db.addActivity({ leadId, leadName: lead.name, type: 'quotation', description: `Lead created from quotation ${quote.code} by ${user?.name || 'Monipack CRM'}` });
    if (!sm) {
      // Nobody owns it yet: Customer Care assigns it
      const { rows: cc } = await query("SELECT id FROM users WHERE role IN ('customer_care','super_admin') AND archived_at IS NULL AND is_active");
      await notify(cc.map((r) => r.id).filter((id) => String(id) !== String(user?.id)), {
        kind: 'lead', title: `Quotation ${quote.code} needs a salesman`, body: `${lead.name} · OMR ${Number(quote.grandTotalOMR || 0).toFixed(3)}`, link: 'customercare',
      }).catch(() => {});
    }
  }
  // Linking also moves the lead to Quotation Follow-Up and sets its value
  await db.updateQuotation(quote.id, { leadId }, { changedBy: user?.name || 'Monipack CRM' });
  return { leadId, created };
}

/** Follow-up date in 2 days + a task for the lead's salesman (or the person who made the quotation). */
export async function scheduleFollowUp(quote, leadId, user) {
  const due = new Date(Date.now() + FOLLOW_UP_DAYS * DAY);
  due.setUTCHours(6, 0, 0, 0); // 10:00 Oman time
  const { rows } = await query('SELECT id, name, salesman_id, next_follow_up_at FROM leads WHERE id = $1', [leadId]);
  const l = rows[0];
  if (!l) return;
  if (!l.next_follow_up_at || new Date(l.next_follow_up_at) > due || new Date(l.next_follow_up_at) < new Date()) {
    await query("UPDATE leads SET next_follow_up_at = $1, follow_up_note = $2 WHERE id = $3", [due, `Follow up quotation ${quote.code}`.slice(0, 300), leadId]);
  }
  const assignee = l.salesman_id ? { kind: 'salesman', id: String(l.salesman_id) } : (user?.id ? { kind: 'user', id: String(user.id) } : null);
  if (!assignee) return;
  const actor = user?.id ? { ...user, permissions: [...(user.permissions || []), 'tasks.assign'] } : await system();
  try {
    const task = await createTask(actor, {
      title: `Follow up quotation ${quote.code} with ${l.name}`.slice(0, 200),
      description: `Ask the customer about quotation ${quote.code} (OMR ${Number(quote.grandTotalOMR || 0).toFixed(3)}). Mark it accepted or rejected in Quotations.`,
      priority: 'high', dueAt: due.toISOString(), assignee, leadId,
    });
    if (actor.id) await alertTaskAssigned(task, actor).catch(() => {});
  } catch (e) { console.error('[quote follow-up]', e.message); }
}

/** After a quotation is created (the route calls this). */
export async function afterCreate(quote, user) {
  const { leadId, created } = await ensureLead(quote, user);
  if (quote.status !== 'draft') await scheduleFollowUp(quote, leadId, user);
  return { leadId, leadCreated: created };
}

/** After a quotation is edited: a changed total or items after sending = revised → Sample & Negotiation. */
export async function afterUpdate(before, after, user) {
  if (!after.leadId) await ensureLead(after, user);
  const changed = Number(before.grandTotalOMR) !== Number(after.grandTotalOMR)
    || JSON.stringify((before.items || []).map((i) => [i.item, i.quantity, i.unitPriceOMR]))
      !== JSON.stringify((after.items || []).map((i) => [i.item, i.quantity, i.unitPriceOMR]));
  if (!changed || before.status === 'draft' || !after.leadId) return;
  const { rows } = await query('SELECT id, name, status FROM leads WHERE id = $1 AND archived_at IS NULL', [after.leadId]);
  const l = rows[0];
  if (!l) return;
  await db.addActivity({ leadId: l.id, leadName: l.name, type: 'quotation', description: `Quotation ${after.code} revised by ${user?.name || 'Monipack CRM'}: OMR ${Number(before.grandTotalOMR).toFixed(3)} → OMR ${Number(after.grandTotalOMR).toFixed(3)}` });
  if (['quotation_sent', 'contacted', 'new'].includes(l.status)) {
    await db.updateLead(l.id, { status: 'sample_sent' }, { changedBy: user?.name || 'Monipack CRM' });
  }
}

/** Quotation marked rejected → lead lost with the same reason (if no other quotation for it is still open). */
export async function afterRejected(quote, reason, user) {
  if (!quote.leadId) return false;
  const { rows: others } = await query(
    `SELECT 1 FROM quotations WHERE lead_id = $1 AND id <> $2 AND archived_at IS NULL AND status IN ('draft','sent','accepted')
       AND (status <> 'sent' OR date IS NULL OR date + (COALESCE(validity_days, 30) || ' days')::interval >= now()) LIMIT 1`,
    [quote.leadId, quote.id]);
  if (others[0]) return false;
  const lead = await db.getLeadById(quote.leadId);
  if (!lead || lead.status === 'won' || lead.status === 'lost') return false;
  await db.updateLead(lead.id, { status: 'lost', lostReason: lostReasonFor(reason) }, { changedBy: user?.name || 'Monipack CRM' });
  return true;
}

/** Hourly: quotations whose validity ended with no answer get one "call the customer" task. */
export async function remindExpired() {
  const { rows } = await query(
    `SELECT q.id, q.code, q.lead_id, q.grand_total_omr, q.customer_name, q.created_by_user_id
       FROM quotations q
      WHERE q.archived_at IS NULL AND q.status = 'sent' AND q.expiry_reminded_at IS NULL AND q.date IS NOT NULL
        AND q.date + (COALESCE(q.validity_days, 30) || ' days')::interval < now()
        AND q.date > now() - interval '120 days'
      LIMIT 50`);
  for (const q of rows) {
    await query('UPDATE quotations SET expiry_reminded_at = now() WHERE id = $1', [q.id]);
    const l = q.lead_id ? (await query('SELECT id, name, salesman_id, status FROM leads WHERE id = $1 AND archived_at IS NULL', [q.lead_id])).rows[0] : null;
    if (l && (l.status === 'won' || l.status === 'lost')) continue;
    const assignee = l?.salesman_id ? { kind: 'salesman', id: String(l.salesman_id) } : (q.created_by_user_id ? { kind: 'user', id: String(q.created_by_user_id) } : null);
    if (!assignee) continue;
    const actor = await system();
    try {
      const task = await createTask(actor, {
        title: `Call the customer: quotation ${q.code} expired`.slice(0, 200),
        description: `${q.customer_name} has not answered quotation ${q.code} (OMR ${Number(q.grand_total_omr || 0).toFixed(3)}) and it has expired. Call them: renew it, revise it, or mark it rejected.`,
        priority: 'high', dueAt: new Date(Date.now() + 4 * 3600000).toISOString(), assignee, leadId: l?.id,
      });
      await alertTaskAssigned(task, actor).catch(() => {});
    } catch (e) { console.error('[quote expiry]', e.message); }
  }
  return rows.length;
}

/** One-time fix: link every old quotation that has no lead. */
export async function linkOrphans(user) {
  const { rows } = await query('SELECT id FROM quotations WHERE archived_at IS NULL AND lead_id IS NULL ORDER BY id');
  let linked = 0; let created = 0;
  for (const r of rows) {
    const q = await db.getQuotationById(r.id);
    if (!q) continue;
    const { rows: by } = await query('SELECT u.id, u.name, u.salesman_id FROM quotations q JOIN users u ON u.id = q.created_by_user_id WHERE q.id = $1', [r.id]);
    const owner = by[0] ? { id: by[0].id, name: by[0].name, salesmanId: by[0].salesman_id } : user;
    const res = await ensureLead(q, owner);
    linked++; if (res.created) created++;
    // Bring the lead up to date with how the quotation already ended
    const linkedQ = { ...q, leadId: res.leadId };
    if (q.status === 'accepted') {
      const lead = await db.getLeadById(res.leadId);
      if (lead && lead.status !== 'won') await db.updateLead(res.leadId, { status: 'won', dealValue: q.grandTotalOMR }, { changedBy: user?.name || 'Monipack CRM' });
    } else if (q.status === 'rejected') {
      await afterRejected(linkedQ, q.statusReason || '', user);
    }
  }
  return { linked, created };
}

export function startExpiryJob() {
  const run = () => remindExpired().catch((e) => console.error('[quote expiry]', e.message));
  setTimeout(run, 60000).unref();
  setInterval(run, 3600000).unref();
}
