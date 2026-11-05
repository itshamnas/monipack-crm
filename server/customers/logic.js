/**
 * Customer Data Collection - pure logic (no database, no packages).
 * Validation, completeness/status rules, CSV import parsing, and JPEG -> PDF.
 */

// Fields stored in their own columns; every other field lives in customers.data (JSONB)
export const COLUMN_FIELDS = { mobile: 'mobile', cr_number: 'crNumber', vat_number: 'vatNumber' };

export const SALESMAN_TYPES = ['branch', 'route_b2b'];
export const FILE_LABELS = ['cr_certificate', 'vat_certificate', 'shop_front', 'other'];
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';

// ---------------- Normalising & validating single values ----------------

/**
 * Oman mobile -> "+968XXXXXXXX". Other countries are accepted when written with "+" (8-15 digits).
 * Returns { value, error }.
 */
export function normalizeMobile(raw) {
  if (isBlank(raw)) return { value: '', error: null };
  const str = String(raw).trim();
  let digits = str.replace(/[^\d]/g, '');
  const hadPlus = str.startsWith('+') || str.startsWith('00');
  if (str.startsWith('00')) digits = digits.slice(2);

  if (digits.startsWith('968') && digits.length === 11) digits = digits.slice(3);
  if (digits.length === 9 && digits.startsWith('0')) digits = digits.slice(1);

  if (digits.length === 8) {
    if (!/^[79]/.test(digits)) {
      return { value: '', error: 'Omani mobile numbers have 8 digits and start with 7 or 9.' };
    }
    return { value: `+968${digits}`, error: null };
  }
  if (hadPlus && digits.length >= 8 && digits.length <= 15 && !digits.startsWith('968')) {
    return { value: `+${digits}`, error: null };
  }
  return { value: '', error: 'Enter a valid mobile number (8 digits for Oman, or with + for other countries).' };
}

/** Any phone (landline allowed): digits with optional +, 7-15 digits. */
export function normalizePhone(raw) {
  if (isBlank(raw)) return { value: '', error: null };
  const str = String(raw).trim();
  const digits = str.replace(/[^\d]/g, '');
  if (digits.length < 7 || digits.length > 15) return { value: '', error: 'Enter a valid phone number.' };
  if (digits.length === 8) return { value: `+968${digits}`, error: null };
  return { value: `+${digits.replace(/^00/, '')}`, error: null };
}

export function normalizeCr(raw) {
  if (isBlank(raw)) return { value: '', error: null };
  const clean = String(raw).replace(/[\s\-/.]/g, '');
  if (!/^\d{4,12}$/.test(clean)) return { value: '', error: 'CR number must contain digits only (4 to 12 digits).' };
  return { value: clean, error: null };
}

export function normalizeVat(raw) {
  if (isBlank(raw)) return { value: '', error: null };
  const clean = String(raw).replace(/[\s\-]/g, '').toUpperCase();
  if (!/^OM\d{10}$/.test(clean)) return { value: '', error: 'Oman VAT numbers look like OM1100012345 (OM + 10 digits).' };
  return { value: clean, error: null };
}

export function normalizeEmail(raw) {
  if (isBlank(raw)) return { value: '', error: null };
  const clean = String(raw).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) return { value: '', error: 'Enter a valid email address.' };
  return { value: clean, error: null };
}

/** Accepts a Google Maps link or "lat, lng". Stored as a Google Maps link. */
export function normalizeLocation(raw) {
  if (isBlank(raw)) return { value: '', error: null };
  const str = String(raw).trim();
  const m = str.match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (m) {
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { value: `https://www.google.com/maps?q=${lat},${lng}`, error: null };
    }
  }
  if (/^https:\/\/(www\.)?(google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(str)) {
    return { value: str.slice(0, 500), error: null };
  }
  return { value: '', error: 'Use the location button, or paste a Google Maps link.' };
}

function normalizeByType(field, raw) {
  if (field.key === 'mobile') return normalizeMobile(raw);
  if (field.key === 'cr_number') return normalizeCr(raw);
  if (field.key === 'vat_number') return normalizeVat(raw);
  switch (field.type) {
    case 'phone': return normalizePhone(raw);
    case 'email': return normalizeEmail(raw);
    case 'location': return normalizeLocation(raw);
    case 'number': {
      if (isBlank(raw)) return { value: '', error: null };
      const s = String(raw).trim();
      return /^\d{1,12}$/.test(s) ? { value: s, error: null } : { value: '', error: 'Numbers only.' };
    }
    case 'date': {
      if (isBlank(raw)) return { value: '', error: null };
      const s = String(raw).trim();
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? { value: s, error: null } : { value: '', error: 'Use a valid date.' };
    }
    case 'dropdown': {
      if (isBlank(raw)) return { value: '', error: null };
      const s = String(raw).trim();
      const options = Array.isArray(field.options) ? field.options : [];
      if (options.length && !options.includes(s)) return { value: '', error: 'Choose one of the listed options.' };
      return { value: s, error: null };
    }
    default: {
      if (isBlank(raw)) return { value: '', error: null };
      return { value: String(raw).trim().slice(0, 2000), error: null };
    }
  }
}

// ---------------- Field rules ----------------

export function isRequired(field, salesmanType) {
  if (field.is_hidden || field.isHidden) return false;
  return salesmanType === 'branch'
    ? Boolean(field.required_branch ?? field.requiredBranch)
    : Boolean(field.required_route_b2b ?? field.requiredRouteB2b);
}

/** Value of a field on a customer object { mobile, crNumber, noCr, vatNumber, data, photoCount }. */
export function fieldValue(customer, key) {
  if (COLUMN_FIELDS[key]) return customer[COLUMN_FIELDS[key]];
  return customer.data ? customer.data[key] : undefined;
}

function isFilled(customer, field) {
  if (field.type === 'photo') return Number(customer.photoCount || 0) > 0;
  if (field.key === 'cr_number' && customer.noCr) return true;
  return !isBlank(fieldValue(customer, field.key));
}

/**
 * Which visible fields are still empty.
 * @returns {{ missingRequired: string[], missing: string[] }}  (field keys)
 */
export function completeness(customer, fields, salesmanType) {
  const missingRequired = [];
  const missing = [];
  for (const f of fields) {
    if (f.is_hidden || f.isHidden) continue;
    if (!isFilled(customer, f)) {
      missing.push(f.key);
      if (isRequired(f, salesmanType)) missingRequired.push(f.key);
    }
  }
  return { missingRequired, missing };
}

/** 'complete' when every visible field is filled, else 'submitted'. Caller handles pending approval. */
export function statusAfterSubmit(customer, fields, salesmanType) {
  return completeness(customer, fields, salesmanType).missing.length === 0 ? 'complete' : 'submitted';
}

/**
 * Validate a form submission.
 * input: { name?, mobile, crNumber, noCr, noCrReason, vatNumber, data: { key: value } }
 * options: { salesmanType, requireName, photoCount }
 * Returns { errors: { key: message }, clean: { name, mobile, crNumber, noCr, noCrReason, vatNumber, data } }
 */
export function validateSubmission(input = {}, fields = [], options = {}) {
  const { salesmanType = 'branch', requireName = false, photoCount = 0 } = options;
  const errors = {};
  const clean = { data: {} };

  const name = String(input.name ?? '').trim();
  if (requireName && name.length < 2) errors.name = 'Customer name is required.';
  clean.name = name.slice(0, 255);

  const noCr = Boolean(input.noCr);
  if (noCr && salesmanType !== 'branch') {
    errors.cr_number = 'Route / B2B customers must have a CR number.';
  }
  clean.noCr = noCr && salesmanType === 'branch';
  clean.noCrReason = clean.noCr ? String(input.noCrReason ?? '').trim().slice(0, 500) : '';
  if (clean.noCr && clean.noCrReason.length < 3) {
    errors.no_cr_reason = 'Please give a short reason why there is no CR.';
  }

  const inputData = input.data && typeof input.data === 'object' ? input.data : {};
  const raw = (key) => {
    if (key === 'mobile') return input.mobile;
    if (key === 'cr_number') return input.crNumber;
    if (key === 'vat_number') return input.vatNumber;
    return inputData[key];
  };

  for (const f of fields) {
    if (f.is_hidden || f.isHidden || f.type === 'photo') continue;
    if (f.key === 'cr_number' && clean.noCr) {
      clean.crNumber = '';
      continue;
    }
    const { value, error } = normalizeByType(f, raw(f.key));
    if (error) errors[f.key] = error;
    if (COLUMN_FIELDS[f.key]) clean[COLUMN_FIELDS[f.key]] = value;
    else if (value !== '') clean.data[f.key] = value;
  }

  // Required checks (only when the value itself was valid)
  const candidate = { ...clean, photoCount };
  for (const f of fields) {
    if (!isRequired(f, salesmanType) || errors[f.key]) continue;
    if (!isFilled(candidate, f)) {
      errors[f.key] = f.type === 'photo' ? 'Please add at least one photo.' : `${f.label} is required.`;
    }
  }

  return { errors, clean };
}

// ---------------- CSV import ----------------

/** RFC-4180 CSV parser; detects comma / semicolon / tab and strips the Excel BOM. */
export function parseCsv(text) {
  let src = String(text || '');
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let q = false;
  for (const ch of firstLine) {
    if (ch === '"') q = !q;
    else if (!q && ch in counts) counts[ch]++;
  }
  const delim = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0
    ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
    : ',';

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '"') {
      if (inQuotes && n === '"') { field += '"'; i++; } else inQuotes = !inQuotes;
    } else if (c === delim && !inQuotes) {
      row.push(field); field = '';
    } else if ((c === '\n' || c === '\r') && !inQuotes) {
      if (c === '\r' && n === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ''));
}

const HEADER_ALIASES = {
  name: ['customer name', 'customer', 'name', 'company', 'company name', 'shop name', 'business name', 'client', 'client name'],
  salesman: ['salesman', 'sales man', 'salesman name', 'sales rep', 'rep', 'representative', 'assigned to', 'assigned salesman'],
  mobile: ['mobile', 'mobile number', 'mobile no', 'phone', 'phone number', 'contact mobile', 'gsm'],
  cr_number: ['cr', 'cr number', 'cr no', 'commercial registration', 'commercial registration number'],
  vat_number: ['vat', 'vat number', 'vat no', 'vatin', 'tax number', 'trn'],
  whatsapp: ['whatsapp', 'whatsapp number', 'whatsapp no'],
  contact_number: ['contact number', 'landline', 'telephone', 'tel'],
  email: ['email', 'e-mail', 'email address'],
  route: ['route', 'route name'],
  segment: ['segment', 'customer segment', 'customer type', 'type'],
  address: ['address', 'full address'],
  postal_code: ['postal code', 'postcode', 'po box', 'zip'],
  location: ['location', 'google map', 'google maps', 'maps link', 'map link', 'gps'],
};

export function mapHeaders(headerRow, extraFieldKeys = []) {
  const map = {};
  headerRow.forEach((h, idx) => {
    const k = String(h || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[*:]/g, '').trim();
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (map[field] === undefined && aliases.includes(k)) { map[field] = idx; return; }
    }
    for (const key of extraFieldKeys) {
      if (map[key] === undefined && (k === key || k === key.replace(/_/g, ' '))) { map[key] = idx; return; }
    }
  });
  return map;
}

/**
 * Turn CSV text into import rows. Salesmen are matched by name (case-insensitive).
 * Values are NOT validated strictly here: prefilled details are only hints for the salesman.
 * @returns {{ rows: object[], headerMap: object, errors: string[] }}
 */
export function parseCustomerImport(csvText, { salesmen = [], fieldKeys = [] } = {}) {
  const table = parseCsv(csvText);
  if (table.length < 2) return { rows: [], headerMap: {}, errors: ['The file needs a header row and at least one customer.'] };
  const headerMap = mapHeaders(table[0], fieldKeys);
  const errors = [];
  if (headerMap.name === undefined) errors.push('No "Customer name" column found.');
  if (headerMap.salesman === undefined) errors.push('No "Salesman" column found.');
  if (errors.length) return { rows: [], headerMap, errors };

  const byName = new Map(salesmen.map((s) => [String(s.name).trim().toLowerCase(), s]));
  const rows = table.slice(1).map((cells, i) => {
    const get = (key) => (headerMap[key] !== undefined ? String(cells[headerMap[key]] ?? '').trim() : '');
    const salesmanName = get('salesman');
    const sm = byName.get(salesmanName.toLowerCase());
    const problems = [];
    const name = get('name');
    if (name.length < 2) problems.push('Customer name missing');
    if (!sm) problems.push(salesmanName ? `Salesman "${salesmanName}" not found` : 'Salesman missing');

    const data = {};
    for (const key of Object.keys(headerMap)) {
      if (['name', 'salesman', 'mobile', 'cr_number', 'vat_number'].includes(key)) continue;
      const v = get(key);
      if (v) data[key] = v;
    }
    const mobile = normalizeMobile(get('mobile'));
    const cr = normalizeCr(get('cr_number'));
    const vat = normalizeVat(get('vat_number'));
    return {
      line: i + 2,
      name,
      salesmanName,
      salesmanId: sm ? String(sm.id) : null,
      mobile: mobile.error ? '' : mobile.value,
      crNumber: cr.error ? '' : cr.value,
      vatNumber: vat.error ? '' : vat.value,
      data,
      valid: problems.length === 0,
      problems,
    };
  });
  return { rows, headerMap, errors };
}

// ---------------- Files ----------------

/** Detect file type by its first bytes (never trust the browser's name or type). */
export function detectFileType(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'pdf';
  return null;
}

/** Width, height and colour components of a JPEG (from its SOF marker). */
export function jpegInfo(buf) {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    // SOF0..SOF15 except DHT(C4), JPG(C8), DAC(CC)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return {
        height: buf.readUInt16BE(i + 5),
        width: buf.readUInt16BE(i + 7),
        components: buf[i + 9],
        adobe: buf.includes(Buffer.from('Adobe')),
      };
    }
    i += 2 + len;
  }
  throw new Error('Not a readable JPEG image');
}

/**
 * Build a PDF with one A4 page per JPEG, each image scaled to fit with a margin.
 * The JPEG bytes are embedded unchanged (no re-compression).
 */
export function jpegsToPdf(jpegBuffers, { title = 'Customer documents' } = {}) {
  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const MARGIN = 28;
  const objects = []; // index = object number - 1
  const add = (content) => { objects.push(content); return objects.length; };

  const catalogNo = add(null);
  const pagesNo = add(null);
  const pageNos = [];

  jpegBuffers.forEach((buf, idx) => {
    const info = jpegInfo(buf);
    const colorSpace = info.components === 1 ? '/DeviceGray' : info.components === 4 ? '/DeviceCMYK' : '/DeviceRGB';
    const decode = info.components === 4 && info.adobe ? ' /Decode [1 0 1 0 1 0 1 0]' : '';
    const imgNo = add({
      dict: `<< /Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} /ColorSpace ${colorSpace} /BitsPerComponent 8 /Filter /DCTDecode${decode} /Length ${buf.length} >>`,
      stream: buf,
    });
    const scale = Math.min((PAGE_W - 2 * MARGIN) / info.width, (PAGE_H - 2 * MARGIN) / info.height);
    const w = (info.width * scale).toFixed(2);
    const h = (info.height * scale).toFixed(2);
    const x = ((PAGE_W - info.width * scale) / 2).toFixed(2);
    const y = ((PAGE_H - info.height * scale) / 2).toFixed(2);
    const content = Buffer.from(`q ${w} 0 0 ${h} ${x} ${y} cm /Im${idx} Do Q`, 'latin1');
    const contentNo = add({ dict: `<< /Length ${content.length} >>`, stream: content });
    const pageNo = add(
      `<< /Type /Page /Parent ${pagesNo} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /XObject << /Im${idx} ${imgNo} 0 R >> >> /Contents ${contentNo} 0 R >>`
    );
    pageNos.push(pageNo);
  });

  objects[catalogNo - 1] = `<< /Type /Catalog /Pages ${pagesNo} 0 R >>`;
  objects[pagesNo - 1] = `<< /Type /Pages /Kids [${pageNos.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageNos.length} >>`;
  const safeTitle = String(title).replace(/[^\x20-\x7e]/g, '').replace(/[()\\]/g, '');
  const infoNo = add(`<< /Title (${safeTitle}) /Producer (Monipack CRM) >>`);

  const chunks = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  let offset = chunks[0].length;
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(offset);
    let part;
    if (obj && typeof obj === 'object' && obj.stream) {
      part = Buffer.concat([
        Buffer.from(`${i + 1} 0 obj\n${obj.dict}\nstream\n`, 'latin1'),
        obj.stream,
        Buffer.from('\nendstream\nendobj\n', 'latin1'),
      ]);
    } else {
      part = Buffer.from(`${i + 1} 0 obj\n${obj}\nendobj\n`, 'latin1');
    }
    chunks.push(part);
    offset += part.length;
  });
  const xref = [`xref\n0 ${objects.length + 1}\n`, '0000000000 65535 f \n', ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)].join('');
  chunks.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root ${catalogNo} 0 R /Info ${infoNo} 0 R >>\nstartxref\n${offset}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(chunks);
}
