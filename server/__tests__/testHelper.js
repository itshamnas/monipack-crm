import 'dotenv/config';
import pool, { query } from '../db/pool.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function verifyTestSafety() {
  const dbUrl = process.env.DATABASE_URL;
  const dbUrlTest = process.env.DATABASE_URL_TEST;

  if (!dbUrlTest) {
    throw new Error('[TEST SAFETY] DATABASE_URL_TEST must be set.');
  }

  if (!dbUrl) {
    throw new Error('[TEST SAFETY] DATABASE_URL must be set.');
  }

  if (dbUrlTest.trim() === dbUrl.trim()) {
    throw new Error('[TEST SAFETY] DATABASE_URL_TEST must be different from DATABASE_URL.');
  }

  try {
    const parsed = new URL(dbUrlTest);
    const dbName = parsed.pathname.replace(/^\//, '').toLowerCase();
    if (!dbName.includes('test')) {
      throw new Error(`[TEST SAFETY] Test database name must contain "test", but got: "${dbName}"`);
    }
  } catch (err) {
    if (err.message.includes('[TEST SAFETY]')) throw err;
    throw new Error(`[TEST SAFETY] Invalid DATABASE_URL_TEST format: ${err.message}`);
  }
}

// Verify safety immediately on load
verifyTestSafety();

// Uploaded customer photos go to a throw-away folder during tests, never the real uploads folder
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'monipack-test-uploads-'));

// Bring the TEST database up to date with every migration before any test runs,
// so a new migration never needs a separate manual step for the test database.
function migrateTestDb() {
  const runnerPath = path.resolve(__dirname, '../migrations/runner.js');
  const proc = spawnSync('node', [runnerPath], {
    env: { ...process.env, NODE_ENV: 'test' },
    encoding: 'utf-8',
  });
  if (proc.status !== 0) {
    throw new Error(`[TEST SETUP] Migrating the test database failed:\n${proc.stderr || proc.stdout}`);
  }
}
migrateTestDb();

export async function resetTestDb() {
  verifyTestSafety();
  await query(`
    TRUNCATE TABLE
      link_access_log,
      customer_transfers,
      customer_submissions,
      customer_files,
      customers,
      quotation_items,
      quotations,
      lead_activities,
      lead_stage_history,
      audit_log,
      leads,
      products,
      branches,
      salesmen,
      users,
      categories,
      pipeline_stages,
      settings
    RESTART IDENTITY CASCADE
  `);

  await query('ALTER SEQUENCE quotation_number_seq RESTART WITH 1000');

  // Customer form fields: drop test-added fields and restore the default rules
  await query('DELETE FROM customer_fields WHERE is_core = false AND key NOT IN (\'whatsapp\',\'contact_number\',\'email\',\'route\',\'segment\',\'address\',\'postal_code\',\'location\',\'photos\')');
  await query(`UPDATE customer_fields SET is_hidden = false,
    required_branch = key IN ('mobile','cr_number'), required_route_b2b = key IN ('mobile','cr_number')`);

  // Insert default pipeline stages and categories needed by the app
  const defaultStages = [
    { id: 'new', label: 'STEP 1: Qualification & Intake', color: 'border-t-2 border-blue-500 bg-blue-50/20' },
    { id: 'contacted', label: 'STEP 2: Analyze & Assign', color: 'border-t-2 border-indigo-500 bg-indigo-50/20' },
    { id: 'quotation_sent', label: 'STEP 3: Quotation Follow-Up', color: 'border-t-2 border-amber-500 bg-amber-50/20' },
    { id: 'sample_sent', label: 'STEP 4: Sample & Negotiation', color: 'border-t-2 border-purple-500 bg-purple-50/20' },
    { id: 'won', label: 'STEP 5: Converted (Won)', color: 'border-t-2 border-emerald-500 bg-emerald-50/20' },
    { id: 'lost', label: 'STEP 6: Lost / Closed', color: 'border-t-2 border-rose-500 bg-rose-50/20' },
  ];

  let order = 1;
  for (const s of defaultStages) {
    await query(
      'INSERT INTO pipeline_stages (stage_id, label, color, sort_order) VALUES ($1, $2, $3, $4) ON CONFLICT (stage_id) DO NOTHING',
      [s.id, s.label, s.color, order++]
    );
  }

  const defaultCategories = [
    'Packaging Products',
    'Disposable Products',
    'Kohe Products',
    'Cleaning Products',
    'Food Products',
    'Other / Custom Wholesale Requirement',
  ];

  for (const cat of defaultCategories) {
    await query('INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [cat]);
  }
}

export function runImportWithFixture(fixtureRelativePath) {
  verifyTestSafety();
  const scriptPath = path.resolve(__dirname, '../scripts/import-json.js');
  const fullFixturePath = path.resolve(__dirname, fixtureRelativePath);

  const proc = spawnSync('node', [scriptPath], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      IMPORT_JSON_PATH: fullFixturePath,
    },
    encoding: 'utf-8',
  });

  if (proc.status !== 0) {
    throw new Error(`Fixture import failed: ${proc.stderr || proc.stdout}`);
  }
  return proc.stdout;
}
