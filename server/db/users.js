import bcrypt from 'bcryptjs';
import { query } from './pool.js';
import { userToApi } from './utils.js';
import { normalizeRole } from '../auth/permissions.js';

const USER_COLUMNS = `u.id, u.name, u.email, u.role, u.can_export, u.is_active, u.token_version,
  u.must_change_password, u.last_login_at, u.salesman_id, u.created_at, u.updated_at, u.photo_key,
  s.name AS salesman_name`;

const USER_SELECT = `SELECT ${USER_COLUMNS} FROM users u LEFT JOIN salesmen s ON s.id = u.salesman_id`;

function hashPassword(password) {
  const salt = bcrypt.genSaltSync(10);
  return bcrypt.hashSync(password, salt);
}

function toId(id) {
  const n = parseInt(id, 10);
  return isNaN(n) ? null : n;
}

/** All users (active and deactivated), never with password hashes. */
export async function getUsers() {
  const { rows } = await query(`${USER_SELECT} WHERE u.archived_at IS NULL ORDER BY u.created_at`);
  return rows.map(userToApi);
}

/** Internal: includes password_hash. Never send the result to the browser. */
export async function getUserByEmail(email) {
  if (!email) return null;
  const { rows } = await query(
    'SELECT * FROM users WHERE email = $1 AND archived_at IS NULL',
    [String(email).toLowerCase().trim()]
  );
  return rows[0] || null;
}

/** Internal: includes password_hash. Never send the result to the browser. */
export async function getUserById(id) {
  const numId = toId(id);
  if (numId === null) return null;
  const { rows } = await query('SELECT * FROM users WHERE id = $1 AND archived_at IS NULL', [numId]);
  return rows[0] || null;
}

/** Light lookup used by the auth middleware on every request. */
export async function getUserAuthState(id) {
  const numId = toId(id);
  if (numId === null) return null;
  const { rows } = await query(
    `SELECT id, name, email, role, can_export, is_active, token_version, must_change_password, salesman_id, photo_key, totp_enabled
     FROM users WHERE id = $1 AND archived_at IS NULL`,
    [numId]
  );
  return rows[0] || null;
}

export async function getPublicUserById(id) {
  const numId = toId(id);
  if (numId === null) return null;
  const { rows } = await query(`${USER_SELECT} WHERE u.id = $1 AND u.archived_at IS NULL`, [numId]);
  return rows[0] ? userToApi(rows[0]) : null;
}

export async function createUser({
  name, email, password, role, passwordHash: existingHash,
  canExport, salesmanId, mustChangePassword = false,
}) {
  const hash = existingHash || hashPassword(password);
  const cleanRole = normalizeRole(role) || 'manager';
  const exportFlag = canExport !== undefined ? Boolean(canExport) : cleanRole === 'super_admin';

  const { rows } = await query(
    `INSERT INTO users (name, email, role, can_export, password_hash, salesman_id, must_change_password)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      name || 'User',
      String(email).toLowerCase().trim(),
      cleanRole,
      exportFlag,
      hash,
      cleanRole === 'salesman' ? toId(salesmanId) : null,
      Boolean(mustChangePassword),
    ]
  );
  return getPublicUserById(rows[0].id);
}

/**
 * Update role / active status / export flag / linked salesman / name.
 * Bumps token_version when access changes so existing sessions end immediately.
 */
export async function updateUser(id, updates = {}) {
  const numId = toId(id);
  if (numId === null) return null;
  const existing = await getUserById(numId);
  if (!existing) return null;

  const role = updates.role !== undefined ? normalizeRole(updates.role) : existing.role;
  if (!role) throw Object.assign(new Error('Invalid role'), { status: 400 });

  const isActive = updates.isActive !== undefined ? Boolean(updates.isActive) : existing.is_active;
  const canExport = updates.canExport !== undefined ? Boolean(updates.canExport) : existing.can_export;
  let salesmanId = updates.salesmanId !== undefined ? toId(updates.salesmanId) : existing.salesman_id;
  if (role !== 'salesman') salesmanId = null;
  const name = updates.name !== undefined && String(updates.name).trim() ? String(updates.name).trim() : existing.name;

  const accessChanged =
    role !== existing.role ||
    isActive !== existing.is_active ||
    canExport !== existing.can_export ||
    salesmanId !== existing.salesman_id;

  await query(
    `UPDATE users SET name = $1, role = $2, is_active = $3, can_export = $4, salesman_id = $5,
       token_version = token_version + $6, updated_at = now()
     WHERE id = $7 AND archived_at IS NULL`,
    [name, role, isActive, canExport, salesmanId, accessChanged ? 1 : 0, numId]
  );
  return getPublicUserById(numId);
}

/** Deactivate instead of deleting, so history and audit stay intact. */
export async function deactivateUser(id) {
  return updateUser(id, { isActive: false });
}

/** Kept for older callers: now a soft deactivate. */
export async function deleteUser(id) {
  const updated = await deactivateUser(id);
  return Boolean(updated);
}

/**
 * Admin reset: new temporary password, forces change at next login, ends old sessions.
 */
export async function updateUserPassword(id, newPassword, { mustChange = true } = {}) {
  const numId = toId(id);
  if (numId === null) return null;
  const { rowCount } = await query(
    `UPDATE users SET password_hash = $1, must_change_password = $2,
       token_version = token_version + 1, updated_at = now()
     WHERE id = $3 AND archived_at IS NULL`,
    [hashPassword(newPassword), Boolean(mustChange), numId]
  );
  if (!rowCount) return null;
  return getPublicUserById(numId);
}

export async function recordLogin(id) {
  const numId = toId(id);
  if (numId === null) return;
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [numId]);
}

export async function countActiveSuperAdmins(excludeId = null) {
  const { rows } = await query(
    `SELECT COUNT(*) AS cnt FROM users
     WHERE role = 'super_admin' AND is_active = true AND archived_at IS NULL
       AND ($1::int IS NULL OR id <> $1::int)`,
    [toId(excludeId)]
  );
  return parseInt(rows[0].cnt, 10);
}

export async function initUsers() {
  const { rows } = await query('SELECT COUNT(*) as count FROM users WHERE archived_at IS NULL');
  if (parseInt(rows[0].count, 10) === 0) {
    const seedEmail = process.env.SEED_ADMIN_EMAIL?.trim();
    const seedPassword = process.env.SEED_ADMIN_PASSWORD;
    if (seedEmail && seedPassword) {
      await createUser({
        name: 'Monipack Administrator',
        email: seedEmail,
        password: seedPassword,
        role: 'super_admin',
        mustChangePassword: true,
      });
      console.log(`Seeded initial Super Administrator account: ${seedEmail}`);
    }
  }
}
