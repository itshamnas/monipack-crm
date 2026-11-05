import 'dotenv/config';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import db from './db/index.js';
import {
  generateProductTemplate,
  parseProductCsv,
  parseUniversalProductData
} from './productImportService.js';
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
app.set('trust proxy', 'loopback');
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || '';

// Production Startup Guard: JWT_SECRET must be configured and >= 32 characters
if (process.env.NODE_ENV === 'production') {
  if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error('[FATAL SECURITY ERROR] In production, JWT_SECRET must be set and at least 32 characters long.');
    process.exit(1);
  }
} else if (!JWT_SECRET && process.env.NODE_ENV !== 'test') {
  console.warn('[SECURITY WARNING] JWT_SECRET is not set in development.');
}

const rawOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
const allowedOrigins = rawOrigins.length > 0
  ? rawOrigins
  : (process.env.NODE_ENV !== 'production' ? ['http://localhost:3000', 'http://localhost:5000', 'http://127.0.0.1:3000', 'http://127.0.0.1:5000'] : []);

app.use(cors({
  origin: (origin, callback) => {
    // Requests with no Origin header (same-origin, curl, server-to-server) are allowed
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.options('*', cors());

// Helmet with Content Security Policy & defensive headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      workerSrc: ["'self'"],
      manifestSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Body Parser: 1mb globally, 15mb only on specific bulk/import endpoints
app.use(express.json({ limit: '1mb' }));
const largeJsonParser = express.json({ limit: '15mb' });

// Wrap async route handlers - uncaught errors go to the central error handler
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Health Check Endpoint (useful for Render keep-alive and diagnostics)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    name: 'Monipack CRM API',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Initialize default users if database is empty (async, non-blocking)
(async () => {
  try {
    await db.initUsers();
  } catch (err) {
    console.error('[Startup] Failed to init users:', err.message);
  }
})();

// ---------------- Security Rate Limiter (IP & Email Lockout) ----------------
// Lockout by IP: 5 failed attempts / 15 min
// Lockout by Email: 10 failed attempts / 15 min
const loginAttemptsByIp = new Map(); // ip -> { count, resetAt }
const loginAttemptsByEmail = new Map(); // email -> { count, resetAt }

const checkLoginRateLimit = (req, res, next) => {
  const clientIp = req.ip || '127.0.0.1';
  const email = (req.body?.email || '').toLowerCase().trim();
  const now = Date.now();

  // 1. Check IP lockout (5 fails / 15 min)
  const ipRecord = loginAttemptsByIp.get(clientIp);
  if (ipRecord) {
    if (now > ipRecord.resetAt) {
      loginAttemptsByIp.delete(clientIp);
    } else if (ipRecord.count >= 5) {
      const remainingMinutes = Math.max(1, Math.ceil((ipRecord.resetAt - now) / 60000));
      return res.status(429).json({
        error: `Security Lockout: Too many failed login attempts from this network. Please wait ${remainingMinutes} minute(s) before trying again.`,
      });
    }
  }

  // 2. Check Email lockout (10 fails / 15 min)
  if (email) {
    const emailRecord = loginAttemptsByEmail.get(email);
    if (emailRecord) {
      if (now > emailRecord.resetAt) {
        loginAttemptsByEmail.delete(email);
      } else if (emailRecord.count >= 10) {
        const remainingMinutes = Math.max(1, Math.ceil((emailRecord.resetAt - now) / 60000));
        return res.status(429).json({
          error: `Security Lockout: Account locked due to repeated failed attempts. Please wait ${remainingMinutes} minute(s) before trying again.`,
        });
      }
    }
  }

  req.clientIp = clientIp;
  next();
};

const recordFailedLogin = async (clientIp, email) => {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes lockout

  // Increment IP counter
  const ipRecord = loginAttemptsByIp.get(clientIp) || { count: 0, resetAt: now + windowMs };
  ipRecord.count += 1;
  loginAttemptsByIp.set(clientIp, ipRecord);

  // Increment Email counter
  let emailFails = 0;
  if (email) {
    const cleanEmail = email.toLowerCase().trim();
    const emailRecord = loginAttemptsByEmail.get(cleanEmail) || { count: 0, resetAt: now + windowMs };
    emailRecord.count += 1;
    emailFails = emailRecord.count;
    loginAttemptsByEmail.set(cleanEmail, emailRecord);
  }

  try {
    await db.addAuditEntry({
      type: 'security_alert',
      targetEmail: email || 'unknown',
      ipAddress: clientIp,
      description: `Failed login attempt for ${email || 'unknown'} from IP ${clientIp} (IP: ${ipRecord.count}/5${email ? `, Email: ${emailFails}/10` : ''})`,
    });
  } catch (err) {
    console.error('[Audit] Failed to log failed login:', err.message);
  }
};

const recordSuccessfulLogin = (clientIp, email) => {
  loginAttemptsByIp.delete(clientIp);
  if (email) {
    loginAttemptsByEmail.delete(email.toLowerCase().trim());
  }
};

// Periodic cleanup of expired rate limit entries to prevent memory leaks (runs every 15 minutes)
const rateLimitCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of loginAttemptsByIp) {
    if (now > rec.resetAt) loginAttemptsByIp.delete(ip);
  }
  for (const [email, rec] of loginAttemptsByEmail) {
    if (now > rec.resetAt) loginAttemptsByEmail.delete(email);
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
app.post('/api/auth/login', checkLoginRateLimit, asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const clientIp = req.clientIp || '127.0.0.1';

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = await db.getUserByEmail(email);
  if (!user) {
    await recordFailedLogin(clientIp, email);
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const isMatch = bcrypt.compareSync(password, user.password_hash);
  if (!isMatch) {
    await recordFailedLogin(clientIp, email);
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  // Login succeeded: reset failure counter for this IP and email
  recordSuccessfulLogin(clientIp, email);

  const payload = {
    id: String(user.id),
    name: user.name,
    email: user.email,
    role: user.role, // 'super_admin' or 'admin'
    canExport: user.can_export === true,
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

  // Log login activity to audit_log
  try {
    await db.addAuditEntry({
      type: 'login',
      userId: user.id,
      userName: user.name,
      description: user.name.toLowerCase().includes('admin')
        ? `${user.name} signed in`
        : `${user.name} (${user.role === 'super_admin' ? 'Administrator' : 'Admin'}) signed in`,
    });
  } catch (err) {
    console.error('[Audit] Failed to log login:', err.message);
  }

  res.json({
    token,
    user: payload,
  });
}));

// Current User Session
app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// ---------------- Protected Business Endpoints ----------------

// Analytics (Dashboard)
app.get('/api/analytics', authMiddleware, asyncHandler(async (req, res) => {
  const stats = await db.getAnalytics();
  res.json(stats);
}));

// Export Leads CSV - STRICTLY RESTRICTED to Administrator
app.get('/api/leads/export', authMiddleware, requireExportPermission, asyncHandler(async (req, res) => {
  const { status, category, branch, search, scope } = req.query;

  const filterOptions = scope === 'all' ? {} : {
    status: (status && status !== 'all' && status !== 'All Stages') ? status : undefined,
    category: (category && category !== 'all' && category !== 'All Categories') ? category : undefined,
    branch: (branch && branch !== 'all' && branch !== 'All Oman Branches') ? branch : undefined,
    search: (search && search.trim()) ? search.trim() : undefined,
  };

  const leads = await db.getLeads(filterOptions);

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
    escapeCsv(l.customerLocation || l.branch || 'Oman'),
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

  try {
    await db.addAuditEntry({
      type: 'security',
      userId: req.user.id,
      userName: req.user.name,
      description: `CONFIDENTIAL EXPORT: Administrator (${req.user.email}) exported ${leads.length} leads to CSV (Scope: ${scope === 'all' ? 'All Records' : 'Filtered View'})`,
    });
  } catch (err) {
    console.error('[Audit] Failed to log export:', err.message);
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  const filenameScope = scope === 'all' ? 'all' : (filterOptions.branch ? String(filterOptions.branch).replace(/\s+/g, '_') : 'filtered');
  res.setHeader('Content-Disposition', `attachment; filename=monipack_leads_${filenameScope}_${new Date().toISOString().slice(0, 10)}.csv`);
  res.send(csvData);
}));

// Leads List
app.get('/api/leads', authMiddleware, asyncHandler(async (req, res) => {
  const { status, category, branch, search } = req.query;
  const leads = await db.getLeads({ status, category, branch, search });
  res.json(leads);
}));

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
    console.error('[Template]', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

app.get('/api/leads/:id', authMiddleware, asyncHandler(async (req, res) => {
  const lead = await db.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  res.json(lead);
}));

app.post('/api/leads', authMiddleware, asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ error: 'Company or Client Name must be at least 2 characters long.' });
  }
  const created = await db.createLead(req.body);
  await db.addActivity({
    leadId: created.id,
    leadName: created.name,
    type: 'status_change',
    description: `New lead created by ${req.user.name}: ${created.name} (${created.category})`,
  });
  // Record initial stage in history
  await db.recordStageChange({
    leadId: created.id,
    fromStatus: null,
    toStatus: created.status || 'new',
    changedBy: req.user.name,
  });
  res.status(201).json(created);
}));

app.patch('/api/leads/:id', authMiddleware, asyncHandler(async (req, res) => {
  const prev = await db.getLeadById(req.params.id);
  if (!prev) return res.status(404).json({ error: 'Lead not found' });

  const updated = await db.updateLead(req.params.id, req.body, { changedBy: req.user.name });
  if (!updated) return res.status(404).json({ error: 'Lead not found' });

  if (req.body.status && req.body.status !== prev.status) {
    await db.addActivity({
      leadId: updated.id,
      leadName: updated.name,
      type: 'status_change',
      description: `Stage changed from "${prev.status}" to "${req.body.status}" by ${req.user.name}`,
    });
  }

  res.json(updated);
}));

// Safe Purge All Leads (Super Admin Only - Clean Slate) - MUST be before /api/leads/:id
app.delete('/api/leads/purge-all', authMiddleware, requireSuperAdmin, asyncHandler(async (req, res) => {
  const purgedCount = await db.purgeAllLeads();
  await db.addActivity({
    type: 'settings',
    description: `Leads database reset: ${purgedCount} leads permanently purged by ${req.user.name}`,
  });
  res.json({
    success: true,
    purgedCount,
    message: `Database reset successful. ${purgedCount} leads permanently purged.`
  });
}));

app.delete('/api/leads/:id', authMiddleware, asyncHandler(async (req, res) => {
  if (req.params.id === 'purge-all') return;
  const success = await db.deleteLead(req.params.id);
  if (!success) return res.status(404).json({ error: 'Lead not found' });
  res.json({ message: 'Lead deleted successfully' });
}));

// Parse uploaded Leads CSV content for preview before committing
app.post('/api/leads/parse-csv', authMiddleware, largeJsonParser, asyncHandler(async (req, res) => {
  const csvData = req.body.csvData || req.body.csvContent;
  if (!csvData) return res.status(400).json({ error: 'No CSV data provided' });

  const existingLeads = await db.getLeads();
  const branches = await db.getBranches();
  const categories = await db.getCategories();

  const result = parseLeadCsv(csvData, {
    leads: existingLeads,
    branches,
    categories
  });

  res.json(result);
}));

// Bulk Import Leads into CRM
app.post('/api/leads/bulk-import', authMiddleware, largeJsonParser, asyncHandler(async (req, res) => {
  const { items, options } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'No valid lead records provided for import' });
  }

  const result = await db.bulkUpsertLeads(items, options || {});

  await db.addActivity({
    type: 'lead_import',
    description: `Leads Bulk Import: ${result.addedCount} new inquiries created, ${result.updatedCount} leads updated (${result.skippedCount} skipped) by ${req.user.name}`,
  });

  res.json({
    success: true,
    message: `Successfully processed ${items.length} leads (${result.addedCount} added, ${result.updatedCount} updated, ${result.skippedCount} skipped).`,
    ...result
  });
}));

app.post('/api/leads/:id/activity', authMiddleware, asyncHandler(async (req, res) => {
  const lead = await db.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const act = await db.addActivity({
    leadId: lead.id,
    leadName: lead.name,
    type: req.body.type || 'note',
    description: req.body.description || 'Activity recorded',
  });

  if (req.body.type === 'whatsapp' || req.body.type === 'call') {
    await db.updateLead(lead.id, { lastContactedAt: new Date().toISOString() });
  }

  res.status(201).json(act);
}));

// Products
app.get('/api/products', authMiddleware, asyncHandler(async (req, res) => {
  const { category, brand, search } = req.query;
  const products = await db.getProducts({ category, brand, search });
  res.json(products);
}));

app.post('/api/products', authMiddleware, asyncHandler(async (req, res) => {
  const product = await db.createProduct(req.body);
  res.status(201).json(product);
}));

app.patch('/api/products/:id', authMiddleware, asyncHandler(async (req, res) => {
  const updated = await db.updateProduct(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Product not found' });
  res.json(updated);
}));

app.delete('/api/products/:id', authMiddleware, asyncHandler(async (req, res) => {
  const ok = await db.deleteProduct(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Product not found' });
  await db.addActivity({
    type: 'product_delete',
    description: `Product deleted (ID: ${req.params.id}) by ${req.user.name}`,
  });
  res.json({ message: 'Product deleted' });
}));

// Bulk Delete Products
app.post('/api/products/bulk-delete', authMiddleware, asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'No product IDs provided' });
  }
  const count = await db.bulkDeleteProducts(ids);
  await db.addActivity({
    type: 'product_delete',
    description: `Bulk deleted ${count} products by ${req.user.name}`,
  });
  res.json({ success: true, count, message: `Successfully deleted ${count} products.` });
}));

// Download Official Product Catalog CSV Template
app.get('/api/products/template', authMiddleware, asyncHandler(async (req, res) => {
  const csvContent = generateProductTemplate();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=monipack_product_catalog_template.csv');
  res.send(csvContent);
}));

// Parse uploaded product CSV content with Variance Analysis
app.post('/api/products/parse-csv', authMiddleware, largeJsonParser, asyncHandler(async (req, res) => {
  const csvData = req.body.csvData || req.body.csvContent;
  if (!csvData) return res.status(400).json({ error: 'No product CSV data provided' });

  const existingProducts = await db.getProducts();
  const result = parseUniversalProductData(csvData, existingProducts);

  res.json(result);
}));

// Bulk Import Products into Catalog
app.post('/api/products/bulk-import', authMiddleware, largeJsonParser, asyncHandler(async (req, res) => {
  const { items, options } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'No valid product items provided for import' });
  }

  const result = await db.bulkUpsertProducts(items, options || {});

  await db.addActivity({
    type: 'product_import',
    description: `Product Import: ${result.addedCount} new items added, ${result.updatedCount} items updated by ${req.user.name}`,
  });

  res.json({
    success: true,
    message: `Successfully processed ${items.length} items (${result.addedCount} added, ${result.updatedCount} updated).`,
    ...result
  });
}));

// Quotations
app.get('/api/quotations', authMiddleware, asyncHandler(async (req, res) => {
  const quotes = await db.getQuotations();
  res.json(quotes);
}));

app.get('/api/quotations/:id', authMiddleware, asyncHandler(async (req, res) => {
  const quote = await db.getQuotationById(req.params.id);
  if (!quote) return res.status(404).json({ error: 'Quotation not found' });
  res.json(quote);
}));

app.post('/api/quotations', authMiddleware, asyncHandler(async (req, res) => {
  if (!req.body.customerName || typeof req.body.customerName !== 'string' || !req.body.customerName.trim()) {
    return res.status(400).json({ error: 'Customer or Business Name is required for quotation.' });
  }
  if (req.body.items && !Array.isArray(req.body.items)) {
    return res.status(400).json({ error: 'Quotation items must be provided as an array.' });
  }
  const quote = await db.createQuotation(req.body);
  await db.addActivity({
    leadId: quote.leadId,
    leadName: quote.customerName,
    type: 'quotation',
    description: `Generated quotation ${quote.code} for OMR ${Number(quote.grandTotalOMR).toFixed(3)} by ${req.user.name}`,
  });
  res.status(201).json(quote);
}));

app.put('/api/quotations/:id', authMiddleware, asyncHandler(async (req, res) => {
  const updated = await db.updateQuotation(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Quotation not found' });
  await db.addActivity({
    type: 'quotation',
    description: `Quotation "${updated.code}" updated by ${req.user.name}`,
  });
  res.json(updated);
}));

app.delete('/api/quotations/:id', authMiddleware, asyncHandler(async (req, res) => {
  const success = await db.deleteQuotation(req.params.id);
  if (!success) return res.status(404).json({ error: 'Quotation not found' });
  await db.addActivity({
    type: 'quotation',
    description: `Quotation "${req.params.id}" was deleted by ${req.user.name}`,
  });
  res.json({ message: 'Quotation deleted successfully' });
}));

// ================= Super Admin ONLY Settings & Controls =================

// Get Settings
app.get('/api/settings', authMiddleware, requireSuperAdmin, asyncHandler(async (req, res) => {
  const settings = await db.getSettings();
  res.json(settings);
}));

// Update Settings
app.patch('/api/settings', authMiddleware, requireSuperAdmin, asyncHandler(async (req, res) => {
  const updated = await db.updateSettings(req.body);
  await db.addActivity({
    type: 'settings',
    description: `System settings updated by Administrator (${req.user.email})`,
  });
  res.json(updated);
}));

// Download System Backup Snapshot (Super Admin Only)
app.get('/api/backup', authMiddleware, requireSuperAdmin, asyncHandler(async (req, res) => {
  const filenameDate = new Date().toISOString().slice(0, 10);
  await db.addAuditEntry({
    type: 'security',
    userId: req.user.id,
    userName: req.user.name,
    description: `System database backup snapshot downloaded by Administrator (${req.user?.email || 'super_admin'})`,
  });

  // Build backup from all tables
  const backup = {
    users: await db.getUsers(),
    leads: await db.getLeads(),
    products: await db.getProducts(),
    quotations: await db.getQuotations(),
    branches: await db.getBranches(),
    categories: await db.getCategories(),
    pipelineStages: await db.getPipelineStages(),
    settings: await db.getSettings(),
    activities: await db.getActivities(200),
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=monipack_crm_backup_${filenameDate}.json`);
  res.send(JSON.stringify(backup, null, 2));
}));

// Users Management
app.get('/api/users', authMiddleware, requireSuperAdmin, asyncHandler(async (req, res) => {
  const users = await db.getUsers();
  res.json(users);
}));

app.post('/api/users', authMiddleware, requireSuperAdmin, asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }
  const existing = await db.getUserByEmail(email);
  if (existing) {
    return res.status(400).json({ error: 'A user with this email already exists.' });
  }
  const created = await db.createUser({ name, email, password, role: role || 'admin' });
  await db.addAuditEntry({
    type: 'security',
    userId: req.user.id,
    userName: req.user.name,
    description: `New user created by Administrator: ${name} (${role || 'admin'})`,
  });
  res.status(201).json(created);
}));

app.delete('/api/users/:id', authMiddleware, requireSuperAdmin, asyncHandler(async (req, res) => {
  const success = await db.deleteUser(req.params.id);
  if (!success) {
    return res.status(400).json({ error: 'Unable to delete this user account.' });
  }
  await db.addAuditEntry({
    type: 'security',
    userId: req.user.id,
    userName: req.user.name,
    description: `User account deleted by Administrator (ID: ${req.params.id})`,
  });
  res.json({ message: 'User deleted successfully' });
}));

app.patch('/api/users/:id/password', authMiddleware, requireSuperAdmin, asyncHandler(async (req, res) => {
  const { password } = req.body || {};
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }
  const updated = await db.updateUserPassword(req.params.id, password);
  if (!updated) {
    return res.status(404).json({ error: 'User not found.' });
  }
  await db.addAuditEntry({
    type: 'security',
    userId: req.user.id,
    userName: req.user.name,
    description: `Password reset by Administrator for user: ${updated.name} (${updated.email})`,
  });
  res.json({ message: 'Password updated successfully', user: updated });
}));

// ---------------- Global App Config (Categories, Stages, Branches) ----------------

app.get('/api/config', authMiddleware, asyncHandler(async (req, res) => {
  const [categories, pipelineStages, branches] = await Promise.all([
    db.getCategories(),
    db.getPipelineStages(),
    db.getBranches(),
  ]);
  res.json({ categories, pipelineStages, branches });
}));

// Oman Branches List with per-rep lead counts
app.get('/api/branches', authMiddleware, asyncHandler(async (req, res) => {
  const branches = await db.getBranches();
  const leads = await db.getLeads();

  const branchesWithCounts = branches.map((b) => {
    const branchLeads = leads.filter(
      (l) => String(l.branchId) === String(b.id) || (l.branch === b.name && (!b.salesman || l.salesman === b.salesman))
    );
    return {
      ...b,
      leadCount: branchLeads.length,
      activeLeads: branchLeads.filter((l) => l.status !== 'won' && l.status !== 'lost').length,
      wonLeads: branchLeads.filter((l) => l.status === 'won').length,
    };
  });
  res.json(branchesWithCounts);
}));

// Security Audit Trail (Super Admin Only)
app.get('/api/audit-logs', authMiddleware, requireSuperAdmin, asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const logs = await db.getAuditLogs(limit);
  res.json(logs);
}));

// Category Management (Super Admin Only)
app.post('/api/settings/categories', authMiddleware, requireSuperAdmin, asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Valid category name is required.' });
  }
  const clean = name.trim();
  const existing = await db.getCategories();
  if (existing.some((c) => c.toLowerCase() === clean.toLowerCase())) {
    return res.status(409).json({ error: `Category "${clean}" already exists.` });
  }
  const categories = await db.addCategory(clean);
  await db.addActivity({
    type: 'settings',
    description: `New product category created: "${clean}" by Administrator (${req.user.email})`,
  });
  res.status(201).json({ categories });
}));

app.delete('/api/settings/categories/:name', authMiddleware, requireSuperAdmin, asyncHandler(async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const ok = await db.deleteCategory(name);
  if (!ok) return res.status(404).json({ error: 'Category not found' });
  await db.addActivity({
    type: 'settings',
    description: `Product category removed: "${name}" by Administrator`,
  });
  const categories = await db.getCategories();
  res.json({ categories });
}));

// Pipeline Stages Management (Super Admin Only)
app.post('/api/settings/stages', authMiddleware, requireSuperAdmin, asyncHandler(async (req, res) => {
  const { id, label, color } = req.body;
  if (!label) return res.status(400).json({ error: 'Stage label is required.' });
  const stage = await db.addPipelineStage({ id, label, color });
  await db.addActivity({
    type: 'settings',
    description: `New pipeline stage created: "${label}" by Administrator`,
  });
  res.status(201).json(stage);
}));

app.delete('/api/settings/stages/:id', authMiddleware, requireSuperAdmin, asyncHandler(async (req, res) => {
  const ok = await db.deletePipelineStage(req.params.id);
  if (!ok) return res.status(400).json({ error: 'Cannot delete this pipeline stage.' });
  await db.addActivity({
    type: 'settings',
    description: `Pipeline stage removed: "${req.params.id}" by Administrator`,
  });
  const stages = await db.getPipelineStages();
  res.json({ stages });
}));

// Branches & Salesmen Management (Super Admin Only)
app.post('/api/settings/branches', authMiddleware, requireSuperAdmin, asyncHandler(async (req, res) => {
  const { name, city, phone, salesman, isHeadquarters } = req.body;
  if (!name) return res.status(400).json({ error: 'Branch name is required.' });
  const branch = await db.addBranch({ name, city, phone, salesman, isHeadquarters });
  await db.addActivity({
    type: 'settings',
    description: `New branch created: "${name}" (Salesman: ${salesman || 'Unassigned'}) by Administrator`,
  });
  res.status(201).json(branch);
}));

app.patch('/api/settings/branches/:id', authMiddleware, requireSuperAdmin, asyncHandler(async (req, res) => {
  const updated = await db.updateBranch(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Branch not found' });
  await db.addActivity({
    type: 'settings',
    description: `Branch "${updated.name}" updated (Salesman: ${updated.salesman}) by Administrator`,
  });
  res.json(updated);
}));

app.delete('/api/settings/branches/:id', authMiddleware, requireSuperAdmin, asyncHandler(async (req, res) => {
  const ok = await db.deleteBranch(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Branch not found' });
  await db.addActivity({
    type: 'settings',
    description: `Branch removed (ID: ${req.params.id}) by Administrator`,
  });
  res.json({ message: 'Branch deleted successfully' });
}));

// ---- Central Error Handlers ----

// CORS rejection handler
app.use((err, req, res, next) => {
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Not allowed by CORS' });
  }
  next(err);
});

// Central async error handler: never send err.message to the browser
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] Server Error:`, err.stack || err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
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
let server = null;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`===============================================`);
    console.log(` Monipack CRM Server ACTIVE on port ${PORT}`);
    console.log(` Morooj Nizwa International LLC`);
    console.log(` Database: PostgreSQL`);
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
}

export { app, server };
export default app;
