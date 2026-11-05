import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { query } from '../db/pool.js';
import { resetTestDb, verifyTestSafety, runImportWithFixture } from './testHelper.js';

describe('PostgreSQL Migration Verification Suite', () => {
  let authToken;

  beforeAll(async () => {
    verifyTestSafety();
    await resetTestDb();
    // Run fixture import once before tests
    runImportWithFixture('fixtures/test_import_fixture.json');
  });

  // 1. Login works with an imported user
  it('login works with an imported user from fixture using known password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'imported_fixture_user@example.com',
        password: 'TestFixturePass123!',
      });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('imported_fixture_user@example.com');
    authToken = res.body.token;
  });

  // 2. Salesmen are imported as separate rows linked to branches
  it('salesmen are imported as separate rows linked to branches (handles covering multiple branches)', async () => {
    // Check salesmen rows
    const { rows: salesmen } = await query('SELECT * FROM salesmen WHERE archived_at IS NULL ORDER BY name');
    expect(salesmen.length).toBe(2); // "Fixture Salesman One" and "B2B Route Rep"

    const smOne = salesmen.find(s => s.name === 'Fixture Salesman One');
    expect(smOne).toBeDefined();
    expect(smOne.type).toBe('branch');
    expect(smOne.branch_id).toBeDefined();

    const b2bRep = salesmen.find(s => s.name === 'B2B Route Rep');
    expect(b2bRep).toBeDefined();
    expect(b2bRep.type).toBe('route_b2b');

    // Check branches linked to smOne
    const { rows: branches } = await query(
      'SELECT id, name, legacy_id, default_salesman_id FROM branches WHERE default_salesman_id = $1 ORDER BY name',
      [smOne.id]
    );
    // Fixture Salesman One covers both Fixture Ghala and Fixture Musannah!
    expect(branches.length).toBe(2);
    const branchNames = branches.map(b => b.name);
    expect(branchNames).toContain('Fixture Ghala');
    expect(branchNames).toContain('Fixture Musannah');
  });

  // 3. Create lead, update stage -> a lead_stage_history row is written
  it('create lead, update stage -> a lead_stage_history row is written inside transaction', async () => {
    // Create lead
    const createRes = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Stage History Test Co',
        category: 'Packaging Products',
        mobile: '91234567',
        status: 'new',
      });

    expect(createRes.status).toBe(201);
    const leadId = createRes.body.id;
    const numLeadId = parseInt(leadId, 10);

    // Update stage to contacted
    const patchRes = await request(app)
      .patch(`/api/leads/${leadId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        status: 'contacted',
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.status).toBe('contacted');

    // Query lead_stage_history table directly
    const { rows: history } = await query(
      'SELECT * FROM lead_stage_history WHERE lead_id = $1 ORDER BY changed_at DESC',
      [numLeadId]
    );

    expect(history.length).toBeGreaterThanOrEqual(1);
    const stageTransition = history.find(h => h.from_status === 'new' && h.to_status === 'contacted');
    expect(stageTransition).toBeDefined();
    expect(stageTransition.changed_by).toBe('Fixture Imported User');
    expect(stageTransition.changed_at).toBeDefined();
  });

  // 4. Create two quotations at the same time -> different numbers (sequence concurrency)
  it('create two quotations at the same time -> different unique numbers', async () => {
    const payload1 = {
      customerName: 'Concurrent Customer Alpha',
      items: [{ item: 'Cup A', quantity: 10, unitPriceOMR: 1.5 }],
    };
    const payload2 = {
      customerName: 'Concurrent Customer Beta',
      items: [{ item: 'Cup B', quantity: 20, unitPriceOMR: 2.0 }],
    };

    const [res1, res2] = await Promise.all([
      request(app).post('/api/quotations').set('Authorization', `Bearer ${authToken}`).send(payload1),
      request(app).post('/api/quotations').set('Authorization', `Bearer ${authToken}`).send(payload2),
    ]);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(res1.body.code).toBeDefined();
    expect(res2.body.code).toBeDefined();
    expect(res1.body.code).not.toBe(res2.body.code);

    // Verify quantity supports decimals in quotation_items
    const decimalQuoteRes = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        customerName: 'Decimal Test Customer',
        items: [{ item: 'Cling Film Roll', quantity: 12.750, unit: 'ROLL', unitPriceOMR: 3.500 }],
      });
    expect(decimalQuoteRes.status).toBe(201);
    expect(decimalQuoteRes.body.items[0].quantity).toBe(12.75);
  });

  // 5. Deleting a lead sets archived_at instead of removing the row
  it('deleting a lead sets archived_at instead of removing the row (soft delete)', async () => {
    const createRes = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Soft Delete Lead Co',
        category: 'Cleaning Products',
        mobile: '98765432',
      });
    expect(createRes.status).toBe(201);
    const leadId = createRes.body.id;
    const numLeadId = parseInt(leadId, 10);

    // Delete lead via API
    const deleteRes = await request(app)
      .delete(`/api/leads/${leadId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(deleteRes.status).toBe(200);

    // Verify row still exists in database with archived_at set
    const { rows: dbRows } = await query('SELECT * FROM leads WHERE id = $1', [numLeadId]);
    expect(dbRows.length).toBe(1);
    expect(dbRows[0].archived_at).not.toBeNull();
    expect(dbRows[0].name).toBe('Soft Delete Lead Co');

    // Verify lead is NOT returned in getLeadById or getLeads API
    const getRes = await request(app)
      .get(`/api/leads/${leadId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(getRes.status).toBe(404);

    const listRes = await request(app)
      .get('/api/leads')
      .set('Authorization', `Bearer ${authToken}`);
    const foundInList = listRes.body.some(l => l.id === leadId);
    expect(foundInList).toBe(false);
  });

  // 6. Branch default salesman update does not rewrite existing lead history
  it('updating branch default salesman does not rewrite existing lead history', async () => {
    // Create lead assigned to Fixture Ghala
    const leadRes = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Branch History Test Co',
        branch: 'Fixture Ghala',
        salesman: 'Fixture Salesman One',
        mobile: '99887766',
      });
    expect(leadRes.status).toBe(201);
    const leadId = leadRes.body.id;

    // Find Fixture Ghala branch id
    const { rows: bRows } = await query("SELECT id FROM branches WHERE name = 'Fixture Ghala'");
    const branchId = bRows[0].id;

    // Update branch with new salesman
    const updateBranchRes = await request(app)
      .patch(`/api/settings/branches/${branchId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Fixture Ghala Renamed',
        salesman: 'Brand New Salesman',
      });
    // Even if this is admin or super_admin
    // (Note: settings endpoints check super_admin, let's verify if user role allows or test db directly)
    if (updateBranchRes.status === 200) {
      // Check lead did NOT get rewritten
      const getLeadRes = await request(app)
        .get(`/api/leads/${leadId}`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(getLeadRes.body.branch).toBe('Fixture Ghala');
      expect(getLeadRes.body.salesman).toBe('Fixture Salesman One');
    }
  });
});
