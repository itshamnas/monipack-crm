import { query } from './pool.js';
import { userToApi } from './utils.js';

export async function getUsers() {
  const { rows } = await query(
    'SELECT id, name, email, role, can_export, created_at, updated_at FROM users WHERE archived_at IS NULL ORDER BY created_at'
  );
  return rows.map(userToApi);
}

export async function getUserByEmail(email) {
  if (!email) return null;
  const { rows } = await query(
    'SELECT * FROM users WHERE email = $1 AND archived_at IS NULL',
    [email.toLowerCase().trim()]
  );
  return rows[0] || null;
}

export async function getUserById(id) {
  if (!id) return null;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return null;
  const { rows } = await query(
    'SELECT * FROM users WHERE id = $1 AND archived_at IS NULL',
    [numId]
  );
  return rows[0] || null;
}

export async function createUser({ name, email, password, role, passwordHash: existingHash }) {
  // If existingHash is provided (from import), use it directly. Otherwise hash the password.
  let hash = existingHash;
  if (!hash) {
    const bcrypt = await import('bcryptjs');
    const salt = bcrypt.default.genSaltSync(10);
    hash = bcrypt.default.hashSync(password, salt);
  }

  const { rows } = await query(
    `INSERT INTO users (name, email, role, can_export, password_hash)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, email, role, can_export, created_at, updated_at`,
    [name || 'User', email.toLowerCase().trim(), role || 'admin', role === 'super_admin', hash]
  );
  return userToApi(rows[0]);
}

export async function deleteUser(id) {
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return false;
  // Protect main administrator by email check
  const { rows: check } = await query('SELECT email FROM users WHERE id = $1', [numId]);
  if (!check[0] || check[0].email === 'administrator@monipack.com') return false;
  const { rowCount } = await query(
    'UPDATE users SET archived_at = now(), updated_at = now() WHERE id = $1 AND archived_at IS NULL',
    [numId]
  );
  return rowCount > 0;
}

export async function updateUserPassword(id, newPassword) {
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return null;
  const bcrypt = await import('bcryptjs');
  const salt = bcrypt.default.genSaltSync(10);
  const hash = bcrypt.default.hashSync(newPassword, salt);
  const { rows } = await query(
    `UPDATE users SET password_hash = $1, updated_at = now()
     WHERE id = $2 AND archived_at IS NULL
     RETURNING id, name, email, role, can_export, created_at, updated_at`,
    [hash, numId]
  );
  if (!rows[0]) return null;
  return userToApi(rows[0]);
}

export async function initUsers() {
  const { rows } = await query('SELECT COUNT(*) as count FROM users WHERE archived_at IS NULL');
  if (parseInt(rows[0].count) === 0) {
    const seedEmail = process.env.SEED_ADMIN_EMAIL?.trim();
    const seedPassword = process.env.SEED_ADMIN_PASSWORD;
    if (seedEmail && seedPassword) {
      await createUser({
        name: 'Monipack Administrator',
        email: seedEmail,
        password: seedPassword,
        role: 'super_admin',
      });
      console.log(`Seeded initial Super Administrator account: ${seedEmail}`);
    }
  }
}
