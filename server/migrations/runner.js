import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbUrl = process.env.NODE_ENV === 'test'
  ? process.env.DATABASE_URL_TEST
  : process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('[migrate] ERROR: DATABASE_URL is required (or DATABASE_URL_TEST when NODE_ENV=test).');
  process.exit(1);
}

async function migrate() {
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  console.log('[migrate] Connected to database.');

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    const { rows: applied } = await client.query('SELECT filename FROM _migrations ORDER BY filename');
    const appliedSet = new Set(applied.map(r => r.filename));

    const files = fs.readdirSync(__dirname)
      .filter(f => f.endsWith('.sql'))
      .sort();

    let appliedCount = 0;

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`  [skip] ${file} (already applied)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(__dirname, file), 'utf-8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`  [done] ${file}`);
        appliedCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  [FAIL] ${file}:`, err.message);
        throw err;
      }
    }

    console.log(`[migrate] Complete. ${appliedCount} new migration(s) applied, ${files.length - appliedCount} already up-to-date.`);
  } finally {
    await client.end();
  }
}

migrate().catch(err => {
  console.error('[migrate] Migration failed:', err.message);
  process.exit(1);
});
