import { query } from './pool.js';
import { productToApi } from './utils.js';

export async function getProducts(filters = {}) {
  let sql = 'SELECT * FROM products WHERE archived_at IS NULL';
  const params = [];
  let idx = 1;

  if (filters.category && filters.category !== 'all') {
    sql += ` AND category = $${idx++}`;
    params.push(filters.category);
  }
  if (filters.brand && filters.brand !== 'all') {
    sql += ` AND brand = $${idx++}`;
    params.push(filters.brand);
  }
  if (filters.search) {
    const q = `%${filters.search.toLowerCase()}%`;
    sql += ` AND (LOWER(name) LIKE $${idx} OR LOWER(sku) LIKE $${idx} OR name_ar LIKE $${idx})`;
    params.push(q);
    idx++;
  }

  sql += ' ORDER BY created_at DESC';
  const { rows } = await query(sql, params);
  return rows.map(productToApi);
}

export async function createProduct(product) {
  const sku = product.sku || `MNP-${Math.floor(1000 + Math.random() * 9000)}`;
  const { rows } = await query(
    `INSERT INTO products (sku, name, name_ar, category, brand, description, unit, price_omr, stock, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      sku,
      product.name,
      product.nameAr || '',
      product.category || 'Packaging Products',
      product.brand || 'Monipack',
      product.description || '',
      product.unit || 'PCS',
      Number(product.priceOMR || 0),
      Number(product.stock || 0),
      product.source || null,
    ]
  );
  return productToApi(rows[0]);
}

export async function updateProduct(id, updates) {
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return null;

  const { rows: existing } = await query('SELECT * FROM products WHERE id = $1 AND archived_at IS NULL', [numId]);
  if (!existing[0]) return null;

  const e = existing[0];
  const { rows } = await query(
    `UPDATE products SET
       name = $1, name_ar = $2, sku = $3, category = $4, brand = $5,
       description = $6, unit = $7, price_omr = $8, stock = $9,
       source = $10, updated_at = now()
     WHERE id = $11 AND archived_at IS NULL
     RETURNING *`,
    [
      updates.name !== undefined ? updates.name : e.name,
      updates.nameAr !== undefined ? updates.nameAr : e.name_ar,
      updates.sku !== undefined ? updates.sku : e.sku,
      updates.category !== undefined ? updates.category : e.category,
      updates.brand !== undefined ? updates.brand : e.brand,
      updates.description !== undefined ? updates.description : e.description,
      updates.unit !== undefined ? updates.unit : e.unit,
      updates.priceOMR !== undefined ? Number(updates.priceOMR) : Number(e.price_omr),
      updates.stock !== undefined ? Number(updates.stock) : Number(e.stock),
      updates.source !== undefined ? updates.source : e.source,
      numId,
    ]
  );
  return rows[0] ? productToApi(rows[0]) : null;
}

export async function deleteProduct(id) {
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return false;
  const { rowCount } = await query(
    'UPDATE products SET archived_at = now(), updated_at = now() WHERE id = $1 AND archived_at IS NULL',
    [numId]
  );
  return rowCount > 0;
}

export async function bulkDeleteProducts(ids = []) {
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const numIds = ids.map(id => parseInt(id, 10)).filter(n => !isNaN(n));
  if (numIds.length === 0) return 0;
  const { rowCount } = await query(
    'UPDATE products SET archived_at = now(), updated_at = now() WHERE id = ANY($1) AND archived_at IS NULL',
    [numIds]
  );
  return rowCount;
}

export async function bulkUpsertProducts(items = [], options = {}) {
  let addedCount = 0;
  let updatedCount = 0;
  const updateExisting = options.updateExisting !== false;

  for (const item of items) {
    if (!item.name || !item.name.trim()) continue;
    const cleanSku = item.sku ? item.sku.trim() : '';
    const cleanName = item.name.trim();

    // Check if exists by SKU or name
    let existingRow = null;
    if (cleanSku) {
      const { rows } = await query(
        'SELECT * FROM products WHERE LOWER(sku) = LOWER($1) AND archived_at IS NULL',
        [cleanSku]
      );
      existingRow = rows[0];
    }
    if (!existingRow) {
      const { rows } = await query(
        'SELECT * FROM products WHERE LOWER(name) = LOWER($1) AND archived_at IS NULL',
        [cleanName]
      );
      existingRow = rows[0];
    }

    if (existingRow && updateExisting) {
      await query(
        `UPDATE products SET
           name = $1, name_ar = $2, sku = $3, category = $4, brand = $5,
           unit = $6, price_omr = $7, stock = $8, description = $9,
           source = $10, updated_at = now()
         WHERE id = $11`,
        [
          cleanName,
          item.nameAr || existingRow.name_ar || '',
          cleanSku || existingRow.sku,
          item.category || existingRow.category || 'Packaging Products',
          item.brand || existingRow.brand || 'Monipack',
          item.unit || existingRow.unit || 'CTN',
          item.priceOMR !== undefined && item.priceOMR !== '' ? Number(item.priceOMR) : Number(existingRow.price_omr),
          item.stock !== undefined && item.stock !== '' ? Number(item.stock) : Number(existingRow.stock),
          item.description || existingRow.description || '',
          item.source || 'tally_import',
          existingRow.id,
        ]
      );
      updatedCount++;
    } else if (!existingRow) {
      const sku = cleanSku || `MNP-${Math.floor(1000 + Math.random() * 9000)}`;
      await query(
        `INSERT INTO products (sku, name, name_ar, category, brand, unit, price_omr, stock, description, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          sku, cleanName, item.nameAr || '', item.category || 'Packaging Products',
          item.brand || 'Monipack', item.unit || 'CTN', Number(item.priceOMR || 0),
          Number(item.stock || 0), item.description || '', item.source || 'imported',
        ]
      );
      addedCount++;

      // Auto-register category
      if (item.category && item.category.trim()) {
        await query(
          'INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
          [item.category.trim()]
        );
      }
    }
  }

  const { rows: total } = await query('SELECT COUNT(*) AS cnt FROM products WHERE archived_at IS NULL');
  return { addedCount, updatedCount, totalInCatalog: parseInt(total[0].cnt) };
}
