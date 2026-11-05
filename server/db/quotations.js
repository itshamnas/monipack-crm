import { query, getClient } from './pool.js';
import { quotationToApi } from './utils.js';

export async function getQuotations() {
  const { rows } = await query(
    'SELECT * FROM quotations WHERE archived_at IS NULL ORDER BY created_at DESC'
  );

  const quotations = [];
  for (const row of rows) {
    const { rows: items } = await query(
      'SELECT * FROM quotation_items WHERE quotation_id = $1 ORDER BY seq',
      [row.id]
    );
    quotations.push(quotationToApi(row, items));
  }
  return quotations;
}

export async function getQuotationById(id) {
  const numId = parseInt(id, 10);
  let row;
  if (!isNaN(numId)) {
    const { rows } = await query('SELECT * FROM quotations WHERE id = $1 AND archived_at IS NULL', [numId]);
    row = rows[0];
  }
  if (!row) {
    // Try by code
    const { rows } = await query('SELECT * FROM quotations WHERE code = $1 AND archived_at IS NULL', [id]);
    row = rows[0];
  }
  if (!row) return null;

  const { rows: items } = await query(
    'SELECT * FROM quotation_items WHERE quotation_id = $1 ORDER BY seq',
    [row.id]
  );
  return quotationToApi(row, items);
}

async function syncLeadQuotationStatus(client, leadId, grandTotalOMR, changedBy) {
  if (!leadId) return;
  const numLeadId = parseInt(leadId, 10);
  if (isNaN(numLeadId)) return;

  const { rows } = await client.query(
    'SELECT id, status, deal_value FROM leads WHERE id = $1 AND archived_at IS NULL FOR UPDATE',
    [numLeadId]
  );
  if (!rows[0]) return;
  const lead = rows[0];

  const currentStatus = lead.status;
  const canAdvanceStatus = currentStatus === 'new' || currentStatus === 'contacted';
  const newStatus = canAdvanceStatus ? 'quotation_sent' : currentStatus;

  const canUpdateDealValue = currentStatus !== 'won' && currentStatus !== 'lost';
  const newDealValue = canUpdateDealValue ? grandTotalOMR : Number(lead.deal_value);

  const statusChanged = canAdvanceStatus && currentStatus !== newStatus;
  const dealValueChanged = canUpdateDealValue && Number(lead.deal_value) !== Number(grandTotalOMR);

  if (statusChanged || dealValueChanged) {
    await client.query(
      `UPDATE leads SET status = $1, deal_value = $2, updated_at = now()
       WHERE id = $3 AND archived_at IS NULL`,
      [newStatus, newDealValue, numLeadId]
    );
  }

  if (statusChanged) {
    await client.query(
      `INSERT INTO lead_stage_history (lead_id, from_status, to_status, changed_by)
       VALUES ($1, $2, $3, $4)`,
      [numLeadId, currentStatus, newStatus, changedBy || 'System']
    );
  }
}

export async function createQuotation(quoteInput, options = {}) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Get sequence number for unique code
    const { rows: seqRows } = await client.query("SELECT nextval('quotation_number_seq') AS seq");
    const seq = seqRows[0].seq;
    const today = new Date();
    const dateStr = today.toISOString().slice(2, 10).replace(/-/g, '');
    const code = quoteInput.code || `MNI-ITS-${dateStr}-${seq}`;

    // Calculate items
    const items = (quoteInput.items || []).map((item, index) => {
      const qty = Number(item.quantity || 1);
      const price = Number(item.unitPriceOMR || 0);
      return {
        seq: index + 1,
        productId: item.productId || null,
        item: item.item || 'Custom Packaging Item',
        description: item.description || '-',
        quantity: qty,
        unit: item.unit || 'PCS',
        unitPriceOMR: price,
        totalOMR: Number((qty * price).toFixed(3)),
      };
    });

    const subtotalOMR = Number(items.reduce((acc, curr) => acc + curr.totalOMR, 0).toFixed(3));
    const enableVat = quoteInput.enableVat !== undefined ? Boolean(quoteInput.enableVat) : true;
    const vatRate = quoteInput.vatRate !== undefined ? Number(quoteInput.vatRate) : 5;
    const vatAmountOMR = enableVat ? Number((subtotalOMR * (vatRate / 100)).toFixed(3)) : 0;
    const grandTotalOMR = Number((subtotalOMR + vatAmountOMR).toFixed(3));

    const leadId = quoteInput.leadId ? parseInt(quoteInput.leadId, 10) || null : null;

    const { rows: qRows } = await client.query(
      `INSERT INTO quotations (code, lead_id, customer_name, address, attn, date, validity_days,
         sales_rep, status, subtotal_omr, enable_vat, vat_rate, vat_amount_omr, grand_total_omr, terms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        code, leadId,
        quoteInput.customerName || 'Valued Customer',
        quoteInput.address || 'Muscat, Sultanate of Oman',
        quoteInput.attn || '',
        quoteInput.date || today.toISOString().split('T')[0],
        quoteInput.validityDays || 30,
        quoteInput.salesRep || '',
        quoteInput.status || 'sent',
        subtotalOMR, enableVat, vatRate, vatAmountOMR, grandTotalOMR,
        JSON.stringify(quoteInput.terms || [
          'All prices are quoted in Omani Rial (OMR).',
          'Quotation validity: 30 days from date of issue.',
          'Payment terms: As per agreed commercial credit terms.',
          'Delivery: Fast delivery across all Oman Wilayats upon confirmed PO.',
        ]),
      ]
    );

    const quotationId = qRows[0].id;

    // Insert items
    const insertedItems = [];
    for (const item of items) {
      const prodId = item.productId ? parseInt(item.productId, 10) || null : null;
      const { rows: iRows } = await client.query(
        `INSERT INTO quotation_items (quotation_id, seq, product_id, item, description, quantity, unit, unit_price_omr, total_omr)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [quotationId, item.seq, prodId, item.item, item.description, item.quantity, item.unit, item.unitPriceOMR, item.totalOMR]
      );
      insertedItems.push(iRows[0]);
    }

    // If linked to a lead, sync lead status and deal value (within same transaction)
    if (leadId) {
      await syncLeadQuotationStatus(client, leadId, grandTotalOMR, options.changedBy || quoteInput.salesRep);
    }

    await client.query('COMMIT');
    return quotationToApi(qRows[0], insertedItems);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateQuotation(id, updates, options = {}) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Find existing
    const numId = parseInt(id, 10);
    let row;
    if (!isNaN(numId)) {
      const { rows } = await client.query('SELECT * FROM quotations WHERE id = $1 AND archived_at IS NULL', [numId]);
      row = rows[0];
    }
    if (!row) {
      const { rows } = await client.query('SELECT * FROM quotations WHERE code = $1 AND archived_at IS NULL', [id]);
      row = rows[0];
    }
    if (!row) { await client.query('ROLLBACK'); client.release(); return null; }

    let items;
    let subtotalOMR = Number(row.subtotal_omr);

    if (updates.items && Array.isArray(updates.items)) {
      // Delete old items
      await client.query('DELETE FROM quotation_items WHERE quotation_id = $1', [row.id]);

      items = [];
      for (let index = 0; index < updates.items.length; index++) {
        const item = updates.items[index];
        const qty = Number(item.quantity || 1);
        const price = Number(item.unitPriceOMR || 0);
        const totalOMR = Number((qty * price).toFixed(3));
        const prodId = item.productId ? parseInt(item.productId, 10) || null : null;
        const seq = item.seq !== undefined && item.seq !== null ? (Number(item.seq) || (index + 1)) : (index + 1);

        const { rows: iRows } = await client.query(
          `INSERT INTO quotation_items (quotation_id, seq, product_id, item, description, quantity, unit, unit_price_omr, total_omr)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING *`,
          [row.id, seq, prodId, item.item || 'Custom Packaging Item', item.description || '', qty, item.unit || 'PCS', price, totalOMR]
        );
        items.push(iRows[0]);
      }
      subtotalOMR = Number(items.reduce((acc, i) => acc + Number(i.total_omr), 0).toFixed(3));
    } else {
      if (updates.subtotalOMR !== undefined) subtotalOMR = Number(updates.subtotalOMR);
      const { rows: existingItems } = await client.query(
        'SELECT * FROM quotation_items WHERE quotation_id = $1 ORDER BY seq', [row.id]
      );
      items = existingItems;
    }

    const enableVat = updates.enableVat !== undefined ? Boolean(updates.enableVat) : (row.enable_vat !== false);
    const vatRate = updates.vatRate !== undefined ? Number(updates.vatRate) : Number(row.vat_rate ?? 5);
    const vatAmountOMR = enableVat ? Number((subtotalOMR * (vatRate / 100)).toFixed(3)) : 0;
    const grandTotalOMR = updates.grandTotalOMR !== undefined
      ? Number(updates.grandTotalOMR)
      : Number((subtotalOMR + vatAmountOMR).toFixed(3));

    const leadId = updates.leadId !== undefined
      ? (parseInt(updates.leadId, 10) || null)
      : row.lead_id;

    const termsJson = updates.terms !== undefined
      ? JSON.stringify(updates.terms)
      : (typeof row.terms === 'string' ? row.terms : (row.terms ? JSON.stringify(row.terms) : null));

    const { rows: uRows } = await client.query(
      `UPDATE quotations SET
         customer_name = $1, address = $2, attn = $3, date = $4, validity_days = $5,
         sales_rep = $6, status = $7, subtotal_omr = $8, enable_vat = $9, vat_rate = $10,
         vat_amount_omr = $11, grand_total_omr = $12, terms = $13, lead_id = $14, updated_at = now()
       WHERE id = $15
       RETURNING *`,
      [
        updates.customerName !== undefined ? updates.customerName : row.customer_name,
        updates.address !== undefined ? updates.address : row.address,
        updates.attn !== undefined ? updates.attn : row.attn,
        updates.date !== undefined ? updates.date : row.date,
        updates.validityDays !== undefined ? updates.validityDays : row.validity_days,
        updates.salesRep !== undefined ? updates.salesRep : row.sales_rep,
        updates.status !== undefined ? updates.status : row.status,
        subtotalOMR, enableVat, vatRate, vatAmountOMR, grandTotalOMR,
        termsJson,
        leadId,
        row.id,
      ]
    );

    // If linked to a lead, sync lead status and deal value (within same transaction)
    if (leadId) {
      await syncLeadQuotationStatus(client, leadId, grandTotalOMR, options.changedBy || updates.salesRep || row.sales_rep);
    }

    await client.query('COMMIT');
    return quotationToApi(uRows[0], items);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteQuotation(id) {
  const numId = parseInt(id, 10);
  let rowCount = 0;
  if (!isNaN(numId)) {
    const result = await query(
      'UPDATE quotations SET archived_at = now(), updated_at = now() WHERE id = $1 AND archived_at IS NULL',
      [numId]
    );
    rowCount = result.rowCount;
  }
  if (rowCount === 0) {
    const result = await query(
      'UPDATE quotations SET archived_at = now(), updated_at = now() WHERE code = $1 AND archived_at IS NULL',
      [id]
    );
    rowCount = result.rowCount;
  }
  return rowCount > 0;
}

export async function purgeAllQuotations() {
  const { rows } = await query('SELECT COUNT(*) AS cnt FROM quotations WHERE archived_at IS NULL');
  const count = parseInt(rows[0].cnt);
  await query('UPDATE quotations SET archived_at = now(), updated_at = now() WHERE archived_at IS NULL');
  return count;
}
