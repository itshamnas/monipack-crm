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
  validateSubmission, statusAfterSubmit, parseCustomerImport, detectFileType, jpegsToPdf, completeness, mergeData, stageOf,
  FILE_LABELS, MAX_FILE_BYTES, SALESMAN_TYPES,
} from './logic.js';
import { saveFile, readFile } from './storage.js';
import { workbook } from './xlsx.js';

const LINK_SESSION_HOURS = 12;

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
// Fields the salesman works with on his link (super-admin-only fields such as "Customer status" are left out)
const salesmanFields = (fields) => fields.filter((f) => !f.adminOnly);
// Fields whose value comes from the form itself (photos and documents are uploaded separately)
const formFields = (fields) => fields.filter((f) => f.type !== 'photo' && f.type !== 'document');

/** What the salesman sees for one customer: his values plus how complete it is. */
function linkCustomer(c, fields, salesmanType) {
  const comp = completeness(c, fields, salesmanType, { audience: 'salesman' });
  return {
    id: c.id, name: c.name, status: c.status, locked: c.locked,
    mobile: c.mobile, crNumber: c.crNumber, noCr: c.noCr, noCrReason: c.noCrReason, vatNumber: c.vatNumber,
    data: Object.fromEntries(fields.filter((f) => !COLUMN_KEYS.has(f.key)).map((f) => [f.key, c.data[f.key]]).filter(([, v]) => v !== undefined)),
    fileLabels: c.fileLabels,
    percent: comp.percent, missing: comp.missing,
  };
}
const COLUMN_KEYS = new Set(['mobile', 'cr_number', 'vat_number']);

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
    res.json(salesmanFields(await cdb.getCustomerFields({ includeHidden: false })));
  }));

  app.get('/api/link/:token/customers', linkGuard, loadLinkSalesman, linkAuth, asyncHandler(async (req, res) => {
    const sm = req.linkSalesman;
    const [all, fields] = await Promise.all([
      cdb.listCustomers({ salesmanId: sm.id }),
      cdb.getCustomerFields({ includeHidden: false }),
    ]);
    const list = all.map((c) => linkCustomer(c, salesmanFields(fields), sm.type));
    // Not started first, then the least complete, finished ones last
    const rank = (c) => (c.status === 'not_started' ? 0 : c.percent < 100 ? 1 : 2);
    list.sort((a, b) => rank(a) - rank(b) || a.percent - b.percent || a.name.localeCompare(b.name));
    const notStarted = list.filter((c) => c.status === 'not_started').length;
    const completed = list.filter((c) => c.status !== 'not_started' && c.percent === 100).length;
    res.json({
      total: list.length,
      remaining: notStarted,
      notStarted,
      incomplete: list.length - notStarted - completed,
      completed,
      percent: list.length ? Math.round(list.reduce((sum, c) => sum + c.percent, 0) / list.length) : 0,
      customers: list,
    });
  }));

  // Fill in a prefilled customer (only while it is still "not started")
  app.post('/api/link/:token/customers/:id/submit', linkGuard, loadLinkSalesman, linkAuth, asyncHandler(async (req, res) => {
    const sm = req.linkSalesman;
    const row = await cdb.getCustomerRow(req.params.id);
    if (!row || row.salesman_id !== sm.id) return res.status(404).json({ error: 'Customer not found.' });
    if (row.status !== 'not_started') return res.status(409).json({ error: 'This customer was already submitted. Ask the administrator to make changes.' });

    const fields = await cdb.getCustomerFields({ includeHidden: false });
    // Photos and documents are uploaded right after this call, so they are not checked here
    const { errors, clean } = validateSubmission(req.body, formFields(salesmanFields(fields)), { salesmanType: sm.type, audience: 'salesman' });
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please check the highlighted fields.', fields: errors });
    if (!clean.name) clean.name = row.name;
    clean.data = mergeData(row.data, clean.data, fields, { audience: 'salesman' });

    const dups = await cdb.findDuplicates({ ...clean, excludeId: row.id });
    const candidate = { ...cdb.customerToApi(row), ...clean };
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

  // After the first submit the salesman may come back and fill fields that are still empty (until 100% or locked)
  app.post('/api/link/:token/customers/:id/complete', linkGuard, loadLinkSalesman, linkAuth, asyncHandler(async (req, res) => {
    const sm = req.linkSalesman;
    const row = await cdb.getCustomerRow(req.params.id);
    if (!row || row.salesman_id !== sm.id) return res.status(404).json({ error: 'Customer not found.' });
    if (row.status === 'not_started') return res.status(409).json({ error: 'Please fill in the customer first.' });
    if (row.locked) return res.status(409).json({ error: 'The administrator has locked this customer. Ask them to make changes.' });

    const current = cdb.customerToApi(row);
    const fields = await cdb.getCustomerFields({ includeHidden: false });
    const body = req.body || {};
    // Saved values stay as they are: only empty fields take the new values
    const input = {
      mobile: current.mobile || body.mobile,
      crNumber: current.crNumber || body.crNumber,
      noCr: current.noCr,
      noCrReason: current.noCrReason,
      vatNumber: current.vatNumber || body.vatNumber,
      data: { ...(body.data || {}), ...Object.fromEntries(Object.entries(current.data).filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length))) },
    };
    const { errors, clean } = validateSubmission(input, formFields(salesmanFields(fields)), { salesmanType: sm.type, audience: 'salesman' });
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please check the highlighted fields.', fields: errors });
    clean.name = row.name;
    clean.data = mergeData(row.data, clean.data, fields, { audience: 'salesman', onlyFillEmpty: true });

    const candidate = { ...current, ...clean };
    const status = row.status === 'pending_approval' ? undefined : statusAfterSubmit(candidate, fields, sm.type);
    const saved = await cdb.saveCustomerValues(row.id, clean, { status });
    await cdb.addSubmission(row.id, sm.id, { ...clean, submittedBy: sm.name, salesmanType: sm.type, update: true });
    await log(req, 'complete');
    const fresh = cdb.customerToApi(await cdb.getCustomerRow(saved.id));
    res.json({ customer: linkCustomer(fresh, salesmanFields(fields), sm.type), message: 'Details added. Thank you!' });
  }));

  // Salesman adds a customer who was not in his list -> waits for approval
  app.post('/api/link/:token/customers', linkGuard, loadLinkSalesman, linkAuth, asyncHandler(async (req, res) => {
    const sm = req.linkSalesman;
    const fields = await cdb.getCustomerFields({ includeHidden: false });
    const { errors, clean } = validateSubmission(req.body, formFields(salesmanFields(fields)), { salesmanType: sm.type, requireName: true, audience: 'salesman' });
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

  // CR paper, VAT certificate and photos: any time after the customer is saved, until the admin locks it
  app.post('/api/link/:token/customers/:id/files', linkGuard, largeJsonParser, loadLinkSalesman, linkAuth, asyncHandler(async (req, res) => {
    const sm = req.linkSalesman;
    const row = await cdb.getCustomerRow(req.params.id);
    if (!row || row.salesman_id !== sm.id) return res.status(404).json({ error: 'Customer not found.' });
    if (row.status === 'not_started') return res.status(409).json({ error: 'Save the customer first, then add documents.' });
    if (row.locked) return res.status(409).json({ error: 'The administrator has locked this customer.' });
    const decoded = decodeUpload(req.body);
    if (decoded.error) return res.status(400).json({ error: decoded.error });
    const file = await storeUpload(row.id, decoded, 'link');
    await refreshStatus(row.id);
    await log(req, 'upload');
    res.status(201).json({ id: String(file.id), label: file.label });
  }));

  // ---- My leads (enquiries) on the salesman link ----
  const STAGE_LABELS = { new: 'New', contacted: 'Assigned', quotation_sent: 'Quote sent', sample_sent: 'Sample / negotiation', won: 'Won', lost: 'Lost' };
  // The pipeline stages from Settings, or the standard six when none are configured
  const pipelineStages = async () => {
    const list = await db.getPipelineStages();
    return list.length ? list : Object.keys(STAGE_LABELS).map((id) => ({ id, label: STAGE_LABELS[id] }));
  };

  app.get('/api/link/:token/leads', linkGuard, loadLinkSalesman, linkAuth, asyncHandler(async (req, res) => {
    const [leads, stages] = await Promise.all([db.getLeads({ salesmanId: req.linkSalesman.id }), pipelineStages()]);
    const closed = new Set(['won', 'lost']);
    leads.sort((a, b) => (closed.has(a.status) - closed.has(b.status)) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
    res.json({
      stages: stages.map((st) => ({ id: st.id, label: STAGE_LABELS[st.id] || String(st.label || st.id).replace(/^STEP \d+:\s*/, '') })),
      leads: leads.map((l) => ({
        id: l.id, name: l.name, customerId: l.customerId, category: l.category, quantity: l.quantity,
        mobile: l.mobile ? `${l.countryCode || '+968'} ${l.mobile}` : l.phone, location: l.customerLocation,
        status: l.status, dealValue: l.dealValue, notes: l.notes, lostReason: l.lostReason, date: l.date, updatedAt: l.updatedAt,
      })),
    });
  }));

  // Salesman moves his lead to another stage and/or adds a note
  app.post('/api/link/:token/leads/:id', linkGuard, loadLinkSalesman, linkAuth, asyncHandler(async (req, res) => {
    const sm = req.linkSalesman;
    const lead = await db.getLeadById(req.params.id);
    if (!lead || String(lead.salesmanId) !== String(sm.id)) return res.status(404).json({ error: 'Lead not found.' });
    const { status, note, dealValue, lostReason } = req.body || {};
    const updates = {};
    if (status && status !== lead.status) {
      const stages = await pipelineStages();
      if (!stages.some((st) => st.id === status)) return res.status(400).json({ error: 'Unknown stage.' });
      if (status === 'lost' && !String(lostReason || '').trim()) return res.status(400).json({ error: 'Please give the reason the deal was lost.', fields: { lostReason: 'Reason required.' } });
      updates.status = status;
      if (status === 'lost') updates.lostReason = String(lostReason).trim().slice(0, 255);
    }
    if (dealValue !== undefined && dealValue !== '') {
      const v = Number(dealValue);
      if (!Number.isFinite(v) || v < 0) return res.status(400).json({ error: 'Deal value must be a number.', fields: { dealValue: 'Numbers only.' } });
      updates.dealValue = v;
    }
    const cleanNote = String(note || '').trim().slice(0, 2000);
    if (cleanNote) {
      const stamp = new Date().toISOString().slice(0, 10);
      updates.notes = `${lead.notes ? `${lead.notes}\n` : ''}[${stamp} ${sm.name}]: ${cleanNote}`;
    }
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nothing to save.' });
    updates.lastContactedAt = new Date().toISOString();
    const updated = await db.updateLead(lead.id, updates, { changedBy: `${sm.name} (link)` });
    if (updates.status) {
      await db.addActivity({ leadId: updated.id, leadName: updated.name, type: 'status_change',
        description: `Stage changed from "${lead.status}" to "${updates.status}" by ${sm.name} (salesman link)` });
    }
    if (cleanNote) {
      await db.addActivity({ leadId: updated.id, leadName: updated.name, type: 'note', description: `${sm.name}: ${cleanNote}` });
    }
    await log(req, 'lead_update');
    res.json({ ok: true, message: 'Lead updated.', lead: { id: updated.id, status: updated.status, dealValue: updated.dealValue, notes: updated.notes } });
  }));

  // =============== ADMIN (login required) ===============

  const audit = (req, description) => db.addAuditEntry({ type: 'customers', userId: req.user.id, userName: req.user.name, description }).catch(() => {});

  // "New enquiry" form: find an existing customer by name or mobile (salesmen only see their own)
  app.get('/api/customer-lookup', authMiddleware, requirePermission('leads.create', 'customers.view'), asyncHandler(async (req, res) => {
    const scope = req.user.role === 'salesman' ? { salesmanId: req.user.salesmanId ?? -1 } : {};
    res.json(await cdb.lookupCustomers(req.query.q, scope));
  }));

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
    list = list.map((c) => {
      const comp = completeness(c, fields, c.salesmanType || 'branch');
      return { ...c, missing: comp.missing, percent: comp.percent, stage: stageOf(c, comp.percent) };
    });
    if (req.query.stage) list = list.filter((c) => c.stage === req.query.stage);
    if (missing) list = list.filter((c) => c.status !== 'not_started' && c.missing.includes(String(missing)));
    res.json(list);
  }));

  // ---- Customer Data Centre: everything in one Excel workbook (or JSON for the PDF report) ----
  const STAGE_NAMES = { pending_approval: 'Needs approval', not_started: 'Not started', in_progress: 'In progress', complete: 'Complete' };
  const LEAD_STAGES = { new: 'New', contacted: 'Assigned', quotation_sent: 'Quote sent', sample_sent: 'Sample / negotiation', won: 'Won', lost: 'Lost' };
  const FILE_NAMES = { cr_certificate: 'CR paper', vat_certificate: 'VAT certificate', shop_front: 'Shop front', other: 'Other' };

  async function dataCentreSheets() {
    const { customers, fields, leads, quotes, files } = await cdb.getDataCentreRows();
    const label = Object.fromEntries(fields.map((f) => [f.key, f.label]));
    const dataFields = fields.filter((f) => !['mobile', 'cr_number', 'vat_number'].includes(f.key) && f.type !== 'photo' && f.type !== 'document');
    const docFields = fields.filter((f) => f.type === 'document');
    const summary = await cdb.getSummary();
    const clean = (v) => (v && /Needs Intake/.test(String(v)) ? '' : v);

    const customerRows = customers.map((c) => {
      const comp = completeness(c, fields, c.salesmanType || 'branch');
      const stage = stageOf(c, comp.percent);
      return [
        Number(c.id), c.name, c.salesmanName || '', c.salesmanType === 'route_b2b' ? 'Route / B2B' : c.salesmanType ? 'Branch' : '',
        STAGE_NAMES[stage], comp.percent / 100, stage === 'not_started' ? '' : comp.missing.map((k) => label[k] || k).join(', '),
        c.mobile, c.noCr ? 'NO CR' : c.crNumber, c.noCrReason, c.vatNumber,
        ...dataFields.map((f) => c.data[f.key]),
        ...docFields.map((f) => (c.fileLabels.includes(f.docLabel) ? 'Yes' : 'No')),
        c.leadCount, c.openLeads, c.openValue, c.wonValue, c.quoteCount, c.lastEnquiryAt,
        c.source, c.createdAt, c.locked ? 'Yes' : 'No',
      ];
    });

    return [
      {
        name: 'Customers',
        columns: [
          { label: 'ID', type: 'number', width: 7 }, { label: 'Customer', width: 32 }, { label: 'Salesman', width: 20 }, { label: 'Salesman type', width: 13 },
          { label: 'Status', width: 14 }, { label: '% complete', type: 'percent', width: 11 }, { label: 'Still missing', width: 45 },
          { label: 'Mobile', width: 15 }, { label: 'CR number', width: 13 }, { label: 'No CR reason', width: 20 }, { label: 'VAT number', width: 15 },
          ...dataFields.map((f) => ({ label: f.label, width: f.type === 'location' ? 40 : 18 })),
          ...docFields.map((f) => ({ label: `${f.label} uploaded`, width: 12 })),
          { label: 'Enquiries', type: 'number', width: 10 }, { label: 'Open enquiries', type: 'number', width: 10 },
          { label: 'Open value (OMR)', type: 'number', width: 14 }, { label: 'Won (OMR)', type: 'number', width: 13 },
          { label: 'Quotations', type: 'number', width: 10 }, { label: 'Last enquiry', type: 'date', width: 17 },
          { label: 'Source', width: 10 }, { label: 'Added on', type: 'date', width: 17 }, { label: 'Locked', width: 8 },
        ],
        rows: customerRows,
      },
      {
        name: 'Enquiries',
        columns: [
          { label: 'Lead ID', type: 'number', width: 8 }, { label: 'Date', type: 'date', width: 17 }, { label: 'Customer ID', type: 'number', width: 10 },
          { label: 'Customer', width: 30 }, { label: 'Mobile', width: 16 }, { label: 'Product', width: 22 }, { label: 'Quantity', width: 25 },
          { label: 'Stage', width: 16 }, { label: 'Salesman', width: 20 }, { label: 'Branch', width: 14 }, { label: 'Location', width: 18 },
          { label: 'Deal value (OMR)', type: 'number', width: 14 }, { label: 'Lost reason', width: 20 }, { label: 'Notes', width: 50 },
          { label: 'Last update', type: 'date', width: 17 },
        ],
        rows: leads.map((l) => [
          l.id, l.date || l.created_at, l.customer_id, l.customer_name_linked || l.name, l.mobile ? `${l.country_code || ''} ${l.mobile}`.trim() : l.phone,
          l.category, clean(l.quantity), LEAD_STAGES[l.status] || l.status, l.salesman_name, l.branch_name, clean(l.customer_location),
          Number(l.deal_value || 0), l.lost_reason, clean(l.notes), l.updated_at,
        ]),
      },
      {
        name: 'Quotations',
        columns: [
          { label: 'Quotation', width: 14 }, { label: 'Date', type: 'date', width: 17 }, { label: 'Customer ID', type: 'number', width: 10 },
          { label: 'Customer', width: 30 }, { label: 'Lead ID', type: 'number', width: 8 }, { label: 'Sales rep', width: 20 }, { label: 'Status', width: 12 },
          { label: 'Subtotal (OMR)', type: 'number', width: 14 }, { label: 'VAT (OMR)', type: 'number', width: 12 }, { label: 'Total (OMR)', type: 'number', width: 14 },
        ],
        rows: quotes.map((q) => [
          q.code, q.date || q.created_at, q.customer_id, q.customer_name_linked || q.customer_name, q.lead_id, q.sales_rep, q.status,
          Number(q.subtotal_omr || 0), Number(q.vat_amount_omr || 0), Number(q.grand_total_omr || 0),
        ]),
      },
      {
        name: 'Documents',
        columns: [{ label: 'Customer ID', type: 'number', width: 10 }, { label: 'Customer', width: 30 }, { label: 'Document', width: 16 },
          { label: 'File type', width: 10 }, { label: 'Uploaded', type: 'date', width: 17 }, { label: 'Uploaded by', width: 12 }],
        rows: files.map((f) => [f.customer_id, f.customer_name, FILE_NAMES[f.label] || f.label, f.mime === 'application/pdf' ? 'PDF' : 'Photo', f.uploaded_at, f.uploaded_via === 'link' ? 'Salesman' : 'Office']),
      },
      {
        name: 'Salesmen',
        columns: [{ label: 'Salesman', width: 24 }, { label: 'Type', width: 13 }, { label: 'Customers', type: 'number', width: 10 },
          { label: 'Not started', type: 'number', width: 11 }, { label: 'Customer data done', type: 'percent', width: 14 },
          { label: 'Open enquiries', type: 'number', width: 12 }, { label: 'Won (OMR)', type: 'number', width: 13 }, { label: 'Link on', width: 8 }],
        rows: summary.salesmen.map((sm) => {
          const mine = customers.filter((c) => c.salesmanId === sm.salesmanId);
          return [sm.name, sm.type === 'route_b2b' ? 'Route / B2B' : 'Branch', sm.assigned, sm.remaining, (sm.percent || 0) / 100,
            mine.reduce((t, c) => t + c.openLeads, 0), mine.reduce((t, c) => t + c.wonValue, 0), sm.linkEnabled ? 'Yes' : 'No'];
        }),
      },
    ];
  }

  app.get('/api/data-centre.xlsx', authMiddleware, requirePermission('customers.manage'), asyncHandler(async (req, res) => {
    const sheets = await dataCentreSheets();
    const buf = workbook(sheets);
    await audit(req, `Downloaded Customer Data Centre (Excel): ${sheets[0].rows.length} customers, ${sheets[1].rows.length} enquiries`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=monipack_data_centre_${new Date().toISOString().slice(0, 10)}.xlsx`);
    res.send(buf);
  }));

  app.get('/api/data-centre', authMiddleware, requirePermission('customers.manage'), asyncHandler(async (req, res) => {
    const sheets = await dataCentreSheets();
    await audit(req, 'Downloaded Customer Data Centre (PDF)');
    res.json(sheets.map((s) => ({ name: s.name, columns: s.columns, rows: s.rows })));
  }));

  app.get('/api/customers/export', authMiddleware, requirePermission('customers.manage'), asyncHandler(async (req, res) => {
    const [list, fields] = await Promise.all([cdb.listCustomers({}), cdb.getCustomerFields({ includeHidden: false })]);
    const cell = (v) => {
      let s = v === undefined || v === null ? '' : String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula injection guard
      return `"${s.replace(/"/g, '""')}"`;
    };
    const dataFields = fields.filter((f) => !['mobile', 'cr_number', 'vat_number', 'photos'].includes(f.key) && f.type !== 'photo' && f.type !== 'document');
    const docFields = fields.filter((f) => f.type === 'document');
    const header = ['ID', 'Customer name', 'Salesman', 'Status', 'Mobile', 'CR number', 'No CR reason', 'VAT number',
      ...dataFields.map((f) => f.label), ...docFields.map((f) => f.label), '% complete', 'Photos', 'Submitted at'];
    const lines = list.map((c) => [
      c.id, c.name, c.salesmanName, c.status, c.mobile, c.noCr ? 'NO CR' : c.crNumber, c.noCrReason, c.vatNumber,
      ...dataFields.map((f) => (Array.isArray(c.data[f.key]) ? c.data[f.key].join(', ') : c.data[f.key])),
      ...docFields.map((f) => (c.fileLabels.includes(f.docLabel) ? 'Yes' : 'No')),
      completeness(c, fields, c.salesmanType || 'branch').percent, c.photoCount, c.submittedAt,
    ].map(cell).join(','));
    await audit(req, `Exported ${list.length} customers to CSV`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=monipack_customers_${new Date().toISOString().slice(0, 10)}.csv`);
    res.send('﻿' + [header.map(cell).join(','), ...lines].join('\r\n'));
  }));

  app.get('/api/customers/:id', authMiddleware, requirePermission('customers.view'), asyncHandler(async (req, res) => {
    const c = await cdb.getCustomer(req.params.id);
    if (!c) return res.status(404).json({ error: 'Customer not found.' });
    const comp = completeness(c, await cdb.getCustomerFields({ includeHidden: false }), c.salesmanType || 'branch');
    const activity = await cdb.getCustomerActivity(c.id);
    res.json({ ...c, percent: comp.percent, missing: comp.missing, stage: stageOf(c, comp.percent), ...activity });
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
    const current = cdb.customerToApi(row);
    const { errors, clean } = validateSubmission({ name: row.name, ...req.body }, fields, {
      salesmanType: type, requireName: true, photoCount: current.photoCount, fileLabels: current.fileLabels,
    });
    const requiredProblems = Object.keys(errors).filter((k) => /required|at least one photo/i.test(errors[k]));
    if (row.status === 'not_started') requiredProblems.forEach((k) => delete errors[k]);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please check the highlighted fields.', fields: errors });

    clean.data = mergeData(row.data, clean.data, fields);
    let status;
    if (row.status === 'submitted' || row.status === 'complete') {
      status = statusAfterSubmit({ ...current, ...clean }, fields, type);
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

  // Lock: the salesman can no longer add details or documents to this customer
  app.post('/api/customers/:id/lock', authMiddleware, requirePermission('customers.manage'), asyncHandler(async (req, res) => {
    const row = await cdb.getCustomerRow(req.params.id);
    if (!row) return res.status(404).json({ error: 'Customer not found.' });
    const locked = req.body?.locked !== false;
    const saved = await cdb.setCustomerLocked(row.id, locked);
    await audit(req, `Customer ${locked ? 'locked' : 'unlocked'}: ${saved.name} (#${saved.id})`);
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
    const allowed = ['text', 'number', 'phone', 'email', 'dropdown', 'multiselect', 'yesno', 'date', 'textarea'];
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
