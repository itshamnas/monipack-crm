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
  ROLES,
  normalizeRole,
  permissionsFor,
  hasPermission,
  isOwnScopeOnly,
  segmentOf,
  dataScope,
  validatePassword,
} from './auth/permissions.js';
import {
  generateProductTemplate,
  parseProductCsv,
  parseUniversalProductData
} from './productImportService.js';
import {
  generateLeadTemplate,
  parseLeadCsv
} from './leadImportService.js';
import { registerCustomerRoutes } from './customers/routes.js';
import { registerCleanupRoutes } from './admin/cleanup.js';
import { registerTaskRoutes } from './tasks/tasks.js';
import { registerPhotoRoutes } from './profile/photos.js';
import { registerTwoFactorRoutes, twoFactorRequired, issueChallenge } from './auth/twoFactor.js';
import { registerBackupRoutes, startBackupSchedule } from './backup/daily.js';
import { recordMiddleware, registerVaultRoutes } from './audit/vault.js';
import { query as dbQuery } from './db/pool.js';
import { registerReportRoutes } from './reports/value.js';
import * as quotePipe from './quotes/pipeline.js';
import { registerWhatsAppRoutes, alertLeadAssigned, revokeUserLinks } from './notify/whatsapp.js';
import { registerNotificationRoutes, notify, usersForSalesman, managers as managerIds } from './notify/notify.js';

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

// Behind the Cloudflare tunnel every request reaches us from this machine (127.0.0.1).
// Use the visitor's real address Cloudflare sends, but only when the request really came from this machine.
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const VALID_IP = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-f:]{2,45})$/i;
app.use((req, res, next) => {
  const cf = String(req.headers['cf-connecting-ip'] || '').trim();
  if (cf && VALID_IP.test(cf) && LOOPBACK.has(req.socket?.remoteAddress)) {
    Object.defineProperty(req, 'ip', { value: cf, configurable: true });
  }
  next();
});
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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Link-Session']
}));
app.options('*', cors());

// Helmet with Content Security Policy & defensive headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", "data:"],
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
  // geolocation is allowed for our own pages: salesmen use "Use my current location" on the customer link page
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  next();
});

// Body Parser: 1mb globally, 15mb only on specific bulk/import/upload endpoints.
// The global parser must SKIP those routes, otherwise it rejects large bodies before the route's own parser runs.
const LARGE_BODY_ROUTES = [
  /^\/api\/leads\/(parse-csv|bulk-import)$/,
  /^\/api\/products\/(parse-csv|bulk-import)$/,
  /^\/api\/customers\/import(\/parse)?$/,
  /^\/api\/customers\/[^/]+\/files$/,
  /^\/api\/link\/[^/]+\/customers\/[^/]+\/files$/,
];
const smallJsonParser = express.json({ limit: '1mb' });
app.use((req, res, next) => (LARGE_BODY_ROUTES.some((re) => re.test(req.path)) ? next() : smallJsonParser(req, res, next)));
const largeJsonParser = express.json({ limit: '40mb' }); // a 10 MB PDF + its page images, as base64

// Audit vault: record every change and sensitive download (after the response, never blocks it)
app.use(recordMiddleware);

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

// Read-only share links (/api/view/:token): at most 120 opens per minute per IP
const viewHits = new Map();
const viewLimiter = (req, res, next) => {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const rec = viewHits.get(ip);
  if (!rec || now > rec.resetAt) viewHits.set(ip, { count: 1, resetAt: now + 60000 });
  else if (++rec.count > 120) return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
  if (viewHits.size > 5000) viewHits.clear();
  next();
};

// ---------------- Security & Auth Middleware ----------------

// Requests allowed while a user still has to replace a temporary password
const PASSWORD_CHANGE_ALLOWED = new Set(['/api/auth/me', '/api/auth/change-password']);

// Build the session user from a DB row (never includes the password hash)
const superAdminOnly = (req, res, next) => (req.user?.role === 'super_admin' ? next() : res.status(403).json({ error: 'Only the super admin can do this.' }));

function buildSessionUser(u) {
  const user = {
    id: String(u.id),
    name: u.name,
    email: u.email,
    role: normalizeRole(u.role) || 'manager',
    canExport: u.can_export === true,
    salesmanId: u.salesman_id != null ? String(u.salesman_id) : null,
    mustChangePassword: Boolean(u.must_change_password),
    twoFactorEnabled: Boolean(u.totp_enabled),
    photoUrl: u.photo_key ? `/api/photos/${u.photo_key}` : null,
  };
  user.permissions = permissionsFor(user);
  user.canExport = user.permissions.includes('leads.export');
  return user;
}

// The token carries only the user id and token version; everything else is loaded fresh on each request
function signToken(u) {
  return jwt.sign({ id: String(u.id), tv: u.token_version || 0 }, JWT_SECRET, { expiresIn: '12h' });
}

const authMiddleware = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  let decoded;
  try {
    decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
  }

  // Load the user on every request: deactivation, role change or password reset ends old sessions at once
  const u = await db.getUserAuthState(decoded.id);
  if (!u || !u.is_active || (u.token_version || 0) !== (decoded.tv || 0)) {
    return res.status(401).json({ error: 'Session expired or your access has changed. Please log in again.' });
  }

  req.user = buildSessionUser(u);

  const pathOnly = (req.originalUrl || '').split('?')[0];
  if (req.user.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.has(pathOnly)) {
    return res.status(403).json({
      error: 'Please set a new password before continuing.',
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
  }
  next();
});

// Allow the request when the user has ANY of the listed permissions
const requirePermission = (...perms) => (req, res, next) => {
  if (!req.user || !perms.some((p) => req.user.permissions.includes(p))) {
    return res.status(403).json({ error: 'You do not have permission to do this.' });
  }
  next();
};

// Salesmen see only their own leads; B2B / Retail managers only their department
const leadScope = (req) => dataScope(req.user);

// Returns the lead only if this user may see it (otherwise null -> 404, so ids of other leads are not revealed)
async function loadLeadForUser(req, id) {
  const lead = await db.getLeadById(id);
  if (!lead) return null;
  if (isOwnScopeOnly(req.user)) {
    if (!req.user.salesmanId || String(lead.salesmanId ?? '') !== String(req.user.salesmanId)) return null;
  }
  const seg = segmentOf(req.user);
  if (seg && (await db.getLeadSegment(lead.id)) !== seg) return null;
  return lead;
}

// Department of a lead after applying `input` on top of `prev` (both optional)
async function segmentAfter(input = {}, prev = {}) {
  const has = (k) => Object.prototype.hasOwnProperty.call(input, k);
  const bid = has('branchId') ? (parseInt(input.branchId, 10) || null) : (parseInt(prev.branchId, 10) || null);
  let sid = has('salesmanId') ? (parseInt(input.salesmanId, 10) || null) : null;
  if (!has('salesmanId')) {
    if (has('salesman') && String(input.salesman || '').trim()) {
      const { rows } = await dbQuery('SELECT id FROM salesmen WHERE lower(trim(name)) = lower(trim($1)) AND archived_at IS NULL ORDER BY id LIMIT 1', [String(input.salesman)]);
      sid = rows[0]?.id || null;
    } else if (!has('salesman')) sid = parseInt(prev.salesmanId, 10) || null;
  }
  const bname = has('branch') ? (input.branch || null) : (prev.branch || null);
  const { rows } = await dbQuery('SELECT lead_segment($1::int, $2::int, $3::text) AS seg', [bid, sid, bname]);
  return rows[0]?.seg || null;
}
const DEPT_NAME = { b2b: 'B2B', retail: 'Retail' };
const outsideDept = (seg) => `Choose a ${DEPT_NAME[seg] || ''} branch or salesman. You can only keep enquiries inside your own department.`;

// Users without 'leads.assign' cannot move a lead to another branch or salesman
const ASSIGNMENT_FIELDS = ['branchId', 'branch', 'salesmanId', 'salesman'];
function withoutAssignmentFields(req, body = {}) {
  if (hasPermission(req.user, 'leads.assign')) return body;
  const clean = { ...body };
  ASSIGNMENT_FIELDS.forEach((f) => delete clean[f]);
  return clean;
}

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

  if (!user.is_active) {
    try {
      await db.addAuditEntry({
        type: 'security_alert',
        userId: user.id,
        userName: user.name,
        targetEmail: user.email,
        ipAddress: clientIp,
        description: `Login refused for deactivated account ${user.email}`,
      });
    } catch (err) {
      console.error('[Audit] Failed to log refused login:', err.message);
    }
    return res.status(403).json({ error: 'This account is disabled. Please contact your administrator.' });
  }

  // Login succeeded: reset failure counter for this IP and email
  recordSuccessfulLogin(clientIp, email);

  // 2-step login: the password was right, now ask for the code from the authenticator app
  if (twoFactorRequired(user)) {
    return res.json({ needs2fa: true, challenge: issueChallenge(user, JWT_SECRET), name: user.name });
  }
  await db.recordLogin(user.id);

  const sessionUser = buildSessionUser(user);
  const token = signToken(user);

  try {
    await db.addAuditEntry({
      type: 'login',
      userId: user.id,
      userName: user.name,
      ipAddress: clientIp,
      description: `${user.name} (${sessionUser.role}) signed in`,
    });
  } catch (err) {
    console.error('[Audit] Failed to log login:', err.message);
  }

  res.json({ token, user: sessionUser });
}));

// Current User Session (role + permissions, so the screens can show/hide actions)
app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// Change own password (also used for the forced change after a temporary password)
app.post('/api/auth/change-password', authMiddleware, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const emailKey = (req.user.email || '').toLowerCase().trim();
  const lock = loginAttemptsByEmail.get(emailKey);
  if (lock && Date.now() <= lock.resetAt && lock.count >= 10) {
    return res.status(429).json({ error: 'Too many failed attempts. Please wait and try again.' });
  }

  const user = await db.getUserById(req.user.id);
  if (!user || !currentPassword || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    await recordFailedLogin(req.ip || '127.0.0.1', req.user.email);
    return res.status(400).json({ error: 'Your current password is not correct.' });
  }

  const problem = validatePassword(newPassword);
  if (problem) return res.status(400).json({ error: problem });
  if (bcrypt.compareSync(newPassword, user.password_hash)) {
    return res.status(400).json({ error: 'The new password must be different from the current one.' });
  }

  await db.updateUserPassword(user.id, newPassword, { mustChange: false });
  const fresh = await db.getUserAuthState(user.id);

  await db.addAuditEntry({
    type: 'security',
    userId: user.id,
    userName: user.name,
    description: `${user.name} changed their password`,
  });

  res.json({ token: signToken(fresh), user: buildSessionUser(fresh) });
}));

// ---------------- Protected Business Endpoints ----------------

// Analytics (Dashboard)
app.get('/api/analytics', authMiddleware, requirePermission('dashboard.view'), asyncHandler(async (req, res) => {
  const stats = await db.getAnalytics(leadScope(req));
  res.json(stats);
}));

// Export Leads CSV - STRICTLY RESTRICTED to Administrator
app.get('/api/leads/export', authMiddleware, requirePermission('leads.export'), asyncHandler(async (req, res) => {
  const { status, category, branch, search, scope } = req.query;

  const filterOptions = scope === 'all' ? {} : {
    status: (status && status !== 'all' && status !== 'All Stages') ? status : undefined,
    category: (category && category !== 'all' && category !== 'All Categories') ? category : undefined,
    branch: (branch && branch !== 'all' && branch !== 'All Oman Branches') ? branch : undefined,
    search: (search && search.trim()) ? search.trim() : undefined,
  };

  const leads = await db.getLeads({ ...filterOptions, ...leadScope(req) });

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
      description: `CONFIDENTIAL EXPORT: ${req.user.name} (${req.user.email}) exported ${leads.length} leads to CSV (Scope: ${scope === 'all' ? 'All Records' : 'Filtered View'})`,
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
app.get('/api/leads', authMiddleware, requirePermission('leads.view_all', 'leads.view_dept', 'leads.view_own'), asyncHandler(async (req, res) => {
  const { status, category, branch, search } = req.query;
  const leads = await db.getLeads({ status, category, branch, search, ...leadScope(req) });
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

// Duplicate check while typing a new enquiry: same mobile (last 8 digits) in open leads or customers
app.get('/api/leads/check-duplicate', authMiddleware, requirePermission('leads.create', 'leads.update'), asyncHandler(async (req, res) => {
  const digits = String(req.query.mobile || '').replace(/\D/g, '');
  if (digits.length < 7) return res.json({ leads: [], customers: [] });
  const tail = digits.slice(-8);
  const exclude = parseInt(req.query.excludeId, 10) || 0;
  const [leads, customers] = await Promise.all([
    dbQuery(
      `SELECT id, name, status, salesman_name, created_at, salesman_id, lead_segment(branch_id, salesman_id, branch_name) AS seg FROM leads
       WHERE archived_at IS NULL AND id <> $2 AND right(regexp_replace(coalesce(mobile, phone, ''), '\\D', '', 'g'), 8) = $1
       ORDER BY created_at DESC LIMIT 5`, [tail, exclude]),
    dbQuery(
      `SELECT c.id, c.name, s.name AS salesman, s.id AS salesman_id, s.type AS stype FROM customers c LEFT JOIN salesmen s ON s.id = c.salesman_id
       WHERE c.archived_at IS NULL AND right(regexp_replace(coalesce(c.mobile, ''), '\\D', '', 'g'), 8) = $1 LIMIT 5`, [tail]),
  ]);
  // Outside your own scope you only learn that the number exists elsewhere, not whose it is
  const scope = dataScope(req.user);
  const seeLead = (r) => (scope.segment ? r.seg === scope.segment : scope.salesmanId !== undefined ? String(r.salesman_id) === String(scope.salesmanId) : true);
  const seeCust = (r) => (scope.segment ? r.stype === (scope.segment === 'b2b' ? 'route_b2b' : 'branch') : scope.salesmanId !== undefined ? String(r.salesman_id) === String(scope.salesmanId) : true);
  res.json({
    leads: leads.rows.map((r) => (seeLead(r)
      ? { id: String(r.id), name: r.name, status: r.status, salesman: r.salesman_name || '', date: r.created_at }
      : { id: null, name: 'Already an enquiry in another department', status: r.status, salesman: '', date: r.created_at, hidden: true })),
    customers: customers.rows.map((r) => (seeCust(r)
      ? { id: String(r.id), name: r.name, salesman: r.salesman || '' }
      : { id: null, name: 'Already a customer of another department', salesman: '', hidden: true })),
  });
}));

app.get('/api/leads/:id', authMiddleware, requirePermission('leads.view_all', 'leads.view_dept', 'leads.view_own'), asyncHandler(async (req, res) => {
  const lead = await loadLeadForUser(req, req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  res.json(lead);
}));

app.post('/api/leads', authMiddleware, requirePermission('leads.create'), asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ error: 'Company or Client Name must be at least 2 characters long.' });
  }
  const input = withoutAssignmentFields(req, req.body);
  if (isOwnScopeOnly(req.user)) {
    // A salesman's new enquiry is always assigned to himself
    if (!req.user.salesmanId) {
      return res.status(403).json({ error: 'Your login is not linked to a salesman record. Please contact your administrator.' });
    }
    const me = await db.getSalesmanById(req.user.salesmanId);
    input.salesmanId = req.user.salesmanId;
    input.salesman = me?.name || req.user.name;
    if (me?.branchId) input.branchId = me.branchId;
  }
  const mySeg = segmentOf(req.user);
  if (mySeg && (await segmentAfter(input)) !== mySeg) {
    return res.status(400).json({ error: outsideDept(mySeg), code: 'OUTSIDE_DEPARTMENT' });
  }
  const created = await db.createLead(input);
  if (created?.salesmanId) {
    const ids = (await usersForSalesman(created.salesmanId)).filter((x) => String(x) !== String(req.user.id));
    await notify(ids, { kind: 'lead', title: `New lead for you: ${created.name}`, body: `${created.category || ''}${created.customerLocation ? ` · ${created.customerLocation}` : ''}`, link: 'leads' });
    if (!isOwnScopeOnly(req.user)) await alertLeadAssigned(created.id, req.user).catch((e) => console.error('[whatsapp]', e.message));
  }
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

app.patch('/api/leads/:id', authMiddleware, requirePermission('leads.update'), asyncHandler(async (req, res) => {
  const prev = await loadLeadForUser(req, req.params.id);
  if (!prev) return res.status(404).json({ error: 'Lead not found' });

  // A lost deal must say why (so the business can see why it loses)
  if (req.body.status === 'lost' && prev.status !== 'lost' && !String(req.body.lostReason || '').trim()) {
    return res.status(400).json({ error: 'Choose the reason this deal was lost.', code: 'LOST_REASON_REQUIRED' });
  }
  if (req.body.lostReason !== undefined) req.body.lostReason = String(req.body.lostReason || '').trim().slice(0, 255);

  const changes = withoutAssignmentFields(req, req.body);
  const mySeg = segmentOf(req.user);
  if (mySeg && ASSIGNMENT_FIELDS.some((f) => f in changes) && (await segmentAfter(changes, prev)) !== mySeg) {
    return res.status(400).json({ error: outsideDept(mySeg), code: 'OUTSIDE_DEPARTMENT' });
  }
  const updated = await db.updateLead(req.params.id, changes, { changedBy: req.user.name });
  if (!updated) return res.status(404).json({ error: 'Lead not found' });

  if (updated.salesmanId && String(updated.salesmanId) !== String(prev.salesmanId || '')) {
    const ids = (await usersForSalesman(updated.salesmanId)).filter((x) => String(x) !== String(req.user.id));
    await notify(ids, { kind: 'lead', title: `${req.user.name} assigned you a lead: ${updated.name}`, body: updated.category || '', link: 'leads' });
    await alertLeadAssigned(updated.id, req.user).catch((e) => console.error('[whatsapp]', e.message));
  }
  if (req.body.status === 'won' && prev.status !== 'won') {
    const seg = await db.getLeadSegment(updated.id);
    const deptRole = seg === 'b2b' ? 'b2b_manager' : seg === 'retail' ? 'retail_manager' : null;
    const dept = deptRole ? (await dbQuery('SELECT id FROM users WHERE role = $1 AND archived_at IS NULL AND is_active', [deptRole])).rows.map((r) => r.id) : [];
    const ids = [...new Set([...(await managerIds()), ...dept])].filter((x) => String(x) !== String(req.user.id));
    await notify(ids, { kind: 'won', title: `Deal won: ${updated.name}`, body: `${Number(updated.dealValue || 0) ? `OMR ${Number(updated.dealValue).toLocaleString('en-US', { maximumFractionDigits: 3 })} · ` : ''}by ${req.user.name}`, link: 'leads' });
  }
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
app.delete('/api/leads/purge-all', authMiddleware, requirePermission('leads.purge'), asyncHandler(async (req, res) => {
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

app.delete('/api/leads/:id', authMiddleware, requirePermission('leads.archive'), asyncHandler(async (req, res) => {
  if (req.params.id === 'purge-all') return;
  const lead = await loadLeadForUser(req, req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  const success = await db.deleteLead(req.params.id);
  if (!success) return res.status(404).json({ error: 'Lead not found' });
  await db.addActivity({
    leadId: req.params.id,
    leadName: lead?.name || '',
    type: 'status_change',
    description: `Lead archived by ${req.user.name}`,
  });
  res.json({ message: 'Lead deleted successfully' });
}));

// Parse uploaded Leads CSV content for preview before committing
app.post('/api/leads/parse-csv', authMiddleware, requirePermission('leads.import'), largeJsonParser, asyncHandler(async (req, res) => {
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
app.post('/api/leads/bulk-import', authMiddleware, requirePermission('leads.import'), largeJsonParser, asyncHandler(async (req, res) => {
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

// One lead's history (notes, calls, stage changes)
app.get('/api/leads/:id/timeline', authMiddleware, requirePermission('leads.view_all', 'leads.view_dept', 'leads.view_own'), asyncHandler(async (req, res) => {
  const lead = await loadLeadForUser(req, req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  res.json(await db.getLeadTimeline(lead.id));
}));

// Monthly sales targets per salesman (view: managers and super admin; edit: settings)
app.get('/api/sales-targets', authMiddleware, requirePermission('customers.view'), asyncHandler(async (req, res) => {
  const result = await db.getTargets(req.query.month);
  const seg = segmentOf(req.user);
  if (seg && Array.isArray(result?.rows)) {
    const keep = new Set((await db.getSalesmen()).filter((x) => x.type === (seg === 'b2b' ? 'route_b2b' : 'branch')).map((x) => String(x.id)));
    result.rows = result.rows.filter((r) => keep.has(String(r.salesmanId)));
  }
  res.json(result);
}));
app.put('/api/sales-targets', authMiddleware, requirePermission('settings.manage'), asyncHandler(async (req, res) => {
  const { month, targets } = req.body || {};
  if (!Array.isArray(targets)) return res.status(400).json({ error: 'Send a list of targets.' });
  const result = await db.setTargets(month, targets);
  await db.addAuditEntry({ type: 'settings', userId: req.user.id, userName: req.user.name, description: `Sales targets for ${result.month} updated by ${req.user.email}` });
  res.json(result);
}));

app.post('/api/leads/:id/activity', authMiddleware, requirePermission('leads.update'), asyncHandler(async (req, res) => {
  const lead = await loadLeadForUser(req, req.params.id);
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
app.get('/api/products', authMiddleware, requirePermission('products.view'), asyncHandler(async (req, res) => {
  const { category, brand, search } = req.query;
  const products = await db.getProducts({ category, brand, search });
  res.json(products);
}));

app.post('/api/products', authMiddleware, requirePermission('products.manage'), asyncHandler(async (req, res) => {
  const product = await db.createProduct(req.body);
  res.status(201).json(product);
}));

app.patch('/api/products/:id', authMiddleware, requirePermission('products.manage'), asyncHandler(async (req, res) => {
  const updated = await db.updateProduct(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Product not found' });
  res.json(updated);
}));

app.delete('/api/products/:id', authMiddleware, requirePermission('products.manage'), asyncHandler(async (req, res) => {
  const ok = await db.deleteProduct(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Product not found' });
  await db.addActivity({
    type: 'product_delete',
    description: `Product deleted (ID: ${req.params.id}) by ${req.user.name}`,
  });
  res.json({ message: 'Product deleted' });
}));

// Bulk Delete Products
app.post('/api/products/bulk-delete', authMiddleware, requirePermission('products.manage'), asyncHandler(async (req, res) => {
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
app.get('/api/products/template', authMiddleware, requirePermission('products.manage'), asyncHandler(async (req, res) => {
  const csvContent = generateProductTemplate();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=monipack_product_catalog_template.csv');
  res.send(csvContent);
}));

// Parse uploaded product CSV content with Variance Analysis
app.post('/api/products/parse-csv', authMiddleware, requirePermission('products.manage'), largeJsonParser, asyncHandler(async (req, res) => {
  const csvData = req.body.csvData || req.body.csvContent;
  if (!csvData) return res.status(400).json({ error: 'No product CSV data provided' });

  const existingProducts = await db.getProducts();
  const result = parseUniversalProductData(csvData, existingProducts);

  res.json(result);
}));

// Bulk Import Products into Catalog
app.post('/api/products/bulk-import', authMiddleware, requirePermission('products.manage'), largeJsonParser, asyncHandler(async (req, res) => {
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
app.get('/api/quotations', authMiddleware, requirePermission('quotations.view'), asyncHandler(async (req, res) => {
  const quotes = await db.getQuotations(leadScope(req));
  res.json(quotes);
}));

app.get('/api/quotations/:id', authMiddleware, requirePermission('quotations.view'), asyncHandler(async (req, res) => {
  const quote = await db.getQuotationById(req.params.id);
  if (!quote || !(await canUseQuotation(req, quote))) return res.status(404).json({ error: 'Quotation not found' });
  res.json(quote);
}));

// A salesman may only work on quotations that belong to his own enquiries
async function canUseQuotation(req, quote) {
  if (!isOwnScopeOnly(req.user) && !segmentOf(req.user)) return true;
  if (!quote.leadId) return false;
  return Boolean(await loadLeadForUser(req, quote.leadId));
}

app.post('/api/quotations', authMiddleware, requirePermission('quotations.create'), asyncHandler(async (req, res) => {
  if (isOwnScopeOnly(req.user)) {
    if (!req.body.leadId || !(await loadLeadForUser(req, req.body.leadId))) {
      return res.status(403).json({ error: 'You can only create quotations for your own enquiries.' });
    }
  }
  if (segmentOf(req.user) && (!req.body.leadId || !(await loadLeadForUser(req, req.body.leadId)))) {
    return res.status(403).json({ error: 'Link the quotation to an enquiry in your department.' });
  }
  if (!req.body.customerName || typeof req.body.customerName !== 'string' || !req.body.customerName.trim()) {
    return res.status(400).json({ error: 'Customer or Business Name is required for quotation.' });
  }
  if (req.body.items && !Array.isArray(req.body.items)) {
    return res.status(400).json({ error: 'Quotation items must be provided as an array.' });
  }
  const quote = await db.createQuotation(req.body, { changedBy: req.user.name });
  // Remember who prepared it (for the quotation figures on Home → Money)
  await dbQuery('UPDATE quotations SET created_by_user_id = $1 WHERE id = $2', [req.user.id, quote.id]).catch(() => {});
  await db.addActivity({
    leadId: quote.leadId,
    leadName: quote.customerName,
    type: 'quotation',
    description: `Generated quotation ${quote.code} for OMR ${Number(quote.grandTotalOMR).toFixed(3)} by ${req.user.name}`,
  });
  // Into the pipeline: link or create its lead, follow-up in 2 days
  let flow = {};
  try { flow = await quotePipe.afterCreate(quote, req.user); } catch (e) { console.error('[quote pipeline]', e.message); }
  const fresh = (await db.getQuotationById(quote.id)) || quote;
  res.status(201).json({ ...fresh, leadCreated: Boolean(flow.leadCreated) });
}));

app.put('/api/quotations/:id', authMiddleware, requirePermission('quotations.update'), asyncHandler(async (req, res) => {
  const existing = await db.getQuotationById(req.params.id);
  if (!existing || !(await canUseQuotation(req, existing))) return res.status(404).json({ error: 'Quotation not found' });
  if ((isOwnScopeOnly(req.user) || segmentOf(req.user)) && req.body.leadId && !(await loadLeadForUser(req, req.body.leadId))) {
    return res.status(403).json({ error: 'You can only link quotations to your own enquiries.' });
  }
  const updated = await db.updateQuotation(req.params.id, req.body, { changedBy: req.user.name });
  if (!updated) return res.status(404).json({ error: 'Quotation not found' });
  await db.addActivity({
    type: 'quotation',
    description: `Quotation "${updated.code}" updated by ${req.user.name}`,
  });
  // Revised after sending → lead to Sample & Negotiation (and make sure it has a lead)
  try { await quotePipe.afterUpdate(existing, updated, req.user); } catch (e) { console.error('[quote pipeline]', e.message); }
  res.json((await db.getQuotationById(updated.id)) || updated);
}));

// Quotation status: draft / sent / accepted / rejected (expired is shown from date + validity)
app.post('/api/quotations/:id/status', authMiddleware, requirePermission('quotations.status'), asyncHandler(async (req, res) => {
  const existing = await db.getQuotationById(req.params.id);
  if (!existing || !(await canUseQuotation(req, existing))) return res.status(404).json({ error: 'Quotation not found' });
  const status = String(req.body?.status || '');
  if (!['draft', 'sent', 'accepted', 'rejected'].includes(status)) return res.status(400).json({ error: 'Unknown quotation status.' });
  const reason = String(req.body?.reason || '').trim();
  if (status === 'rejected' && !reason) return res.status(400).json({ error: 'Say why the customer rejected the quotation.' });
  // Accepted → lead Won; Rejected → lead Lost with the same reason (automatic)
  const out = await db.setQuotationStatus(existing.id, status, { reason, markLeadWon: status === 'accepted', changedBy: req.user.name });
  if (!out) return res.status(404).json({ error: 'Quotation not found' });
  if (status === 'rejected') {
    try { out.leadLost = await quotePipe.afterRejected(existing, reason, req.user); } catch (e) { console.error('[quote pipeline]', e.message); }
  }
  await db.addActivity({ leadId: existing.leadId || null, type: 'quotation', description: `Quotation "${existing.code}" marked ${status}${reason ? ` (${reason})` : ''} by ${req.user.name}${out.leadWon ? '; lead marked Won' : ''}${out.leadLost ? '; lead marked Lost' : ''}` });
  if (status === 'accepted') {
    const ids = (await managerIds()).filter((x) => String(x) !== String(req.user.id));
    await notify(ids, { kind: 'won', title: `Quotation accepted: ${existing.code} · ${existing.customerName}`, body: `OMR ${Number(existing.grandTotalOMR || 0).toLocaleString('en-US', { maximumFractionDigits: 3 })} · by ${req.user.name}`, link: 'quotations' });
  }
  res.json(out);
}));

// One-time fix: give every old quotation without a lead its lead (super admin)
app.post('/api/quotation-orphans/link', authMiddleware, superAdminOnly, asyncHandler(async (req, res) => {
  const r = await quotePipe.linkOrphans(req.user);
  await userAudit(req, `Linked ${r.linked} old quotations to leads (${r.created} new leads)`);
  res.json(r);
}));
app.get('/api/quotation-orphans', authMiddleware, requirePermission('quotations.view'), asyncHandler(async (req, res) => {
  const { rows } = await dbQuery('SELECT COUNT(*) AS c FROM quotations WHERE archived_at IS NULL AND lead_id IS NULL');
  res.json({ count: Number(rows[0].c) });
}));

app.delete('/api/quotations/:id', authMiddleware, requirePermission('quotations.archive'), asyncHandler(async (req, res) => {
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
app.get('/api/settings', authMiddleware, requirePermission('settings.manage'), asyncHandler(async (req, res) => {
  const settings = await db.getSettings();
  res.json(settings);
}));

// Update Settings
// Company details printed on quotations (any signed-in user; no system settings)
app.get('/api/company', authMiddleware, asyncHandler(async (req, res) => {
  const st = await db.getSettings();
  const pick = ['companyName', 'companyNameAr', 'brandName', 'website', 'phone', 'email', 'headquarters', 'poBox',
    'crNumber', 'vatNumber', 'bankName', 'bankAccountName', 'bankAccountNumber', 'iban'];
  res.json(Object.fromEntries(pick.map((k) => [k, st[k] || ''])));
}));

app.patch('/api/settings', authMiddleware, requirePermission('settings.manage'), asyncHandler(async (req, res) => {
  const updated = await db.updateSettings(req.body);
  await db.addActivity({
    type: 'settings',
    description: `System settings updated by Administrator (${req.user.email})`,
  });
  res.json(updated);
}));

// Download System Backup Snapshot (Super Admin Only)
app.get('/api/backup', authMiddleware, requirePermission('backup.download'), asyncHandler(async (req, res) => {
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

// ---------------- User Management (Super Admin) ----------------

const userAudit = (req, description) => db.addAuditEntry({
  type: 'security',
  userId: req.user.id,
  userName: req.user.name,
  description,
});

// Validate role + salesman link; returns an error message or null
async function checkRoleAndSalesman(role, salesmanId) {
  if (!role || !ROLES.includes(role)) return `Role must be one of: ${ROLES.join(', ')}.`;
  if (role === 'salesman') {
    if (!salesmanId) return 'Choose which salesman record this login belongs to.';
    const sm = await db.getSalesmanById(salesmanId);
    if (!sm) return 'The selected salesman was not found.';
  }
  return null;
}

app.get('/api/users', authMiddleware, requirePermission('users.manage'), asyncHandler(async (req, res) => {
  res.json(await db.getUsers());
}));

// Salesmen list (for linking logins and for assignment)
app.get('/api/salesmen', authMiddleware, requirePermission('users.manage', 'leads.assign', 'customers.view'), asyncHandler(async (req, res) => {
  const seg = segmentOf(req.user);
  const list = await db.getSalesmen();
  res.json(seg ? list.filter((x) => x.type === (seg === 'b2b' ? 'route_b2b' : 'branch')) : list);
}));

app.post('/api/users', authMiddleware, requirePermission('users.manage'), asyncHandler(async (req, res) => {
  const { name, email, password, salesmanId, canExport } = req.body || {};
  const role = normalizeRole(req.body?.role);
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and a temporary password are required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  const pwProblem = validatePassword(password);
  if (pwProblem) return res.status(400).json({ error: pwProblem });
  const roleProblem = await checkRoleAndSalesman(role, salesmanId);
  if (roleProblem) return res.status(400).json({ error: roleProblem });
  if (await db.getUserByEmail(email)) {
    return res.status(409).json({ error: 'A user with this email already exists.' });
  }

  let created;
  try {
    created = await db.createUser({
      name: String(name).trim(),
      email,
      password,
      role,
      salesmanId,
      canExport: role === 'super_admin' ? true : Boolean(canExport),
      mustChangePassword: true,
      phone: req.body?.phone,
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'This salesman already has a login.' });
    }
    throw err;
  }
  await userAudit(req, `User created: ${created.name} <${created.email}> as ${created.role}`);
  res.status(201).json(created);
}));

app.patch('/api/users/:id', authMiddleware, requirePermission('users.manage'), asyncHandler(async (req, res) => {
  const target = await db.getPublicUserById(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found.' });

  const body = req.body || {};
  const nextRole = body.role !== undefined ? normalizeRole(body.role) : target.role;
  const nextActive = body.isActive !== undefined ? Boolean(body.isActive) : target.isActive;
  const nextSalesmanId = body.salesmanId !== undefined ? body.salesmanId : target.salesmanId;
  const isSelf = String(target.id) === String(req.user.id);

  if (isSelf && (nextRole !== target.role || nextActive === false)) {
    return res.status(400).json({ error: 'You cannot change your own role or deactivate your own account.' });
  }
  const roleProblem = await checkRoleAndSalesman(nextRole, nextSalesmanId);
  if (roleProblem) return res.status(400).json({ error: roleProblem });
  if (target.role === 'super_admin' && target.isActive && (nextRole !== 'super_admin' || !nextActive)) {
    if ((await db.countActiveSuperAdmins(target.id)) === 0) {
      return res.status(400).json({ error: 'At least one active Super Admin must remain.' });
    }
  }

  let updated;
  try {
    updated = await db.updateUser(target.id, {
      name: body.name,
      phone: body.phone,
      role: nextRole,
      isActive: nextActive,
      canExport: body.canExport,
      salesmanId: nextSalesmanId,
    });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'This salesman already has a login.' });
    throw err;
  }

  const changes = [];
  if (updated.role !== target.role) changes.push(`role ${target.role} -> ${updated.role}`);
  if (updated.isActive !== target.isActive) changes.push(updated.isActive ? 'reactivated' : 'deactivated');
  if (updated.canExport !== target.canExport) changes.push(`export ${updated.canExport ? 'allowed' : 'removed'}`);
  if (updated.salesmanId !== target.salesmanId) changes.push('linked salesman changed');
  if (changes.length) await userAudit(req, `User ${updated.email}: ${changes.join(', ')}`);
  if (updated.role !== target.role || !updated.isActive) await revokeUserLinks(updated.id);
  res.json(updated);
}));

// Kept for the existing screen: "delete" now deactivates (history stays intact)
app.delete('/api/users/:id', authMiddleware, requirePermission('users.manage'), asyncHandler(async (req, res) => {
  const target = await db.getPublicUserById(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (String(target.id) === String(req.user.id)) {
    return res.status(400).json({ error: 'You cannot deactivate your own account.' });
  }
  if (target.role === 'super_admin' && target.isActive && (await db.countActiveSuperAdmins(target.id)) === 0) {
    return res.status(400).json({ error: 'At least one active Super Admin must remain.' });
  }
  await db.deactivateUser(target.id);
  await revokeUserLinks(target.id);
  await userAudit(req, `User deactivated: ${target.email}`);
  res.json({ message: 'User deactivated successfully' });
}));

// Admin sets a temporary password: the user must change it at next login, old sessions end
app.patch('/api/users/:id/password', authMiddleware, requirePermission('users.manage'), asyncHandler(async (req, res) => {
  const { password } = req.body || {};
  const problem = validatePassword(password);
  if (problem) return res.status(400).json({ error: problem });
  const updated = await db.updateUserPassword(req.params.id, password, { mustChange: true });
  if (!updated) return res.status(404).json({ error: 'User not found.' });
  await userAudit(req, `Temporary password set for ${updated.email}`);
  res.json({ message: 'Temporary password set. The user must change it at next login.', user: updated });
}));

// ---------------- Global App Config (Categories, Stages, Branches) ----------------

app.get('/api/config', authMiddleware, asyncHandler(async (req, res) => {
  const [categories, pipelineStages, branches] = await Promise.all([
    db.getCategories(),
    db.getPipelineStages(),
    db.getBranches(),
  ]);
  const seg = segmentOf(req.user);
  res.json({ categories, pipelineStages, branches: seg ? branches.filter((b) => b.type === seg) : branches });
}));

// Oman Branches List with per-rep lead counts
app.get('/api/branches', authMiddleware, requirePermission('branches.view'), asyncHandler(async (req, res) => {
  const seg = segmentOf(req.user);
  const branches = (await db.getBranches()).filter((b) => !seg || b.type === seg);
  const leads = await db.getLeads(leadScope(req));

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
app.get('/api/audit-logs', authMiddleware, requirePermission('audit.view'), asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const logs = await db.getAuditLogs(limit);
  res.json(logs);
}));

// Category Management (Super Admin Only)
app.post('/api/settings/categories', authMiddleware, requirePermission('settings.manage'), asyncHandler(async (req, res) => {
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

app.delete('/api/settings/categories/:name', authMiddleware, requirePermission('settings.manage'), asyncHandler(async (req, res) => {
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
app.post('/api/settings/stages', authMiddleware, requirePermission('settings.manage'), asyncHandler(async (req, res) => {
  const { id, label, color } = req.body;
  if (!label) return res.status(400).json({ error: 'Stage label is required.' });
  const stage = await db.addPipelineStage({ id, label, color });
  await db.addActivity({
    type: 'settings',
    description: `New pipeline stage created: "${label}" by Administrator`,
  });
  res.status(201).json(stage);
}));

app.delete('/api/settings/stages/:id', authMiddleware, requirePermission('settings.manage'), asyncHandler(async (req, res) => {
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
app.post('/api/settings/branches', authMiddleware, requirePermission('settings.manage'), superAdminOnly, asyncHandler(async (req, res) => {
  const { name, city, phone, salesman, isHeadquarters, type } = req.body;
  if (!name) return res.status(400).json({ error: 'Branch name is required.' });
  if (!['retail', 'b2b'].includes(type)) return res.status(400).json({ error: 'Choose Retail or B2B for the branch.' });
  const branch = await db.addBranch({ name, city, phone, salesman, isHeadquarters, type });
  await db.addActivity({
    type: 'settings',
    description: `New branch created: "${name}" (Salesman: ${salesman || 'Unassigned'}) by Administrator`,
  });
  res.status(201).json(branch);
}));

app.patch('/api/settings/branches/:id', authMiddleware, requirePermission('settings.manage'), superAdminOnly, asyncHandler(async (req, res) => {
  if (req.body.type !== undefined && !['retail', 'b2b'].includes(req.body.type)) return res.status(400).json({ error: 'Choose Retail or B2B for the branch.' });
  const updated = await db.updateBranch(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Branch not found' });
  await db.addActivity({
    type: 'settings',
    description: `Branch "${updated.name}" updated (Salesman: ${updated.salesman}) by Administrator`,
  });
  res.json(updated);
}));

app.delete('/api/settings/branches/:id', authMiddleware, requirePermission('settings.manage'), superAdminOnly, asyncHandler(async (req, res) => {
  const ok = await db.deleteBranch(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Branch not found' });
  await db.addActivity({
    type: 'settings',
    description: `Branch removed (ID: ${req.params.id}) by Administrator`,
  });
  res.json({ message: 'Branch deleted successfully' });
}));

// ---- Profile photos ----
registerWhatsAppRoutes(app, { authMiddleware, requirePermission, asyncHandler, linkLimiter: viewLimiter });
registerReportRoutes(app, { authMiddleware, requirePermission, asyncHandler, audit: (req, d) => db.addAuditEntry({ type: 'export', userId: req.user.id, userName: req.user.name, description: `${d} by ${req.user.email}` }) });
registerPhotoRoutes(app, { authMiddleware, asyncHandler, photoJsonParser: (req, res, next) => next() });

// ---- Customer Data Collection (salesman links + admin) ----
registerCustomerRoutes(app, { authMiddleware, requirePermission, asyncHandler, largeJsonParser, JWT_SECRET, db });
registerCleanupRoutes(app, { authMiddleware, asyncHandler, db });
registerTaskRoutes(app, { authMiddleware, requirePermission, asyncHandler, db });
registerVaultRoutes(app, { authMiddleware, asyncHandler, JWT_SECRET });
registerTwoFactorRoutes(app, { authMiddleware, asyncHandler, db, JWT_SECRET, signToken, buildSessionUser });
registerBackupRoutes(app, { authMiddleware, asyncHandler });
registerNotificationRoutes(app, { authMiddleware, asyncHandler });
startBackupSchedule();

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
  quotePipe.startExpiryJob(); // hourly: expired quotations with no answer → "call the customer" task
  server = app.listen(PORT, process.env.HOST || '0.0.0.0', () => {
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
