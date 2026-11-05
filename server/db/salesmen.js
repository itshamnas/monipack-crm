import { query } from './pool.js';
import { salesmanToApi } from './utils.js';

export async function getSalesmen() {
  const { rows } = await query(
    'SELECT * FROM salesmen WHERE archived_at IS NULL ORDER BY name'
  );
  return rows.map(salesmanToApi);
}

export async function getSalesmanById(id) {
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return null;
  const { rows } = await query(
    'SELECT * FROM salesmen WHERE id = $1 AND archived_at IS NULL', [numId]
  );
  return rows[0] ? salesmanToApi(rows[0]) : null;
}

export async function findOrCreateSalesman(name, opts = {}) {
  if (!name || !name.trim()) return null;
  const cleanName = name.trim();

  // Try to find existing by name (case-insensitive)
  const { rows: existing } = await query(
    'SELECT * FROM salesmen WHERE LOWER(name) = LOWER($1) AND archived_at IS NULL LIMIT 1',
    [cleanName]
  );
  if (existing[0]) return salesmanToApi(existing[0]);

  // Create new
  const type = opts.type || 'branch';
  const branchId = opts.branchId ? parseInt(opts.branchId, 10) : null;
  const phone = opts.phone || null;

  const { rows } = await query(
    `INSERT INTO salesmen (name, phone, type, branch_id, is_active)
     VALUES ($1, $2, $3, $4, true)
     RETURNING *`,
    [cleanName, phone, type, branchId]
  );
  return salesmanToApi(rows[0]);
}

export async function createSalesman({ name, phone, type, branchId, isActive }) {
  const { rows } = await query(
    `INSERT INTO salesmen (name, phone, type, branch_id, is_active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [name, phone || null, type || 'branch', branchId ? parseInt(branchId, 10) : null, isActive !== false]
  );
  return salesmanToApi(rows[0]);
}

export async function updateSalesman(id, updates) {
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return null;
  const { rows } = await query(
    `UPDATE salesmen SET
       name = COALESCE($1, name),
       phone = COALESCE($2, phone),
       type = COALESCE($3, type),
       branch_id = COALESCE($4, branch_id),
       is_active = COALESCE($5, is_active),
       updated_at = now()
     WHERE id = $6 AND archived_at IS NULL
     RETURNING *`,
    [updates.name, updates.phone, updates.type, updates.branchId ? parseInt(updates.branchId, 10) : null, updates.isActive, numId]
  );
  return rows[0] ? salesmanToApi(rows[0]) : null;
}

export async function deleteSalesman(id) {
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return false;
  const { rowCount } = await query(
    'UPDATE salesmen SET archived_at = now(), updated_at = now() WHERE id = $1 AND archived_at IS NULL',
    [numId]
  );
  return rowCount > 0;
}
