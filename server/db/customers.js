import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { query, getClient } from './pool.js';
import { completeness, stageOf } from '../customers/logic.js';

const toId = (v) => {
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
};
const iso = (d) => (d ? new Date(d).toISOString() : null);

// ---------------- Mapping ----------------

export function fieldToApi(r) {
  return {
    id: String(r.id),
    key: r.key,
    label: r.label,
    type: r.type,
    options: Array.isArray(r.options) ? r.options : [],
    requiredBranch: Boolean(r.required_branch),
    requiredRouteB2b: Boolean(r.required_route_b2b),
    isCore: Boolean(r.is_core),
    isHidden: Boolean(r.is_hidden),
    adminOnly: Boolean(r.admin_only),
    showIf: r.show_if || null,
    docLabel: r.doc_label || null,
    sortOrder: r.sort_order,
  };
}

export function customerToApi(r) {
  return {
    id: String(r.id),
    name: r.name,
    salesmanId: r.salesman_id != null ? String(r.salesman_id) : null,
    salesmanName: r.salesman_name || null,
    salesmanType: r.salesman_type || null,
    status: r.status,
    mobile: r.mobile || '',
    crNumber: r.cr_number || '',
    noCr: Boolean(r.no_cr),
    noCrReason: r.no_cr_reason || '',
    vatNumber: r.vat_number || '',
    data: r.data || {},
    source: r.source,
    reviewNote: r.review_note || '',
    photoCount: Number(r.photo_count || 0),
    fileLabels: Array.isArray(r.file_labels) ? r.file_labels : [],
    locked: Boolean(r.locked),
    leadCount: Number(r.lead_count || 0),
    openLeads: Number(r.open_leads || 0),
    wonValue: Number(r.won_value || 0),
    openValue: Number(r.open_value || 0),
    quoteCount: Number(r.quote_count || 0),
    lastEnquiryAt: iso(r.last_enquiry_at),
    submittedAt: iso(r.submitted_at),
    approvedAt: iso(r.approved_at),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

const CUSTOMER_SELECT = `
  SELECT c.*, s.name AS salesman_name, s.type AS salesman_type,
    (SELECT COUNT(*) FROM customer_files f WHERE f.customer_id = c.id AND f.archived_at IS NULL) AS photo_count,
    ARRAY(SELECT DISTINCT f.label FROM customer_files f WHERE f.customer_id = c.id AND f.archived_at IS NULL) AS file_labels,
    ls.lead_count, ls.open_leads, ls.won_value, ls.open_value, ls.last_enquiry_at,
    (SELECT COUNT(*) FROM quotations q JOIN leads lq ON lq.id = q.lead_id
      WHERE lq.customer_id = c.id AND q.archived_at IS NULL) AS quote_count
  FROM customers c
  LEFT JOIN salesmen s ON s.id = c.salesman_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS lead_count,
      COUNT(*) FILTER (WHERE l.status NOT IN ('won', 'lost')) AS open_leads,
      COALESCE(SUM(l.deal_value) FILTER (WHERE l.status = 'won'), 0) AS won_value,
      COALESCE(SUM(l.deal_value) FILTER (WHERE l.status NOT IN ('won', 'lost')), 0) AS open_value,
      MAX(COALESCE(l.date, l.created_at)) AS last_enquiry_at
    FROM leads l WHERE l.customer_id = c.id AND l.archived_at IS NULL
  ) ls ON true`;

// ---------------- Fields ----------------

export async function getCustomerFields({ includeHidden = true } = {}) {
  const { rows } = await query(
    `SELECT * FROM customer_fields ${includeHidden ? '' : 'WHERE is_hidden = false'} ORDER BY sort_order, id`
  );
  return rows.map(fieldToApi);
}

function slugKey(label) {
  return String(label).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50) || 'field';
}

export async function createCustomerField({ label, type, options, requiredBranch, requiredRouteB2b, adminOnly }) {
  let key = slugKey(label);
  const { rows: existing } = await query('SELECT key FROM customer_fields WHERE key LIKE $1', [`${key}%`]);
  const taken = new Set(existing.map((r) => r.key));
  if (taken.has(key)) {
    let i = 2;
    while (taken.has(`${key}_${i}`)) i++;
    key = `${key}_${i}`;
  }
  const { rows: maxRows } = await query('SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM customer_fields');
  const { rows } = await query(
    `INSERT INTO customer_fields (key, label, type, options, required_branch, required_route_b2b, sort_order, admin_only)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8) RETURNING *`,
    [key, String(label).trim().slice(0, 120), type, JSON.stringify(options || []), Boolean(requiredBranch), Boolean(requiredRouteB2b), maxRows[0].next, Boolean(adminOnly)]
  );
  return fieldToApi(rows[0]);
}

// Mobile and CR are always visible and required
const LOCKED_REQUIRED = new Set(['mobile', 'cr_number']);

export async function updateCustomerField(id, updates = {}) {
  const numId = toId(id);
  const { rows: cur } = await query('SELECT * FROM customer_fields WHERE id = $1', [numId]);
  if (!cur[0]) return null;
  const f = cur[0];
  const locked = LOCKED_REQUIRED.has(f.key);
  const label = updates.label !== undefined && String(updates.label).trim() ? String(updates.label).trim().slice(0, 120) : f.label;
  const options = updates.options !== undefined && Array.isArray(updates.options)
    ? updates.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 200)
    : f.options;
  const { rows } = await query(
    `UPDATE customer_fields SET label = $1, options = $2::jsonb, required_branch = $3, required_route_b2b = $4,
       is_hidden = $5, sort_order = $6, admin_only = $8, updated_at = now() WHERE id = $7 RETURNING *`,
    [
      label,
      JSON.stringify(options),
      locked ? true : (updates.requiredBranch !== undefined ? Boolean(updates.requiredBranch) : f.required_branch),
      locked ? true : (updates.requiredRouteB2b !== undefined ? Boolean(updates.requiredRouteB2b) : f.required_route_b2b),
      locked ? false : (updates.isHidden !== undefined ? Boolean(updates.isHidden) : f.is_hidden),
      updates.sortOrder !== undefined ? (toId(updates.sortOrder) ?? f.sort_order) : f.sort_order,
      numId,
      locked ? false : (updates.adminOnly !== undefined ? Boolean(updates.adminOnly) : f.admin_only),
    ]
  );
  return fieldToApi(rows[0]);
}

// ---------------- Salesman links ----------------

export function linkToApi(r) {
  return {
    salesmanId: String(r.id),
    name: r.name,
    type: r.type,
    phone: r.phone || '',
    linkEnabled: Boolean(r.link_enabled),
    linkToken: r.link_token || null,
    hasPin: Boolean(r.link_pin_hash),
    linkCreatedAt: iso(r.link_created_at),
    linkLastUsedAt: iso(r.link_last_used_at),
  };
}

export async function getSalesmanForLink(token) {
  if (!token || !/^[a-f0-9]{32}$/.test(token)) return null;
  const { rows } = await query(
    `SELECT * FROM salesmen WHERE link_token = $1 AND link_enabled = true AND is_active = true AND archived_at IS NULL`,
    [token]
  );
  return rows[0] || null;
}

export async function getSalesmanRow(id) {
  const { rows } = await query('SELECT * FROM salesmen WHERE id = $1 AND archived_at IS NULL', [toId(id)]);
  return rows[0] || null;
}

/**
 * action: 'enable' (creates a token if none), 'disable', 'regenerate' (new token: old link stops working).
 * pin: undefined = unchanged, null/'' = remove, '1234' = set.
 */
export async function setSalesmanLink(id, { action, pin } = {}) {
  const sm = await getSalesmanRow(id);
  if (!sm) return null;
  let token = sm.link_token;
  let enabled = sm.link_enabled;
  let createdAt = sm.link_created_at;
  if (action === 'enable') {
    enabled = true;
    if (!token) { token = crypto.randomBytes(16).toString('hex'); createdAt = new Date(); }
  } else if (action === 'disable') {
    enabled = false;
  } else if (action === 'regenerate') {
    token = crypto.randomBytes(16).toString('hex');
    createdAt = new Date();
    enabled = true;
  }
  let pinHash = sm.link_pin_hash;
  if (pin !== undefined) pinHash = pin ? bcrypt.hashSync(String(pin), 10) : null;
  const { rows } = await query(
    `UPDATE salesmen SET link_token = $1, link_enabled = $2, link_created_at = $3, link_pin_hash = $4, updated_at = now()
     WHERE id = $5 RETURNING *`,
    [token, enabled, createdAt, pinHash, sm.id]
  );
  return linkToApi(rows[0]);
}

export async function listLinks() {
  const { rows } = await query('SELECT * FROM salesmen WHERE archived_at IS NULL ORDER BY name');
  return rows.map(linkToApi);
}

export async function touchLinkUsed(salesmanId) {
  await query('UPDATE salesmen SET link_last_used_at = now() WHERE id = $1', [salesmanId]);
}

export async function logLinkAccess(salesmanId, event, ip, userAgent) {
  await query(
    'INSERT INTO link_access_log (salesman_id, event, ip_address, user_agent) VALUES ($1, $2, $3, $4)',
    [salesmanId, event, ip ? String(ip).slice(0, 64) : null, userAgent ? String(userAgent).slice(0, 300) : null]
  );
}

export async function getLinkLog(salesmanId, limit = 50) {
  const { rows } = await query(
    'SELECT event, ip_address, user_agent, created_at FROM link_access_log WHERE salesman_id = $1 ORDER BY created_at DESC LIMIT $2',
    [toId(salesmanId), limit]
  );
  return rows.map((r) => ({ event: r.event, ipAddress: r.ip_address, userAgent: r.user_agent, at: iso(r.created_at) }));
}

// ---------------- Customers ----------------

export async function getCustomerRow(id) {
  const { rows } = await query(`${CUSTOMER_SELECT} WHERE c.id = $1 AND c.archived_at IS NULL`, [toId(id)]);
  return rows[0] || null;
}

export async function getCustomer(id) {
  const row = await getCustomerRow(id);
  if (!row) return null;
  const customer = customerToApi(row);
  const [{ rows: files }, { rows: subs }, { rows: transfers }] = await Promise.all([
    query('SELECT * FROM customer_files WHERE customer_id = $1 AND archived_at IS NULL ORDER BY uploaded_at', [row.id]),
    query('SELECT * FROM customer_submissions WHERE customer_id = $1 ORDER BY submitted_at DESC', [row.id]),
    query(
      `SELECT t.*, sf.name AS from_name, st.name AS to_name, u.name AS by_name
       FROM customer_transfers t
       LEFT JOIN salesmen sf ON sf.id = t.from_salesman_id
       LEFT JOIN salesmen st ON st.id = t.to_salesman_id
       LEFT JOIN users u ON u.id = t.by_user_id
       WHERE t.customer_id = $1 ORDER BY t.transferred_at DESC`,
      [row.id]
    ),
  ]);
  customer.files = files.map((f) => ({
    id: String(f.id), label: f.label, originalName: f.original_name, mime: f.mime, sizeBytes: f.size_bytes,
    uploadedVia: f.uploaded_via, uploadedAt: iso(f.uploaded_at),
  }));
  customer.submissions = subs.map((s) => ({ id: String(s.id), snapshot: s.snapshot, submittedAt: iso(s.submitted_at) }));
  customer.transfers = transfers.map((t) => ({
    from: t.from_name, to: t.to_name, by: t.by_name, at: iso(t.transferred_at),
  }));
  return customer;
}

/**
 * filters: { salesmanId, status, search, onlyRemaining }
 */
export async function listCustomers(filters = {}) {
  const where = ['c.archived_at IS NULL'];
  const params = [];
  if (filters.salesmanId !== undefined && filters.salesmanId !== '' && filters.salesmanId !== 'all') {
    if (filters.salesmanId === 'unassigned') where.push('c.salesman_id IS NULL');
    else { params.push(toId(filters.salesmanId) ?? -1); where.push(`c.salesman_id = $${params.length}`); }
  }
  if (filters.status && filters.status !== 'all') {
    params.push(filters.status);
    where.push(`c.status = $${params.length}`);
  }
  if (filters.search && String(filters.search).trim()) {
    params.push(`%${String(filters.search).trim().toLowerCase()}%`);
    const p = `$${params.length}`;
    where.push(`(LOWER(c.name) LIKE ${p} OR c.mobile LIKE ${p} OR LOWER(COALESCE(c.cr_number,'')) LIKE ${p} OR LOWER(COALESCE(c.vat_number,'')) LIKE ${p})`);
  }
  const limit = Math.min(toId(filters.limit) || 2000, 5000);
  const { rows } = await query(
    `${CUSTOMER_SELECT} WHERE ${where.join(' AND ')} ORDER BY c.name LIMIT ${limit}`,
    params
  );
  return rows.map(customerToApi);
}

export async function findDuplicates({ mobile, crNumber, vatNumber, excludeId }) {
  const conds = [];
  const params = [toId(excludeId) ?? -1];
  if (mobile) { params.push(mobile); conds.push(`c.mobile = $${params.length}`); }
  if (crNumber) { params.push(String(crNumber).toLowerCase()); conds.push(`LOWER(c.cr_number) = $${params.length}`); }
  if (vatNumber) { params.push(String(vatNumber).toLowerCase()); conds.push(`LOWER(c.vat_number) = $${params.length}`); }
  if (!conds.length) return [];
  const { rows } = await query(
    `SELECT c.id, c.name, c.mobile, c.cr_number, c.vat_number, s.name AS salesman_name
     FROM customers c LEFT JOIN salesmen s ON s.id = c.salesman_id
     WHERE c.archived_at IS NULL AND c.id <> $1 AND (${conds.join(' OR ')}) LIMIT 5`,
    params
  );
  return rows.map((r) => {
    const matched = [];
    if (mobile && r.mobile === mobile) matched.push('mobile');
    if (crNumber && r.cr_number && r.cr_number.toLowerCase() === String(crNumber).toLowerCase()) matched.push('CR');
    if (vatNumber && r.vat_number && r.vat_number.toLowerCase() === String(vatNumber).toLowerCase()) matched.push('VAT');
    return { id: String(r.id), name: r.name, salesmanName: r.salesman_name, matched };
  });
}

export function duplicateNote(dups) {
  if (!dups.length) return '';
  return 'Possible duplicate: ' + dups
    .map((d) => `"${d.name}" (#${d.id}, ${d.salesmanName || 'unassigned'}) – same ${d.matched.join(' & ')}`)
    .join('; ');
}

export async function createCustomer(c) {
  const { rows } = await query(
    `INSERT INTO customers (name, salesman_id, status, mobile, cr_number, no_cr, no_cr_reason, vat_number, data,
       source, review_note, created_by_user_id, submitted_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13) RETURNING id`,
    [
      c.name, toId(c.salesmanId), c.status || 'not_started', c.mobile || null, c.crNumber || null,
      Boolean(c.noCr), c.noCrReason || null, c.vatNumber || null, JSON.stringify(c.data || {}),
      c.source || 'admin', c.reviewNote || null, toId(c.createdByUserId), c.submittedAt || null,
    ]
  );
  return getCustomerRow(rows[0].id);
}

/** Overwrite the customer's values (validated "clean" object) and optionally status. */
export async function saveCustomerValues(id, clean, { status, markSubmitted = false, reviewNote } = {}) {
  const { rows } = await query(
    `UPDATE customers SET
       name = COALESCE(NULLIF($1, ''), name),
       mobile = NULLIF($2, ''), cr_number = NULLIF($3, ''), no_cr = $4, no_cr_reason = NULLIF($5, ''),
       vat_number = NULLIF($6, ''), data = $7::jsonb,
       status = COALESCE($8, status),
       submitted_at = CASE WHEN $9 THEN now() ELSE submitted_at END,
       review_note = COALESCE($10, review_note),
       updated_at = now()
     WHERE id = $11 AND archived_at IS NULL RETURNING id`,
    [
      clean.name || '', clean.mobile || '', clean.crNumber || '', Boolean(clean.noCr), clean.noCrReason || '',
      clean.vatNumber || '', JSON.stringify(clean.data || {}), status || null, Boolean(markSubmitted),
      reviewNote === undefined ? null : reviewNote, toId(id),
    ]
  );
  return rows[0] ? getCustomerRow(rows[0].id) : null;
}

export async function setCustomerStatus(id, status, { approvedByUserId } = {}) {
  await query(
    `UPDATE customers SET status = $1,
       approved_at = CASE WHEN $2::int IS NOT NULL THEN now() ELSE approved_at END,
       approved_by_user_id = COALESCE($2::int, approved_by_user_id),
       review_note = CASE WHEN $2::int IS NOT NULL THEN NULL ELSE review_note END,
       updated_at = now()
     WHERE id = $3`,
    [status, toId(approvedByUserId), toId(id)]
  );
  return getCustomerRow(id);
}

export async function addSubmission(customerId, salesmanId, snapshot) {
  await query(
    'INSERT INTO customer_submissions (customer_id, salesman_id, snapshot) VALUES ($1, $2, $3::jsonb)',
    [toId(customerId), toId(salesmanId), JSON.stringify(snapshot)]
  );
}

export async function addFile({ customerId, label, storageKey, originalName, mime, sizeBytes, uploadedVia }) {
  const { rows } = await query(
    `INSERT INTO customer_files (customer_id, label, storage_key, original_name, mime, size_bytes, uploaded_via)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [toId(customerId), label, storageKey, originalName ? String(originalName).slice(0, 255) : null, mime, sizeBytes, uploadedVia]
  );
  return rows[0];
}

export async function getFiles(customerId) {
  const { rows } = await query(
    'SELECT * FROM customer_files WHERE customer_id = $1 AND archived_at IS NULL ORDER BY uploaded_at',
    [toId(customerId)]
  );
  return rows;
}

export async function getFile(customerId, fileId) {
  const { rows } = await query(
    'SELECT * FROM customer_files WHERE id = $1 AND customer_id = $2 AND archived_at IS NULL',
    [toId(fileId), toId(customerId)]
  );
  return rows[0] || null;
}

export async function transferCustomers(ids, toSalesmanId, byUserId) {
  const client = await getClient();
  let moved = 0;
  try {
    await client.query('BEGIN');
    for (const id of ids) {
      const { rows } = await client.query(
        'SELECT id, salesman_id FROM customers WHERE id = $1 AND archived_at IS NULL FOR UPDATE',
        [toId(id)]
      );
      const c = rows[0];
      if (!c || c.salesman_id === toId(toSalesmanId)) continue;
      await client.query('UPDATE customers SET salesman_id = $1, updated_at = now() WHERE id = $2', [toId(toSalesmanId), c.id]);
      await client.query(
        'INSERT INTO customer_transfers (customer_id, from_salesman_id, to_salesman_id, by_user_id) VALUES ($1,$2,$3,$4)',
        [c.id, c.salesman_id, toId(toSalesmanId), toId(byUserId)]
      );
      moved++;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return moved;
}

export async function archiveCustomer(id) {
  const { rowCount } = await query(
    'UPDATE customers SET archived_at = now(), updated_at = now() WHERE id = $1 AND archived_at IS NULL',
    [toId(id)]
  );
  return rowCount > 0;
}

/**
 * Import prepared rows. Skips rows that are invalid, or whose mobile/CR/VAT or exact name+salesman already exists.
 */
export async function importCustomers(rows, userId) {
  const client = await getClient();
  let added = 0;
  let skippedDuplicate = 0;
  let skippedInvalid = 0;
  const seen = new Set();
  try {
    await client.query('BEGIN');
    for (const r of rows) {
      if (!r || !r.valid || !r.name || !toId(r.salesmanId)) { skippedInvalid++; continue; }
      const nameKey = `${String(r.name).trim().toLowerCase()}|${toId(r.salesmanId)}`;
      if (seen.has(nameKey)) { skippedDuplicate++; continue; }
      const conds = ['(LOWER(name) = $1 AND salesman_id = $2)'];
      const params = [String(r.name).trim().toLowerCase(), toId(r.salesmanId)];
      if (r.mobile) { params.push(r.mobile); conds.push(`mobile = $${params.length}`); }
      if (r.crNumber) { params.push(String(r.crNumber).toLowerCase()); conds.push(`LOWER(cr_number) = $${params.length}`); }
      if (r.vatNumber) { params.push(String(r.vatNumber).toLowerCase()); conds.push(`LOWER(vat_number) = $${params.length}`); }
      const { rows: dup } = await client.query(
        `SELECT id FROM customers WHERE archived_at IS NULL AND (${conds.join(' OR ')}) LIMIT 1`,
        params
      );
      if (dup.length) { skippedDuplicate++; continue; }
      await client.query(
        `INSERT INTO customers (name, salesman_id, status, mobile, cr_number, vat_number, data, source, created_by_user_id)
         VALUES ($1, $2, 'not_started', $3, $4, $5, $6::jsonb, 'import', $7)`,
        [String(r.name).trim().slice(0, 255), toId(r.salesmanId), r.mobile || null, r.crNumber || null, r.vatNumber || null,
          JSON.stringify(r.data && typeof r.data === 'object' ? r.data : {}), toId(userId)]
      );
      seen.add(nameKey);
      added++;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return { added, skippedDuplicate, skippedInvalid };
}

// ---------------- Dashboard ----------------

export async function getSummary() {
  const [fields, { rows: customers }, links] = await Promise.all([
    getCustomerFields({ includeHidden: false }),
    query(`${CUSTOMER_SELECT} WHERE c.archived_at IS NULL`),
    listLinks(),
  ]);

  const totals = { total: 0, not_started: 0, in_progress: 0, complete: 0, pending_approval: 0 };
  const per = new Map(links.map((l) => [l.salesmanId, {
    ...l, assigned: 0, remaining: 0, submitted: 0, complete: 0, pending: 0, lastActivity: null, percentSum: 0,
  }]));
  let percentSum = 0;
  const missingCounts = Object.fromEntries(fields.map((f) => [f.key, 0]));

  for (const row of customers) {
    const c = customerToApi(row);
    const pct = completeness(c, fields, c.salesmanType || 'branch', { audience: 'salesman' }).percent;
    const adminPct = completeness(c, fields, c.salesmanType || 'branch').percent;
    const stage = stageOf(c, adminPct);
    percentSum += adminPct;
    totals.total++;
    totals[stage]++;
    const p = c.salesmanId ? per.get(c.salesmanId) : null;
    if (p) {
      p.assigned++;
      p.percentSum += pct;
      if (c.status === 'not_started') p.remaining++;
      if (stage === 'in_progress') p.submitted++;
      if (stage === 'complete') p.complete++;
      if (stage === 'pending_approval') p.pending++;
      if (c.submittedAt && (!p.lastActivity || c.submittedAt > p.lastActivity)) p.lastActivity = c.submittedAt;
    }
    if (c.status !== 'not_started') {
      const { missing } = completeness(c, fields, c.salesmanType || 'branch');
      missing.forEach((k) => { if (k in missingCounts) missingCounts[k]++; });
    }
  }

  const done = totals.in_progress + totals.complete;
  return {
    totals: {
      ...totals,
      percentDone: totals.total ? Math.round((done / totals.total) * 100) : 0,
      percentComplete: totals.total ? Math.round(percentSum / totals.total) : 0,
    },
    salesmen: [...per.values()].filter((p) => p.assigned > 0 || p.linkEnabled).map(({ percentSum: ps, ...p }) => ({
      ...p, percent: p.assigned ? Math.round(ps / p.assigned) : 0,
    })),
    missing: fields.map((f) => ({ key: f.key, label: f.label, count: missingCounts[f.key] || 0 })),
  };
}

/** Super admin locks a customer: the salesman can no longer add details or documents. */
export async function setCustomerLocked(id, locked) {
  await query('UPDATE customers SET locked = $1, updated_at = now() WHERE id = $2 AND archived_at IS NULL', [Boolean(locked), toId(id)]);
  return getCustomerRow(id);
}

// ---------------- Leads <-> customers ----------------

const last8 = (v) => {
  const d = String(v || '').replace(/\D/g, '');
  return d.length >= 8 ? d.slice(-8) : null;
};

function normalizeLeadMobile(countryCode, mobile) {
  const d = String(mobile || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 8 && String(countryCode || '+968').replace(/\D/g, '') === '968') return `+968${d}`;
  if (d.length === 11 && d.startsWith('968')) return `+${d}`;
  const cc = String(countryCode || '').replace(/\D/g, '');
  if (cc && !d.startsWith(cc)) return `+${cc}${d}`;
  return `+${d}`;
}

/** Find the customer a lead belongs to (same mobile, or the one customer with exactly this name). */
export async function findCustomerForLead({ mobile, phone, name }) {
  const key = last8(mobile) || last8(phone);
  if (key) {
    const { rows } = await query(
      `SELECT id FROM customers WHERE archived_at IS NULL
         AND RIGHT(regexp_replace(COALESCE(mobile, ''), '\\D', '', 'g'), 8) = $1 ORDER BY id LIMIT 1`,
      [key]
    );
    if (rows[0]) return rows[0].id;
  }
  if (name && String(name).trim()) {
    const { rows } = await query(
      `SELECT MIN(id) AS id FROM customers WHERE archived_at IS NULL AND LOWER(TRIM(name)) = LOWER(TRIM($1)) HAVING COUNT(*) = 1`,
      [String(name)]
    );
    if (rows[0]) return rows[0].id;
  }
  return null;
}

/**
 * Every lead belongs to a customer. Use the chosen customer, or the matching one, or create a new one
 * (it then appears in the salesman's link list so he can complete the details).
 * leadRow: a raw leads row. Returns the customer id.
 */
export async function ensureCustomerForLead(leadRow, chosenCustomerId) {
  let cid = toId(chosenCustomerId);
  if (cid) {
    const { rows } = await query('SELECT id FROM customers WHERE id = $1 AND archived_at IS NULL', [cid]);
    if (!rows[0]) cid = null;
  }
  if (!cid) cid = await findCustomerForLead(leadRow);
  if (!cid) {
    const { rows } = await query(
      `INSERT INTO customers (name, salesman_id, status, mobile, data, source)
       VALUES ($1, $2, 'not_started', $3, $4::jsonb, 'enquiry') RETURNING id`,
      [
        String(leadRow.name || 'Customer').trim().slice(0, 255) || 'Customer',
        leadRow.salesman_id || null,
        normalizeLeadMobile(leadRow.country_code, leadRow.mobile || leadRow.phone),
        JSON.stringify(leadRow.customer_location ? { address: String(leadRow.customer_location).slice(0, 500) } : {}),
      ]
    );
    cid = rows[0].id;
  }
  await query('UPDATE leads SET customer_id = $1 WHERE id = $2', [cid, leadRow.id]);
  return cid;
}

/** Quick search for the "New enquiry" form: existing customers by name or mobile. */
export async function lookupCustomers(q, { salesmanId } = {}) {
  const text = String(q || '').trim();
  if (text.length < 2) return [];
  const digits = text.replace(/\D/g, '');
  const params = [`%${text.toLowerCase()}%`];
  let where = 'LOWER(c.name) LIKE $1';
  if (digits.length >= 4) {
    params.push(`%${digits.slice(-8)}%`);
    where += ` OR regexp_replace(COALESCE(c.mobile, ''), '\\D', '', 'g') LIKE $${params.length}`;
  }
  let scope = '';
  if (salesmanId !== undefined) {
    params.push(toId(salesmanId) ?? -1);
    scope = ` AND c.salesman_id = $${params.length}`;
  }
  const { rows } = await query(
    `SELECT c.id, c.name, c.mobile, c.data, c.salesman_id, s.name AS salesman_name, s.branch_id, b.name AS branch_name,
       (SELECT COUNT(*) FROM leads l WHERE l.customer_id = c.id AND l.archived_at IS NULL) AS lead_count
     FROM customers c
     LEFT JOIN salesmen s ON s.id = c.salesman_id
     LEFT JOIN branches b ON b.id = s.branch_id
     WHERE c.archived_at IS NULL AND (${where})${scope}
     ORDER BY c.name LIMIT 8`,
    params
  );
  return rows.map((r) => ({
    id: String(r.id),
    name: r.name,
    mobile: r.mobile || '',
    city: r.data?.city || '',
    governorate: r.data?.governorate || '',
    address: r.data?.address || '',
    salesmanId: r.salesman_id != null ? String(r.salesman_id) : null,
    salesmanName: r.salesman_name || '',
    branchId: r.branch_id != null ? String(r.branch_id) : null,
    branchName: r.branch_name || '',
    leadCount: Number(r.lead_count || 0),
  }));
}

/** Enquiries and quotations of one customer (for the customer page). */
export async function getCustomerActivity(customerId) {
  const cid = toId(customerId);
  const [{ rows: leads }, { rows: quotes }] = await Promise.all([
    query(
      `SELECT id, name, category, status, deal_value, quantity, salesman_name, branch_name, date, updated_at
       FROM leads WHERE customer_id = $1 AND archived_at IS NULL ORDER BY COALESCE(date, created_at) DESC`,
      [cid]
    ),
    query(
      `SELECT q.* FROM quotations q JOIN leads l ON l.id = q.lead_id
       WHERE l.customer_id = $1 AND q.archived_at IS NULL ORDER BY q.created_at DESC`,
      [cid]
    ),
  ]);
  return {
    leads: leads.map((l) => ({
      id: String(l.id), name: l.name, category: l.category || '', status: l.status, dealValue: Number(l.deal_value || 0),
      quantity: l.quantity || '', salesman: l.salesman_name || '', branch: l.branch_name || '', date: iso(l.date || l.updated_at),
    })),
    quotations: quotes.map((q) => ({
      id: String(q.id),
      number: q.code,
      total: Number(q.grand_total_omr || 0),
      status: q.status || '',
      date: iso(q.created_at),
      leadId: q.lead_id != null ? String(q.lead_id) : null,
    })),
    wonValue: leads.filter((l) => l.status === 'won').reduce((s, l) => s + Number(l.deal_value || 0), 0),
  };
}

/** Everything for the Customer Data Centre download: customers, enquiries, quotations, documents. */
export async function getDataCentreRows() {
  const [customers, fields, { rows: leads }, { rows: quotes }, { rows: files }] = await Promise.all([
    listCustomers({}),
    getCustomerFields({ includeHidden: false }),
    query(`SELECT l.*, c.name AS customer_name_linked FROM leads l LEFT JOIN customers c ON c.id = l.customer_id
           WHERE l.archived_at IS NULL ORDER BY COALESCE(l.date, l.created_at) DESC`),
    query(`SELECT q.*, l.customer_id, c.name AS customer_name_linked FROM quotations q
           LEFT JOIN leads l ON l.id = q.lead_id LEFT JOIN customers c ON c.id = l.customer_id
           WHERE q.archived_at IS NULL ORDER BY q.created_at DESC`),
    query(`SELECT f.*, c.name AS customer_name FROM customer_files f JOIN customers c ON c.id = f.customer_id
           WHERE f.archived_at IS NULL AND c.archived_at IS NULL ORDER BY c.name, f.uploaded_at`),
  ]);
  return { customers, fields, leads, quotes, files };
}
