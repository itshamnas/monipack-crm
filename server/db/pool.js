import 'dotenv/config';
import pg from 'pg';

const isTest = process.env.NODE_ENV === 'test';
const dbUrl = isTest
  ? process.env.DATABASE_URL_TEST
  : process.env.DATABASE_URL;

if (!dbUrl) {
  const varName = isTest ? 'DATABASE_URL_TEST' : 'DATABASE_URL';
  console.error(`[DB] ${varName} environment variable is required.`);
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: dbUrl,
  max: 20,
});

pool.on('error', (err) => {
  console.error('[DB Pool] Unexpected error on idle client:', err.message);
});

export default pool;

export async function query(text, params) {
  return pool.query(text, params);
}

export async function getClient() {
  const client = await pool.connect();
  return client;
}
