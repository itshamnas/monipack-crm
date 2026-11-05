/**
 * Monipack CRM - Product Catalog CSV Import & Price Variance Service
 * Morooj Nizwa International LLC - Sultanate of Oman
 */

/**
 * Generates an official Monipack compatible CSV template with sample data.
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
 * Universal CSV Parser with intelligent header mapping for product spreadsheets.
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
  const findCol = (aliases, exclude = []) => {
    return headerCells.findIndex(h => aliases.some(a => h.includes(a)) && !exclude.some(e => h.includes(e)));
  };

  const colSku = findCol(['sku', 'partnumber', 'partno', 'itemcode', 'code', 'barcode']);
  const colName = findCol(['name', 'itemname', 'productname', 'stockitem', 'item']);
  const colNameAr = findCol(['namear', 'arabic', 'alias', 'descriptionar']);
  const colCategory = findCol(['category', 'stockgroup', 'group', 'parent']);
  const colBrand = findCol(['brand', 'make', 'manufacturer']);
  const colUnit = findCol(['unit', 'uom', 'baseunits', 'units']);
  const colPrice = findCol(['price', 'priceomr', 'rate', 'standardprice', 'sellingprice', 'mrp']);
  const colStock = findCol(['stock', 'quantity', 'qty', 'closingbalance', 'balance', 'openingbalance'], ['group', 'category']);
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
 * Universal Product Importer with Smart Variance Analysis
 * Accepts standard CSV/Excel text and performs real-time comparison against existing catalog items.
 */
export function parseUniversalProductData(content, existingProducts = []) {
  if (!content || typeof content !== 'string') {
    return { items: [], count: 0, newCount: 0, priceChangedCount: 0, lowStockCount: 0, formatDetected: 'Empty' };
  }

  const rawItems = parseProductCsv(content);

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
      source: item.source || 'csv_drop'
    };
  });

  return {
    items: enrichedItems,
    count: enrichedItems.length,
    newCount,
    priceChangedCount,
    lowStockCount,
    formatDetected: 'CSV Spreadsheet'
  };
}
