import fs from 'fs';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import db from './db.js';
import { runSeed } from './seed.js';
import { 
  generateProductTemplate, 
  parseProductCsv, 
  parseUniversalProductData,
  testTallyConnection, 
  fetchTallyStockItems 
} from './tallyService.js';
import {
  generateLeadTemplate,
  parseLeadCsv
} from './leadImportService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Uncaught exception protection so server never crashes silently
process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'monipack-om-crm-sec-2026';

const allowedOrigins = [
  'https://crm.monipack.com',
  'https://www.crm.monipack.com',
  'http://crm.monipack.com',
  'http://localhost:3000',
  'http://localhost:5000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5000',
  'http://127.0.0.1:5173'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.includes(origin) ||
      origin.endsWith('.monipack.com') ||
      origin.endsWith('.onrender.com')
    ) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.options('*', cors());
app.use(express.json({ limit: '15mb' }));

// Health Check Endpoint (useful for Render keep-alive and diagnostics)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    name: 'Monipack CRM API',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Ensure seed data and default users are present on startup
runSeed();

// ---------------- Security Middleware & HTTP Hardening ----------------

// 1. Defensive HTTP Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// 2. In-Memory Brute-Force Login Rate Limiter (Max 5 failed attempts / 15 min per IP)
const loginAttempts = new Map(); // ip -> { count, resetAt }

const checkLoginRateLimit = (req, res, next) => {
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1')
    .toString()
    .split(',')[0]
    .trim();
  const now = Date.now();
  const record = loginAttempts.get(clientIp);

  if (record) {
    if (now > record.resetAt) {
      loginAttempts.delete(clientIp);
    } else if (record.count >= 5) {
      const remainingMinutes = Math.max(1, Math.ceil((record.resetAt - now) / 60000));
      return res.status(429).json({
        error: `Security Lockout: Too many failed login attempts. Please wait ${remainingMinutes} minute(s) before trying again.`,
      });
    }
  }

  req.clientIp = clientIp;
  next();
};

const recordFailedLogin = (clientIp, email) => {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes lockout
  const record = loginAttempts.get(clientIp) || { count: 0, resetAt: now + windowMs };
  record.count += 1;
  loginAttempts.set(clientIp, record);

  db.addActivity({
    type: 'security_alert',
    description: `Failed login attempt for ${email || 'unknown'} from IP ${clientIp} (${record.count}/5 attempts)`,
  });
};

const recordSuccessfulLogin = (clientIp) => {
  loginAttempts.delete(clientIp);
};

// Periodic cleanup of expired rate limit entries to prevent memory leaks (runs every 15 minutes)
const rateLimitCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of loginAttempts) {
    if (now > rec.resetAt) {
      loginAttempts.delete(ip);
    }
  }
}, 15 * 60 * 1000);
if (rateLimitCleanupInterval.unref) {
  rateLimitCleanupInterval.unref();
}

// ---------------- Security & Auth Middleware ----------------

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
  }
};

// Strict Export Restriction: Only 'super_admin' (Administrator) can export data
const requireExportPermission = (req, res, next) => {
  if (!req.user || req.user.role !== 'super_admin' || !req.user.canExport) {
    return res.status(403).json({
      error: 'Access Denied: Only Administrator has full permission to export confidential customer leads.',
    });
  }
  next();
};

const requireSuperAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Access Denied: Super Administrator role required.' });
  }
  next();
};

// ---------------- Authentication Endpoints ----------------

// Login with Rate Limiting and Audit Security
app.post('/api/auth/login', checkLoginRateLimit, (req, res) => {
  try {
    const { email, password } = req.body;
    const clientIp = req.clientIp || '127.0.0.1';

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = db.getUserByEmail(email);
    if (!user) {
      recordFailedLogin(clientIp, email);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isMatch = bcrypt.compareSync(password, user.passwordHash);
    if (!isMatch) {
      recordFailedLogin(clientIp, email);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Login succeeded: reset failure counter for this IP
    recordSuccessfulLogin(clientIp);

    const payload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role, // 'super_admin' or 'admin'
      canExport: user.canExport === true,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

    // Log login activity
    db.addActivity({
      type: 'login',
      description: user.name.toLowerCase().includes('admin') 
        ? `${user.name} signed in` 
        : `${user.name} (${user.role === 'super_admin' ? 'Administrator' : 'Admin'}) signed in`,
    });

    res.json({
      token,
      user: payload,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Current User Session
app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// ---------------- Public Endpoints ----------------

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Monipack CRM API (Secured)',
    company: 'Morooj Nizwa International LLC',
  });
});

// ---------------- Protected Business Endpoints ----------------

// Analytics (Dashboard)
app.get('/api/analytics', authMiddleware, (req, res) => {
  try {
    const stats = db.getAnalytics();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export Leads CSV - STRICTLY RESTRICTED to Administrator
app.get('/api/leads/export', authMiddleware, requireExportPermission, (req, res) => {
  try {
    const { status, category, branch, search, scope } = req.query;

    const filterOptions = scope === 'all' ? {} : {
      status: (status && status !== 'all' && status !== 'All Stages') ? status : undefined,
      category: (category && category !== 'all' && category !== 'All Categories') ? category : undefined,
      branch: (branch && branch !== 'all' && branch !== 'All Oman Branches') ? branch : undefined,
      search: (search && search.trim()) ? search.trim() : undefined,
    };

    const leads = db.getLeads(filterOptions);

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      let str = String(val);
      // Neutralize spreadsheet formula injection (CWE-1236)
      if (/^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`;
      }
      str = str.replace(/"/g, '""');
      return `"${str}"`;
    };

    // Stage labels mapping for readable presentation
    const stageMap = {
      new: 'STEP 1: Qualification & Intake',
      contacted: 'STEP 2: Analyze & Assign',
      quotation_sent: 'STEP 3: Quotation Follow-Up',
      sample_sent: 'STEP 4: Sample & Negotiation',
      won: 'STEP 5: Converted (Won)',
      lost: 'STEP 6: Lost / Closed'
    };

    // Build comprehensive CSV headers
    const headers = [
      'Lead ID',
      'Company / Client Name',
      'Product Category',
      'Country Code',
      'Mobile Number',
      'Full Phone (Call/WhatsApp)',
      'Email Address',
      'Customer Location / Wilayat',
      'Assigned Oman Branch',
      'Assigned Sales Representative',
      'Commercial Pipeline Stage',
      'Estimated Value (OMR)',
      'Quantity / Volume Required',
      'Customer Care Notes & Discussions',
      'Not Converted Reason',
      'Created Date',
      'Last Updated'
    ];

    const rows = leads.map((l) => [
      escapeCsv(l.id),
      escapeCsv(l.name),
      escapeCsv(l.category),
      escapeCsv(l.countryCode || '+968'),
      escapeCsv(l.mobile || ''),
      escapeCsv(l.phone || (l.mobile ? `${l.countryCode || '+968'} ${l.mobile}` : '')),
      escapeCsv(l.email || ''),
      escapeCsv(l.customerLocation || l.city || l.branch || 'Oman'),
      escapeCsv(l.branch || 'Ghala'),
      escapeCsv(l.salesman || 'Unassigned'),
      escapeCsv(stageMap[l.status] || l.status || 'New'),
      Number(l.dealValue || 0).toFixed(3),
      escapeCsv(l.quantity || ''),
      escapeCsv(l.notes || ''),
      escapeCsv(l.lostReason || ''),
      escapeCsv(l.date || l.createdAt || ''),
      escapeCsv(l.updatedAt || ''),
    ]);

    // Prepend UTF-8 BOM (\uFEFF) for 100% Arabic and symbol fidelity in Excel and Google Sheets
    const csvData = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');

    db.addActivity({
      type: 'security',
      description: `CONFIDENTIAL EXPORT: Administrator (${req.user.email}) exported ${leads.length} leads to CSV (Scope: ${scope === 'all' ? 'All Records' : 'Filtered View'})`,
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    const filenameScope = scope === 'all' ? 'all' : (filterOptions.branch ? filterOptions.branch.replace(/\s+/g, '_') : 'filtered');
    res.setHeader('Content-Disposition', `attachment; filename=monipack_leads_${filenameScope}_${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(csvData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Leads List
app.get('/api/leads', authMiddleware, (req, res) => {
  try {
    const { status, category, branch, search } = req.query;
    const leads = db.getLeads({ status, category, branch, search });
    res.json(leads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download Official Leads CSV Template (Public endpoint, supports ?type=minimal or ?type=standard)
app.get('/api/leads/template', (req, res) => {
  try {
    const templateType = req.query.type === 'standard' ? 'standard' : 'minimal';
    const csvContent = generateLeadTemplate(templateType);
    const filename = templateType === 'standard'
      ? 'monipack_leads_standard_template.csv'
      : 'monipack_leads_quick_template_name_mobile.csv';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/leads/:id', authMiddleware, (req, res) => {
  const lead = db.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  res.json(lead);
});

app.post('/api/leads', authMiddleware, (req, res) => {
  try {
    const { name, mobile, phone } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ error: 'Company or Client Name must be at least 2 characters long.' });
    }
    const created = db.createLead(req.body);
    db.addActivity({
      leadId: created.id,
      leadName: created.name,
      type: 'status_change',
      description: `New lead created by ${req.user.name}: ${created.name} (${created.category})`,
    });
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/leads/:id', authMiddleware, (req, res) => {
  try {
    const prev = db.getLeadById(req.params.id);
    if (!prev) return res.status(404).json({ error: 'Lead not found' });

    const updated = db.updateLead(req.params.id, req.body);

    if (req.body.status && req.body.status !== prev.status) {
      db.addActivity({
        leadId: updated.id,
        leadName: updated.name,
        type: 'status_change',
        description: `Stage changed from "${prev.status}" to "${req.body.status}" by ${req.user.name}`,
      });
    }

    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Safe Purge All Leads (Super Admin Only - Clean Slate) - MUST be before /api/leads/:id
app.delete('/api/leads/purge-all', authMiddleware, requireSuperAdmin, (req, res) => {
  try {
    const purgedCount = db.purgeAllLeads();
    db.addActivity({
      type: 'settings',
      description: `Leads database reset: ${purgedCount} leads permanently purged by ${req.user.name}`,
    });
    res.json({
      success: true,
      purgedCount,
      message: `Database reset successful. ${purgedCount} leads permanently purged.`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/leads/:id', authMiddleware, (req, res) => {
  if (req.params.id === 'purge-all') return;
  const success = db.deleteLead(req.params.id);
  if (!success) return res.status(404).json({ error: 'Lead not found' });
  res.json({ message: 'Lead deleted successfully' });
});

// Parse uploaded Leads CSV content for preview before committing
app.post('/api/leads/parse-csv', authMiddleware, (req, res) => {
  try {
    const csvData = req.body.csvData || req.body.csvContent;
    if (!csvData) return res.status(400).json({ error: 'No CSV data provided' });

    const existingLeads = db.getLeads();
    const branches = db.getBranches();
    const categories = db.getCategories();

    const result = parseLeadCsv(csvData, {
      leads: existingLeads,
      branches,
      categories
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: `Failed to parse leads CSV: ${err.message}` });
  }
});

// Bulk Import Leads into CRM
app.post('/api/leads/bulk-import', authMiddleware, (req, res) => {
  try {
    const { items, options } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No valid lead records provided for import' });
    }

    const result = db.bulkUpsertLeads(items, options || {});

    db.addActivity({
      type: 'lead_import',
      description: `Leads Bulk Import: ${result.addedCount} new inquiries created, ${result.updatedCount} leads updated (${result.skippedCount} skipped) by ${req.user.name}`,
    });

    res.json({
      success: true,
      message: `Successfully processed ${items.length} leads (${result.addedCount} added, ${result.updatedCount} updated, ${result.skippedCount} skipped).`,
      ...result
    });
  } catch (err) {
    res.status(500).json({ error: `Leads import failed: ${err.message}` });
  }
});

app.post('/api/leads/:id/activity', authMiddleware, (req, res) => {
  const lead = db.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const act = db.addActivity({
    leadId: lead.id,
    leadName: lead.name,
    type: req.body.type || 'note',
    description: req.body.description || 'Activity recorded',
  });

  if (req.body.type === 'whatsapp' || req.body.type === 'call') {
    db.updateLead(lead.id, { lastContactedAt: new Date().toISOString() });
  }

  res.status(201).json(act);
});

// Products
app.get('/api/products', authMiddleware, (req, res) => {
  try {
    const { category, brand, search } = req.query;
    const products = db.getProducts({ category, brand, search });
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', authMiddleware, (req, res) => {
  try {
    const product = db.createProduct(req.body);
    res.status(201).json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/products/:id', authMiddleware, (req, res) => {
  try {
    const updated = db.updateProduct(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Product not found' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/products/:id', authMiddleware, (req, res) => {
  const ok = db.deleteProduct(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Product not found' });
  db.addActivity({
    type: 'product_delete',
    description: `Product deleted (ID: ${req.params.id}) by ${req.user.name}`,
  });
  res.json({ message: 'Product deleted' });
});

// Bulk Delete Products
app.post('/api/products/bulk-delete', authMiddleware, (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No product IDs provided' });
    }
    const count = db.bulkDeleteProducts(ids);
    db.addActivity({
      type: 'product_delete',
      description: `Bulk deleted ${count} products by ${req.user.name}`,
    });
    res.json({ success: true, count, message: `Successfully deleted ${count} products.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download Official Monipack / Tally CSV Template
app.get('/api/products/template', authMiddleware, (req, res) => {
  try {
    const csvContent = generateProductTemplate();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=monipack_tally_product_template.csv');
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Parse uploaded product content (CSV, Excel text, or Raw Tally XML) with 2026 Variance Analysis
app.post('/api/products/parse-csv', authMiddleware, (req, res) => {
  try {
    const csvData = req.body.csvData || req.body.csvContent;
    if (!csvData) return res.status(400).json({ error: 'No product or Tally data provided' });

    const existingProducts = db.getProducts();
    const result = parseUniversalProductData(csvData, existingProducts);

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: `Failed to parse product data: ${err.message}` });
  }
});

// Automated Tally Watchdog Push Endpoint for 2026 Scheduled Background Sync
app.post('/api/tally/sync-push', (req, res) => {
  try {
    const syncKey = req.headers['x-tally-key'] || req.query.key;
    const authHeader = req.headers.authorization;
    const expectedKey = process.env.TALLY_SYNC_KEY || 'monipack-tally-sync-2026';

    let authorized = false;
    let syncUser = 'Automated Tally Watchdog';

    if (syncKey === expectedKey) {
      authorized = true;
    } else if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        authorized = true;
        syncUser = decoded.name || 'CRM User';
      } catch (e) {}
    }

    if (!authorized) {
      return res.status(401).json({ error: 'Unauthorized: Invalid Tally sync key or token.' });
    }

    const { items, options } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided in sync payload.' });
    }

    const result = db.bulkUpsertProducts(items, options || { updateExisting: true });

    db.addActivity({
      type: 'tally_watchdog_sync',
      description: `Watchdog Auto-Sync: ${result.addedCount} new items, ${result.updatedCount} items refreshed by ${syncUser}`,
    });

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk Import Products into Catalog
app.post('/api/products/bulk-import', authMiddleware, (req, res) => {
  try {
    const { items, options } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No valid product items provided for import' });
    }

    const result = db.bulkUpsertProducts(items, options || {});

    db.addActivity({
      type: 'product_import',
      description: `Product Import: ${result.addedCount} new items added, ${result.updatedCount} items updated by ${req.user.name}`,
    });

    res.json({
      success: true,
      message: `Successfully processed ${items.length} items (${result.addedCount} added, ${result.updatedCount} updated).`,
      ...result
    });
  } catch (err) {
    res.status(500).json({ error: `Import failed: ${err.message}` });
  }
});

// Test Live Connection to TallyPrime XML Server (Port 9000)
app.post('/api/tally/test', authMiddleware, async (req, res) => {
  try {
    const tallyUrl = req.body.tallyUrl || 'http://127.0.0.1:9000';
    const status = await testTallyConnection(tallyUrl);
    res.json(status);
  } catch (err) {
    res.status(500).json({ online: false, message: err.message });
  }
});

// Fetch Live Stock Items from TallyPrime for Preview
app.post('/api/tally/fetch', authMiddleware, async (req, res) => {
  try {
    const tallyUrl = req.body.tallyUrl || 'http://127.0.0.1:9000';
    const companyName = req.body.companyName || '';
    const items = await fetchTallyStockItems(tallyUrl, companyName);
    res.json({
      items,
      count: items.length
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Live Sync from TallyPrime Directly into Catalog
app.post('/api/tally/sync', authMiddleware, async (req, res) => {
  try {
    const tallyUrl = req.body.tallyUrl || 'http://127.0.0.1:9000';
    const companyName = req.body.companyName || '';
    const updateExisting = req.body.updateExisting !== false;

    const items = await fetchTallyStockItems(tallyUrl, companyName);
    if (!items || items.length === 0) {
      return res.status(404).json({ error: 'No stock items returned from TallyPrime. Ensure your Tally company is open with Stock Items.' });
    }

    const result = db.bulkUpsertProducts(items, { updateExisting });

    db.addActivity({
      type: 'tally_sync',
      description: `TallyPrime Live Sync: ${result.addedCount} added, ${result.updatedCount} updated by ${req.user.name}`,
    });

    res.json({
      success: true,
      message: `TallyPrime Sync Successful! ${result.addedCount} new items added, ${result.updatedCount} items updated.`,
      ...result
    });
  } catch (err) {
    res.status(502).json({ error: `TallyPrime Sync Failed: ${err.message}` });
  }
});

// Quotations
app.get('/api/quotations', authMiddleware, (req, res) => {
  try {
    const quotes = db.getQuotations();
    res.json(quotes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/quotations/:id', authMiddleware, (req, res) => {
  const quote = db.getQuotationById(req.params.id);
  if (!quote) return res.status(404).json({ error: 'Quotation not found' });
  res.json(quote);
});

app.post('/api/quotations', authMiddleware, (req, res) => {
  try {
    if (!req.body.customerName || typeof req.body.customerName !== 'string' || !req.body.customerName.trim()) {
      return res.status(400).json({ error: 'Customer or Business Name is required for quotation.' });
    }
    if (req.body.items && !Array.isArray(req.body.items)) {
      return res.status(400).json({ error: 'Quotation items must be provided as an array.' });
    }
    const quote = db.createQuotation(req.body);
    db.addActivity({
      leadId: quote.leadId,
      leadName: quote.customerName,
      type: 'quotation',
      description: `Generated quotation ${quote.code} for OMR ${quote.grandTotalOMR.toFixed(3)} by ${req.user.name}`,
    });
    res.status(201).json(quote);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/quotations/:id', authMiddleware, (req, res) => {
  try {
    const updated = db.updateQuotation(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Quotation not found' });
    db.addActivity({
      type: 'quotation',
      description: `Quotation "${updated.code}" updated by ${req.user.name}`,
    });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/quotations/:id', authMiddleware, (req, res) => {
  try {
    const success = db.deleteQuotation(req.params.id);
    if (!success) return res.status(404).json({ error: 'Quotation not found' });
    db.addActivity({
      type: 'quotation',
      description: `Quotation "${req.params.id}" was deleted by ${req.user.name}`,
    });
    res.json({ message: 'Quotation deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= Super Admin ONLY Settings & Controls =================

// Get Settings
app.get('/api/settings', authMiddleware, requireSuperAdmin, (req, res) => {
  res.json(db.getSettings());
});

// Update Settings
app.patch('/api/settings', authMiddleware, requireSuperAdmin, (req, res) => {
  try {
    const updated = db.updateSettings(req.body);
    db.addActivity({
      type: 'settings',
      description: `System settings updated by Administrator (${req.user.email})`,
    });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Download System Backup Snapshot (Super Admin Only)
app.get('/api/backup', authMiddleware, requireSuperAdmin, (req, res) => {
  try {
    const filenameDate = new Date().toISOString().slice(0, 10);
    db.addActivity({
      type: 'security',
      description: `System database backup snapshot downloaded by Administrator (${req.user?.email || 'super_admin'})`,
    });
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=monipack_crm_backup_${filenameDate}.json`);
    res.send(JSON.stringify(db.data, null, 2));
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate backup snapshot' });
  }
});

// Users Management
app.get('/api/users', authMiddleware, requireSuperAdmin, (req, res) => {
  res.json(db.getUsers());
});

app.post('/api/users', authMiddleware, requireSuperAdmin, (req, res) => {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }
    if (db.getUserByEmail(email)) {
      return res.status(400).json({ error: 'A user with this email already exists.' });
    }
    const created = db.createUser({ name, email, password, role: role || 'admin' });
    db.addActivity({
      type: 'security',
      description: `New user created by Administrator: ${name} (${role || 'admin'})`,
    });
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/users/:id', authMiddleware, requireSuperAdmin, (req, res) => {
  try {
    const success = db.deleteUser(req.params.id);
    if (!success) {
      return res.status(400).json({ error: 'Unable to delete this user account.' });
    }
    db.addActivity({
      type: 'security',
      description: `User account deleted by Administrator (ID: ${req.params.id})`,
    });
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/users/:id/password', authMiddleware, requireSuperAdmin, (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }
    const updated = db.updateUserPassword(req.params.id, password);
    if (!updated) {
      return res.status(404).json({ error: 'User not found.' });
    }
    db.addActivity({
      type: 'security',
      description: `Password reset by Administrator for user: ${updated.name} (${updated.email})`,
    });
    res.json({ message: 'Password updated successfully', user: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- Global App Config (Categories, Stages, Branches) ----------------

app.get('/api/config', authMiddleware, (req, res) => {
  res.json({
    categories: db.getCategories(),
    pipelineStages: db.getPipelineStages(),
    branches: db.getBranches(),
  });
});

// Oman Branches List with per-rep lead counts
app.get('/api/branches', authMiddleware, (req, res) => {
  try {
    const branches = db.getBranches();
    const leads = db.getLeads();
    const branchesWithCounts = branches.map((b) => {
      const branchLeads = leads.filter(
        (l) => l.branchId === b.id || (l.branch === b.name && (!b.salesman || l.salesman === b.salesman))
      );
      return {
        ...b,
        leadCount: branchLeads.length,
        activeLeads: branchLeads.filter((l) => l.status !== 'won' && l.status !== 'lost').length,
        wonLeads: branchLeads.filter((l) => l.status === 'won').length,
      };
    });
    res.json(branchesWithCounts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Security Audit Trail (Super Admin Only)
app.get('/api/audit-logs', authMiddleware, requireSuperAdmin, (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const logs = db.getActivities(limit);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Category Management (Super Admin Only)
app.post('/api/settings/categories', authMiddleware, requireSuperAdmin, (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Valid category name is required.' });
    }
    const clean = name.trim();
    const existing = db.getCategories();
    if (existing.some((c) => c.toLowerCase() === clean.toLowerCase())) {
      return res.status(409).json({ error: `Category "${clean}" already exists.` });
    }
    const categories = db.addCategory(clean);
    db.addActivity({
      type: 'settings',
      description: `New product category created: "${clean}" by Administrator (${req.user.email})`,
    });
    res.status(201).json({ categories });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/settings/categories/:name', authMiddleware, requireSuperAdmin, (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    const ok = db.deleteCategory(name);
    if (!ok) return res.status(404).json({ error: 'Category not found' });
    db.addActivity({
      type: 'settings',
      description: `Product category removed: "${name}" by Administrator`,
    });
    res.json({ categories: db.getCategories() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Pipeline Stages Management (Super Admin Only)
app.post('/api/settings/stages', authMiddleware, requireSuperAdmin, (req, res) => {
  try {
    const { id, label, color } = req.body;
    if (!label) return res.status(400).json({ error: 'Stage label is required.' });
    const stage = db.addPipelineStage({ id, label, color });
    db.addActivity({
      type: 'settings',
      description: `New pipeline stage created: "${label}" by Administrator`,
    });
    res.status(201).json(stage);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/settings/stages/:id', authMiddleware, requireSuperAdmin, (req, res) => {
  try {
    const ok = db.deletePipelineStage(req.params.id);
    if (!ok) return res.status(400).json({ error: 'Cannot delete this pipeline stage.' });
    db.addActivity({
      type: 'settings',
      description: `Pipeline stage removed: "${req.params.id}" by Administrator`,
    });
    res.json({ stages: db.getPipelineStages() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Branches & Salesmen Management (Super Admin Only)
app.post('/api/settings/branches', authMiddleware, requireSuperAdmin, (req, res) => {
  try {
    const { name, city, phone, salesman, isHeadquarters } = req.body;
    if (!name) return res.status(400).json({ error: 'Branch name is required.' });
    const branch = db.addBranch({ name, city, phone, salesman, isHeadquarters });
    db.addActivity({
      type: 'settings',
      description: `New branch created: "${name}" (Salesman: ${salesman || 'Unassigned'}) by Administrator`,
    });
    res.status(201).json(branch);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/settings/branches/:id', authMiddleware, requireSuperAdmin, (req, res) => {
  try {
    const updated = db.updateBranch(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Branch not found' });
    db.addActivity({
      type: 'settings',
      description: `Branch "${updated.name}" updated (Salesman: ${updated.salesman}) by Administrator`,
    });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/settings/branches/:id', authMiddleware, requireSuperAdmin, (req, res) => {
  try {
    const ok = db.deleteBranch(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Branch not found' });
    db.addActivity({
      type: 'settings',
      description: `Branch removed (ID: ${req.params.id}) by Administrator`,
    });
    res.json({ message: 'Branch deleted successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// API 404 Shield: Never return HTML for unhandled /api/* routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.originalUrl}` });
});

// Serve static build in production (if frontend was bundled with backend)
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  // Standalone Backend Mode (e.g. Render / Heroku / Railway)
  app.get('/', (req, res) => {
    res.json({
      status: 'active',
      name: 'Monipack CRM Backend API',
      organization: 'Morooj Nizwa International LLC',
      endpoints: {
        health: '/api/health',
        auth: '/api/auth/login'
      },
      docs: 'Backend service is online and ready to accept CRM API requests.'
    });
  });
}

// Bind to 0.0.0.0 so localhost (IPv6 ::1 and IPv4 127.0.0.1) and LAN all work reliably
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(` Monipack CRM Server ACTIVE on port ${PORT}`);
  console.log(` Morooj Nizwa International LLC`);
  console.log(` Access Localhost: http://localhost:${PORT}`);
  console.log(` Access Loopback:  http://127.0.0.1:${PORT}`);
  console.log(`===============================================`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[CRITICAL] Port ${PORT} is already in use by another process.`);
  } else {
    console.error(`[CRITICAL] Server error:`, err);
  }
});
