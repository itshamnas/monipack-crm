import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../index.js';
import db from '../db/index.js';
import { query } from '../db/pool.js';
import { resetTestDb, verifyTestSafety } from './testHelper.js';

const SECRET = process.env.JWT_SECRET || 'test-jwt-secret-min-32-chars-long!!';
const PASSWORD = 'RoleTestPass123!';

// Token exactly as the server issues it: user id + current token version
async function tokenFor(user) {
  const { rows } = await query('SELECT token_version FROM users WHERE id = $1', [parseInt(user.id, 10)]);
  return jwt.sign({ id: String(user.id), tv: rows[0].token_version }, SECRET, { expiresIn: '1h' });
}

const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe('Roles & permissions (RBAC) - enforced on the server', () => {
  const u = {};
  const t = {};
  let smA;
  let smB;
  let leadA;
  let leadB;

  beforeAll(async () => {
    verifyTestSafety();
    await resetTestDb();

    smA = await db.createSalesman({ name: 'Salesman Alpha', type: 'branch' });
    smB = await db.createSalesman({ name: 'Salesman Beta', type: 'route_b2b' });

    u.super = await db.createUser({ name: 'Super Admin', email: 'super@roles.test', password: PASSWORD, role: 'super_admin' });
    u.manager = await db.createUser({ name: 'Manager', email: 'manager@roles.test', password: PASSWORD, role: 'manager' });
    u.care = await db.createUser({ name: 'Care Agent', email: 'care@roles.test', password: PASSWORD, role: 'customer_care' });
    u.salesA = await db.createUser({ name: 'Alpha Login', email: 'alpha@roles.test', password: PASSWORD, role: 'salesman', salesmanId: smA.id });
    u.salesB = await db.createUser({ name: 'Beta Login', email: 'beta@roles.test', password: PASSWORD, role: 'salesman', salesmanId: smB.id });

    for (const k of Object.keys(u)) t[k] = await tokenFor(u[k]);

    // Customer care creates and assigns two enquiries (screens send the salesman NAME only)
    const a = await request(app).post('/api/leads').set(auth(t.care))
      .send({ name: 'Alpha Customer LLC', mobile: '91110001', salesman: 'Salesman Alpha' });
    const b = await request(app).post('/api/leads').set(auth(t.care))
      .send({ name: 'Beta Customer LLC', mobile: '91110002', salesman: 'Salesman Beta' });
    leadA = a.body;
    leadB = b.body;
  });

  it('login returns role and permissions, never the password hash', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'care@roles.test', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('customer_care');
    expect(res.body.user.permissions).toContain('leads.create');
    expect(res.body.user.permissions).not.toContain('settings.manage');
    expect(JSON.stringify(res.body)).not.toMatch(/password_hash|passwordHash|\$2[aby]\$/);
  });

  it('links a lead to the salesman record from the salesman name', () => {
    expect(leadA.salesmanId).toBe(String(smA.id));
    expect(leadB.salesmanId).toBe(String(smB.id));
  });

  // [method, path, body, { role: expectedStatus }]
  const matrix = [
    ['get', '/api/settings', null, { super: 200, manager: 403, care: 403, salesA: 403 }],
    ['get', '/api/users', null, { super: 200, manager: 403, care: 403, salesA: 403 }],
    ['get', '/api/backup', null, { super: 200, manager: 403, care: 403, salesA: 403 }],
    ['get', '/api/audit-logs', null, { super: 200, manager: 200, care: 403, salesA: 403 }],
    ['get', '/api/leads/export', null, { super: 200, manager: 403, care: 403, salesA: 403 }],
    ['post', '/api/settings/categories', { name: 'RBAC Test Category' }, { manager: 403, care: 403, salesA: 403 }],
    ['post', '/api/products', { sku: 'RBAC-1', name: 'RBAC Product', priceOMR: 1 }, { care: 403, salesA: 403 }],
    ['post', '/api/leads/bulk-import', { items: [{ name: 'X', mobile: '91234567' }] }, { salesA: 403 }],
    ['get', '/api/products', null, { super: 200, manager: 200, care: 200, salesA: 200 }],
    ['get', '/api/analytics', null, { super: 200, manager: 200, care: 200, salesA: 200 }],
  ];

  for (const [method, path, body, expected] of matrix) {
    for (const [role, status] of Object.entries(expected)) {
      it(`${role} -> ${method.toUpperCase()} ${path} = ${status}`, async () => {
        let req = request(app)[method](path).set(auth(t[role]));
        if (body) req = req.send(body);
        const res = await req;
        expect(res.status).toBe(status);
      });
    }
  }

  it('manager can archive a lead; customer care and salesman cannot', async () => {
    const tmp = await request(app).post('/api/leads').set(auth(t.care)).send({ name: 'Archive Me LLC', mobile: '91110009' });
    expect((await request(app).delete(`/api/leads/${tmp.body.id}`).set(auth(t.care))).status).toBe(403);
    expect((await request(app).delete(`/api/leads/${tmp.body.id}`).set(auth(t.salesA))).status).toBe(403);
    expect((await request(app).delete(`/api/leads/${tmp.body.id}`).set(auth(t.manager))).status).toBe(200);
  });

  it('salesman sees only his own leads', async () => {
    const res = await request(app).get('/api/leads').set(auth(t.salesA));
    expect(res.status).toBe(200);
    const ids = res.body.map((l) => l.id);
    expect(ids).toContain(leadA.id);
    expect(ids).not.toContain(leadB.id);
  });

  it("salesman gets 404 for another salesman's lead (read, update, activity)", async () => {
    expect((await request(app).get(`/api/leads/${leadB.id}`).set(auth(t.salesA))).status).toBe(404);
    expect((await request(app).patch(`/api/leads/${leadB.id}`).set(auth(t.salesA)).send({ notes: 'x' })).status).toBe(404);
    expect((await request(app).post(`/api/leads/${leadB.id}/activity`).set(auth(t.salesA)).send({ type: 'call' })).status).toBe(404);
  });

  it('salesman can update his own lead but cannot reassign it', async () => {
    const res = await request(app).patch(`/api/leads/${leadA.id}`).set(auth(t.salesA))
      .send({ status: 'contacted', salesman: 'Salesman Beta', salesmanId: smB.id });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('contacted');
    expect(res.body.salesmanId).toBe(String(smA.id));
  });

  it("salesman's new enquiry is assigned to himself", async () => {
    const res = await request(app).post('/api/leads').set(auth(t.salesA))
      .send({ name: 'Walk-in Shop', mobile: '91110003', salesman: 'Salesman Beta' });
    expect(res.status).toBe(201);
    expect(res.body.salesmanId).toBe(String(smA.id));
  });

  it("dashboard figures for a salesman cover only his leads", async () => {
    const res = await request(app).get('/api/analytics').set(auth(t.salesB));
    expect(res.status).toBe(200);
    expect(res.body.totalLeads).toBe(1);
  });

  it('salesman can quote only his own enquiries and sees only those quotations', async () => {
    const item = { item: 'Box', quantity: 2, unitPriceOMR: 1.5 };
    const own = await request(app).post('/api/quotations').set(auth(t.salesA))
      .send({ customerName: 'Alpha Customer LLC', leadId: leadA.id, items: [item] });
    expect(own.status).toBe(201);

    const other = await request(app).post('/api/quotations').set(auth(t.salesA))
      .send({ customerName: 'Beta Customer LLC', leadId: leadB.id, items: [item] });
    expect(other.status).toBe(403);

    const noLead = await request(app).post('/api/quotations').set(auth(t.salesA))
      .send({ customerName: 'Someone', items: [item] });
    expect(noLead.status).toBe(403);

    const betaQuote = await request(app).post('/api/quotations').set(auth(t.manager))
      .send({ customerName: 'Beta Customer LLC', leadId: leadB.id, items: [item] });
    expect(betaQuote.status).toBe(201);

    const list = await request(app).get('/api/quotations').set(auth(t.salesA));
    const codes = list.body.map((q) => q.id);
    expect(codes).toContain(own.body.id);
    expect(codes).not.toContain(betaQuote.body.id);
    expect((await request(app).get(`/api/quotations/${betaQuote.body.id}`).set(auth(t.salesA))).status).toBe(404);
    expect((await request(app).put(`/api/quotations/${betaQuote.body.id}`).set(auth(t.salesA)).send({ attn: 'x' })).status).toBe(404);
  });

  it("deactivating a user ends their existing session immediately and blocks login", async () => {
    const victim = await db.createUser({ name: 'Temp Care', email: 'tempcare@roles.test', password: PASSWORD, role: 'customer_care' });
    const victimToken = await tokenFor(victim);
    expect((await request(app).get('/api/leads').set(auth(victimToken))).status).toBe(200);

    const res = await request(app).patch(`/api/users/${victim.id}`).set(auth(t.super)).send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);

    expect((await request(app).get('/api/leads').set(auth(victimToken))).status).toBe(401);
    const login = await request(app).post('/api/auth/login').send({ email: 'tempcare@roles.test', password: PASSWORD });
    expect(login.status).toBe(403);
  });

  it('changing a role ends the old session', async () => {
    const user = await db.createUser({ name: 'Role Changer', email: 'rolechange@roles.test', password: PASSWORD, role: 'manager' });
    const oldToken = await tokenFor(user);
    const res = await request(app).patch(`/api/users/${user.id}`).set(auth(t.super)).send({ role: 'customer_care' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('customer_care');
    expect((await request(app).get('/api/leads').set(auth(oldToken))).status).toBe(401);
  });

  it('password reset invalidates old tokens and forces a password change before anything else', async () => {
    const user = await db.createUser({ name: 'Reset Me', email: 'resetme@roles.test', password: PASSWORD, role: 'customer_care' });
    const oldToken = await tokenFor(user);

    const reset = await request(app).patch(`/api/users/${user.id}/password`).set(auth(t.super)).send({ password: 'TempPass12345' });
    expect(reset.status).toBe(200);
    expect((await request(app).get('/api/leads').set(auth(oldToken))).status).toBe(401);

    const login = await request(app).post('/api/auth/login').send({ email: 'resetme@roles.test', password: 'TempPass12345' });
    expect(login.status).toBe(200);
    expect(login.body.user.mustChangePassword).toBe(true);

    const blocked = await request(app).get('/api/leads').set(auth(login.body.token));
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await request(app).get('/api/auth/me').set(auth(login.body.token))).status).toBe(200);

    const tooShort = await request(app).post('/api/auth/change-password').set(auth(login.body.token))
      .send({ currentPassword: 'TempPass12345', newPassword: 'short' });
    expect(tooShort.status).toBe(400);

    const changed = await request(app).post('/api/auth/change-password').set(auth(login.body.token))
      .send({ currentPassword: 'TempPass12345', newPassword: 'MyNewSecurePass9' });
    expect(changed.status).toBe(200);
    expect(changed.body.user.mustChangePassword).toBe(false);
    expect((await request(app).get('/api/leads').set(auth(changed.body.token))).status).toBe(200);
  });

  it('user management validates role, salesman link and password length', async () => {
    const noLink = await request(app).post('/api/users').set(auth(t.super))
      .send({ name: 'No Link', email: 'nolink@roles.test', password: 'LongEnough123', role: 'salesman' });
    expect(noLink.status).toBe(400);

    const shortPw = await request(app).post('/api/users').set(auth(t.super))
      .send({ name: 'Short', email: 'short@roles.test', password: 'abc123', role: 'manager' });
    expect(shortPw.status).toBe(400);

    const dupLink = await request(app).post('/api/users').set(auth(t.super))
      .send({ name: 'Dup', email: 'dup@roles.test', password: 'LongEnough123', role: 'salesman', salesmanId: smA.id });
    expect(dupLink.status).toBe(409);

    const ok = await request(app).post('/api/users').set(auth(t.super))
      .send({ name: 'New Care', email: 'newcare@roles.test', password: 'LongEnough123', role: 'customer_care' });
    expect(ok.status).toBe(201);
    expect(ok.body.mustChangePassword).toBe(true);
  });

  it('super admin cannot lock themselves out or remove the last super admin', async () => {
    const self = await request(app).patch(`/api/users/${u.super.id}`).set(auth(t.super)).send({ isActive: false });
    expect(self.status).toBe(400);
    const selfRole = await request(app).patch(`/api/users/${u.super.id}`).set(auth(t.super)).send({ role: 'manager' });
    expect(selfRole.status).toBe(400);
  });

  it('no user-related API response ever contains a password hash', async () => {
    const responses = [
      await request(app).get('/api/users').set(auth(t.super)),
      await request(app).get('/api/auth/me').set(auth(t.manager)),
      await request(app).get('/api/backup').set(auth(t.super)),
      await request(app).patch(`/api/users/${u.manager.id}`).set(auth(t.super)).send({ name: 'Manager Renamed' }),
    ];
    for (const r of responses) {
      expect(r.status).toBe(200);
      expect(r.text).not.toMatch(/password_hash|passwordHash|\$2[aby]\$/);
    }
  });
});
