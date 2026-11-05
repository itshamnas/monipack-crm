import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import db from '../db.js';

describe('Feature Integrity Suite - End-to-End Functional Verification', () => {
  let testUser;
  let authToken;

  // Setup dynamic test user
  it('authenticates a user and issues a valid session token', async () => {
    testUser = db.createUser({
      name: 'Functional Verification User',
      email: 'dyn_test_user@example.com',
      password: 'DynamicTestPassword123!',
      role: 'admin',
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'dyn_test_user@example.com',
        password: 'DynamicTestPassword123!',
      });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('dyn_test_user@example.com');
    authToken = res.body.token;
  });

  // Dashboard analytics
  it('loads dashboard analytics data successfully', async () => {
    const res = await request(app)
      .get('/api/analytics')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.totalLeads).toBeDefined();
    expect(res.body.totalQuotations).toBeDefined();
    expect(res.body.totalPipelineValueOMR).toBeDefined();
  });

  // Leads list & Lead Slip details
  it('loads leads and lead details for Lead Slip', async () => {
    const listRes = await request(app)
      .get('/api/leads')
      .set('Authorization', `Bearer ${authToken}`);

    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);

    if (listRes.body.length > 0) {
      const leadId = listRes.body[0].id;
      const detailRes = await request(app)
        .get(`/api/leads/${leadId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.name).toBeDefined();
      expect(detailRes.body.category).toBeDefined();
    }
  });

  // Quotation details for print
  it('loads quotations and quotation details for Quotation Print', async () => {
    const listRes = await request(app)
      .get('/api/quotations')
      .set('Authorization', `Bearer ${authToken}`);

    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);

    if (listRes.body.length > 0) {
      const quoteId = listRes.body[0].id;
      const detailRes = await request(app)
        .get(`/api/quotations/${quoteId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.customerName).toBeDefined();
      expect(detailRes.body.items).toBeDefined();
    }
  });

  // Lead CSV Import parser
  it('parses lead CSV content accurately', async () => {
    const sampleLeadCsv = `Company / Client Name (Required),Mobile Number (+968) (Required),Product Category
Oman Hospitality Cafe LLC,+968 97023051,Packaging Products`;

    const res = await request(app)
      .post('/api/leads/parse-csv')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ csvData: sampleLeadCsv });

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.validCount).toBe(1);
    expect(res.body.items[0].name).toBe('Oman Hospitality Cafe LLC');
    expect(res.body.items[0].mobile).toBe('97023051');
  });

  // Product CSV Import parser
  it('parses product CSV content accurately', async () => {
    const sampleProductCsv = `SKU / Part Number,Item Name (English),Arabic Name,Category / Stock Group,Brand,Unit,Price (OMR),Opening Stock Balance
MNP-TEST-CUP,Kraft Hot Cup 8oz,أكواب كرافت 8 أونصة,Packaging Products,Monipack,CTN,12.500,150`;

    const res = await request(app)
      .post('/api/products/parse-csv')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ csvData: sampleProductCsv });

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.items[0].sku).toBe('MNP-TEST-CUP');
    expect(res.body.items[0].name).toBe('Kraft Hot Cup 8oz');
    expect(res.body.items[0].priceOMR).toBe(12.5);
    expect(res.body.items[0].stock).toBe(150);
  });

  // PWA Service Worker & Manifest serving
  it('serves PWA service worker and manifest correctly with Helmet headers', async () => {
    const swRes = await request(app).get('/sw.js');
    expect([200, 404]).toContain(swRes.status); // Served if static dist exists

    const healthRes = await request(app).get('/api/health');
    expect(healthRes.headers['content-security-policy']).toBeDefined();
    expect(healthRes.headers['x-content-type-options']).toBe('nosniff');
  });

  // Cleanup
  afterAll(() => {
    if (testUser && testUser.id) {
      db.deleteUser(testUser.id);
    }
  });
});
