import { query } from './pool.js';

export async function getCategories() {
  const { rows } = await query('SELECT name FROM categories ORDER BY id');
  return rows.map(r => r.name);
}

export async function addCategory(name) {
  if (!name || typeof name !== 'string' || !name.trim()) return false;
  const clean = name.trim();
  await query(
    'INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
    [clean]
  );
  return getCategories();
}

export async function deleteCategory(name) {
  if (!name) return false;
  const { rowCount } = await query('DELETE FROM categories WHERE name = $1', [name]);
  return rowCount > 0;
}
