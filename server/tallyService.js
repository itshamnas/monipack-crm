import http from 'http';
import https from 'https';

/**
 * Generates an official Monipack & TallyPrime compatible CSV template with sample data.
 */
export function generateProductTemplate() {
  const headers = [
    'SKU / Part Number',
    'Item Name (English)',
    'Arabic Name (الاسم بالعربي)',
    'Category / Stock Group',
    'Brand',
    'Unit of Measure (UOM)',
    'Price (OMR)',
    'Opening Stock Balance',
    'Description / Specifications'
  ];

  const sampleRows = [
    [
      'MNP-CUP-PET-16',
      'Clear PET Cold Cups 16oz',
      'أكواب بلاستيك شفاف بارد 16 أونصة',
      'Packaging Products',
      'Monipack',
      'CTN',
      '14.500',
      '450',
      'Ultra-clear durable PET cups suitable for iced coffee, smoothies, and juices (1,000 pcs/ctn)'
    ],
    [
      'MNP-CUP-KFT-08',
      'Double Wall Kraft Hot Cups 8oz',
      'أكواب كرافت دبل ساخن 8 أونصة',
      'Packaging Products',
      'Monipack',
      'CTN',
      '12.800',
      '520',
      'Insulated double-wall kraft cups, heat resistant, leakproof PE lining (500 pcs/ctn)'
    ],
    [
      'MNP-BAG-TW-M',
      'Kraft Paper Bags with Twisted Handle (Medium)',
      'أكياس ورقية كرافت بمقبض متوسط',
      'Packaging Products',
      'Monipack',
      'CTN',
      '8.500',
      '600',
      'Eco-friendly natural brown kraft shopping & takeaway bag with reinforced handle (250 pcs/ctn)'
    ],
    [
      'MNC-DIS-05L',
      'Moniclean Antibacterial Surface Disinfectant 5L',
      'موني كلين معقم ومطهر أسطح 5 لتر',
      'Cleaning Products',
      'Moniclean',
      'CAN',
      '4.800',
      '190',
      'Hospital grade multi-surface disinfectant and sanitizing liquid for HORECA and commercial use'
    ],
    [
      'MNF-SYR-VAN',
      'Monifood French Vanilla Beverage Syrup 1L',
      'موني فود سيرب الفانيليا الفرنسية 1 لتر',
      'Food Products',
      'Monifood',
      'BTL',
      '3.950',
      '240',
      'Premium flavoring syrup for specialty coffee shops, frappes, and desserts'
    ],
    [
      'KHE-SPOON-W',
      'Kohe Birchwood Biodegradable Spoons 16cm',
      'كوهي ملاعق خشب طبيعي قابلة للتحلل 16 سم',
      'Kohe Products',
      'Kohe',
      'CTN',
      '6.200',
      '350',
      '100% natural FSC-certified birchwood cutlery, splinter-free, plastic-free alternative (1,000 pcs/ctn)'
    ]
  ];

  const escapeCell = (val) => `"${String(val || '').replace(/"/g, '""')}"`;
  const csvContent = '\uFEFF' + [
    headers.map(escapeCell).join(','),
    ...sampleRows.map(row => row.map(escapeCell).join(','))
  ].join('\r\n');

  return csvContent;
}

/**
 * Universal CSV Parser with intelligent header mapping for TallyPrime and standard spreadsheets.
 */
export function parseProductCsv(csvContent) {
  if (!csvContent) return [];

  // Remove potential UTF-8 BOM
  let cleaned = csvContent;
  if (cleaned.charCodeAt(0) === 0xFEFF) {
    cleaned = cleaned.slice(1);
  }

  // Split lines
  const rawLines = cleaned.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (rawLines.length < 2) return [];

  // Parse CSV line respecting quotes
  const parseLine = (text) => {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"' || char === "'") {
        if (inQuotes && text[i + 1] === char) {
          cur += char;
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += char;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const headerCells = parseLine(rawLines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

  // Header matching dictionary
  const findCol = (aliases) => {
    return headerCells.findIndex(h => aliases.some(a => h.includes(a)));
  };

  const colSku = findCol(['sku', 'partnumber', 'partno', 'itemcode', 'code', 'barcode']);
  const colName = findCol(['name', 'itemname', 'productname', 'stockitem', 'item']);
  const colNameAr = findCol(['namear', 'arabic', 'alias', 'descriptionar']);
  const colCategory = findCol(['category', 'stockgroup', 'group', 'parent']);
  const colBrand = findCol(['brand', 'make', 'manufacturer']);
  const colUnit = findCol(['unit', 'uom', 'baseunits', 'units']);
  const colPrice = findCol(['price', 'priceomr', 'rate', 'standardprice', 'sellingprice', 'mrp']);
  const colStock = findCol(['stock', 'quantity', 'qty', 'closingbalance', 'balance', 'openingbalance']);
  const colDesc = findCol(['description', 'specs', 'specification', 'narration', 'remarks', 'notes']);

  const parsedItems = [];

  for (let i = 1; i < rawLines.length; i++) {
    const row = parseLine(rawLines[i]);
    if (row.length === 0 || !row.some(cell => cell.length > 0)) continue;

    const name = (colName !== -1 ? row[colName] : '') || row[1] || row[0];
    if (!name || !name.trim()) continue;

    // Clean price
    let rawPrice = colPrice !== -1 ? row[colPrice] : '';
    rawPrice = String(rawPrice || '').replace(/[^\d.]/g, '');
    const priceOMR = parseFloat(rawPrice) || 0;

    // Clean stock
    let rawStock = colStock !== -1 ? row[colStock] : '';
    rawStock = String(rawStock || '').replace(/[^\d.-]/g, '');
    const stock = parseInt(rawStock, 10) || 0;

    // Category deduction
    let category = (colCategory !== -1 ? row[colCategory] : '') || 'Packaging Products';
    if (category.toLowerCase().includes('clean')) category = 'Cleaning Products';
    else if (category.toLowerCase().includes('food')) category = 'Food Products';
    else if (category.toLowerCase().includes('kohe')) category = 'Kohe Products';
    else if (category.toLowerCase().includes('disp')) category = 'Disposable Products';
    else if (category.toLowerCase().includes('pack')) category = 'Packaging Products';

    // Brand deduction
    let brand = (colBrand !== -1 ? row[colBrand] : '') || '';
    if (!brand) {
      if (category.includes('Cleaning') || name.toLowerCase().includes('moniclean')) brand = 'Moniclean';
      else if (category.includes('Food') || name.toLowerCase().includes('monifood')) brand = 'Monifood';
      else if (category.includes('Kohe') || name.toLowerCase().includes('kohe')) brand = 'Kohe';
      else brand = 'Monipack';
    }

    parsedItems.push({
      sku: (colSku !== -1 ? row[colSku] : '') || `MNP-${Math.floor(1000 + Math.random() * 9000)}`,
      name: name.trim(),
      nameAr: colNameAr !== -1 ? row[colNameAr] : '',
      category: category.trim(),
      brand: brand.trim(),
      unit: (colUnit !== -1 ? row[colUnit] : '') || 'CTN',
      priceOMR,
      stock,
      description: colDesc !== -1 ? row[colDesc] : '',
      source: 'csv_import'
    });
  }

  return parsedItems;
}

/**
 * Test TallyPrime connectivity over HTTP port 9000
 */
export function testTallyConnection(tallyUrl = 'http://127.0.0.1:9000') {
  return new Promise((resolve) => {
    try {
      const u = new URL(tallyUrl);
      const req = http.request({
        hostname: u.hostname,
        port: u.port || 9000,
        path: '/',
        method: 'GET',
        timeout: 3000
      }, (res) => {
        resolve({
          online: true,
          status: res.statusCode,
          message: `Connected to TallyPrime at ${tallyUrl} (HTTP ${res.statusCode})`
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          online: false,
          message: `TallyPrime connection timed out at ${tallyUrl}. Ensure TallyPrime is open and port 9000 is enabled in F1: Help -> Settings -> Connectivity.`
        });
      });

      req.on('error', (err) => {
        resolve({
          online: false,
          message: `Cannot reach TallyPrime at ${tallyUrl} (${err.code || err.message}). Please verify TallyPrime is running.`
        });
      });

      req.end();
    } catch (e) {
      resolve({
        online: false,
        message: `Invalid Tally URL: ${e.message}`
      });
    }
  });
}

/**
 * Fetch Stock Items directly from TallyPrime XML Server
 */
export function fetchTallyStockItems(tallyUrl = 'http://127.0.0.1:9000', companyName = '') {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(tallyUrl);

      // Standard Tally XML Envelope for Stock Items
      const tallyXmlPayload = `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Accounts</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <ACCOUNTTYPE>Stock Items</ACCOUNTTYPE>
          ${companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : ''}
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>
`.trim();

      const req = http.request({
        hostname: u.hostname,
        port: u.port || 9000,
        path: '/',
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml;charset=utf-8',
          'Content-Length': Buffer.byteLength(tallyXmlPayload),
        },
        timeout: 10000,
      }, (res) => {
        let xmlData = '';
        res.setEncoding('utf8');
        res.on('data', chunk => xmlData += chunk);
        res.on('end', () => {
          try {
            const parsed = parseTallyXml(xmlData);
            resolve(parsed);
          } catch (err) {
            reject(new Error(`Failed to parse Tally response: ${err.message}`));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`TallyPrime timed out while fetching stock data at ${tallyUrl}`));
      });

      req.on('error', (err) => {
        reject(new Error(`TallyPrime network error: ${err.message}. Is TallyPrime listening on port ${u.port || 9000}?`));
      });

      req.write(tallyXmlPayload);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Helper to clean XML values: unescape entities, strip CDATA tags, and trim
 */
export function cleanXmlValue(text) {
  if (!text) return '';
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/gi, "'")
    .trim();
}

/**
 * Parse TallyPrime XML response into Monipack CRM Product format
 */
export function parseTallyXml(xml) {
  if (!xml || typeof xml !== 'string') return [];

  const items = [];
  // Match each <STOCKITEM ...> ... </STOCKITEM> block
  const itemRegex = /<STOCKITEM[\s\S]*?<\/STOCKITEM>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[0];

    const getTag = (tag) => {
      const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
      const m = block.match(r);
      return m ? cleanXmlValue(m[1]) : '';
    };

    let name = getTag('NAME');
    if (!name) {
      const nameAttr = block.match(/<STOCKITEM[^>]*\sNAME="([^"]+)"/i) || block.match(/<STOCKITEM[^>]*\sNAME='([^']+)'/i);
      if (nameAttr) name = cleanXmlValue(nameAttr[1]);
    }
    if (!name) {
      const langMatch = block.match(/<LANGUAGENAME\.LIST>[\s\S]*?<NAME>([^<]+)<\/NAME>/i);
      if (langMatch) name = cleanXmlValue(langMatch[1]);
    }
    if (!name) continue;

    const parent = getTag('PARENT') || 'Packaging Products';
    const baseUnits = getTag('BASEUNITS') || 'CTN';
    const partNo = getTag('PARTNUMBER') || getTag('GUID') || `MNP-${Math.floor(1000 + Math.random() * 9000)}`;
    const description = getTag('DESCRIPTION') || getTag('NARRATION') || '';
    
    // Parse Rate / Standard Price
    let rawRate = getTag('STANDARDPRICE') || getTag('RATE') || '0';
    rawRate = rawRate.replace(/[^\d.]/g, '');
    const priceOMR = parseFloat(rawRate) || 0;

    // Parse Closing Balance
    let rawBalance = getTag('CLOSINGBALANCE') || getTag('OPENINGBALANCE') || '0';
    rawBalance = rawBalance.replace(/[^\d.-]/g, '');
    const stock = parseInt(rawBalance, 10) || 0;

    // Auto determine brand
    let brand = 'Monipack';
    if (parent.toLowerCase().includes('clean') || name.toLowerCase().includes('moniclean')) brand = 'Moniclean';
    else if (parent.toLowerCase().includes('food') || name.toLowerCase().includes('monifood')) brand = 'Monifood';
    else if (parent.toLowerCase().includes('kohe') || name.toLowerCase().includes('kohe')) brand = 'Kohe';

    items.push({
      sku: partNo,
      name,
      nameAr: getTag('ALIAS') || '',
      category: parent,
      brand,
      unit: baseUnits,
      priceOMR,
      stock,
      description,
      source: 'tally_live_xml'
    });
  }

  return items;
}

/**
 * Universal Product Importer with Smart Variance Analysis for 2026
 * Accepts raw Tally XML (Alt + E export) or standard CSV/Excel,
 * and performs real-time comparison against existing catalog items.
 */
export function parseUniversalProductData(content, existingProducts = []) {
  if (!content || typeof content !== 'string') {
    return { items: [], count: 0, newCount: 0, priceChangedCount: 0, lowStockCount: 0, formatDetected: 'Empty' };
  }

  const isXml = content.includes('<ENVELOPE') || content.includes('<STOCKITEM') || content.includes('<?xml');
  let rawItems = [];

  if (isXml) {
    rawItems = parseTallyXml(content);
  } else {
    rawItems = parseProductCsv(content);
  }

  let newCount = 0;
  let priceChangedCount = 0;
  let lowStockCount = 0;

  const enrichedItems = rawItems.map(item => {
    const existing = existingProducts.find(p => {
      if (item.sku && p.sku && p.sku.toLowerCase() === item.sku.toLowerCase()) return true;
      if (item.name && p.name && p.name.trim().toLowerCase() === item.name.trim().toLowerCase()) return true;
      return false;
    });

    const isNew = !existing;
    const oldPrice = existing ? Number(existing.priceOMR || 0) : null;
    const newPrice = Number(item.priceOMR || 0);
    const priceDiff = existing ? (newPrice - oldPrice) : 0;
    const priceDiffPct = existing && oldPrice > 0 ? (((newPrice - oldPrice) / oldPrice) * 100).toFixed(1) : '0.0';
    const priceChanged = existing && Math.abs(newPrice - oldPrice) > 0.001;
    const isPriceIncrease = priceChanged && newPrice > oldPrice;

    const oldStock = existing ? Number(existing.stock || 0) : null;
    const newStock = Number(item.stock || 0);
    const isLowStock = newStock > 0 && newStock <= 20;
    const isOutOfStock = newStock <= 0;

    if (isNew) newCount++;
    if (priceChanged) priceChangedCount++;
    if (isLowStock || isOutOfStock) lowStockCount++;

    return {
      ...item,
      isNew,
      oldPrice,
      newPrice,
      priceDiff,
      priceDiffPct,
      priceChanged,
      isPriceIncrease,
      oldStock,
      newStock,
      isLowStock,
      isOutOfStock,
      existingId: existing ? existing.id : null,
      source: isXml ? 'tally_xml_drop' : item.source || 'csv_drop'
    };
  });

  return {
    items: enrichedItems,
    count: enrichedItems.length,
    newCount,
    priceChangedCount,
    lowStockCount,
    formatDetected: isXml ? 'Tally Native XML (Alt + E)' : 'CSV / Excel Spreadsheet'
  };
}
