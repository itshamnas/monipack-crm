import pool, { query, getClient } from './pool.js';
import { normalizeOmanPhone, leadToApi } from './utils.js';
import { ensureCustomerForLead } from './customers.js';
import { leadScopeSql } from './scope.js';

/** Match a salesman name (as the screens send it) to the salesmen table. */
async function resolveSalesmanId(runner, name) {
  if (!name || !String(name).trim()) return null;
  const { rows } = await runner.query(
    'SELECT id FROM salesmen WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) AND archived_at IS NULL ORDER BY id LIMIT 1',
    [String(name)]
  );
  return rows[0] ? rows[0].id : null;
}

function toId(v) {
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

export async function getLeads(filters = {}) {
  let sql = 'SELECT * FROM leads WHERE archived_at IS NULL';
  const params = [];
  let idx = 1;

  // Own-scope (salesman) or department-scope (B2B / Retail manager)
  const sc = leadScopeSql(filters, idx);
  if (sc.params.length) { sql += sc.sql; params.push(...sc.params); idx += sc.params.length; }

  if (filters.search && filters.search.trim()) {
    const q = `%${filters.search.trim().toLowerCase()}%`;
    sql += ` AND (LOWER(name) LIKE $${idx} OR phone LIKE $${idx} OR mobile LIKE $${idx} OR LOWER(email) LIKE $${idx} OR LOWER(customer_location) LIKE $${idx} OR LOWER(salesman_name) LIKE $${idx} OR LOWER(notes) LIKE $${idx} OR LOWER(quantity) LIKE $${idx})`;
    params.push(q);
    idx++;
  }

  if (filters.status && filters.status !== 'all' && filters.status !== 'All Stages' && filters.status.trim()) {
    sql += ` AND status = $${idx++}`;
    params.push(filters.status);
  }

  if (filters.category && filters.category !== 'all' && filters.category !== 'All Categories' && filters.category.trim()) {
    sql += ` AND category = $${idx++}`;
    params.push(filters.category);
  }

  if (filters.branch && filters.branch !== 'all' && filters.branch !== 'All Oman Branches' && filters.branch.trim()) {
    const bFilter = filters.branch.trim();
    const bId = parseInt(bFilter, 10);
    if (!isNaN(bId)) {
      sql += ` AND branch_id = $${idx++}`;
      params.push(bId);
    } else {
      sql += ` AND (branch_name = $${idx})`;
      params.push(bFilter);
      idx++;
    }
  }

  sql += ' ORDER BY updated_at DESC NULLS LAST, date DESC NULLS LAST';

  const { rows } = await query(sql, params);
  return rows.map(leadToApi);
}

export async function getLeadById(id) {
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return null;
  const { rows } = await query('SELECT * FROM leads WHERE id = $1 AND archived_at IS NULL', [numId]);
  return rows[0] ? leadToApi(rows[0]) : null;
}

/** A valid date for the next follow-up, or null to clear it */
function followUpOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function createLead(lead) {
  const { countryCode, mobile, phone } = normalizeOmanPhone(lead.countryCode, lead.mobile, lead.phone);
  const salesmanId = toId(lead.salesmanId) ?? await resolveSalesmanId({ query }, lead.salesman);

  const { rows } = await query(
    `INSERT INTO leads (
       name, contact_person, category, product_details, country_code, mobile, phone,
       email, branch_id, branch_name, salesman_id, salesman_name, customer_location,
       status, deal_value, quantity, notes, intake_completed, source, date,
       next_follow_up_at, follow_up_note
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
     RETURNING *`,
    [
      lead.name || 'Untitled Lead',
      lead.contactPerson || '',
      lead.category || 'Packaging Products',
      lead.productDetails || '',
      countryCode,
      mobile,
      phone,
      lead.email || '',
      lead.branchId ? parseInt(lead.branchId, 10) || null : null,
      lead.branch || 'Ghala',
      salesmanId,
      lead.salesman || '',
      lead.customerLocation || '',
      lead.status || 'new',
      Number(lead.dealValue || 0),
      lead.quantity || '',
      lead.notes || '',
      Boolean(lead.intakeCompleted),
      lead.source || null,
      lead.date || new Date().toISOString(),
      followUpOrNull(lead.nextFollowUpAt),
      String(lead.followUpNote || '').slice(0, 300),
    ]
  );
  // Every enquiry belongs to a customer: the one chosen in the form, the matching one, or a new one
  const customerId = await ensureCustomerForLead(rows[0], lead.customerId);
  return leadToApi({ ...rows[0], customer_id: customerId });
}

export async function updateLead(id, updates, options = {}) {
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return null;

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { rows: existingRows } = await client.query('SELECT * FROM leads WHERE id = $1 AND archived_at IS NULL FOR UPDATE', [numId]);
    if (!existingRows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    const e = existingRows[0];

    const rawCode = updates.countryCode || e.country_code || '+968';
    const rawMobile = updates.mobile !== undefined ? updates.mobile : e.mobile;
    const rawPhone = updates.phone !== undefined ? updates.phone : e.phone;
    const { countryCode, mobile, phone } = normalizeOmanPhone(rawCode, rawMobile, rawPhone);

    let nextSalesmanId = e.salesman_id;
    if (updates.salesmanId !== undefined) {
      nextSalesmanId = toId(updates.salesmanId);
    } else if (updates.salesman !== undefined && updates.salesman !== e.salesman_name) {
      nextSalesmanId = await resolveSalesmanId(client, updates.salesman);
    }

    const { rows } = await client.query(
      `UPDATE leads SET
         name = $1, contact_person = $2, category = $3, product_details = $4,
         country_code = $5, mobile = $6, phone = $7, email = $8,
         branch_id = $9, branch_name = $10, salesman_id = $11, salesman_name = $12,
         customer_location = $13, status = $14, deal_value = $15, quantity = $16,
         notes = $17, intake_completed = $18, lost_reason = $19,
         last_contacted_at = $20, next_follow_up_at = $22, follow_up_note = $23, updated_at = now()
       WHERE id = $21 AND archived_at IS NULL
       RETURNING *`,
      [
        updates.name !== undefined ? updates.name : e.name,
        updates.contactPerson !== undefined ? updates.contactPerson : e.contact_person,
        updates.category !== undefined ? updates.category : e.category,
        updates.productDetails !== undefined ? updates.productDetails : e.product_details,
        countryCode,
        mobile,
        phone,
        updates.email !== undefined ? updates.email : e.email,
        updates.branchId !== undefined ? (parseInt(updates.branchId, 10) || null) : e.branch_id,
        updates.branch !== undefined ? updates.branch : e.branch_name,
        nextSalesmanId,
        updates.salesman !== undefined ? updates.salesman : e.salesman_name,
        updates.customerLocation !== undefined ? updates.customerLocation : e.customer_location,
        updates.status !== undefined ? updates.status : e.status,
        updates.dealValue !== undefined ? Number(updates.dealValue) : Number(e.deal_value),
        updates.quantity !== undefined ? updates.quantity : e.quantity,
        updates.notes !== undefined ? updates.notes : e.notes,
        updates.intakeCompleted !== undefined ? Boolean(updates.intakeCompleted) : e.intake_completed,
        updates.lostReason !== undefined ? updates.lostReason : e.lost_reason,
        updates.lastContactedAt !== undefined ? updates.lastContactedAt : e.last_contacted_at,
        numId,
        updates.nextFollowUpAt !== undefined ? followUpOrNull(updates.nextFollowUpAt) : e.next_follow_up_at,
        updates.followUpNote !== undefined ? String(updates.followUpNote || '').slice(0, 300) : (e.follow_up_note || ''),
      ]
    );

    const changedBy = options.changedBy || updates.changedBy || 'System';
    if (updates.status && updates.status !== e.status) {
      await client.query(
        `INSERT INTO lead_stage_history (lead_id, from_status, to_status, changed_by)
         VALUES ($1, $2, $3, $4)`,
        [numId, e.status, updates.status, changedBy]
      );
    }

    await client.query('COMMIT');
    if (!rows[0]) return null;
    // Linked to another customer in the form, or not linked yet: (re)link it
    if (updates.customerId !== undefined || !rows[0].customer_id) {
      const customerId = await ensureCustomerForLead(rows[0], updates.customerId);
      return leadToApi({ ...rows[0], customer_id: customerId });
    }
    return leadToApi(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteLead(id) {
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return false;
  const { rowCount } = await query(
    'UPDATE leads SET archived_at = now(), updated_at = now() WHERE id = $1 AND archived_at IS NULL',
    [numId]
  );
  return rowCount > 0;
}

export async function purgeAllLeads() {
  const { rows } = await query('SELECT COUNT(*) AS cnt FROM leads WHERE archived_at IS NULL');
  const count = parseInt(rows[0].cnt);
  await query('UPDATE leads SET archived_at = now(), updated_at = now() WHERE archived_at IS NULL');
  return count;
}

export async function bulkUpsertLeads(items = [], options = {}) {
  const duplicatePolicy = options.duplicatePolicy || 'update';
  let addedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const item of items) {
    if (item.isValid === false) { skippedCount++; continue; }
    const cleanName = (item.name || '').trim();
    const cleanMobile = (item.mobile || '').trim();
    if (!cleanName || !cleanMobile) { skippedCount++; continue; }

    let existingRow = null;
    if (duplicatePolicy !== 'allow_duplicates') {
      const { rows } = await query(
        `SELECT * FROM leads WHERE archived_at IS NULL AND (
          (mobile IS NOT NULL AND mobile = $1) OR
          (phone IS NOT NULL AND phone LIKE '%' || $1 || '%') OR
          (LOWER(name) = LOWER($2))
        ) LIMIT 1`,
        [cleanMobile, cleanName]
      );
      existingRow = rows[0];
    }

    if (existingRow) {
      if (duplicatePolicy === 'skip') { skippedCount++; continue; }

      const mergedNotes = item.notes
        ? (existingRow.notes ? `${existingRow.notes}\n[Import Update ${new Date().toISOString().slice(0, 10)}]: ${item.notes}` : item.notes)
        : existingRow.notes;

      await query(
        `UPDATE leads SET
           name = $1, contact_person = COALESCE(NULLIF($2, ''), contact_person),
           category = COALESCE(NULLIF($3, ''), category),
           mobile = COALESCE(NULLIF($4, ''), mobile), phone = COALESCE(NULLIF($5, ''), phone),
           email = COALESCE(NULLIF($6, ''), email),
           customer_location = CASE WHEN $7 != '' AND $7 != 'Needs Intake' THEN $7 ELSE customer_location END,
           branch_name = COALESCE(NULLIF($8, ''), branch_name),
           salesman_name = COALESCE(NULLIF($9, ''), salesman_name),
           status = CASE WHEN $10 != '' AND $10 != 'new' THEN $10 ELSE status END,
           deal_value = CASE WHEN $11 > 0 THEN $11 ELSE deal_value END,
           quantity = CASE WHEN $12 != '' AND $12 != 'Needs Intake' THEN $12 ELSE quantity END,
           notes = $13, updated_at = now()
         WHERE id = $14`,
        [
          cleanName || existingRow.name,
          item.contactPerson || '',
          item.category || '',
          cleanMobile,
          item.phone || '',
          item.email || '',
          item.customerLocation || '',
          item.branch || '',
          item.salesman || '',
          item.status || '',
          Number(item.dealValue || 0),
          item.quantity || '',
          mergedNotes || '',
          existingRow.id,
        ]
      );
      updatedCount++;
    } else {
      const { countryCode: cc, mobile: mob, phone: ph } = normalizeOmanPhone(
        item.countryCode || '+968', cleanMobile, item.phone
      );
      await query(
        `INSERT INTO leads (name, contact_person, category, country_code, mobile, phone,
           email, customer_location, branch_name, salesman_name, status, deal_value,
           quantity, notes, source, date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'new',$11,$12,$13,$14,now())`,
        [
          cleanName,
          item.contactPerson || '',
          item.category || 'Packaging Products',
          cc, mob, ph || (mob ? `+968 ${mob}` : ''),
          item.email || '',
          item.customerLocation || 'Needs Intake',
          item.branch || 'Ghala',
          item.salesman || '',
          Number(item.dealValue || 0),
          item.quantity || 'Needs Intake',
          item.notes || 'Imported inquiry. Awaiting call intake.',
          item.source || 'csv_import',
        ]
      );
      addedCount++;

      if (item.category && item.category.trim()) {
        await query('INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [item.category.trim()]);
      }
    }
  }

  // Link imported leads to their salesman record (the import file only carries the name)
  await query(
    `UPDATE leads l SET salesman_id = s.id
     FROM salesmen s
     WHERE l.salesman_id IS NULL AND l.archived_at IS NULL
       AND l.salesman_name IS NOT NULL AND l.salesman_name <> ''
       AND LOWER(TRIM(l.salesman_name)) = LOWER(TRIM(s.name)) AND s.archived_at IS NULL`
  );

  // Every imported lead belongs to a customer (matched by mobile/name, or created)
  const { rows: unlinked } = await query('SELECT * FROM leads WHERE customer_id IS NULL AND archived_at IS NULL');
  for (const row of unlinked) await ensureCustomerForLead(row);

  const { rows: total } = await query('SELECT COUNT(*) AS cnt FROM leads WHERE archived_at IS NULL');
  return { addedCount, updatedCount, skippedCount, totalLeads: parseInt(total[0].cnt) };
}

/** Department of a lead ('b2b' | 'retail' | null). */
export async function getLeadSegment(id) {
  const n = toId(id);
  if (n === null) return null;
  const { rows } = await query('SELECT lead_segment(branch_id, salesman_id, branch_name) AS seg FROM leads WHERE id = $1', [n]);
  return rows[0]?.seg || null;
}
