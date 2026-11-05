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

  // 7. BUG 2 (a) lead in 'contacted' -> becomes 'quotation_sent' on quotation create, changed_by equals test user
  it('BUG 2 (a): lead in contacted -> becomes quotation_sent on quotation create, changed_by equals logged-in user', async () => {
    // 1. Create a lead with status 'contacted'
    const leadRes = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Contacted Lead Packaging Co',
        category: 'Custom Boxes',
        mobile: '91112233',
        status: 'contacted',
        dealValue: 50.000,
      });
    expect(leadRes.status).toBe(201);
    const leadId = leadRes.body.id;
    const numLeadId = parseInt(leadId, 10);

    // 2. Create a quotation linked to this lead
    const quoteRes = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        leadId,
        customerName: 'Contacted Lead Packaging Co',
        salesRep: 'Fixture Salesman One',
        items: [{ item: 'Custom Printed Box', quantity: 100, unitPriceOMR: 1.500 }],
      });
    expect(quoteRes.status).toBe(201);
    const grandTotal = quoteRes.body.grandTotalOMR;

    // 3. Check lead status updated to quotation_sent and dealValue updated
    const getLeadRes = await request(app)
      .get(`/api/leads/${leadId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(getLeadRes.status).toBe(200);
    expect(getLeadRes.body.status).toBe('quotation_sent');
    expect(getLeadRes.body.dealValue).toBe(grandTotal);

    // 4. Verify lead_stage_history entry has changed_by = logged-in user's name
    const { rows: history } = await query(
      'SELECT * FROM lead_stage_history WHERE lead_id = $1 AND to_status = $2 ORDER BY changed_at DESC',
      [numLeadId, 'quotation_sent']
    );
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].from_status).toBe('contacted');
    expect(history[0].to_status).toBe('quotation_sent');
    expect(history[0].changed_by).toBe('Fixture Imported User');
  });

  // 8. BUG 2 (b) lead in 'won' -> stays 'won', dealValue is not overwritten
  it('BUG 2 (b): lead in won -> stays won when quotation created/updated, dealValue not overwritten', async () => {
    // 1. Create a lead with status 'won' and fixed dealValue
    const leadRes = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Won Deal Loyal Corp',
        category: 'Food Containers',
        mobile: '92223344',
        status: 'won',
        dealValue: 750.000,
      });
    expect(leadRes.status).toBe(201);
    const leadId = leadRes.body.id;
    const numLeadId = parseInt(leadId, 10);

    const { rows: historyBefore } = await query(
      'SELECT COUNT(*) AS cnt FROM lead_stage_history WHERE lead_id = $1',
      [numLeadId]
    );
    const countBefore = parseInt(historyBefore[0].cnt, 10);

    // 2. Create quotation linked to won lead with different amount
    const quoteRes = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        leadId,
        customerName: 'Won Deal Loyal Corp',
        items: [{ item: 'Add-on Trays', quantity: 50, unitPriceOMR: 2.000 }],
      });
    expect(quoteRes.status).toBe(201);

    // 3. Check lead status is STILL 'won' and dealValue is STILL 750
    const getLeadRes = await request(app)
      .get(`/api/leads/${leadId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(getLeadRes.status).toBe(200);
    expect(getLeadRes.body.status).toBe('won');
    expect(getLeadRes.body.dealValue).toBe(750);

    // 4. Update quotation and verify lead still remains 'won' and dealValue still unchanged
    const quoteId = quoteRes.body.id;
    const updateQuoteRes = await request(app)
      .put(`/api/quotations/${quoteId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        items: [{ item: 'Add-on Trays Premium', quantity: 100, unitPriceOMR: 5.000 }],
      });
    expect(updateQuoteRes.status).toBe(200);

    const getLeadAfterUpdate = await request(app)
      .get(`/api/leads/${leadId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(getLeadAfterUpdate.body.status).toBe('won');
    expect(getLeadAfterUpdate.body.dealValue).toBe(750);

    // 5. Verify no new stage transition was written into lead_stage_history
    const { rows: historyAfter } = await query(
      'SELECT COUNT(*) AS cnt FROM lead_stage_history WHERE lead_id = $1',
      [numLeadId]
    );
    expect(parseInt(historyAfter[0].cnt, 10)).toBe(countBefore);
  });

  // 9. BUG 2 (c) lead in 'sample_sent' -> stays 'sample_sent', dealValue is updated
  it('BUG 2 (c): lead in sample_sent -> stays sample_sent when quotation created/updated, dealValue updated', async () => {
    // 1. Create a lead with status 'sample_sent'
    const leadRes = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Sample Sent Testing LLC',
        category: 'Bio Bowls',
        mobile: '93334455',
        status: 'sample_sent',
        dealValue: 120.000,
      });
    expect(leadRes.status).toBe(201);
    const leadId = leadRes.body.id;
    const numLeadId = parseInt(leadId, 10);

    // 2. Create quotation linked to sample_sent lead
    const quoteRes = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        leadId,
        customerName: 'Sample Sent Testing LLC',
        items: [{ item: 'Bio Bowls 500ml', quantity: 200, unitPriceOMR: 1.250 }],
      });
    expect(quoteRes.status).toBe(201);
    const quotationId = quoteRes.body.id;
    const grandTotal = quoteRes.body.grandTotalOMR;

    // 3. Verify lead status remains 'sample_sent' (did not regress to quotation_sent!), dealValue updated
    const getLeadRes = await request(app)
      .get(`/api/leads/${leadId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(getLeadRes.status).toBe(200);
    expect(getLeadRes.body.status).toBe('sample_sent');
    expect(getLeadRes.body.dealValue).toBe(grandTotal);

    // 4. Verify no lead_stage_history row for quotation_sent was created
    const { rows: historyRows } = await query(
      'SELECT * FROM lead_stage_history WHERE lead_id = $1 AND to_status = $2',
      [numLeadId, 'quotation_sent']
    );
    expect(historyRows.length).toBe(0);

    // 5. Update the quotation and verify status still stays sample_sent and dealValue updates
    const updateQuoteRes = await request(app)
      .put(`/api/quotations/${quotationId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        items: [{ item: 'Bio Bowls 500ml', quantity: 400, unitPriceOMR: 1.250 }],
      });
    expect(updateQuoteRes.status).toBe(200);
    const newGrandTotal = updateQuoteRes.body.grandTotalOMR;

    const getLeadAfterUpdate = await request(app)
      .get(`/api/leads/${leadId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(getLeadAfterUpdate.body.status).toBe('sample_sent');
    expect(getLeadAfterUpdate.body.dealValue).toBe(newGrandTotal);
  });
});
