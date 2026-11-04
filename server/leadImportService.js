/**
 * Monipack CRM - Enterprise Lead Import Service (2026 Non-Breaking Architecture)
 * Morooj Nizwa International LLC - Sultanate of Oman
 * 
 * Supports:
 * - Downloadable bilingual CSV/Excel template with UTF-8 BOM
 * - Smart header recognition & loose column mapping
 * - Oman phone number normalization (+968 with 8-digit mobile/tel validation)
 * - Oman branch hub resolution (Ghala, Al Khoud, Mabela, Amarath, Nizwa, Bahla, Musannah, Ibra, Ibri, Jalan Bani Buali)
 * - Automatic sales representative assignment based on branch
 * - Duplicate & conflict detection against current database (by phone, mobile, company name)
 */

export function generateLeadTemplate(type = 'minimal') {
  if (type === 'minimal') {
    // Ultra-simple 2-column template: Name & Mobile Number only
    const headers = [
      'Customer / Company Name (Required)',
      'Mobile Number (+968) (Required)'
    ];

    const sampleRows = [
      ['Bait Al Luban Omani Restaurant', '+968 97023051'],
      ['Karak Al Zafran Cafe & Bakery', '+968 91234567'],
      ['Nizwa Heritage Bakery & Sweets', '+968 95551234'],
      ['Golden Dunes Catering LLC', '+968 79062219'],
      ['Al Barakah Hypermarket', '92008899']
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const csvRows = [
      headers.map(escapeCsv).join(','),
      ...sampleRows.map(row => row.map(escapeCsv).join(','))
    ];

    return '\uFEFF' + csvRows.join('\r\n');
  }

  // Standard template with optional fields for full intake
  const headers = [
    'Company / Client Name (Required)',
    'Mobile / Phone Number (+968) (Required)',
    'Customer Contact Person (Optional)',
    'Product Category (Optional - default: Packaging Products)',
    'Customer Location / Wilayat (Optional - ask during call)',
    'Quantity / Volume Required (Optional - ask during call)',
    'Estimated Deal Value OMR (Optional)',
    'Customer Requirements & Notes (Optional)'
  ];

  const sampleRows = [
    [
      'Bait Al Luban Omani Restaurant',
      '+968 97023051',
      'Salim Al Riyami',
      'Packaging Products',
      'Muttrah Corniche, Muscat',
      '200 Cartons custom burger & meal boxes',
      '1250.000',
      'Met at HORECA Oman exhibition. Needs custom printed kraft takeaway boxes and eco bags.'
    ],
    [
      'Karak Al Zafran Cafe & Bakery',
      '+968 91234567',
      'Fatima Al Balushi',
      'Kohe Products',
      'Al Khoud 6, Seeb',
      '50 Cartons 8oz & 12oz double wall hot cups',
      '480.000',
      'Inquiry from Instagram campaign. Requires sample paper cups with embossed logo.'
    ],
    [
      'Nizwa Heritage Bakery & Sweets',
      '+968 95551234',
      'Khalfan Al Kindi',
      'Disposable Products',
      'Firq Industrial Area, Nizwa',
      '80 Cartons clear plastic pastry containers',
      '850.000',
      'Customer requested price list for disposable transparent bakery boxes.'
    ],
    [
      'Golden Dunes Catering LLC',
      '+968 79062219',
      'Chef Tariq Mansoor',
      'Packaging Products',
      'Al Rusayl Industrial City',
      '500 Cartons aluminum foil containers',
      '3400.000',
      'Requested official quote with 30-day payment terms for government hospital catering.'
    ],
    [
      'Al Barakah Hypermarket',
      '+968 92008899',
      'Nasser Al Saadi',
      'Cleaning Products',
      'Jalan Bani Buali Commercial St',
      '150 Cans 5L Moniclean disinfectant & hand soap',
      '1800.000',
      'New wholesale account. Direct supply of cleaning chemicals and jumbo rolls.'
    ]
  ];

  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const csvRows = [
    headers.map(escapeCsv).join(','),
    ...sampleRows.map(row => row.map(escapeCsv).join(','))
  ];

  // UTF-8 BOM (\uFEFF) ensures Excel and Google Sheets render Arabic and symbols perfectly
  return '\uFEFF' + csvRows.join('\r\n');
}

/**
 * Normalizes Oman phone numbers into clean international format (+968 xxxxxxxx)
 */
export function normalizeOmanPhone(rawPhone) {
  if (!rawPhone) return { phone: '', mobile: '', countryCode: '+968', valid: false };

  // Strip spaces, dashes, parentheses, non-digits (except leading +)
  let clean = String(rawPhone).trim().replace(/[\s\-\(\)\.]/g, '');

  let mobile = '';
  let countryCode = '+968';

  if (clean.startsWith('+968')) {
    mobile = clean.slice(4);
  } else if (clean.startsWith('00968')) {
    mobile = clean.slice(5);
  } else if (clean.startsWith('968') && clean.length >= 11) {
    mobile = clean.slice(3);
  } else {
    mobile = clean;
  }

  // Remove leading 0 if present (e.g. 097023051 -> 97023051)
  if (mobile.startsWith('0')) {
    mobile = mobile.slice(1);
  }

  const valid = /^[79]\d{7}$/.test(mobile); // Oman standard 8-digit mobile/tel starts with 7 or 9
  const formattedPhone = mobile ? `${countryCode} ${mobile}` : '';

  return {
    phone: formattedPhone,
    mobile: mobile,
    countryCode: countryCode,
    valid: valid
  };
}

/**
 * Parses raw CSV content with smart column detection, branch/salesman mapping,
 * Oman phone normalization, and duplicate detection.
 */
export function parseLeadCsv(csvContent, dbContext = {}) {
  if (!csvContent || typeof csvContent !== 'string') {
    return { items: [], count: 0, duplicatesCount: 0, validCount: 0 };
  }

  // Remove UTF-8 BOM if present
  let cleanContent = csvContent.replace(/^\uFEFF/, '').trim();
  if (!cleanContent) return { items: [], count: 0, duplicatesCount: 0, validCount: 0 };

  const lines = parseCsvToRows(cleanContent);
  if (lines.length < 2) {
    return { items: [], count: 0, duplicatesCount: 0, validCount: 0 };
  }

  const headerRow = lines[0].map(h => (h || '').trim().toLowerCase());
  const colMap = mapHeadersToLeadFields(headerRow);

  const existingLeads = dbContext.leads || [];
  const branches = dbContext.branches || [];
  const categories = dbContext.categories || [
    'Packaging Products',
    'Disposable Products',
    'Kohe Products',
    'Cleaning Products',
    'Food Products',
    'Other / Custom Wholesale Requirement'
  ];

  // Map of branch -> salesman
  const branchSalesMap = {};
  branches.forEach(b => {
    if (b.name) {
      branchSalesMap[b.name.toLowerCase()] = b.salesman || 'Unassigned';
    }
  });

  const parsedItems = [];
  let duplicatesCount = 0;
  let validCount = 0;
  let invalidCount = 0;

  for (let r = 1; r < lines.length; r++) {
    const row = lines[r];
    if (!row || row.length === 0 || row.every(cell => !cell || !cell.trim())) {
      continue; // Skip empty rows
    }

    const getVal = (colIndex) => {
      if (colIndex === undefined || colIndex === null || colIndex === -1) return '';
      return (row[colIndex] || '').trim();
    };

    const rawName = getVal(colMap.name) || getVal(colMap.company) || '';
    const cleanName = rawName.replace(/&amp;/g, '&').trim();
    const contactPerson = getVal(colMap.contactPerson) || '';
    const rawCategory = getVal(colMap.category);
    const rawPhone = getVal(colMap.phone) || getVal(colMap.mobile) || '';
    const email = getVal(colMap.email) || '';
    const location = getVal(colMap.location) || getVal(colMap.city) || getVal(colMap.wilayat) || '';
    const rawBranch = getVal(colMap.branch);
    const rawSalesman = getVal(colMap.salesman);
    const rawStage = getVal(colMap.stage) || getVal(colMap.status);
    const rawDealValue = getVal(colMap.dealValue) || getVal(colMap.value);
    const quantity = getVal(colMap.quantity) || '';
    const notes = getVal(colMap.notes) || '';

    // 1. Phone Normalization
    const phoneData = normalizeOmanPhone(rawPhone);

    // 2. Strict Requirement Validation: ONLY Name and Mobile Number are required
    let isValid = true;
    let errorReason = '';

    if (!cleanName || cleanName.length < 2) {
      isValid = false;
      errorReason = 'Missing Customer/Company Name';
    } else if (!phoneData.mobile) {
      isValid = false;
      errorReason = 'Missing Mobile Number';
    }

    if (!isValid) {
      invalidCount++;
      parsedItems.push({
        name: cleanName || 'Unnamed Lead',
        contactPerson,
        category: 'Packaging Products',
        countryCode: phoneData.countryCode || '+968',
        mobile: phoneData.mobile,
        phone: rawPhone,
        email,
        customerLocation: 'Needs Intake',
        branch: 'Ghala',
        salesman: 'Shamnas Acheerakath',
        status: 'new',
        dealValue: 0,
        quantity: 'Needs Intake',
        notes: notes || 'Incomplete lead record',
        isValid: false,
        errorReason,
        isDuplicate: false,
        phoneValid: false,
        source: 'csv_import'
      });
      continue;
    }

    // 3. Branch Resolution
    let resolvedBranch = 'Ghala'; // Default to HQ
    if (rawBranch) {
      const matchBranch = branches.find(b => b.name && b.name.toLowerCase() === rawBranch.toLowerCase());
      if (matchBranch) {
        resolvedBranch = matchBranch.name;
      } else {
        resolvedBranch = rawBranch;
      }
    } else if (location && location !== 'Needs Intake') {
      const matchBranch = branches.find(b => location.toLowerCase().includes(b.name.toLowerCase()));
      if (matchBranch) resolvedBranch = matchBranch.name;
    }

    // 4. Salesman Resolution
    let resolvedSalesman = rawSalesman;
    if (!resolvedSalesman) {
      resolvedSalesman = branchSalesMap[resolvedBranch.toLowerCase()] || 'Shamnas Acheerakath';
    }

    // 5. Category Resolution (Defaults to Packaging Products if omitted)
    let resolvedCategory = 'Packaging Products';
    if (rawCategory) {
      const matchCat = categories.find(c => c.toLowerCase() === rawCategory.toLowerCase());
      if (matchCat) {
        resolvedCategory = matchCat;
      } else {
        const lower = rawCategory.toLowerCase();
        if (lower.includes('cup') || lower.includes('kohe')) resolvedCategory = 'Kohe Products';
        else if (lower.includes('clean') || lower.includes('soap')) resolvedCategory = 'Cleaning Products';
        else if (lower.includes('disp') || lower.includes('plate')) resolvedCategory = 'Disposable Products';
        else if (lower.includes('food')) resolvedCategory = 'Food Products';
        else resolvedCategory = rawCategory;
      }
    }

    // 6. Stage Resolution: All newly imported inquiries land in 'new' (Call Queue) for Customer Care intake
    let resolvedStage = 'new';
    if (rawStage) {
      const s = rawStage.toLowerCase();
      if (s.includes('2') || s.includes('assign') || s.includes('analyze')) resolvedStage = 'contacted';
      else if (s.includes('3') || s.includes('quote') || s.includes('quotation')) resolvedStage = 'quotation_sent';
      else if (s.includes('4') || s.includes('sample') || s.includes('follow')) resolvedStage = 'sample_sent';
      else if (s.includes('won') || s.includes('converted') || s.includes('deal')) resolvedStage = 'won';
      else if (s.includes('lost') || s.includes('not converted')) resolvedStage = 'lost';
    }

    // 7. Deal Value
    let cleanVal = String(rawDealValue).replace(/[^0-9\.]/g, '');
    let dealValue = parseFloat(cleanVal) || 0;

    // 8. Duplicate Check against existing leads
    let isDuplicate = false;
    let duplicateOf = null;
    let duplicateReason = '';

    if (phoneData.mobile) {
      const matchPhone = existingLeads.find(l => {
        if (!l.mobile && !l.phone) return false;
        return (l.mobile && l.mobile === phoneData.mobile) ||
               (l.phone && l.phone.includes(phoneData.mobile));
      });
      if (matchPhone) {
        isDuplicate = true;
        duplicateOf = matchPhone.id;
        duplicateReason = `Mobile match: ${phoneData.mobile} (${matchPhone.name})`;
      }
    }

    if (!isDuplicate && cleanName) {
      const matchName = existingLeads.find(l => l.name && l.name.trim().toLowerCase() === cleanName.toLowerCase());
      if (matchName) {
        isDuplicate = true;
        duplicateOf = matchName.id;
        duplicateReason = `Company Name match: "${matchName.name}"`;
      }
    }

    if (isDuplicate) {
      duplicatesCount++;
    } else {
      validCount++;
    }

    // 9. Location & Quantity: If missing in CSV, mark as 'Needs Intake' for customer care to ask on call
    const finalLocation = location ? location.trim() : 'Needs Intake';
    const finalQuantity = quantity ? quantity.trim() : 'Needs Intake';

    parsedItems.push({
      name: cleanName,
      contactPerson,
      category: resolvedCategory,
      countryCode: phoneData.countryCode,
      mobile: phoneData.mobile,
      phone: phoneData.phone,
      email,
      customerLocation: finalLocation,
      branch: resolvedBranch,
      salesman: resolvedSalesman,
      status: resolvedStage,
      dealValue,
      quantity: finalQuantity,
      notes: notes || 'Imported inquiry. Awaiting call intake.',
      isValid: true,
      errorReason: '',
      isDuplicate,
      duplicateOf,
      duplicateReason,
      phoneValid: phoneData.valid,
      source: 'csv_import'
    });
  }

  return {
    items: parsedItems,
    count: parsedItems.length,
    validCount,
    duplicatesCount,
    invalidCount
  };
}

/**
 * Intelligent header mapper matching variations of common column titles
 */
function mapHeadersToLeadFields(headers) {
  const map = {
    name: -1,
    company: -1,
    contactPerson: -1,
    category: -1,
    phone: -1,
    mobile: -1,
    email: -1,
    location: -1,
    city: -1,
    wilayat: -1,
    branch: -1,
    salesman: -1,
    stage: -1,
    status: -1,
    dealValue: -1,
    value: -1,
    quantity: -1,
    notes: -1
  };

  headers.forEach((h, idx) => {
    // Company / Client Name
    if (h.includes('company') || (h.includes('client') && h.includes('name')) || (h.includes('customer') && h.includes('name')) || h === 'name' || h.includes('business')) {
      if (map.name === -1) map.name = idx;
    }
    // Contact Person
    else if (h.includes('contact') && (h.includes('person') || h.includes('name') || h.includes('rep'))) {
      if (map.contactPerson === -1) map.contactPerson = idx;
    }
    // Category
    else if (h.includes('category') || h.includes('division') || h.includes('product interest') || h.includes('type')) {
      if (map.category === -1) map.category = idx;
    }
    // Phone & Mobile
    else if (h.includes('mobile') || h.includes('whatsapp') || h.includes('cell')) {
      if (map.mobile === -1) map.mobile = idx;
    } else if (h.includes('phone') || h.includes('tel') || h.includes('contact number')) {
      if (map.phone === -1) map.phone = idx;
    }
    // Email
    else if (h.includes('email') || h.includes('mail')) {
      if (map.email === -1) map.email = idx;
    }
    // Location / Wilayat
    else if (h.includes('wilayat') || h.includes('location') || h.includes('city') || h.includes('address') || h.includes('area')) {
      if (map.location === -1) map.location = idx;
    }
    // Oman Branch Hub
    else if (h.includes('branch') || h.includes('hub') || h.includes('office')) {
      if (map.branch === -1) map.branch = idx;
    }
    // Salesman / Representative
    else if (h.includes('sales') || h.includes('rep') || h.includes('agent') || h.includes('account manager')) {
      if (map.salesman === -1) map.salesman = idx;
    }
    // Pipeline Stage / Status
    else if (h.includes('stage') || h.includes('status') || h.includes('step') || h.includes('pipeline')) {
      if (map.stage === -1) map.stage = idx;
    }
    // Deal Value / Amount / OMR
    else if (h.includes('deal') || h.includes('value') || h.includes('amount') || h.includes('omr') || h.includes('price') || h.includes('budget')) {
      if (map.dealValue === -1) map.dealValue = idx;
    }
    // Quantity / Volume
    else if (h.includes('qty') || h.includes('quantity') || h.includes('volume') || h.includes('cartons') || h.includes('units')) {
      if (map.quantity === -1) map.quantity = idx;
    }
    // Notes / Requirements / Discussions
    else if (h.includes('notes') || h.includes('req') || h.includes('discuss') || h.includes('remark') || h.includes('comment') || h.includes('details')) {
      if (map.notes === -1) map.notes = idx;
    }
  });

  return map;
}

/**
 * Standard RFC-4180 CSV tokenizer handling quotes, commas, and multi-line values
 */
function parseCsvToRows(text) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField);
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip LF of CRLF
      }
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}
