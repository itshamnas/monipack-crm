/**
 * Customer Data Collection routes.
 *  - /api/link/:token/...  public pages for salesmen (secret link, optional PIN)
 *  - /api/customers...      admin dashboard, import, review, files (login + permissions)
 */
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import * as cdb from '../db/customers.js';
import {
  validateSubmission, statusAfterSubmit, parseCustomerImport, detectFileType, jpegsToPdf, completeness,
  FILE_LABELS, MAX_FILE_BYTES, SALESMAN_TYPES,
} from './logic.js';
import { saveFile, readFile } from './storage.js';

const LINK_SESSION_HOURS = 12;
const UPLOAD_WINDOW_MINUTES = 60; // salesman may add photos this long after submitting

const tokenHash = (token) => crypto.createHash('sha256').update(String(token)).digest('hex').slice(0, 24);

// ---- simple in-memory limits for the public link pages ----
const hits = new Map(); // ip -> { count, resetAt }
const pinFails = new Map(); // token|ip -> { count, resetAt }
function rateLimited(map, key, max, windowMs) {
  const now = Date.now();
  const rec = map.get(key);
  if (!rec || now > rec.resetAt) { map.set(key, { count: 1, resetAt: now + windowMs }); return false; }
  rec.count++;
  return rec.count > max;
}
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const m of [hits, pinFails]) for (const [k, v] of m) if (now > v.resetAt) m.delete(k);
}, 10 * 60 * 1000);
if (cleanup.unref) cleanup.unref();

function decodeUpload(body) {
  const { base64, label, name } = body || {};
  if (!base64 || typeof base64 !== 'string') return { error: 'No file received.' };
  if (!FILE_LABELS.includes(label)) return { error: 'Choose what this document is (CR, VAT, shop front or other).' };
  const buf = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (!buf.length) return { error: 'The file is empty.' };
  if (buf.length > MAX_FILE_BYTES) return { error: 'The file is larger than 10 MB.' };
  const type = detectFileType(buf);
  if (!type) return { error: 'Only photos (JPG) and PDF files are accepted.' };
  return { buf, type, label, name: typeof name === 'string' ? name : null };
}

async function storeUpload(customerId, decoded, uploadedVia) {
  const ext = decoded.type === 'jpeg' ? 'jpg' : 'pdf';
  const key = saveFile(decoded.buf, ext);
  return cdb.addFile({
    customerId,
    label: decoded.label,
    storageKey: key,
    originalName: decoded.name,
    mime: decoded.type === 'jpeg' ? 'image/jpeg' : 'application/pdf',
    sizeBytes: decoded.buf.length,
    uploadedVia,
  });
}

/** After photos change, a submitted customer may become complete (pending stays pending). */
async function refreshStatus(customerId) {
  const row = await cdb.getCustomerRow(customerId);
  if (!row || !['submitted', 'complete'].includes(row.status)) return row;
  const fields = await cdb.getCustomerFields({ includeHidden: false });
  const c = cdb.customerToApi(row);
  const next = statusAfterSubmit(c, fields, c.salesmanType || 'branch');
  return next === row.status ? row : cdb.setCustomerStatus(customerId, next);
}

const safeName = (s) => String(s || 'customer').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'customer';

export function registerCustomerRoutes(app, { authMiddleware, requirePermission, asyncHandler, largeJsonParser, JWT_SECRET, db }) {
  // =============== PUBLIC: salesman link pages ===============

  const linkGuard = (req, res, next) => {
    if (rateLimited(hits, req.ip || 'unknown', 240, 60 * 1000)) {
      return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
    }
    next();
  };

  const loadLinkSalesman = asyncHandler(async (req, res, next) => {
    const sm = await cdb.getSalesmanForLink(req.params.token);
    if (!sm) return res.status(404).json({ error: 'This link is not valid or has been switched off. Please ask your administrator.' });
    req.linkSalesman = sm;
    next();
  });

  // Requires the session issued by POST /session (proves the PIN when one is set)
  const linkAuth = (req, res, next) => {
    const raw = req.headers['x-link-session'];
    try {
      const s = jwt.verify(String(raw || ''), JWT_SECRET);
      if (s.kind !== 'link' || String(s.sid) !== String(req.linkSalesman.id) || s.th !== tokenHash(req.params.token)) throw new Error('mismatch');
      return next();
    } catch {
      return res.status(401).json({ error: 'Please open your link again.', code: 'LINK_SESSION_REQUIRED' });
    }
  };

  const log = (req, event) => cdb.logLinkAccess(req.linkSalesman.id, event, req.ip, req.headers['user-agent']).catch(() => {});

  app.get('/api/link/:token', linkGuard, loadLinkSalesman, asyncHandler(async (req, res) => {
    await log(req, 'open');
    res.json({
      salesmanName: req.linkSalesman.name,
      salesmanType: req.linkSalesman.type,
      requiresPin: Boolean(req.linkSalesman.link_pin_hash),
    });
  }));

  app.post('/api/link/:token/session', linkGuard, loadLinkSalesman, asyncHandler(async (req, res) => {
    const sm = req.linkSalesman;
    if (sm.link_pin_hash) {
      const key = `${req.params.token}|${req.ip}`;
      const rec = pinFails.get(key);
      if (rec && Date.now() <= rec.resetAt && rec.count >= 5) {
        return res.status(429).json({ error: 'Too many wrong PINs. Please wait 15 minutes.' });
      }
      const pin = String(req.body?.pin || '');
      if (!pin || !bcrypt.compareSync(pin, sm.link_pin_hash)) {
        rateLimited(pinFails, key, 5, 15 * 60 * 1000);
        await log(req, 'pin_failed');
        return res.status(401).json({ error: 'Wrong PIN.' });
      }
      pinFails.delete(key);
    }
    await cdb.touchLinkUsed(sm.id);
    await log(req, 'session');
    const session = jwt.sign({ kind: 'link', sid: String(sm.id), th: tokenHash(req.params.token) }, JWT_SECRET, { expiresIn: `${LINK_SESSION_HOURS}h` });
    res.json({ session });
  }));

  app.get('/api/link/:token/fields', linkGuard, loadLinkSalesman, linkAuth, asyncHandler(async (req, res) => {
    res.json(await cdb.getCustomerFields({ includeHidden: false }));
  }));

  app.get('/api/link/:token/customers', linkGuard, loadLinkSalesman, linkAuth, asyncHandler(async (req, res) => {
    const all = await cdb.listCustomers({ salesmanId: req.linkSalesman.id });
    const remaining = all.filter((c) => c.status === 'not_started');
    const search = String(req.query.search || '').trim().toLowerCase();
    const shown = search
      ? remaining.filter((c) => c.name.toLowerCase().includes(search) || c.mobile.includes(search))
      : remaining;
    res.json({
      total: all.length,
      remaining: remaining.length,
      customers: shown.map((c) => ({
        id: c.id, name: c.name, mobile: c.mobile, crNumber: c.crNumber, vatNumber: c.vatNumber, data: c.data,
      })),
    });
  }));

  // Fill in a prefilled customer (only while it is still "not started")
  app.post('/api/link/:token/customers/:id/submit', linkGuard, loadLinkSalesman, linkAuth, asyncHandler(async (req, res) => {
    const sm = req.linkSalesman;
    const row = await cdb.getCustomerRow(req.params.id);
    if (!row || row.salesman_id !== sm.id) return res.status(404).json({ error: 'Customer not found.' });
    if (row.status !== 'not_started') return res.status(409).json({ error: 'This customer was already submitted. Ask the administrator to make changes.' });

    const fields = await cdb.getCustomerFields({ includeHidden: false });
    // Photos are uploaded right after this call, so the photo field is not required here
    const { errors, clean } = validateSubmission(req.body, fields.filter((f) => f.type !== 'photo'), { salesmanType: sm.type });
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please check the highlighted fields.', fields: errors });
    if (!clean.name) clean.name = row.name;

    const dups = await cdb.findDuplicates({ ...clean, excludeId: row.id });
    const candidate = { ...cdb.customerToApi(row), ...clean, photoCount: Number(row.photo_count || 0) };
    const status = dups.length ? 'pending_approval' : statusAfterSubmit(candidate, fields, sm.type);
    const saved = await cdb.saveCustomerValues(row.id, clean, {
      status, markSubmitted: true, reviewNote: dups.length ? cdb.duplicateNote(dups) : '',
    });
    await cdb.addSubmission(row.id, sm.id, { ...clean, submittedBy: sm.name, salesmanType: sm.type });
    await log(req, 'submit');
    res.json({
      customer: { id: String(saved.id), name: saved.name, status: saved.status },
      duplicate: dups.length > 0,
      message: dups.length
        ? 'Saved. This looks like an existing customer, so the administrator will review it.'
        : 'Saved. Thank you!',
    });
  }));

  // Salesman adds a customer who was not in his list -> waits for approval
  app.post('/api/link/:token/customers', linkGuard, loadLinkSalesman, linkAuth, asyncHandler(async (req, res) => {
    const sm = req.linkSalesman;
    const fields = await cdb.getCustomerFields({ includeHidden: false });
    const { errors, clean } = validateSubmission(req.body, fields.filter((f) => f.type !== 'photo'), { salesmanType: sm.type, requireName: true });
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please check the highlighted fields.', fields: errors });

    const dups = await cdb.findDuplicates({ ...clean });
    const created = await cdb.createCustomer({
      ...clean,
      salesmanId: sm.id,
      status: 'pending_approval',
      source: 'salesman',
      submittedAt: new Date(),
      reviewNote: dups.length ? cdb.duplicateNote(dups) : 'New customer added by salesman',
    });
    await cdb.addSubmission(created.id, sm.id, { ...clean, submittedBy: sm.name, salesmanType: sm.type, newCustomer: true });
    await log(req, 'new_customer');
    res.status(201).json({
      customer: { id: String(created.id), name: created.name, status: created.status },
      duplicate: dups.length > 0,
      message: 'New customer sent to the administrator for approval.',
    });
  }));

  // Photos / PDFs for a customer this salesman just submitted
  app.post('/api/link/:token/customers/:id/files', linkGuard, largeJsonParser, loadLinkSalesman, linkAuth, asyncHandler(async (req, res) => {
    const sm = req.linkSalesman;
    const row = await cdb.getCustomerRow(req.params.id);
    if (!row || row.salesman_id !== sm.id) return res.status(404).json({ error: 'Customer not found.' });
    const recent = row.submitted_at && (Date.now() - new Date(row.submitted_at).getTime()) < UPLOAD_WINDOW_MINUTES * 60 * 1000;
    if (row.status === 'not_started' || !recent) {
      return res.status(409).json({ error: 'Photos can only be added right after saving the customer.' });
    }
    const decoded = decodeUpload(req.body);
    if (decoded.error) return res.status(400).json({ error: decoded.error });
    const file = await storeUpload(row.id, decoded, 'link');
    await refreshStatus(row.id);
    await log(req, 'upload');
    res.status(201).json({ id: String(file.id), label: file.label });
  }));

  // =============== ADMIN (login required) ===============

  const audit = (req, description) => db.addAuditEntry({ type: 'customers', userId: req.user.id, userName: req.user.name, description }).catch(() => {});

  app.get('/api/customers/summary', authMiddleware, requirePermission('customers.view'), asyncHandler(async (req, res) => {
    const summary = await cdb.getSummary();
    // The dashboard never needs the secret link itself; only link managers get it (from /api/customer-links).
    summary.salesmen = summary.salesmen.map(({ linkToken, ...rest }) => rest);
    res.json(summary);
  }));

  app.get('/api/customers', authMiddleware, requirePermission('customers.view'), asyncHandler(async (req, res) => {
    const { salesmanId, status, search, missing } = req.query;
    let list = await cdb.listCustomers({ salesmanId, status, search });
    const fields = await cdb.getCustomerFields({ includeHidden: false });
    list = list.map((c) => ({ ...c, missing: completeness(c, fields, c.salesmanType || 'branch').missing }));
    if (missing) list = list.filter((c) => c.status !== 'not_started' && c.missing.includes(String(missing)));
    res.json(list);
  }));

  app.get('/api/customers/export', authMiddleware, requirePermission('customers.manage'), asyncHandler(async (req, res) => {
    const [list, fields] = await Promise.all([cdb.listCustomers({}), cdb.getCustomerFields({ includeHidden: false })]);
    const cell = (v) => {
      let s = v === undefined || v === null ? '' : String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula injection guard
      return `"${s.replace(/"/g, '""')}"`;
    };
    const dataFields = fields.filter((f) => !['mobile', 'cr_number', 'vat_number', 'photos'].includes(f.key) && f.type !== 'photo');
    const header = ['ID', 'Customer name', 'Salesman', 'Status', 'Mobile', 'CR number', 'No CR reason', 'VAT number',
      ...dataFields.map((f) => f.label), 'Photos', 'Submitted at'];
    const lines = list.map((c) => [
      c.id, c.name, c.salesmanName, c.status, c.mobile, c.noCr ? 'NO CR' : c.crNumber, c.noCrReason, c.vatNumber,
      ...dataFields.map((f) => c.data[f.key]), c.photoCount, c.submittedAt,
    ].map(cell).join(','));
    await audit(req, `Exported ${list.length} customers to CSV`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=monipack_customers_${new Date().toISOString().slice(0, 10)}.csv`);
    res.send('﻿' + [header.map(cell).join(','), ...lines].join('\r\n'));
  }));

  app.get('/api/customers/:id', authMiddleware, requirePermission('customers.view'), asyncHandler(async (req, res) => {
    const c = await cdb.getCustomer(req.params.id);
    if (!c) return res.status(404).json({ error: 'Customer not found.' });
    res.json(c);
  }));

  app.post('/api/customers', authMiddleware, requirePermission('customers.manage'), asyncHandler(async (req, res) => {
    const sm = req.body?.salesmanId ? await cdb.getSalesmanRow(req.body.salesmanId) : null;
    if (!sm) return res.status(400).json({ error: 'Choose the salesman for this customer.' });
    const fields = await cdb.getCustomerFields({ includeHidden: false });
    const { errors, clean } = validateSubmission(req.body, fields, { salesmanType: sm.type, requireName: true });
    // The admin only prefills: "required" problems are for the salesman to complete
    for (const k of Object.keys(errors)) if (/required|at least one photo/i.test(errors[k])) delete errors[k];
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please check the highlighted fields.', fields: errors });
    const created = await cdb.createCustomer({ ...clean, salesmanId: sm.id, status: 'not_started', source: 'admin', createdByUserId: req.user.id });
    await audit(req, `Customer added: ${created.name} (salesman ${sm.name})`);
    res.status(201).json(cdb.customerToApi(created));
  }));

  app.patch('/api/customers/:id', authMiddleware, requirePermission('customers.manage'), asyncHandler(async (req, res) => {
    const row = await cdb.getCustomerRow(req.params.id);
    if (!row) return res.status(404).json({ error: 'Customer not found.' });
    const fields = await cdb.getCustomerFields({ includeHidden: false });
    const type = row.salesman_type || 'branch';
    const { errors, clean } = validateSubmission({ name: row.name, ...req.body }, fields, {
      salesmanType: type, requireName: true, photoCount: Number(row.photo_count || 0),
    });
    const requiredProblems = Object.keys(errors).filter((k) => /required|at least one photo/i.test(errors[k]));
    if (row.status === 'not_started') requiredProblems.forEach((k) => delete errors[k]);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please check the highlighted fields.', fields: errors });

    let status;
    if (row.status === 'submitted' || row.status === 'complete') {
      status = statusAfterSubmit({ ...clean, photoCount: Number(row.photo_count || 0) }, fields, type);
    }
    const saved = await cdb.saveCustomerValues(row.id, clean, { status });
    await audit(req, `Customer edited: ${saved.name} (#${saved.id})`);
    res.json(cdb.customerToApi(saved));
  }));

  app.post('/api/customers/:id/approve', authMiddleware, requirePermission('customers.manage'), asyncHandler(async (req, res) => {
    const row = await cdb.getCustomerRow(req.params.id);
    if (!row) return res.status(404).json({ error: 'Customer not found.' });
    if (row.status !== 'pending_approval') return res.status(409).json({ error: 'This customer is not waiting for approval.' });
    const fields = await cdb.getCustomerFields({ includeHidden: false });
    const c = cdb.customerToApi(row);
    const status = statusAfterSubmit(c, fields, c.salesmanType || 'branch');
    const saved = await cdb.setCustomerStatus(row.id, status, { approvedByUserId: req.user.id });
    await audit(req, `Customer approved: ${saved.name} (#${saved.id})`);
    res.json(cdb.customerToApi(saved));
  }));

  app.post('/api/customers/transfer', authMiddleware, requirePermission('customers.manage'), asyncHandler(async (req, res) => {
    const { ids, toSalesmanId } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'Select at least one customer.' });
    const to = await cdb.getSalesmanRow(toSalesmanId);
    if (!to) return res.status(400).json({ error: 'Choose the salesman to transfer to.' });
    const moved = await cdb.transferCustomers(ids.slice(0, 5000), to.id, req.user.id);
    await audit(req, `Transferred ${moved} customer(s) to ${to.name}`);
    res.json({ moved });
  }));

  app.delete('/api/customers/:id', authMiddleware, requirePermission('customers.manage'), asyncHandler(async (req, res) => {
    const row = await cdb.getCustomerRow(req.params.id);
    if (!row || !(await cdb.archiveCustomer(row.id))) return res.status(404).json({ error: 'Customer not found.' });
    await audit(req, `Customer archived: ${row.name} (#${row.id})`);
    res.json({ message: 'Customer archived.' });
  }));

  app.post('/api/customers/import/parse', authMiddleware, requirePermission('customers.manage'), largeJsonParser, asyncHandler(async (req, res) => {
    const csv = req.body?.csvData;
    if (!csv || typeof csv !== 'string') return res.status(400).json({ error: 'No file content received.' });
    const [salesmen, fields] = await Promise.all([db.getSalesmen(), cdb.getCustomerFields()]);
    const result = parseCustomerImport(csv, { salesmen, fieldKeys: fields.map((f) => f.key) });
    res.json(result);
  }));

  app.post('/api/customers/import', authMiddleware, requirePermission('customers.manage'), largeJsonParser, asyncHandler(async (req, res) => {
    const rows = req.body?.rows;
    if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'Nothing to import.' });
    const result = await cdb.importCustomers(rows.slice(0, 20000), req.user.id);
    await audit(req, `Customer import: ${result.added} added, ${result.skippedDuplicate} duplicates skipped, ${result.skippedInvalid} invalid skipped`);
    res.json(result);
  }));

  // Admin can attach documents too
  app.post('/api/customers/:id/files', authMiddleware, requirePermission('customers.manage'), largeJsonParser, asyncHandler(async (req, res) => {
    const row = await cdb.getCustomerRow(req.params.id);
    if (!row) return res.status(404).json({ error: 'Customer not found.' });
    const decoded = decodeUpload(req.body);
    if (decoded.error) return res.status(400).json({ error: decoded.error });
    const file = await storeUpload(row.id, decoded, 'admin');
    await refreshStatus(row.id);
    res.status(201).json({ id: String(file.id), label: file.label });
  }));

  // Original file exactly as uploaded
  app.get('/api/customers/:id/files/:fileId', authMiddleware, requirePermission('customers.view'), asyncHandler(async (req, res) => {
    const f = await cdb.getFile(req.params.id, req.params.fileId);
    if (!f) return res.status(404).json({ error: 'File not found.' });
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Content-Disposition', `inline; filename="${safeName(f.original_name || f.label)}.${f.mime === 'application/pdf' ? 'pdf' : 'jpg'}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(readFile(f.storage_key));
  }));

  // One document as PDF (photos converted, PDFs as uploaded)
  app.get('/api/customers/:id/files/:fileId/pdf', authMiddleware, requirePermission('customers.view'), asyncHandler(async (req, res) => {
    const f = await cdb.getFile(req.params.id, req.params.fileId);
    if (!f) return res.status(404).json({ error: 'File not found.' });
    const row = await cdb.getCustomerRow(req.params.id);
    const bytes = readFile(f.storage_key);
    const pdf = f.mime === 'application/pdf' ? bytes : jpegsToPdf([bytes], { title: `${row?.name || 'Customer'} - ${f.label}` });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName(row?.name)}_${f.label}.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store');
    await audit(req, `Downloaded ${f.label} PDF for customer #${req.params.id}`);
    res.send(pdf);
  }));

  // All photos of a customer in one PDF
  app.get('/api/customers/:id/documents.pdf', authMiddleware, requirePermission('customers.view'), asyncHandler(async (req, res) => {
    const row = await cdb.getCustomerRow(req.params.id);
    if (!row) return res.status(404).json({ error: 'Customer not found.' });
    const photos = (await cdb.getFiles(row.id)).filter((f) => f.mime === 'image/jpeg');
    if (!photos.length) return res.status(404).json({ error: 'This customer has no photos.' });
    const pdf = jpegsToPdf(photos.map((f) => readFile(f.storage_key)), { title: `${row.name} - documents` });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName(row.name)}_documents.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store');
    await audit(req, `Downloaded all photos as PDF for customer #${row.id}`);
    res.send(pdf);
  }));

  // ---- Field manager ----
  app.get('/api/customer-fields', authMiddleware, requirePermission('customers.view'), asyncHandler(async (req, res) => {
    res.json(await cdb.getCustomerFields());
  }));

  app.post('/api/customer-fields', authMiddleware, requirePermission('customers.manage'), asyncHandler(async (req, res) => {
    const { label, type } = req.body || {};
    const allowed = ['text', 'number', 'phone', 'email', 'dropdown', 'date', 'textarea'];
    if (!label || String(label).trim().length < 2) return res.status(400).json({ error: 'Give the field a name.' });
    if (!allowed.includes(type)) return res.status(400).json({ error: `Field type must be one of: ${allowed.join(', ')}.` });
    const field = await cdb.createCustomerField(req.body);
    await audit(req, `Customer field added: ${field.label}`);
    res.status(201).json(field);
  }));

  app.patch('/api/customer-fields/:id', authMiddleware, requirePermission('customers.manage'), asyncHandler(async (req, res) => {
    const field = await cdb.updateCustomerField(req.params.id, req.body || {});
    if (!field) return res.status(404).json({ error: 'Field not found.' });
    await audit(req, `Customer field changed: ${field.label}`);
    res.json(field);
  }));

  // ---- Salesman links ----
  app.get('/api/customer-links', authMiddleware, requirePermission('customers.manage'), asyncHandler(async (req, res) => {
    res.json(await cdb.listLinks());
  }));

  app.post('/api/salesmen/:id/link', authMiddleware, requirePermission('customers.manage'), asyncHandler(async (req, res) => {
    const { action, pin } = req.body || {};
    if (action && !['enable', 'disable', 'regenerate'].includes(action)) return res.status(400).json({ error: 'Unknown action.' });
    if (pin !== undefined && pin !== null && pin !== '' && !/^\d{4,6}$/.test(String(pin))) {
      return res.status(400).json({ error: 'PIN must be 4 to 6 digits.' });
    }
    const link = await cdb.setSalesmanLink(req.params.id, { action, pin });
    if (!link) return res.status(404).json({ error: 'Salesman not found.' });
    const what = action === 'regenerate' ? 'reset (old link stopped working)' : action === 'disable' ? 'switched off' : action === 'enable' ? 'switched on' : 'updated';
    await audit(req, `Customer link for ${link.name} ${what}${pin !== undefined ? (pin ? ', PIN set' : ', PIN removed') : ''}`);
    res.json(link);
  }));

  app.get('/api/salesmen/:id/link-log', authMiddleware, requirePermission('customers.manage'), asyncHandler(async (req, res) => {
    res.json(await cdb.getLinkLog(req.params.id));
  }));

  app.post('/api/salesmen', authMiddleware, requirePermission('customers.manage'), asyncHandler(async (req, res) => {
    const { name, phone, type } = req.body || {};
    if (!name || String(name).trim().length < 2) return res.status(400).json({ error: 'Salesman name is required.' });
    if (!SALESMAN_TYPES.includes(type)) return res.status(400).json({ error: 'Choose Branch or Route / B2B.' });
    const sm = await db.createSalesman({ name: String(name).trim(), phone, type });
    await audit(req, `Salesman created: ${sm.name} (${type})`);
    res.status(201).json(sm);
  }));

  app.patch('/api/salesmen/:id', authMiddleware, requirePermission('customers.manage'), asyncHandler(async (req, res) => {
    const { type, phone } = req.body || {};
    if (type !== undefined && !SALESMAN_TYPES.includes(type)) return res.status(400).json({ error: 'Choose Branch or Route / B2B.' });
    const sm = await db.updateSalesman(req.params.id, { type, phone });
    if (!sm) return res.status(404).json({ error: 'Salesman not found.' });
    await audit(req, `Salesman ${sm.name} updated (type ${sm.type})`);
    res.json(sm);
  }));
}
