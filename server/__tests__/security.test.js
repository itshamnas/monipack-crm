import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { app } from '../index.js';
import db from '../db/index.js';
import { verifyTestSafety } from './testHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverIndexPath = path.resolve(__dirname, '..', 'index.js');

describe('Security Suite 1 - CORS, RBAC, Rate Limiting, Startup Guard & Tally Removal', () => {
  beforeAll(() => {
    verifyTestSafety();
  });

  // 1. CORS Enforcement
  describe('CORS Enforcement', () => {
    it('rejects requests from an untrusted origin', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'http://untrusted-attacker.com');

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Not allowed by CORS');
    });

    it('allows requests with no Origin header (same-origin, curl, server-to-server)', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('online');
    });

    it('allows requests from a permitted origin', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:3000');

      expect(res.status).toBe(200);
    });
  });

  // 2. Authentication Enforcement
  describe('Authentication Enforcement (401 without Token)', () => {
    it('returns 401 on /api/leads without Bearer token', async () => {
      const res = await request(app).get('/api/leads');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Authentication required');
    });

    it('returns 401 on /api/products without Bearer token', async () => {
      const res = await request(app).get('/api/products');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Authentication required');
    });

    it('returns 401 on /api/quotations without Bearer token', async () => {
      const res = await request(app).get('/api/quotations');
      expect(res.status).toBe(401);
    });

    it('returns 401 on /api/settings without Bearer token', async () => {
      const res = await request(app).get('/api/settings');
      expect(res.status).toBe(401);
    });
  });

  // 3. Rate Limiting & Proxy Trust
  describe('Rate Limiting & Proxy Trust (trust proxy loopback)', () => {
    it('locks out by IP after 5 failed attempts despite changing fake client IPs in X-Forwarded-For', async () => {
      const realUntrustedIp = '203.0.113.5';

      // 5 failed login attempts with varied spoofed leftmost IPs
      for (let i = 1; i <= 5; i++) {
        const fakeLeftIp = `198.51.100.${i * 10}`;
        const res = await request(app)
          .post('/api/auth/login')
          .set('X-Forwarded-For', `${fakeLeftIp}, ${realUntrustedIp}`)
          .send({ email: `test_user_${i}@example.com`, password: 'invalid_password' });

        expect(res.status).toBe(401);
      }

      // The 6th attempt from the same untrusted IP must be locked out with HTTP 429
      const lockedRes = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', `10.99.99.99, ${realUntrustedIp}`)
        .send({ email: 'another_user@example.com', password: 'invalid_password' });

      expect(lockedRes.status).toBe(429);
      expect(lockedRes.body.error).toContain('Security Lockout: Too many failed login attempts from this network');
    });

    it('locks out by email after 10 failed attempts from different IP addresses', async () => {
      const targetEmail = 'lockout_target@example.com';

      // 10 failed login attempts from distinct untrusted IPs
      for (let i = 1; i <= 10; i++) {
        const uniqueIp = `198.51.100.${100 + i}`;
        const res = await request(app)
          .post('/api/auth/login')
          .set('X-Forwarded-For', `10.0.0.1, ${uniqueIp}`)
          .send({ email: targetEmail, password: 'invalid_password' });

        expect(res.status).toBe(401);
      }

      // The 11th attempt for targetEmail from a completely new IP must be locked out by email
      const newIp = '198.51.100.250';
      const lockedRes = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', `10.0.0.1, ${newIp}`)
        .send({ email: targetEmail, password: 'invalid_password' });

      expect(lockedRes.status).toBe(429);
      expect(lockedRes.body.error).toContain('Account locked due to repeated failed attempts');
    });
  });

  // 4. Production Startup Guard
  describe('Production Startup Guard', () => {
    it('refuses to start in production if JWT_SECRET is missing or empty', () => {
      const proc = spawnSync('node', [serverIndexPath], {
        env: {
          ...process.env,
          NODE_ENV: 'production',
          JWT_SECRET: '',
        },
        encoding: 'utf-8',
      });

      expect(proc.status).toBe(1);
      const combinedOutput = (proc.stdout || '') + (proc.stderr || '');
      expect(combinedOutput).toContain('FATAL SECURITY ERROR');
    });

    it('refuses to start in production if JWT_SECRET is shorter than 32 characters', () => {
      const proc = spawnSync('node', [serverIndexPath], {
        env: {
          ...process.env,
          NODE_ENV: 'production',
          JWT_SECRET: 'short-secret-under-32-chars',
        },
        encoding: 'utf-8',
      });

      expect(proc.status).toBe(1);
      const combinedOutput = (proc.stdout || '') + (proc.stderr || '');
      expect(combinedOutput).toContain('FATAL SECURITY ERROR');
    });
  });

  // 5. Tally Integration Complete Removal
  describe('Tally Integration Complete Removal', () => {
    it('returns 404 for /api/tally/sync-push', async () => {
      const res = await request(app).post('/api/tally/sync-push').send({});
      expect(res.status).toBe(404);
    });

    it('returns 404 for /api/tally/test', async () => {
      const res = await request(app).post('/api/tally/test').send({});
      expect(res.status).toBe(404);
    });

    it('returns 404 for /api/tally/fetch', async () => {
      const res = await request(app).post('/api/tally/fetch').send({});
      expect(res.status).toBe(404);
    });

    it('returns 404 for /api/tally/sync', async () => {
      const res = await request(app).post('/api/tally/sync').send({});
      expect(res.status).toBe(404);
    });
  });

  // 6. Product CSV Import
  describe('Product CSV Import Functionality', () => {
    it('successfully parses product CSV content without Tally dependencies', async () => {
      // Tokens must now belong to a real, active user (the server checks the user on every request)
      const secret = process.env.JWT_SECRET || 'test-jwt-secret-min-32-chars-long!!';
      const manager = await db.createUser({
        name: 'Product Import Tester',
        email: `product_import_${Date.now()}@example.com`,
        password: 'ProductImport123!',
        role: 'manager',
      });
      const token = jwt.sign({ id: manager.id, tv: 0 }, secret, { expiresIn: '1h' });

      const sampleCsv = `SKU / Part Number,Item Name (English),Arabic Name,Category / Stock Group,Brand,Unit,Price (OMR),Opening Stock Balance
TEST-CUP-01,Test Coffee Cup 12oz,كوب قهوة تجريبي,Packaging Products,Monipack,CTN,15.200,200`;

      const res = await request(app)
        .post('/api/products/parse-csv')
        .set('Authorization', `Bearer ${token}`)
        .send({ csvData: sampleCsv });

      expect(res.status).toBe(200);
      expect(res.body.formatDetected).toBe('CSV Spreadsheet');
      expect(res.body.count).toBe(1);
      expect(res.body.items[0].sku).toBe('TEST-CUP-01');
      expect(res.body.items[0].name).toBe('Test Coffee Cup 12oz');
      expect(res.body.items[0].priceOMR).toBe(15.2);
      expect(res.body.items[0].stock).toBe(200);
    });
  });

});
