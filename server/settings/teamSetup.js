/**
 * Team setup: add branches, salesmen and staff logins in one go from rows pasted from Excel.
 *
 * POST /api/team-setup   { rows: [{ job, name, branch, city, phone, email }], dryRun }
 *   dryRun true  -> everything runs inside a transaction that is rolled back: an exact preview, nothing saved
 *   dryRun false -> the same, committed. Logins get a temporary password (shown once) and must change it.
 *
 * Jobs:
 *   branch            a retail shop (Branches, type Retail)
 *   branch_salesman   a shop salesman; "branch" names his shop
 *   b2b_salesman      a B2B salesman; he gets his own B2B entry named after him, so the Inbox can assign to him
 *   general_manager / b2b_manager / retail_manager / customer_care   staff logins (email required)
 * Salesmen get a login only when an email is given. Existing branches, salesmen and emails are reused, never duplicated.
 * Super admin only.
 */
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import pool from '../db/pool.js';

export const JOBS = {
  branch: { label: 'Branch (shop)' },
  branch_salesman: { label: 'Branch salesman', role: 'salesman' },
  b2b_salesman: { label: 'B2B salesman', role: 'salesman' },
  general_manager: { label: 'General Manager', role: 'manager' },
  b2b_manager: { label: 'B2B Manager', role: 'b2b_manager' },
  retail_manager: { label: 'Retail / Branch Manager', role: 'retail_manager' },
  customer_care: { label: 'Customer Care', role: 'customer_care' },
};

const clean = (v, max = 150) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const phoneOf = (v) => {
  const d = String(v ?? '').replace(/[^\d+]/g, '');
  if (!d) return '';
  const digits = d.replace(/\D/g, '');
  if (digits.length === 8) return `+968${digits}`; // Omani number typed without the country code
  return d.startsWith('+') ? d : `+${digits}`;
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
export function tempPassword() {
  const b = crypto.randomBytes(12);
  let s = '';
  for (let i = 0; i < 12; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`; // 14 characters, easy to read out
}

export async function runTeamSetup(rawRows, { dryRun = true } = {}) {
  const rows = (Array.isArray(rawRows) ? rawRows : []).slice(0, 300).map((r, i) => ({
    line: i + 1,
    job: clean(r.job, 40),
    name: clean(r.name),
    branch: clean(r.branch),
    city: clean(r.city, 80),
    phone: phoneOf(r.phone),
    email: clean(r.email, 200).toLowerCase(),
  }));
  const results = rows.map((r) => ({ line: r.line, job: r.job, name: r.name, actions: [], problem: '' }));
  const fail = (i, msg) => { results[i].problem = msg; };

  // Checks that need no database
  const seenEmail = new Map();
  rows.forEach((r, i) => {
    if (!JOBS[r.job]) return fail(i, 'Unknown job. Use one of the jobs in the template.');
    if (r.name.length < 2) return fail(i, 'Name is missing.');
    if (r.email && !EMAIL.test(r.email)) return fail(i, 'Email does not look right.');
    if (JOBS[r.job].role && r.job !== 'branch_salesman' && r.job !== 'b2b_salesman' && !r.email) return fail(i, 'A login needs an email.');
    if (r.job === 'branch_salesman' && !r.branch) return fail(i, 'Write which branch this salesman works in.');
    if (r.email) {
      if (seenEmail.has(r.email)) return fail(i, `Same email as line ${seenEmail.get(r.email)}.`);
      seenEmail.set(r.email, r.line);
    }
    return null;
  });

  const client = await pool.connect();
  const logins = [];
  const people = []; // everyone in the list, so photos can be added straight after
  try {
    await client.query('BEGIN');
    const q = (sql, params) => client.query(sql, params);
    const findBranch = async (name) => (await q('SELECT id, name, type, default_salesman_id FROM branches WHERE lower(name) = lower($1) AND archived_at IS NULL ORDER BY id LIMIT 1', [name])).rows[0];
    const findSalesman = async (name) => (await q('SELECT id, name, type, branch_id, phone FROM salesmen WHERE lower(name) = lower($1) AND archived_at IS NULL ORDER BY id LIMIT 1', [name])).rows[0];

    const ensureBranch = async (i, { name, city, phone, type }) => {
      const found = await findBranch(name);
      if (found) {
        if (found.type !== type) { fail(i, `"${found.name}" already exists as a ${found.type === 'b2b' ? 'B2B' : 'Retail'} branch.`); return null; }
        results[i].actions.push(`Branch "${found.name}" already exists, kept`);
        return found;
      }
      const { rows: [b] } = await q(
        `INSERT INTO branches (name, city, phone, is_headquarters, type) VALUES ($1, $2, $3, false, $4) RETURNING id, name, type, default_salesman_id`,
        [name.slice(0, 100), (city || 'Oman').slice(0, 100), (phone || '').slice(0, 30), type],
      );
      results[i].actions.push(`New ${type === 'b2b' ? 'B2B' : 'Retail'} branch "${b.name}"`);
      return b;
    };

    const ensureSalesman = async (i, r, branch, type) => {
      let sm = await findSalesman(r.name);
      if (sm) {
        await q(`UPDATE salesmen SET branch_id = $1, type = $2, phone = COALESCE(NULLIF($3, ''), phone), is_active = true, updated_at = now() WHERE id = $4`,
          [branch.id, type, r.phone, sm.id]);
        results[i].actions.push(`Salesman "${sm.name}" already exists, moved to ${branch.name}`);
      } else {
        ({ rows: [sm] } = await q(`INSERT INTO salesmen (name, phone, type, branch_id, is_active) VALUES ($1, $2, $3, $4, true) RETURNING id, name`,
          [r.name, r.phone || null, type, branch.id]));
        results[i].actions.push(`New salesman "${sm.name}"`);
      }
      if (!branch.default_salesman_id) {
        await q('UPDATE branches SET default_salesman_id = $1, updated_at = now() WHERE id = $2', [sm.id, branch.id]);
        branch.default_salesman_id = sm.id;
        results[i].actions.push(`Leads for ${branch.name} go to ${sm.name}`);
      } else if (String(branch.default_salesman_id) !== String(sm.id)) {
        results[i].actions.push(`${branch.name} already has a main salesman; ${sm.name} added to it`);
      }
      return sm;
    };

    const ensureLogin = async (i, r, role, salesmanId) => {
      const { rows: [u] } = await q('SELECT id FROM users WHERE lower(email) = $1', [r.email]);
      if (u) { results[i].actions.push(`${r.email} already has a login, not changed`); return u.id; }
      if (salesmanId) {
        const { rows: [has] } = await q('SELECT email FROM users WHERE salesman_id = $1', [salesmanId]);
        if (has) { results[i].actions.push(`${r.name} already signs in as ${has.email}, not changed`); return null; }
      }
      const password = tempPassword();
      const { rows: [nu] } = await q(`INSERT INTO users (name, email, role, can_export, password_hash, salesman_id, must_change_password, phone)
               VALUES ($1, $2, $3, false, $4, $5, true, $6) RETURNING id`,
        [r.name, r.email, role, bcrypt.hashSync(password, 10), salesmanId || null, r.phone ? r.phone.slice(0, 20) : null]);
      results[i].actions.push(`Login ${r.email} (${JOBS[r.job].label})`);
      logins.push({ name: r.name, email: r.email, job: JOBS[r.job].label, password: dryRun ? '' : password, phone: r.phone });
      return nu.id;
    };

    // Shops first, so salesmen rows can point at a shop added lower down the list
    const branchByName = new Map();
    for (const [i, r] of rows.entries()) {
      if (r.job !== 'branch' || results[i].problem) continue;
      const b = await ensureBranch(i, { name: r.name, city: r.city, phone: r.phone, type: 'retail' });
      if (b) branchByName.set(r.name.toLowerCase(), b);
    }
    for (const [i, r] of rows.entries()) {
      if (results[i].problem) continue;
      if (r.job === 'branch_salesman') {
        const b = branchByName.get(r.branch.toLowerCase()) || await findBranch(r.branch);
        if (!b) { fail(i, `No branch called "${r.branch}". Add it as a Branch row, or check the spelling.`); continue; }
        if (b.type === 'b2b') { fail(i, `"${b.name}" is a B2B branch. Use the job B2B salesman.`); continue; }
        const sm = await ensureSalesman(i, r, b, 'branch');
        if (r.email) await ensureLogin(i, r, 'salesman', sm.id);
        people.push({ name: sm.name, job: JOBS[r.job].label, salesmanId: String(sm.id) });
      } else if (r.job === 'b2b_salesman') {
        const b = await ensureBranch(i, { name: r.branch || r.name, city: r.city, phone: r.phone, type: 'b2b' });
        if (!b) continue;
        const sm = await ensureSalesman(i, r, b, 'route_b2b');
        if (r.email) await ensureLogin(i, r, 'salesman', sm.id);
        people.push({ name: sm.name, job: JOBS[r.job].label, salesmanId: String(sm.id) });
      } else if (JOBS[r.job]?.role && r.job !== 'branch') {
        const uid = await ensureLogin(i, r, JOBS[r.job].role, null);
        if (uid) people.push({ name: r.name, job: JOBS[r.job].label, userId: String(uid) });
      }
    }
    await q(dryRun ? 'ROLLBACK' : 'COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  const problems = results.filter((r) => r.problem).length;
  return { dryRun, ok: problems === 0, problems, results, logins, people: dryRun ? [] : people };
}

export function registerTeamSetupRoutes(app, { authMiddleware, superAdminOnly, asyncHandler, audit }) {
  app.post('/api/team-setup', authMiddleware, superAdminOnly, asyncHandler(async (req, res) => {
    const rows = req.body?.rows;
    if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'Paste at least one row.' });
    if (rows.length > 300) return res.status(400).json({ error: 'Up to 300 rows at a time.' });
    const dryRun = req.body?.dryRun !== false;
    // Never save part of a list: with any problem, nothing is created
    const preview = await runTeamSetup(rows, { dryRun: true });
    if (dryRun || !preview.ok) return res.json(preview);
    const out = await runTeamSetup(rows, { dryRun: false });
    await audit(req, `Team setup: ${out.results.length} rows, ${out.logins.length} new logins (${out.logins.map((l) => l.email).join(', ') || 'none'})`);
    res.json(out);
  }));
}
