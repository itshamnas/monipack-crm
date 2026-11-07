import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { query, getClient } from '../db/pool.js';
import { uploadRoot } from '../customers/storage.js';

/**
 * Data cleanup (super admin only): wipe test or old data before going live.
 *
 * Always kept: super admin logins, company settings, customer form fields, pipeline stages,
 * and the security audit log (the cleanup itself is recorded there).
 * Safety: super_admin role + current password + the word DELETE, all in one transaction.
 */
export const CLEANUP_GROUPS = [
  { id: 'customers', label: 'Customers & documents', note: 'All customers, their uploaded CR / VAT documents, submissions and transfers.' },
  { id: 'leads', label: 'Leads & follow-ups', note: 'All leads, stage history and lead activity notes.' },
  { id: 'quotations', label: 'Quotations', note: 'All quotations and their items. Numbering can restart.' },
  { id: 'salesmen', label: 'Salesmen & links', note: 'All salesmen, their secret links, PINs and link history.' },
  { id: 'products', label: 'Products & categories', note: 'The product list and product categories.' },
  { id: 'branches', label: 'Branches', note: 'All branches.' },
  { id: 'tasks', label: 'Tasks', note: 'All tasks and their comments.' },
  { id: 'activity', label: 'Activity history', note: 'The activity feed (who did what). The security audit log is kept.' },
  { id: 'users', label: 'Staff logins', note: 'Every login except super admins (managers, customer care, salesman logins).' },
];
const GROUP_IDS = new Set(CLEANUP_GROUPS.map((g) => g.id));

const COUNT_SQL = {
  customers: 'SELECT (SELECT COUNT(*) FROM customers) AS n, (SELECT COUNT(*) FROM customer_files) AS extra',
  leads: 'SELECT COUNT(*) AS n FROM leads',
  quotations: 'SELECT COUNT(*) AS n FROM quotations',
  salesmen: 'SELECT COUNT(*) AS n FROM salesmen',
  products: 'SELECT (SELECT COUNT(*) FROM products) AS n, (SELECT COUNT(*) FROM categories) AS extra',
  branches: 'SELECT COUNT(*) AS n FROM branches',
  activity: 'SELECT COUNT(*) AS n FROM lead_activities',
  tasks: 'SELECT COUNT(*) AS n FROM tasks WHERE archived_at IS NULL',
  users: "SELECT COUNT(*) AS n FROM users WHERE role <> 'super_admin'",
};

export async function cleanupSummary() {
  const out = [];
  for (const g of CLEANUP_GROUPS) {
    const { rows } = await query(COUNT_SQL[g.id]);
    out.push({ ...g, count: Number(rows[0].n), extra: rows[0].extra !== undefined ? Number(rows[0].extra) : undefined });
  }
  return out;
}

function fileKeysOf(rows) {
  const keys = [];
  for (const r of rows) {
    if (r.storage_key) keys.push(r.storage_key);
    if (r.pdf_storage_key) keys.push(r.pdf_storage_key);
    const pages = typeof r.page_keys === 'string' ? JSON.parse(r.page_keys || '[]') : r.page_keys;
    if (Array.isArray(pages)) keys.push(...pages);
  }
  return [...new Set(keys)];
}

function removeStoredFiles(keys) {
  const root = uploadRoot();
  let removed = 0;
  for (const key of keys) {
    const full = path.resolve(root, key);
    if (!full.startsWith(root + path.sep)) continue; // never leave the upload folder
    try { fs.unlinkSync(full); removed += 1; } catch { /* already gone */ }
  }
  return removed;
}

/** Every customer is gone: clear what is left in the customer documents folder. */
function emptyCustomerFolder() {
  const dir = path.join(uploadRoot(), 'customers');
  let removed = 0;
  const walk = (d) => {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) { walk(full); try { fs.rmdirSync(full); } catch { /* not empty */ } }
      else { try { fs.unlinkSync(full); removed += 1; } catch { /* ignore */ } }
    }
  };
  walk(dir);
  return removed;
}

/** Runs the cleanup in one transaction. Returns rows deleted per group. */
export async function runCleanup(groups, { resetQuotationNumbers = false } = {}) {
  const chosen = new Set(groups);
  const deleted = {};
  let fileKeys = [];
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const run = async (id, sql) => {
      const r = await client.query(sql);
      deleted[id] = (deleted[id] || 0) + (r.rowCount || 0);
    };
    if (chosen.has('quotations')) {
      await run('quotations', 'DELETE FROM quotations');
      if (resetQuotationNumbers) await client.query("SELECT setval('quotation_number_seq', 1000, false)");
    }
    if (chosen.has('leads')) {
      await client.query('DELETE FROM lead_activities WHERE lead_id IS NOT NULL');
      await run('leads', 'DELETE FROM leads');
    }
    if (chosen.has('activity')) await run('activity', 'DELETE FROM lead_activities');
    if (chosen.has('tasks')) await run('tasks', 'DELETE FROM tasks');
    if (chosen.has('customers')) {
      const { rows } = await client.query('SELECT storage_key, pdf_storage_key, page_keys FROM customer_files');
      fileKeys = fileKeysOf(rows);
      await run('customers', 'DELETE FROM customers');
    }
    if (chosen.has('users')) await run('users', "DELETE FROM users WHERE role <> 'super_admin'");
    if (chosen.has('salesmen')) await run('salesmen', 'DELETE FROM salesmen');
    if (chosen.has('products')) {
      await run('products', 'DELETE FROM products');
      await run('products', 'DELETE FROM categories');
    }
    if (chosen.has('branches')) await run('branches', 'DELETE FROM branches');
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  // Files go only after the database change is saved
  let filesRemoved = fileKeys.length ? removeStoredFiles(fileKeys) : 0;
  if (chosen.has('customers')) filesRemoved += emptyCustomerFolder(); // also any orphaned uploads
  return { deleted, filesRemoved };
}

export function registerCleanupRoutes(app, { authMiddleware, asyncHandler, db }) {
  const superAdminOnly = (req, res, next) => {
    if (req.user?.role !== 'super_admin') return res.status(403).json({ error: 'Only a super admin can clean up data.' });
    next();
  };

  app.get('/api/admin/cleanup', authMiddleware, superAdminOnly, asyncHandler(async (req, res) => {
    res.json({ groups: await cleanupSummary() });
  }));

  app.post('/api/admin/cleanup', authMiddleware, superAdminOnly, asyncHandler(async (req, res) => {
    const { groups, confirm, password, resetQuotationNumbers } = req.body || {};
    const list = Array.isArray(groups) ? [...new Set(groups)].filter((g) => GROUP_IDS.has(g)) : [];
    if (!list.length) return res.status(400).json({ error: 'Choose what to delete.' });
    if (confirm !== 'DELETE') return res.status(400).json({ error: 'Type DELETE in capital letters to confirm.' });
    const me = await db.getUserById(req.user.id);
    if (!me || !password || !(await bcrypt.compare(String(password), me.password_hash))) {
      return res.status(403).json({ error: 'Your password is not correct.' });
    }

    const result = await runCleanup(list, { resetQuotationNumbers: Boolean(resetQuotationNumbers) });
    const summary = CLEANUP_GROUPS.filter((g) => list.includes(g.id)).map((g) => `${g.label}: ${result.deleted[g.id] || 0}`).join(', ');
    await db.addAuditEntry({
      type: 'security',
      userId: req.user.id,
      userName: req.user.name,
      description: `Data cleanup by ${req.user.email}: ${summary}${result.filesRemoved ? `; ${result.filesRemoved} document files removed` : ''}${resetQuotationNumbers && list.includes('quotations') ? '; quotation numbering restarted' : ''}`,
    });
    res.json({ ok: true, ...result, groups: await cleanupSummary() });
  }));
}
