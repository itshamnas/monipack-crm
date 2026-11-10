import { query } from './pool.js';
import { branchToApi } from './utils.js';

const TYPE = (t) => (t === 'b2b' ? 'b2b' : t === 'retail' ? 'retail' : null);
const SALESMAN_TYPE = { retail: 'branch', b2b: 'route_b2b' };
/** A salesman's type follows his branch: Retail branch = Branch salesman, B2B branch = Route / B2B salesman. */
export async function syncSalesmenToBranch(branchId) {
  await query(
    `UPDATE salesmen s SET type = CASE b.type WHEN 'b2b' THEN 'route_b2b' ELSE 'branch' END, updated_at = now()
     FROM branches b WHERE b.id = $1 AND s.branch_id = b.id AND s.archived_at IS NULL
       AND s.type <> CASE b.type WHEN 'b2b' THEN 'route_b2b' ELSE 'branch' END`, [branchId]);
}
export { SALESMAN_TYPE };

const BASE_SELECT = `
  SELECT b.*, s.name AS default_salesman_name
  FROM branches b
  LEFT JOIN salesmen s ON b.default_salesman_id = s.id
`;

export async function getBranches() {
  const { rows } = await query(
    `${BASE_SELECT} WHERE b.archived_at IS NULL ORDER BY b.is_headquarters DESC, b.name`
  );
  return rows.map(branchToApi);
}

export async function getBranchById(id) {
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return null;
  const { rows } = await query(
    `${BASE_SELECT} WHERE b.id = $1 AND b.archived_at IS NULL`,
    [numId]
  );
  return rows[0] ? branchToApi(rows[0]) : null;
}

export async function getBranchByLegacyId(legacyId) {
  if (!legacyId) return null;
  const { rows } = await query(
    `${BASE_SELECT} WHERE b.legacy_id = $1 AND b.archived_at IS NULL`,
    [legacyId]
  );
  return rows[0] ? branchToApi(rows[0]) : null;
}

export async function addBranch({ name, city, phone, salesman, isHeadquarters, legacyId, type }) {
  // Find or create salesman if provided
  let salesmanId = null;
  if (salesman && salesman.trim() && salesman !== 'Unassigned') {
    const { findOrCreateSalesman } = await import('./salesmen.js');
    const sm = await findOrCreateSalesman(salesman.trim());
    salesmanId = sm ? parseInt(sm.id, 10) : null;
  }

  const { rows } = await query(
    `INSERT INTO branches (legacy_id, name, city, phone, is_headquarters, default_salesman_id, type)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [legacyId || null, name.trim(), city || 'Oman', phone || '', isHeadquarters === true, salesmanId, TYPE(type) || 'retail']
  );

  // If salesman found, link back to this branch as home if not already linked
  if (salesmanId && rows[0]) {
    const { query: q } = await import('./pool.js');
    await q(
      'UPDATE salesmen SET branch_id = COALESCE(branch_id, $1), updated_at = now() WHERE id = $2',
      [rows[0].id, salesmanId]
    );
    await syncSalesmenToBranch(rows[0].id);
  }

  // Re-fetch with join
  const { rows: final } = await query(
    `${BASE_SELECT} WHERE b.id = $1`,
    [rows[0].id]
  );
  return branchToApi(final[0]);
}

export async function updateBranch(id, updates) {
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return null;

  // Check exists
  const { rows: existing } = await query('SELECT * FROM branches WHERE id = $1 AND archived_at IS NULL', [numId]);
  if (!existing[0]) return null;

  let salesmanId = existing[0].default_salesman_id;
  if (updates.salesman !== undefined) {
    if (updates.salesman && updates.salesman.trim() && updates.salesman !== 'Unassigned') {
      const { findOrCreateSalesman } = await import('./salesmen.js');
      const sm = await findOrCreateSalesman(updates.salesman.trim());
      salesmanId = sm ? parseInt(sm.id, 10) : null;
    } else {
      salesmanId = null;
    }
  }

  const { rows } = await query(
    `UPDATE branches SET
       name = COALESCE($1, name),
       city = COALESCE($2, city),
       phone = COALESCE($3, phone),
       is_headquarters = COALESCE($4, is_headquarters),
       default_salesman_id = $5,
       type = COALESCE($7, type),
       updated_at = now()
     WHERE id = $6 AND archived_at IS NULL
     RETURNING *`,
    [
      updates.name || null,
      updates.city || null,
      updates.phone || null,
      updates.isHeadquarters !== undefined ? updates.isHeadquarters : null,
      salesmanId,
      numId,
      TYPE(updates.type),
    ]
  );
  if (!rows[0]) return null;
  await syncSalesmenToBranch(numId);

  // NOTE: Per requirement #2, we do NOT cascade name/salesman changes to existing leads.

  const { rows: final } = await query(`${BASE_SELECT} WHERE b.id = $1`, [numId]);
  return branchToApi(final[0]);
}

export async function deleteBranch(id) {
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return false;
  const { rowCount } = await query(
    'UPDATE branches SET archived_at = now(), updated_at = now() WHERE id = $1 AND archived_at IS NULL',
    [numId]
  );
  return rowCount > 0;
}
