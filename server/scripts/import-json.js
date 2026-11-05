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
  console.error('[import-json] DATABASE_URL is required.');
  process.exit(1);
}

const jsonPath = process.env.IMPORT_JSON_PATH || path.resolve(__dirname, '../data/monipack_crm.json');

async function importData() {
  if (!fs.existsSync(jsonPath)) {
    console.error(`[import-json] JSON file not found at: ${jsonPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(jsonPath, 'utf-8');
  const data = JSON.parse(raw);

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();

  console.log('[import-json] Connected to database.');

  try {
    await client.query('BEGIN');

    // 1. Import Users (preserve existing bcrypt password hashes)
    let userCount = 0;
    if (Array.isArray(data.users)) {
      for (const u of data.users) {
        if (!u.email) continue;
        const email = u.email.toLowerCase().trim();
        const role = u.role || 'admin';
        const canExport = u.canExport === true || role === 'super_admin';
        const hash = u.passwordHash;
        const name = u.name || 'User';
        const createdAt = u.createdAt ? new Date(u.createdAt) : new Date();

        await client.query(
          `INSERT INTO users (name, email, role, can_export, password_hash, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $6)
           ON CONFLICT (email) DO UPDATE SET
             name = EXCLUDED.name,
             role = EXCLUDED.role,
             can_export = EXCLUDED.can_export,
             password_hash = EXCLUDED.password_hash`,
          [name, email, role, canExport, hash, createdAt]
        );
        userCount++;
      }
    }

    // 2. Import Branches and Salesmen
    // One salesman can cover multiple branches -> unique salesmen first
    let salesmanCount = 0;
    let branchCount = 0;

    const salesmanMap = new Map(); // name -> { id, homeBranchLegacyId, phone, type }
    const rawBranches = Array.isArray(data.branches) ? data.branches : [];

    // First pass: register unique salesmen
    for (const b of rawBranches) {
      const smName = (b.salesman || '').trim();
      if (!smName || smName === 'Unassigned') continue;

      if (!salesmanMap.has(smName.toLowerCase())) {
        const isB2B = (b.id && b.id.includes('b2b')) || (b.name && b.name.toLowerCase().includes('b2b'));
        const type = isB2B ? 'route_b2b' : 'branch';
        salesmanMap.set(smName.toLowerCase(), {
          name: smName,
          phone: b.phone || null,
          type,
          homeBranchLegacyId: b.id,
        });
      }
    }

    // Insert or find unique salesmen
    for (const [key, sm] of salesmanMap.entries()) {
      const { rows: existing } = await client.query(
        'SELECT id FROM salesmen WHERE LOWER(name) = LOWER($1) AND archived_at IS NULL LIMIT 1',
        [sm.name]
      );

      if (existing.length > 0) {
        sm.id = existing[0].id;
        await client.query(
          'UPDATE salesmen SET phone = COALESCE($1, phone), type = $2, updated_at = now() WHERE id = $3',
          [sm.phone, sm.type, sm.id]
        );
      } else {
        const { rows } = await client.query(
          `INSERT INTO salesmen (name, phone, type, is_active)
           VALUES ($1, $2, $3, true)
           RETURNING id`,
          [sm.name, sm.phone, sm.type]
        );
        sm.id = rows[0].id;
        salesmanCount++;
      }
    }

    // Insert or update branches with default_salesman_id
    const branchIdMap = new Map(); // legacy_id -> db id
    for (const b of rawBranches) {
      const smName = (b.salesman || '').trim();
      const smInfo = salesmanMap.get(smName.toLowerCase());
      const defaultSalesmanId = smInfo ? smInfo.id : null;

      let branchDbId = null;
      if (b.id) {
        const { rows: existingB } = await client.query(
          'SELECT id FROM branches WHERE legacy_id = $1 AND archived_at IS NULL',
          [b.id]
        );
        if (existingB.length > 0) {
          branchDbId = existingB[0].id;
          await client.query(
            `UPDATE branches SET
               name = $1, city = $2, phone = $3, is_headquarters = $4, default_salesman_id = $5, updated_at = now()
             WHERE id = $6`,
            [b.name || 'Branch', b.city || 'Oman', b.phone || '', b.isHeadquarters === true, defaultSalesmanId, branchDbId]
          );
        }
      }

      if (!branchDbId) {
        const { rows } = await client.query(
          `INSERT INTO branches (legacy_id, name, city, phone, is_headquarters, default_salesman_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [
            b.id || null,
            b.name || 'Branch',
            b.city || 'Oman',
            b.phone || '',
            b.isHeadquarters === true,
            defaultSalesmanId,
          ]
        );
        branchDbId = rows[0].id;
        branchCount++;
      }

      if (b.id) {
        branchIdMap.set(b.id, branchDbId);
      }
    }

    // Second pass: set salesmen home branch_id if not set
    for (const [key, sm] of salesmanMap.entries()) {
      if (sm.homeBranchLegacyId && branchIdMap.has(sm.homeBranchLegacyId)) {
        const homeBranchId = branchIdMap.get(sm.homeBranchLegacyId);
        await client.query(
          'UPDATE salesmen SET branch_id = COALESCE(branch_id, $1) WHERE id = $2',
          [homeBranchId, sm.id]
        );
      }
    }

    // 3. Import Categories
    let categoryCount = 0;
    if (Array.isArray(data.categories)) {
      for (const cat of data.categories) {
        if (!cat || typeof cat !== 'string' || !cat.trim()) continue;
        await client.query(
          'INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
          [cat.trim()]
        );
        categoryCount++;
      }
    }

    // 4. Import Pipeline Stages
    let stageCount = 0;
    if (Array.isArray(data.pipelineStages)) {
      let order = 1;
      for (const st of data.pipelineStages) {
        if (!st.id || !st.label) continue;
        await client.query(
          `INSERT INTO pipeline_stages (stage_id, label, color, sort_order)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (stage_id) DO UPDATE SET
             label = EXCLUDED.label,
             color = EXCLUDED.color,
             sort_order = EXCLUDED.sort_order`,
          [st.id, st.label, st.color || '', order++]
        );
        stageCount++;
      }
    }

    // 5. Import Products
    let productCount = 0;
    if (Array.isArray(data.products)) {
      for (const p of data.products) {
        if (!p.name) continue;
        const sku = p.sku || `MNP-${Math.floor(1000 + Math.random() * 9000)}`;
        const price = Number(p.priceOMR || 0);
        const stock = Number(p.stock || 0);
        const createdAt = p.createdAt ? new Date(p.createdAt) : new Date();

        await client.query(
          `INSERT INTO products (sku, name, name_ar, category, brand, description, unit, price_omr, stock, source, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
           ON CONFLICT (sku) DO UPDATE SET
             name = EXCLUDED.name,
             name_ar = EXCLUDED.name_ar,
             category = EXCLUDED.category,
             brand = EXCLUDED.brand,
             description = EXCLUDED.description,
             unit = EXCLUDED.unit,
             price_omr = EXCLUDED.price_omr,
             stock = EXCLUDED.stock`,
          [
            sku,
            p.name,
            p.nameAr || '',
            p.category || 'Packaging Products',
            p.brand || 'Monipack',
            p.description || '',
            p.unit || 'PCS',
            price,
            stock,
            'json_import',
            createdAt,
          ]
        );
        productCount++;
      }
    }

    // 6. Import Settings
    let settingsCount = 0;
    if (data.settings && typeof data.settings === 'object') {
      await client.query(
        `INSERT INTO settings (key, value)
         VALUES ('main', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [JSON.stringify(data.settings)]
      );
      settingsCount = 1;
    }

    await client.query('COMMIT');

    // Query final counts from DB
    const { rows: uCnt } = await client.query('SELECT COUNT(*) as c FROM users WHERE archived_at IS NULL');
    const { rows: bCnt } = await client.query('SELECT COUNT(*) as c FROM branches WHERE archived_at IS NULL');
    const { rows: sCnt } = await client.query('SELECT COUNT(*) as c FROM salesmen WHERE archived_at IS NULL');
    const { rows: cCnt } = await client.query('SELECT COUNT(*) as c FROM categories');
    const { rows: psCnt } = await client.query('SELECT COUNT(*) as c FROM pipeline_stages');
    const { rows: pCnt } = await client.query('SELECT COUNT(*) as c FROM products WHERE archived_at IS NULL');
    const { rows: setCnt } = await client.query('SELECT COUNT(*) as c FROM settings');

    console.log('\n=============================================');
    console.log('--- Setup Data Import Completed Successfully ---');
    console.log(`users:           ${uCnt[0].c}`);
    console.log(`branches:        ${bCnt[0].c}`);
    console.log(`salesmen:        ${sCnt[0].c}`);
    console.log(`categories:      ${cCnt[0].c}`);
    console.log(`pipeline_stages: ${psCnt[0].c}`);
    console.log(`products:        ${pCnt[0].c}`);
    console.log(`settings:        ${setCnt[0].c}`);
    console.log('=============================================\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[import-json] Import failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

importData();
