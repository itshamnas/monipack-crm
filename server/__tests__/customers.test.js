import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../index.js';
import db from '../db/index.js';
import { query } from '../db/pool.js';
import { resetTestDb, verifyTestSafety } from './testHelper.js';

const SECRET = process.env.JWT_SECRET || 'test-jwt-secret-min-32-chars-long!!';
const PASSWORD = 'CustTestPass123!';
// 8x8 red JPEG
const JPEG_B64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDDooorhPsD/9k=';

async function tokenFor(user) {
  const { rows } = await query('SELECT token_version FROM users WHERE id = $1', [parseInt(user.id, 10)]);
  return jwt.sign({ id: String(user.id), tv: rows[0].token_version }, SECRET, { expiresIn: '1h' });
}
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const linkHdr = (s) => ({ 'X-Link-Session': s });
// Read a binary (PDF) response body as a Buffer
const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('Customer data collection (salesman links)', () => {
  const t = {};
  let branchSm;
  let routeSm;
  let branchLink;
  let routeLink;
  let branchSession;
  let routeSession;

  beforeAll(async () => {
    verifyTestSafety();
    await resetTestDb();
    branchSm = await db.createSalesman({ name: 'Salim Al Hadhrami', type: 'branch', phone: '96891234567' });
    routeSm = await db.createSalesman({ name: 'Hamad Al Kindi', type: 'route_b2b' });
    const sup = await db.createUser({ name: 'Super', email: 'super@cust.test', password: PASSWORD, role: 'super_admin' });
    const mgr = await db.createUser({ name: 'Manager', email: 'manager@cust.test', password: PASSWORD, role: 'manager' });
    const care = await db.createUser({ name: 'Care', email: 'care@cust.test', password: PASSWORD, role: 'customer_care' });
    t.super = await tokenFor(sup);
    t.manager = await tokenFor(mgr);
    t.care = await tokenFor(care);
  });

  describe('permissions', () => {
    it('customer care cannot see customer data', async () => {
      expect((await request(app).get('/api/customers').set(auth(t.care))).status).toBe(403);
      expect((await request(app).get('/api/customers/summary').set(auth(t.care))).status).toBe(403);
    });
    it('manager can view but not manage', async () => {
      expect((await request(app).get('/api/customers/summary').set(auth(t.manager))).status).toBe(200);
      expect((await request(app).get('/api/customer-links').set(auth(t.manager))).status).toBe(403);
      expect((await request(app).post(`/api/salesmen/${branchSm.id}/link`).set(auth(t.manager)).send({ action: 'enable' })).status).toBe(403);
      expect((await request(app).post('/api/customers/import').set(auth(t.manager)).send({ rows: [] })).status).toBe(403);
    });
    it('admin routes need a login', async () => {
      expect((await request(app).get('/api/customers')).status).toBe(401);
    });
  });

  describe('links', () => {
    it('super admin switches links on and gets a 32-hex token', async () => {
      const a = await request(app).post(`/api/salesmen/${branchSm.id}/link`).set(auth(t.super)).send({ action: 'enable' });
      const b = await request(app).post(`/api/salesmen/${routeSm.id}/link`).set(auth(t.super)).send({ action: 'enable' });
      expect(a.status).toBe(200);
      expect(a.body.linkToken).toMatch(/^[a-f0-9]{32}$/);
      branchLink = a.body.linkToken;
      routeLink = b.body.linkToken;
    });

    it('the dashboard summary never leaks link tokens', async () => {
      const res = await request(app).get('/api/customers/summary').set(auth(t.manager));
      expect(JSON.stringify(res.body)).not.toContain(branchLink);
    });

    it('an unknown token is refused', async () => {
      expect((await request(app).get('/api/link/' + 'a'.repeat(32))).status).toBe(404);
      expect((await request(app).get('/api/link/not-a-token')).status).toBe(404);
    });

    it('opening a link shows the salesman but data needs a session', async () => {
      const info = await request(app).get(`/api/link/${branchLink}`);
      expect(info.status).toBe(200);
      expect(info.body).toMatchObject({ salesmanName: 'Salim Al Hadhrami', salesmanType: 'branch', requiresPin: false });
      const noSession = await request(app).get(`/api/link/${branchLink}/customers`);
      expect(noSession.status).toBe(401);
      expect(noSession.body.code).toBe('LINK_SESSION_REQUIRED');
    });

    it('a session for one link cannot be used on another', async () => {
      branchSession = (await request(app).post(`/api/link/${branchLink}/session`).send({})).body.session;
      routeSession = (await request(app).post(`/api/link/${routeLink}/session`).send({})).body.session;
      expect(branchSession).toBeTruthy();
      const cross = await request(app).get(`/api/link/${routeLink}/customers`).set(linkHdr(branchSession));
      expect(cross.status).toBe(401);
      // A normal login token is not a link session either
      const loginTok = await request(app).get(`/api/link/${routeLink}/customers`).set(linkHdr(t.super));
      expect(loginTok.status).toBe(401);
    });

    it('PIN protects the link', async () => {
      await request(app).post(`/api/salesmen/${routeSm.id}/link`).set(auth(t.super)).send({ pin: '4321' });
      expect((await request(app).get(`/api/link/${routeLink}`)).body.requiresPin).toBe(true);
      expect((await request(app).post(`/api/link/${routeLink}/session`).send({ pin: '0000' })).status).toBe(401);
      const ok = await request(app).post(`/api/link/${routeLink}/session`).send({ pin: '4321' });
      expect(ok.status).toBe(200);
      routeSession = ok.body.session;
      expect((await request(app).post(`/api/salesmen/${routeSm.id}/link`).set(auth(t.super)).send({ pin: '12' })).status).toBe(400);
    });
  });

  describe('import', () => {
    const csv = [
      'Customer Name,Salesman,Mobile,Segment',
      'Al Noor Catering,Salim Al Hadhrami,,Catering',
      'Nizwa Fresh Bakery,salim al hadhrami,,Bakery',
      'Sohar Wholesale,Hamad Al Kindi,92223333,Wholesaler',
      'Ghost Shop,Nobody Known,,',
      ',Hamad Al Kindi,,',
    ].join('\n');

    it('parse shows matched salesmen and problems', async () => {
      const res = await request(app).post('/api/customers/import/parse').set(auth(t.super)).send({ csvData: csv });
      expect(res.status).toBe(200);
      expect(res.body.rows.filter((r) => r.valid)).toHaveLength(3);
      const ghost = res.body.rows.find((r) => r.name === 'Ghost Shop');
      expect(ghost.valid).toBe(false);
    });

    it('import adds valid rows and skips duplicates on a second run', async () => {
      const parsed = await request(app).post('/api/customers/import/parse').set(auth(t.super)).send({ csvData: csv });
      const valid = parsed.body.rows.filter((r) => r.valid);
      const first = await request(app).post('/api/customers/import').set(auth(t.super)).send({ rows: valid });
      expect(first.body.added).toBe(3);
      const again = await request(app).post('/api/customers/import').set(auth(t.super)).send({ rows: valid });
      expect(again.body.added).toBe(0);
      expect(again.body.skippedDuplicate).toBe(3);
    });
  });

  describe('salesman fills in customers', () => {
    let noor;
    let bakery;
    let sohar;

    it('each salesman sees only his own customers with a counter', async () => {
      const res = await request(app).get(`/api/link/${branchLink}/customers`).set(linkHdr(branchSession));
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      expect(res.body.remaining).toBe(2);
      expect(res.body.customers.map((c) => c.name).sort()).toEqual(['Al Noor Catering', 'Nizwa Fresh Bakery']);
      noor = res.body.customers.find((c) => c.name === 'Al Noor Catering');
      bakery = res.body.customers.find((c) => c.name === 'Nizwa Fresh Bakery');
      const r2 = await request(app).get(`/api/link/${routeLink}/customers`).set(linkHdr(routeSession));
      expect(r2.body.customers.map((c) => c.name)).toEqual(['Sohar Wholesale']);
      sohar = r2.body.customers[0];
    });

    it('cannot submit another salesman\'s customer', async () => {
      const res = await request(app).post(`/api/link/${branchLink}/customers/${sohar.id}/submit`).set(linkHdr(branchSession))
        .send({ mobile: '91234567', crNumber: '1234567' });
      expect(res.status).toBe(404);
    });

    it('mobile and CR are required', async () => {
      const res = await request(app).post(`/api/link/${branchLink}/customers/${noor.id}/submit`).set(linkHdr(branchSession)).send({});
      expect(res.status).toBe(400);
      expect(res.body.fields).toHaveProperty('mobile');
      expect(res.body.fields).toHaveProperty('cr_number');
    });

    it('"No CR" is refused for Route / B2B salesmen', async () => {
      const res = await request(app).post(`/api/link/${routeLink}/customers/${sohar.id}/submit`).set(linkHdr(routeSession))
        .send({ mobile: '92223333', noCr: true, noCrReason: 'small shop' });
      expect(res.status).toBe(400);
      expect(res.body.fields).toHaveProperty('cr_number');
    });

    it('branch salesman submits; mobile is normalised; counter goes down', async () => {
      const res = await request(app).post(`/api/link/${branchLink}/customers/${noor.id}/submit`).set(linkHdr(branchSession))
        .send({ mobile: '9123 4567', crNumber: '1234567', data: { segment: 'Catering' } });
      expect(res.status).toBe(200);
      expect(res.body.customer.status).toBe('submitted');
      const list = await request(app).get(`/api/link/${branchLink}/customers`).set(linkHdr(branchSession));
      expect(list.body.remaining).toBe(1);
      const full = await request(app).get(`/api/customers/${noor.id}`).set(auth(t.super));
      expect(full.body.mobile).toBe('+96891234567');
      expect(full.body.submissions).toHaveLength(1);
    });

    it('a submitted customer cannot be changed through the link', async () => {
      const res = await request(app).post(`/api/link/${branchLink}/customers/${noor.id}/submit`).set(linkHdr(branchSession))
        .send({ mobile: '99999999', crNumber: '7654321' });
      expect(res.status).toBe(409);
    });

    it('branch salesman may tick No CR with a reason', async () => {
      const res = await request(app).post(`/api/link/${branchLink}/customers/${bakery.id}/submit`).set(linkHdr(branchSession))
        .send({ mobile: '93334444', noCr: true, noCrReason: 'Small home bakery' });
      expect(res.status).toBe(200);
    });

    it('a duplicate mobile goes to pending approval', async () => {
      const res = await request(app).post(`/api/link/${routeLink}/customers/${sohar.id}/submit`).set(linkHdr(routeSession))
        .send({ mobile: '91234567', crNumber: '5550001' });
      expect(res.status).toBe(200);
      expect(res.body.duplicate).toBe(true);
      expect(res.body.customer.status).toBe('pending_approval');
    });

    it('salesman adds a new customer, waiting for approval', async () => {
      const res = await request(app).post(`/api/link/${branchLink}/customers`).set(linkHdr(branchSession))
        .send({ name: 'Bahla Cafe', mobile: '95556666', crNumber: '8889990' });
      expect(res.status).toBe(201);
      expect(res.body.customer.status).toBe('pending_approval');
    });

    it('photo upload right after submit; non-image files are refused', async () => {
      const ok = await request(app).post(`/api/link/${branchLink}/customers/${noor.id}/files`).set(linkHdr(branchSession))
        .send({ base64: JPEG_B64, label: 'cr_certificate', name: 'cr.jpg' });
      expect(ok.status).toBe(201);
      const bad = await request(app).post(`/api/link/${branchLink}/customers/${noor.id}/files`).set(linkHdr(branchSession))
        .send({ base64: Buffer.from('hello world').toString('base64'), label: 'other' });
      expect(bad.status).toBe(400);
      const notSubmitted = await request(app).get(`/api/link/${branchLink}/customers`).set(linkHdr(branchSession));
      expect(notSubmitted.body.remaining).toBe(0);
    });

    it('a disabled link stops working at once', async () => {
      await request(app).post(`/api/salesmen/${routeSm.id}/link`).set(auth(t.super)).send({ action: 'disable' });
      expect((await request(app).get(`/api/link/${routeLink}/customers`).set(linkHdr(routeSession))).status).toBe(404);
    });

    it('reset gives a new token and the old one dies', async () => {
      const res = await request(app).post(`/api/salesmen/${branchSm.id}/link`).set(auth(t.super)).send({ action: 'regenerate' });
      expect(res.body.linkToken).not.toBe(branchLink);
      expect((await request(app).get(`/api/link/${branchLink}`)).status).toBe(404);
      branchLink = res.body.linkToken;
    });

    describe('super admin review', () => {
      it('summary counts statuses and missing fields', async () => {
        const res = await request(app).get('/api/customers/summary').set(auth(t.super));
        expect(res.status).toBe(200);
        expect(res.body.totals.total).toBe(4);
        expect(res.body.totals.pending_approval).toBe(2);
        const salim = res.body.salesmen.find((s) => s.name === 'Salim Al Hadhrami');
        expect(salim.remaining).toBe(0);
        expect(res.body.missing.find((m) => m.key === 'email').count).toBeGreaterThan(0);
      });

      it('list can filter by missing field', async () => {
        const res = await request(app).get('/api/customers?missing=email').set(auth(t.super));
        expect(res.body.length).toBeGreaterThan(0);
        expect(res.body.every((c) => c.missing.includes('email'))).toBe(true);
      });

      it('photo downloads as a PDF, single and merged', async () => {
        const c = await request(app).get(`/api/customers/${noor.id}`).set(auth(t.super));
        expect(c.body.files).toHaveLength(1);
        const one = await request(app).get(`/api/customers/${noor.id}/files/${c.body.files[0].id}/pdf`).set(auth(t.super)).buffer(true).parse(binary);
        expect(one.status).toBe(200);
        expect(one.headers['content-type']).toContain('application/pdf');
        expect(one.body.subarray(0, 5).toString()).toBe('%PDF-');
        const all = await request(app).get(`/api/customers/${noor.id}/documents.pdf`).set(auth(t.super)).buffer(true).parse(binary);
        expect(all.status).toBe(200);
        // Files are never public
        expect((await request(app).get(`/api/customers/${noor.id}/files/${c.body.files[0].id}`)).status).toBe(401);
      });

      it('only the super admin edits; edits validate', async () => {
        expect((await request(app).patch(`/api/customers/${noor.id}`).set(auth(t.manager)).send({ mobile: '91111111' })).status).toBe(403);
        const bad = await request(app).patch(`/api/customers/${noor.id}`).set(auth(t.super)).send({ mobile: '123', crNumber: '1234567' });
        expect(bad.status).toBe(400);
        const ok = await request(app).patch(`/api/customers/${noor.id}`).set(auth(t.super))
          .send({ name: 'Al Noor Catering LLC', mobile: '91234567', crNumber: '1234567', data: { email: 'info@alnoor.om' } });
        expect(ok.status).toBe(200);
        expect(ok.body.name).toBe('Al Noor Catering LLC');
        // The original submission snapshot is kept unchanged
        const full = await request(app).get(`/api/customers/${noor.id}`).set(auth(t.super));
        expect(full.body.submissions[0].snapshot.data.email).toBeUndefined();
      });

      it('approve moves a pending customer on', async () => {
        const pending = await request(app).get('/api/customers?status=pending_approval').set(auth(t.super));
        const target = pending.body.find((c) => c.name === 'Bahla Cafe');
        const res = await request(app).post(`/api/customers/${target.id}/approve`).set(auth(t.super));
        expect(res.status).toBe(200);
        expect(['submitted', 'complete']).toContain(res.body.status);
        expect((await request(app).post(`/api/customers/${target.id}/approve`).set(auth(t.super))).status).toBe(409);
      });

      it('transfer moves customers and records history', async () => {
        const res = await request(app).post('/api/customers/transfer').set(auth(t.super))
          .send({ ids: [bakery.id], toSalesmanId: String(routeSm.id) });
        expect(res.body.moved).toBe(1);
        const c = await request(app).get(`/api/customers/${bakery.id}`).set(auth(t.super));
        expect(c.body.salesmanName).toBe('Hamad Al Kindi');
        expect(c.body.transfers[0]).toMatchObject({ from: 'Salim Al Hadhrami', to: 'Hamad Al Kindi' });
      });

      it('CSV export guards against spreadsheet formulas', async () => {
        await request(app).patch(`/api/customers/${noor.id}`).set(auth(t.super))
          .send({ mobile: '91234567', crNumber: '1234567', data: { address: '=HYPERLINK("x")' } });
        const res = await request(app).get('/api/customers/export').set(auth(t.super));
        expect(res.status).toBe(200);
        expect(res.text).toContain("\"'=HYPERLINK");
      });

      it('field manager: add a dropdown field; mobile stays required', async () => {
        const add = await request(app).post('/api/customer-fields').set(auth(t.super))
          .send({ label: 'Delivery day', type: 'dropdown', options: ['Sunday', 'Monday'] });
        expect(add.status).toBe(201);
        const fields = (await request(app).get('/api/customer-fields').set(auth(t.super))).body;
        const mobile = fields.find((f) => f.key === 'mobile');
        const res = await request(app).patch(`/api/customer-fields/${mobile.id}`).set(auth(t.super)).send({ requiredBranch: false, isHidden: true });
        expect(res.body.requiredBranch).toBe(true);
        expect(res.body.isHidden).toBe(false);
      });

      it('archive hides a customer', async () => {
        expect((await request(app).delete(`/api/customers/${bakery.id}`).set(auth(t.super))).status).toBe(200);
        expect((await request(app).get(`/api/customers/${bakery.id}`).set(auth(t.super))).status).toBe(404);
      });
    });
  });
});
