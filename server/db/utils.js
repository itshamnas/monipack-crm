/**
 * Normalizes Oman mobile & phone numbers to prevent repeated country code (+968 +968) bugs.
 */
export function normalizeOmanPhone(countryCodeOrRaw = '+968', mobile = '', phone = '') {
  let raw = '';
  let cleanCode = '+968';

  if (!mobile && !phone && countryCodeOrRaw && countryCodeOrRaw !== '+968') {
    raw = String(countryCodeOrRaw);
  } else {
    raw = String(mobile || phone || '');
    if (countryCodeOrRaw && (countryCodeOrRaw.startsWith('+') || countryCodeOrRaw === '968')) {
      cleanCode = countryCodeOrRaw.trim();
    }
  }

  let cleaned = String(raw).replace(/[^\d+]/g, '');
  while (cleaned.startsWith('+968')) {
    cleaned = cleaned.slice(4);
  }
  while (cleaned.startsWith('968') && cleaned.length > 8) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.startsWith('0') && cleaned.length === 9) {
    cleaned = cleaned.slice(1);
  }

  let codeDigits = String(cleanCode).replace(/[^\d]/g, '');
  if (codeDigits === '968' || codeDigits.startsWith('968968')) {
    cleanCode = '+968';
  }

  const fullPhone = cleaned ? `${cleanCode} ${cleaned}` : '';
  return { countryCode: cleanCode, mobile: cleaned, phone: fullPhone };
}

/**
 * Convert a snake_case DB row to camelCase for API response.
 */
export function rowToApi(row) {
  if (!row) return row;
  const result = {};
  for (const [key, value] of Object.entries(row)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = value;
  }
  return result;
}

/**
 * Convert integer/numeric id fields to strings for API response.
 */
export function stringifyIds(obj, ...fields) {
  if (!obj) return obj;
  const result = { ...obj };
  for (const field of fields) {
    if (result[field] !== null && result[field] !== undefined) {
      result[field] = String(result[field]);
    }
  }
  return result;
}

/**
 * Map a leads DB row to the API shape expected by the frontend.
 */
export function leadToApi(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    name: row.name || '',
    contactPerson: row.contact_person || '',
    category: row.category || 'Packaging Products',
    productDetails: row.product_details || '',
    countryCode: row.country_code || '+968',
    mobile: row.mobile || '',
    phone: row.phone || '',
    email: row.email || '',
    branchId: row.branch_id != null ? String(row.branch_id) : '',
    branch: row.branch_name || '',
    salesman: row.salesman_name || '',
    salesmanId: row.salesman_id != null ? String(row.salesman_id) : null,
    customerId: row.customer_id != null ? String(row.customer_id) : null,
    customerLocation: row.customer_location || '',
    status: row.status || 'new',
    dealValue: Number(row.deal_value || 0),
    quantity: row.quantity || '',
    notes: row.notes || '',
    intakeCompleted: Boolean(row.intake_completed),
    source: row.source || '',
    lostReason: row.lost_reason || '',
    date: row.date ? new Date(row.date).toISOString() : new Date().toISOString(),
    lastContactedAt: row.last_contacted_at ? new Date(row.last_contacted_at).toISOString() : null,
    nextFollowUpAt: row.next_follow_up_at ? new Date(row.next_follow_up_at).toISOString() : null,
    followUpNote: row.follow_up_note || '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

/**
 * Map a branch DB row (with joined salesman name) to the API shape.
 */
export function branchToApi(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    name: row.name || '',
    city: row.city || '',
    phone: row.phone || '',
    salesman: row.salesman_name || row.default_salesman_name || '',
    isHeadquarters: Boolean(row.is_headquarters),
  };
}

/**
 * Map a pipeline stage DB row to the API shape (id = stage_id, NOT the PK).
 */
export function stageToApi(row) {
  if (!row) return null;
  return {
    id: row.stage_id,
    label: row.label || '',
    color: row.color || '',
  };
}

/**
 * Map a product DB row to the API shape.
 */
export function productToApi(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    sku: row.sku || '',
    name: row.name || '',
    nameAr: row.name_ar || '',
    category: row.category || '',
    brand: row.brand || '',
    description: row.description || '',
    unit: row.unit || 'PCS',
    priceOMR: Number(row.price_omr || 0),
    stock: Number(row.stock || 0),
    source: row.source || '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
  };
}

/**
 * Map a quotation DB row + items to the API shape.
 */
export function quotationToApi(row, items = []) {
  if (!row) return null;
  return {
    id: String(row.id),
    code: row.code || '',
    leadId: row.lead_id != null ? String(row.lead_id) : null,
    customerName: row.customer_name || 'Valued Customer',
    address: row.address || '',
    attn: row.attn || '',
    // DATE columns come back as local-midnight Date objects: keep the calendar day, never shift it through UTC
    date: row.date instanceof Date
      ? `${row.date.getFullYear()}-${String(row.date.getMonth() + 1).padStart(2, '0')}-${String(row.date.getDate()).padStart(2, '0')}`
      : (row.date ? String(row.date).slice(0, 10) : ''),
    validityDays: Number(row.validity_days || 30),
    salesRep: row.sales_rep || '',
    status: row.status || 'sent',
    statusChangedAt: row.status_changed_at || null,
    statusReason: row.status_reason || '',
    items: items.map(qi => ({
      id: String(qi.id),
      seq: qi.seq,
      productId: qi.product_id != null ? String(qi.product_id) : null,
      item: qi.item || 'Custom Packaging Item',
      description: qi.description || '',
      quantity: Number(qi.quantity || 1),
      unit: qi.unit || 'PCS',
      unitPriceOMR: Number(qi.unit_price_omr || 0),
      totalOMR: Number(qi.total_omr || 0),
    })),
    subtotalOMR: Number(row.subtotal_omr || 0),
    enableVat: row.enable_vat !== false,
    vatRate: Number(row.vat_rate ?? 5),
    vatAmountOMR: Number(row.vat_amount_omr || 0),
    grandTotalOMR: Number(row.grand_total_omr || 0),
    terms: row.terms || [],
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
  };
}

/**
 * Map a user DB row to API shape (excludes passwordHash).
 */
export function userToApi(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    name: row.name || '',
    email: row.email || '',
    role: row.role === 'admin' ? 'manager' : (row.role || 'manager'),
    canExport: Boolean(row.can_export),
    isActive: row.is_active === undefined ? true : Boolean(row.is_active),
    mustChangePassword: Boolean(row.must_change_password),
    salesmanId: row.salesman_id != null ? String(row.salesman_id) : null,
    salesmanName: row.salesman_name || null,
    lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
  };
}

/**
 * Map an activity DB row to API shape.
 */
export function activityToApi(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    leadId: row.lead_id != null ? String(row.lead_id) : null,
    leadName: row.lead_name || '',
    type: row.type || 'note',
    description: row.description || '',
    timestamp: row.timestamp ? new Date(row.timestamp).toISOString() : new Date().toISOString(),
  };
}

/**
 * Map an audit_log DB row to API shape.
 */
export function auditLogToApi(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    type: row.event_type || '',
    description: row.description || '',
    timestamp: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
  };
}

/**
 * Map a salesman DB row to API shape.
 */
export function salesmanToApi(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    name: row.name || '',
    phone: row.phone || '',
    type: row.type || 'branch',
    branchId: row.branch_id != null ? String(row.branch_id) : null,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
  };
}
