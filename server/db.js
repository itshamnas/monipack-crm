import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'monipack_crm.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial state schema
const initialSchema = {
  users: [],
  leads: [],
  categories: [
    'Packaging Products',
    'Disposable Products',
    'Kohe Products',
    'Cleaning Products',
    'Food Products',
    'Other / Custom Wholesale Requirement',
  ],
  pipelineStages: [
    { id: 'new', label: 'STEP 1: Qualification & Intake', color: 'border-t-2 border-blue-500 bg-blue-50/20' },
    { id: 'contacted', label: 'STEP 2: Analyze & Assign', color: 'border-t-2 border-indigo-500 bg-indigo-50/20' },
    { id: 'quotation_sent', label: 'STEP 3: Quotation Follow-Up', color: 'border-t-2 border-amber-500 bg-amber-50/20' },
    { id: 'sample_sent', label: 'STEP 4: Sample & Negotiation', color: 'border-t-2 border-purple-500 bg-purple-50/20' },
    { id: 'won', label: 'STEP 5: Converted (Won)', color: 'border-t-2 border-emerald-500 bg-emerald-50/20' },
    { id: 'lost', label: 'STEP 6: Lost / Closed', color: 'border-t-2 border-rose-500 bg-rose-50/20' },
  ],
  products: [],
  quotations: [],
  branches: [
    { id: 'b_ghala', name: 'Ghala', city: 'Muscat', phone: '+968 79062219', salesman: 'Shamnas Acheerakath', isHeadquarters: true },
    { id: 'b_khoud', name: 'Al Khoud', city: 'Muscat', phone: '+968 97023051', salesman: 'Salim Al Hadhrami', isHeadquarters: false },
    { id: 'b_mabela', name: 'Mabela', city: 'Muscat', phone: '+968 97023052', salesman: 'Mohammed Al Balushi', isHeadquarters: false },
    { id: 'b_amarath', name: 'Amarath', city: 'Muscat', phone: '+968 97023053', salesman: 'Ankit Patel', isHeadquarters: false },
    { id: 'b_musannah', name: 'Musannah', city: 'South Al Batinah', phone: '+968 97023054', salesman: 'Shamnas Acheerakath', isHeadquarters: false },
    { id: 'b_nizwa', name: 'Nizwa', city: 'Ad Dakhiliyah', phone: '+968 97023055', salesman: 'Hamad Al Kindi', isHeadquarters: false },
    { id: 'b_ibri', name: 'Ibri', city: 'Ad Dhahirah', phone: '+968 97023051', salesman: 'Tariq Al Ghafri', isHeadquarters: false },
    { id: 'b_ibra', name: 'Ibra', city: 'Ash Sharqiyah', phone: '+968 97023056', salesman: 'Rashid Al Maskari', isHeadquarters: false },
    { id: 'b_bahla', name: 'Bahla', city: 'Ad Dakhiliyah', phone: '+968 97023057', salesman: 'Said Al Abri', isHeadquarters: false },
    { id: 'b_jalan', name: 'Jalan Bani Buali', city: 'Ash Sharqiyah', phone: '+968 97023058', salesman: 'Abdullah Al Saadi', isHeadquarters: false },
    { id: 'b_b2b_afsal', name: 'B2B', city: '', phone: '+968 79062219', salesman: 'AFSAL', isHeadquarters: false },
    { id: 'b_b2b_anas', name: 'B2B', city: 'Oman', phone: '+968 79062219', salesman: 'ANAS', isHeadquarters: false },
    { id: 'b_b2b_jamshid', name: 'B2B', city: 'Muscat', phone: '+968 79062219', salesman: 'JAMSHID', isHeadquarters: false },
    { id: 'b_b2b_asees', name: 'B2B', city: 'Oman', phone: '+968 79062219', salesman: 'ASEES KAKKERI', isHeadquarters: false },
    { id: 'b_b2b_haris', name: 'B2B', city: 'Oman', phone: '+968 79062219', salesman: 'HARIS KAKKERI', isHeadquarters: false },
  ],
  activities: [],
  settings: {
    companyName: 'Morooj Nizwa International LLC',
    companyNameAr: 'شركة مروج نزوى العالمية ش.م.م',
    brandName: 'Monipack',
    website: 'www.monipack.com',
    shopUrl: 'www.shop.monipack.com',
    phone: '+968 79062219',
    complaintPhone: '+968 9715 0774',
    email: 'info@monipack.com',
    supportEmail: 'customersupport@monipack.com',
    headquarters: 'Ghala, Muscat, Sultanate of Oman',
    currency: 'OMR',
    quoteValidityDays: 30,
    exportRestrictedRole: 'admin',
    enableAuditLogs: true,
    defaultTerms: [
      'All prices are quoted in Omani Rial (OMR).',
      'Quotation validity: 30 days from date of issue.',
      'Payment terms: As per agreed commercial credit terms.',
      'Delivery: Fast delivery across all Oman Wilayats upon confirmed PO.',
    ],
  },
};

/**
 * Normalizes Oman mobile & phone numbers to prevent repeated country code (+968 +968) bugs.
 */
export function normalizeOmanPhone(countryCodeOrRaw = '+968', mobile = '', phone = '') {
  let raw = '';
  let cleanCode = '+968';

  // If called with a single string or when mobile and phone are omitted
  if (!mobile && !phone && countryCodeOrRaw && countryCodeOrRaw !== '+968') {
    raw = String(countryCodeOrRaw);
  } else {
    raw = String(mobile || phone || '');
    if (countryCodeOrRaw && (countryCodeOrRaw.startsWith('+') || countryCodeOrRaw === '968')) {
      cleanCode = countryCodeOrRaw.trim();
    }
  }

  // Strip non-digits except +
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

  // Normalize cleanCode to strictly '+968' if it contains repeated 968
  let codeDigits = String(cleanCode).replace(/[^\d]/g, '');
  if (codeDigits === '968' || codeDigits.startsWith('968968')) {
    cleanCode = '+968';
  }

  const fullPhone = cleaned ? `${cleanCode} ${cleaned}` : '';
  return { countryCode: cleanCode, mobile: cleaned, phone: fullPhone };
}

class Database {
  constructor() {
    this.data = this.load();
    if (!this.data.users) {
      this.data.users = [];
    }
    if (!this.data.settings) {
      this.data.settings = { ...initialSchema.settings };
    }
    if (!this.data.categories || this.data.categories.length === 0) {
      this.data.categories = [...initialSchema.categories];
    }
    if (!this.data.pipelineStages || this.data.pipelineStages.length === 0) {
      this.data.pipelineStages = [...initialSchema.pipelineStages];
    } else {
      const standardStageMap = {
        new: { label: 'STEP 1: Qualification & Intake', color: 'border-t-2 border-blue-500 bg-blue-50/20' },
        contacted: { label: 'STEP 2: Analyze & Assign', color: 'border-t-2 border-indigo-500 bg-indigo-50/20' },
        quotation_sent: { label: 'STEP 3: Quotation Follow-Up', color: 'border-t-2 border-amber-500 bg-amber-50/20' },
        sample_sent: { label: 'STEP 4: Sample & Negotiation', color: 'border-t-2 border-purple-500 bg-purple-50/20' },
        won: { label: 'STEP 5: Converted (Won)', color: 'border-t-2 border-emerald-500 bg-emerald-50/20' },
        lost: { label: 'STEP 6: Lost / Closed', color: 'border-t-2 border-rose-500 bg-rose-50/20' },
      };

      let changed = false;
      this.data.pipelineStages = this.data.pipelineStages.map((stage) => {
        if (standardStageMap[stage.id]) {
          if (stage.label !== standardStageMap[stage.id].label || stage.color !== standardStageMap[stage.id].color) {
            changed = true;
            return {
              ...stage,
              label: standardStageMap[stage.id].label,
              color: standardStageMap[stage.id].color,
            };
          }
        }
        return stage;
      });
      if (changed) {
        this.save();
      }
    }
    if (this.data.branches) {
      const defaultSalesmen = [
        'Shamnas Acheerakath',
        'Salim Al Hadhrami',
        'Mohammed Al Balushi',
        'Ankit Patel',
        'Shamnas Acheerakath',
        'Hamad Al Kindi',
        'Tariq Al Ghafri',
        'Rashid Al Maskari',
        'Said Al Abri',
        'Abdullah Al Saadi'
      ];
      this.data.branches = this.data.branches.map((b, idx) => {
        if (!b.salesman) {
          b.salesman = defaultSalesmen[idx % defaultSalesmen.length];
        }
        return b;
      });
    }
    this.initUsers();
  }

  load() {
    if (!fs.existsSync(DB_PATH)) {
      this.save(initialSchema);
      return initialSchema;
    }
    try {
      const raw = fs.readFileSync(DB_PATH, 'utf-8');
      return JSON.parse(raw);
    } catch (e) {
      console.error('Failed to parse database, recovering initial schema:', e);
      return initialSchema;
    }
  }

  save(data = this.data) {
    const tempPath = `${DB_PATH}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempPath, DB_PATH);
  }

  // --- Leads ---
  getLeads(filters = {}) {
    let result = [...this.data.leads];

    if (filters.search && filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      result = result.filter(
        (l) =>
          (l.name && l.name.toLowerCase().includes(q)) ||
          (l.phone && l.phone.includes(q)) ||
          (l.mobile && l.mobile.includes(q)) ||
          (l.email && l.email.toLowerCase().includes(q)) ||
          (l.customerLocation && l.customerLocation.toLowerCase().includes(q)) ||
          (l.salesman && l.salesman.toLowerCase().includes(q)) ||
          (l.notes && l.notes.toLowerCase().includes(q)) ||
          (l.quantity && l.quantity.toLowerCase().includes(q))
      );
    }

    if (
      filters.status &&
      filters.status !== 'all' &&
      filters.status !== 'All Stages' &&
      filters.status.trim() !== ''
    ) {
      result = result.filter((l) => l.status === filters.status);
    }

    if (
      filters.category &&
      filters.category !== 'all' &&
      filters.category !== 'All Categories' &&
      filters.category.trim() !== ''
    ) {
      result = result.filter((l) => l.category === filters.category);
    }

    if (
      filters.branch &&
      filters.branch !== 'all' &&
      filters.branch !== 'All Oman Branches' &&
      filters.branch.trim() !== ''
    ) {
      const bFilter = filters.branch.trim();
      result = result.filter((l) => {
        if (l.branchId && l.branchId === bFilter) return true;
        if (l.branch === bFilter) return true;
        const targetB = (this.data.branches || []).find((b) => b.id === bFilter || b.name === bFilter);
        if (targetB) {
          if (l.branchId && l.branchId === targetB.id) return true;
          if (l.branch === targetB.name && (!targetB.salesman || l.salesman === targetB.salesman)) return true;
        }
        return false;
      });
    }

    // Default sort by updatedAt descending
    result.sort((a, b) => new Date(b.updatedAt || b.date) - new Date(a.updatedAt || a.date));

    return result;
  }

  getLeadById(id) {
    return this.data.leads.find((l) => l.id === id);
  }

  createLead(lead) {
    const { countryCode, mobile, phone } = normalizeOmanPhone(lead.countryCode, lead.mobile, lead.phone);
    const newLead = {
      id: lead.id || `lead_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name: lead.name || 'Untitled Lead',
      contactPerson: lead.contactPerson || '',
      category: lead.category || 'Packaging Products',
      productDetails: lead.productDetails || '',
      countryCode,
      mobile,
      phone,
      email: lead.email || '',
      branchId: lead.branchId || '',
      branch: lead.branch || 'Ghala',
      salesman: lead.salesman || '',
      customerLocation: lead.customerLocation || '',
      status: lead.status || 'new',
      dealValue: Number(lead.dealValue || 0),
      quantity: lead.quantity || '',
      notes: lead.notes || '',
      intakeCompleted: Boolean(lead.intakeCompleted),
      date: lead.date || new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastContactedAt: lead.lastContactedAt || null,
    };
    this.data.leads.unshift(newLead);
    this.save();
    return newLead;
  }

  updateLead(id, updates) {
    const idx = this.data.leads.findIndex((l) => l.id === id);
    if (idx === -1) return null;

    const existing = this.data.leads[idx];
    const rawCode = updates.countryCode || existing.countryCode || '+968';
    const rawMobile = updates.mobile !== undefined ? updates.mobile : existing.mobile;
    const rawPhone = updates.phone !== undefined ? updates.phone : existing.phone;
    const { countryCode, mobile, phone } = normalizeOmanPhone(rawCode, rawMobile, rawPhone);

    this.data.leads[idx] = {
      ...existing,
      ...updates,
      phone,
      mobile,
      countryCode,
      updatedAt: new Date().toISOString(),
    };
    this.save();
    return this.data.leads[idx];
  }

  deleteLead(id) {
    const idx = this.data.leads.findIndex((l) => l.id === id);
    if (idx === -1) return false;
    this.data.leads.splice(idx, 1);
    this.save();
    return true;
  }

  bulkUpsertLeads(items = [], options = {}) {
    const duplicatePolicy = options.duplicatePolicy || 'update'; // 'update', 'skip', 'allow_duplicates'
    let addedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    items.forEach((item) => {
      // Ignore explicitly invalid rows or rows missing required Name or Mobile
      if (item.isValid === false) {
        skippedCount++;
        return;
      }

      const cleanName = (item.name || '').trim();
      const cleanMobile = (item.mobile || '').trim();

      if (!cleanName || !cleanMobile) {
        skippedCount++;
        return;
      }

      // Find existing match by mobile or company name
      let existingIdx = -1;
      if (duplicatePolicy !== 'allow_duplicates') {
        existingIdx = this.data.leads.findIndex((l) => {
          if (cleanMobile && l.mobile && l.mobile === cleanMobile) return true;
          if (cleanMobile && l.phone && l.phone.includes(cleanMobile)) return true;
          if (cleanName && l.name && l.name.trim().toLowerCase() === cleanName.toLowerCase()) return true;
          return false;
        });
      }

      if (existingIdx !== -1) {
        if (duplicatePolicy === 'skip') {
          skippedCount++;
          return;
        }

        // 'update' policy: Merge new data while preserving existing lead ID and history
        const existing = this.data.leads[existingIdx];
        const mergedNotes = item.notes
          ? (existing.notes ? `${existing.notes}\n[Import Update ${new Date().toISOString().slice(0, 10)}]: ${item.notes}` : item.notes)
          : existing.notes;

        this.data.leads[existingIdx] = {
          ...existing,
          name: cleanName || existing.name,
          contactPerson: item.contactPerson || existing.contactPerson || '',
          category: item.category || existing.category,
          mobile: cleanMobile || existing.mobile,
          phone: item.phone || existing.phone,
          email: item.email || existing.email,
          customerLocation: item.customerLocation && item.customerLocation !== 'Needs Intake' ? item.customerLocation : existing.customerLocation,
          branch: item.branch || existing.branch,
          salesman: item.salesman || existing.salesman,
          status: item.status && item.status !== 'new' ? item.status : existing.status,
          dealValue: item.dealValue && item.dealValue > 0 ? Number(item.dealValue) : existing.dealValue,
          quantity: item.quantity && item.quantity !== 'Needs Intake' ? item.quantity : existing.quantity,
          notes: mergedNotes,
          updatedAt: new Date().toISOString(),
        };
        updatedCount++;
      } else {
        // Create new lead: lands in Step 1 (Call Queue) for Customer Care intake
        const newLead = {
          id: `lead_${Date.now()}_${Math.floor(100 + Math.random() * 900)}`,
          name: cleanName,
          contactPerson: item.contactPerson || '',
          category: item.category || 'Packaging Products',
          countryCode: item.countryCode || '+968',
          mobile: cleanMobile,
          phone: item.phone || (cleanMobile ? `+968 ${cleanMobile}` : ''),
          email: item.email || '',
          customerLocation: item.customerLocation || 'Needs Intake',
          branch: item.branch || 'Ghala',
          salesman: item.salesman || 'Shamnas Acheerakath',
          status: 'new', // Always Step 1 for incoming inquiries
          dealValue: Number(item.dealValue || 0),
          quantity: item.quantity || 'Needs Intake',
          notes: item.notes || 'Imported inquiry. Awaiting call intake.',
          date: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          source: item.source || 'csv_import',
        };
        this.data.leads.unshift(newLead);
        addedCount++;

        // Auto-register category if not present
        if (item.category && item.category.trim() && !this.data.categories.includes(item.category.trim())) {
          this.data.categories.push(item.category.trim());
        }
      }
    });

    this.save();
    return {
      addedCount,
      updatedCount,
      skippedCount,
      totalLeads: this.data.leads.length,
    };
  }

  purgeAllLeads() {
    const count = this.data.leads.length;
    this.data.leads = [];
    this.save();
    return count;
  }

  purgeAllQuotations() {
    const count = this.data.quotations.length;
    this.data.quotations = [];
    this.save();
    return count;
  }

  // --- Products ---
  getProducts(filters = {}) {
    let result = [...this.data.products];
    if (filters.category && filters.category !== 'all') {
      result = result.filter((p) => p.category === filters.category);
    }
    if (filters.brand && filters.brand !== 'all') {
      result = result.filter((p) => p.brand === filters.brand);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.nameAr && p.nameAr.includes(q))
      );
    }
    return result;
  }

  createProduct(product) {
    const newProduct = {
      id: `prod_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      sku: product.sku || `MNP-${Math.floor(1000 + Math.random() * 9000)}`,
      name: product.name,
      nameAr: product.nameAr || '',
      category: product.category || 'Packaging Products',
      brand: product.brand || 'Monipack',
      description: product.description || '',
      unit: product.unit || 'PCS',
      priceOMR: Number(product.priceOMR || 0),
      stock: Number(product.stock || 100),
      createdAt: new Date().toISOString(),
    };
    this.data.products.push(newProduct);
    this.save();
    return newProduct;
  }

  updateProduct(id, updates) {
    const idx = this.data.products.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    this.data.products[idx] = {
      ...this.data.products[idx],
      ...updates,
    };
    this.save();
    return this.data.products[idx];
  }

  deleteProduct(id) {
    const idx = this.data.products.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    this.data.products.splice(idx, 1);
    this.save();
    return true;
  }

  bulkDeleteProducts(ids = []) {
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    const initialLen = this.data.products.length;
    this.data.products = this.data.products.filter((p) => !ids.includes(p.id));
    const deletedCount = initialLen - this.data.products.length;
    this.save();
    return deletedCount;
  }

  bulkUpsertProducts(items = [], options = {}) {
    let addedCount = 0;
    let updatedCount = 0;
    const updateExisting = options.updateExisting !== false;

    items.forEach((item) => {
      if (!item.name || !item.name.trim()) return;

      const cleanSku = item.sku ? item.sku.trim() : '';
      const cleanName = item.name.trim();

      // Check if product already exists by SKU or exact Name
      const existingIdx = this.data.products.findIndex((p) => {
        if (cleanSku && p.sku && p.sku.toLowerCase() === cleanSku.toLowerCase()) {
          return true;
        }
        return p.name.toLowerCase() === cleanName.toLowerCase();
      });

      if (existingIdx !== -1 && updateExisting) {
        // Update existing item
        this.data.products[existingIdx] = {
          ...this.data.products[existingIdx],
          name: cleanName,
          nameAr: item.nameAr || this.data.products[existingIdx].nameAr || '',
          sku: cleanSku || this.data.products[existingIdx].sku,
          category: item.category || this.data.products[existingIdx].category || 'Packaging Products',
          brand: item.brand || this.data.products[existingIdx].brand || 'Monipack',
          unit: item.unit || this.data.products[existingIdx].unit || 'CTN',
          priceOMR: item.priceOMR !== undefined && item.priceOMR !== '' ? Number(item.priceOMR) : this.data.products[existingIdx].priceOMR,
          stock: item.stock !== undefined && item.stock !== '' ? Number(item.stock) : this.data.products[existingIdx].stock,
          description: item.description || this.data.products[existingIdx].description || '',
          source: item.source || 'tally_import',
          updatedAt: new Date().toISOString(),
        };
        updatedCount++;
      } else if (existingIdx === -1) {
        // Create new item
        const newProduct = {
          id: `prod_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
          sku: cleanSku || `MNP-${Math.floor(1000 + Math.random() * 9000)}`,
          name: cleanName,
          nameAr: item.nameAr || '',
          category: item.category || 'Packaging Products',
          brand: item.brand || 'Monipack',
          unit: item.unit || 'CTN',
          priceOMR: Number(item.priceOMR || 0),
          stock: Number(item.stock || 0),
          description: item.description || '',
          source: item.source || 'imported',
          createdAt: new Date().toISOString(),
        };
        this.data.products.push(newProduct);
        addedCount++;

        // Auto-register category if not in categories list
        if (item.category && item.category.trim() && !this.data.categories.includes(item.category.trim())) {
          this.data.categories.push(item.category.trim());
        }
      }
    });

    this.save();
    return { addedCount, updatedCount, totalInCatalog: this.data.products.length };
  }

  // --- Quotations ---
  getQuotations() {
    return [...this.data.quotations].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
  }

  getQuotationById(id) {
    return this.data.quotations.find((q) => q.id === id || q.code === id);
  }

  createQuotation(quote) {
    const today = new Date();
    const dateStr = today.toISOString().slice(2, 10).replace(/-/g, '');
    const seq = Math.floor(1000 + Math.random() * 9000);
    const code = quote.code || `MNI-ITS-${dateStr}-${seq}`;

    // Calculate totals
    const items = (quote.items || []).map((item, index) => {
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

    const subtotalOMR = Number(
      items.reduce((acc, curr) => acc + curr.totalOMR, 0).toFixed(3)
    );
    const enableVat = quote.enableVat !== undefined ? Boolean(quote.enableVat) : true;
    const vatRate = quote.vatRate !== undefined ? Number(quote.vatRate) : 5;
    const vatAmountOMR = enableVat ? Number((subtotalOMR * (vatRate / 100)).toFixed(3)) : 0;
    const grandTotalOMR = Number((subtotalOMR + vatAmountOMR).toFixed(3));

    const newQuotation = {
      id: `quote_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      code,
      leadId: quote.leadId || null,
      customerName: quote.customerName || 'Valued Customer',
      address: quote.address || 'Muscat, Sultanate of Oman',
      attn: quote.attn || '',
      date: quote.date || today.toISOString().split('T')[0],
      validityDays: quote.validityDays || 30,
      salesRep: quote.salesRep || 'Shamnas Acheerakath',
      status: quote.status || 'sent',
      items,
      subtotalOMR,
      enableVat,
      vatRate,
      vatAmountOMR,
      grandTotalOMR,
      terms: quote.terms || [
        'All prices are quoted in Omani Rial (OMR).',
        'Quotation validity: 30 days from date of issue.',
        'Payment terms: As per agreed commercial credit terms.',
        'Delivery: Fast delivery across all Oman Wilayats upon confirmed PO.',
      ],
      createdAt: new Date().toISOString(),
    };

    this.data.quotations.unshift(newQuotation);

    // If quotation is linked to a lead, update lead status to quotation_sent and bump dealValue
    if (newQuotation.leadId) {
      this.updateLead(newQuotation.leadId, {
        status: 'quotation_sent',
        dealValue: grandTotalOMR,
      });
    }

    this.save();
    return newQuotation;
  }

  updateQuotation(id, updates) {
    const idx = this.data.quotations.findIndex((q) => q.id === id || q.code === id);
    if (idx === -1) return null;
    const current = this.data.quotations[idx];

    let items = current.items;
    let subtotalOMR = current.subtotalOMR;

    if (updates.items && Array.isArray(updates.items)) {
      items = updates.items.map((item, index) => {
        const qty = Number(item.quantity || 1);
        const price = Number(item.unitPriceOMR || 0);
        return {
          id: item.id || `item_${Date.now()}_${index}`,
          seq: item.seq !== undefined && item.seq !== null ? (Number(item.seq) || (index + 1)) : (index + 1),
          productId: item.productId || null,
          item: item.item || 'Custom Packaging Item',
          description: item.description || '',
          quantity: qty,
          unit: item.unit || 'PCS',
          unitPriceOMR: price,
          totalOMR: Number((qty * price).toFixed(3)),
        };
      });
      subtotalOMR = Number(items.reduce((acc, curr) => acc + curr.totalOMR, 0).toFixed(3));
    } else if (updates.subtotalOMR !== undefined) {
      subtotalOMR = Number(updates.subtotalOMR);
    }

    const enableVat = updates.enableVat !== undefined ? Boolean(updates.enableVat) : (current.enableVat !== undefined ? Boolean(current.enableVat) : true);
    const vatRate = updates.vatRate !== undefined ? Number(updates.vatRate) : (current.vatRate !== undefined ? Number(current.vatRate) : 5);
    const vatAmountOMR = enableVat ? Number((subtotalOMR * (vatRate / 100)).toFixed(3)) : 0;
    const grandTotalOMR = updates.grandTotalOMR !== undefined ? Number(updates.grandTotalOMR) : Number((subtotalOMR + vatAmountOMR).toFixed(3));

    const updated = {
      ...current,
      ...updates,
      items,
      subtotalOMR,
      enableVat,
      vatRate,
      vatAmountOMR,
      grandTotalOMR,
      terms: updates.terms !== undefined ? updates.terms : current.terms,
      updatedAt: new Date().toISOString(),
    };

    this.data.quotations[idx] = updated;
    if (updated.leadId) {
      this.updateLead(updated.leadId, {
        dealValue: grandTotalOMR,
      });
    }
    this.save();
    return updated;
  }

  deleteQuotation(id) {
    const idx = this.data.quotations.findIndex((q) => q.id === id || q.code === id);
    if (idx === -1) return false;
    this.data.quotations.splice(idx, 1);
    this.save();
    return true;
  }

  // --- Activities ---
  addActivity(act) {
    const newAct = {
      id: `act_${Date.now()}`,
      leadId: act.leadId || null,
      leadName: act.leadName || '',
      type: act.type || 'note', // 'call', 'whatsapp', 'email', 'quotation', 'note', 'status_change'
      description: act.description,
      timestamp: new Date().toISOString(),
    };
    this.data.activities.unshift(newAct);
    // keep recent 200
    if (this.data.activities.length > 200) {
      this.data.activities = this.data.activities.slice(0, 200);
    }
    this.save();
    return newAct;
  }

  getActivities(limit = 20) {
    return this.data.activities.slice(0, limit);
  }

  // --- Analytics ---
  getAnalytics() {
    const leads = this.data.leads;
    const quotations = this.data.quotations;

    const totalLeads = leads.length;
    const newLeads = leads.filter((l) => l.status === 'new').length;
    const contactedLeads = leads.filter((l) => l.status === 'contacted').length;
    const quoteSentLeads = leads.filter((l) => l.status === 'quotation_sent').length;
    const sampleSentLeads = leads.filter((l) => l.status === 'sample_sent').length;
    const wonLeads = leads.filter((l) => l.status === 'won').length;
    const lostLeads = leads.filter((l) => l.status === 'lost').length;

    // Pipeline value
    const totalPipelineValueOMR = Number(
      leads.reduce((sum, l) => sum + (Number(l.dealValue) || 0), 0).toFixed(3)
    );

    // Category breakdown
    const categoryCounts = {};
    leads.forEach((l) => {
      const cat = l.category || 'Other';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    // Branch breakdown
    const branchCounts = {};
    leads.forEach((l) => {
      const b = l.branch || 'Ghala';
      branchCounts[b] = (branchCounts[b] || 0) + 1;
    });

    // Conversion rate
    const closed = wonLeads + lostLeads;
    const conversionRate = closed > 0 ? Number(((wonLeads / closed) * 100).toFixed(1)) : 0;

    return {
      totalLeads,
      newLeads,
      contactedLeads,
      quoteSentLeads,
      sampleSentLeads,
      wonLeads,
      lostLeads,
      totalPipelineValueOMR,
      totalQuotations: quotations.length,
      conversionRate,
      categoryCounts,
      branchCounts,
      recentActivities: this.getActivities(35),
    };
  }

  // --- Users & RBAC ---
  getUsers() {
    return (this.data.users || []).map((u) => {
      const { passwordHash, ...rest } = u;
      return rest;
    });
  }

  getUserByEmail(email) {
    if (!email) return null;
    return (this.data.users || []).find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase()
    );
  }

  getUserById(id) {
    if (!id) return null;
    return (this.data.users || []).find((u) => u.id === id);
  }

  createUser(userData) {
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(userData.password, salt);

    const newUser = {
      id: userData.id || `user_${Date.now()}`,
      name: userData.name || 'User',
      email: userData.email.toLowerCase().trim(),
      role: userData.role || 'admin', // 'super_admin' or 'admin'
      canExport: userData.role === 'super_admin',
      passwordHash,
      createdAt: new Date().toISOString(),
    };

    this.data.users.push(newUser);
    this.save();
    const { passwordHash: _, ...safeUser } = newUser;
    return safeUser;
  }

  initUsers() {
    if (!this.data.users) {
      this.data.users = [];
    }

    // 1. Super Administrator (Full Control + Exporting)
    if (!this.getUserByEmail('administrator@monipack.com')) {
      const salt = bcrypt.genSaltSync(10);
      this.data.users.push({
        id: 'user_super_admin',
        name: 'Monipack Administrator',
        email: 'administrator@monipack.com',
        role: 'super_admin',
        canExport: true,
        passwordHash: bcrypt.hashSync('Admin@Monipack2026!', salt),
        createdAt: new Date().toISOString(),
      });
      console.log('Seeded Super Administrator account: administrator@monipack.com');
    }

    // 2. Admin (Full Control EXCEPT Exporting)
    if (!this.getUserByEmail('admin@monipack.com')) {
      const salt = bcrypt.genSaltSync(10);
      this.data.users.push({
        id: 'user_admin',
        name: 'Monipack Admin',
        email: 'admin@monipack.com',
        role: 'admin',
        canExport: false,
        passwordHash: bcrypt.hashSync('Manager@Monipack2026!', salt),
        createdAt: new Date().toISOString(),
      });
      console.log('Seeded Admin account (No Export): admin@monipack.com');
    }

    this.save();
  }

  // --- Settings & Audit ---
  getSettings() {
    if (!this.data.settings) {
      this.data.settings = {
        companyName: 'Morooj Nizwa International LLC',
        companyNameAr: 'شركة مروج نزوى العالمية ش.م.م',
        brandName: 'Monipack',
        website: 'www.monipack.com',
        shopUrl: 'www.shop.monipack.com',
        phone: '+968 79062219',
        complaintPhone: '+968 9715 0774',
        email: 'info@monipack.com',
        supportEmail: 'customersupport@monipack.com',
        headquarters: 'Ghala, Muscat, Sultanate of Oman',
        currency: 'OMR',
        quoteValidityDays: 30,
        exportRestrictedRole: 'admin',
        enableAuditLogs: true,
        defaultTerms: [
          'All prices are quoted in Omani Rial (OMR).',
          'Quotation validity: 30 days from date of issue.',
          'Payment terms: As per agreed commercial credit terms.',
          'Delivery: Fast delivery across all Oman Wilayats upon confirmed PO.',
        ],
      };
      this.save();
    }
    if (!this.data.settings.defaultTerms || !Array.isArray(this.data.settings.defaultTerms)) {
      this.data.settings.defaultTerms = [
        'All prices are quoted in Omani Rial (OMR).',
        'Quotation validity: 30 days from date of issue.',
        'Payment terms: As per agreed commercial credit terms.',
        'Delivery: Fast delivery across all Oman Wilayats upon confirmed PO.',
      ];
      this.save();
    }
    return this.data.settings;
  }

  updateSettings(updates) {
    this.data.settings = {
      ...this.getSettings(),
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.save();
    return this.data.settings;
  }

  deleteUser(id) {
    if (!this.data.users) return false;
    const idx = this.data.users.findIndex((u) => u.id === id);
    if (idx === -1) return false;
    if (this.data.users[idx].email === 'administrator@monipack.com') {
      return false; // protect main administrator
    }
    this.data.users.splice(idx, 1);
    this.save();
    return true;
  }

  updateUserPassword(id, newPassword) {
    if (!this.data.users) return null;
    const user = this.data.users.find((u) => String(u.id) === String(id));
    if (!user) return null;
    const salt = bcrypt.genSaltSync(10);
    user.passwordHash = bcrypt.hashSync(newPassword, salt);
    user.updatedAt = new Date().toISOString();
    this.save();
    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  // --- Dynamic Categories ---
  getCategories() {
    return this.data.categories || [];
  }

  addCategory(name) {
    if (!name || typeof name !== 'string') return false;
    const clean = name.trim();
    if (!clean) return false;
    if (!this.data.categories) this.data.categories = [];
    if (!this.data.categories.includes(clean)) {
      this.data.categories.push(clean);
      this.save();
    }
    return this.data.categories;
  }

  deleteCategory(name) {
    if (!this.data.categories) return false;
    const idx = this.data.categories.indexOf(name);
    if (idx === -1) return false;
    this.data.categories.splice(idx, 1);
    this.save();
    return true;
  }

  // --- Dynamic Pipeline Stages ---
  getPipelineStages() {
    return this.data.pipelineStages || [];
  }

  addPipelineStage(stage) {
    if (!stage || !stage.label) return null;
    const id = stage.id || stage.label.toLowerCase().replace(/[^a-z0-9]/g, '_');
    if (!this.data.pipelineStages) this.data.pipelineStages = [];
    
    // Check if stage ID exists
    const existing = this.data.pipelineStages.find((s) => s.id === id);
    if (existing) return existing;

    const newStage = {
      id,
      label: stage.label.trim(),
      color: stage.color || 'border-t-red-500 bg-red-50/30',
    };
    this.data.pipelineStages.push(newStage);
    this.save();
    return newStage;
  }

  deletePipelineStage(id) {
    if (!this.data.pipelineStages) return false;
    // Don't delete if it's the only stage
    if (this.data.pipelineStages.length <= 1) return false;
    const idx = this.data.pipelineStages.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    this.data.pipelineStages.splice(idx, 1);
    this.save();
    return true;
  }

  // --- Dynamic Branches & Sales Reps ---
  getBranches() {
    return this.data.branches || [];
  }

  addBranch(branchData) {
    if (!branchData || !branchData.name) return null;
    const id = branchData.id || `b_${Date.now()}`;
    const newBranch = {
      id,
      name: branchData.name.trim(),
      city: branchData.city || 'Oman',
      phone: branchData.phone || '+968 79062219',
      salesman: branchData.salesman || 'Unassigned',
      isHeadquarters: branchData.isHeadquarters === true,
    };
    if (!this.data.branches) this.data.branches = [];
    this.data.branches.push(newBranch);
    this.save();
    return newBranch;
  }

  updateBranch(id, updates) {
    if (!this.data.branches) return null;
    const idx = this.data.branches.findIndex((b) => b.id === id);
    if (idx === -1) return null;
    const prev = { ...this.data.branches[idx] };
    this.data.branches[idx] = {
      ...this.data.branches[idx],
      ...updates,
    };
    const updated = this.data.branches[idx];

    // Cascade branch name and salesman updates to existing leads
    if (this.data.leads && Array.isArray(this.data.leads)) {
      this.data.leads.forEach((l) => {
        const matchesBranch = (l.branchId && l.branchId === id) ||
          (l.branch === prev.name && (!prev.salesman || l.salesman === prev.salesman)) ||
          (!l.branchId && l.branch === prev.name);
        if (matchesBranch) {
          if (updated.name) l.branch = updated.name;
          if (updated.salesman !== undefined) l.salesman = updated.salesman;
          if (!l.branchId) l.branchId = id;
        }
      });
    }

    this.save();
    return this.data.branches[idx];
  }

  deleteBranch(id) {
    if (!this.data.branches) return false;
    const idx = this.data.branches.findIndex((b) => b.id === id);
    if (idx === -1) return false;
    this.data.branches.splice(idx, 1);
    this.save();
    return true;
  }
}

export const db = new Database();
export default db;
