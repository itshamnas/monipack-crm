/**
 * Monipack CRM - Automated TallyPrime Background Watchdog (2026 Smart Architecture)
 * Morooj Nizwa International LLC
 * 
 * Runs as a background service or scheduled task on the PC hosting TallyPrime.
 * Periodically extracts stock balances and rates from Tally (Port 9000),
 * and pushes updates to Monipack CRM without requiring manual user interaction.
 */

import http from 'http';
import { fetchTallyStockItems, testTallyConnection } from './tallyService.js';

const TALLY_URL = process.env.TALLY_URL || 'http://127.0.0.1:9000';
const CRM_HOST = process.env.CRM_HOST || '127.0.0.1';
const CRM_PORT = process.env.CRM_PORT || 5000;
const SYNC_KEY = process.env.TALLY_SYNC_KEY || 'monipack-tally-sync-2026';
const POLL_INTERVAL_MS = (parseInt(process.env.POLL_INTERVAL_MINUTES, 10) || 60) * 60 * 1000;

const isOnce = process.argv.includes('--once');

console.log('========================================================');
console.log('   MONIPACK TALLYPRIME AUTOMATED WATCHDOG (2026)');
console.log('   Morooj Nizwa International LLC - Sultanate of Oman');
console.log('========================================================');
console.log(` Target Tally URL: ${TALLY_URL}`);
console.log(` Target CRM Server: http://${CRM_HOST}:${CRM_PORT}`);
console.log(` Mode: ${isOnce ? 'Single-shot Sync (--once)' : `Daemon (Every ${POLL_INTERVAL_MS / 60000} mins)`}`);
console.log('========================================================\n');

export async function runSyncCycle() {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] Checking TallyPrime connection...`);

  try {
    const conn = await testTallyConnection(TALLY_URL);
    if (!conn.online) {
      console.warn(`[${timestamp}] ⚠️ TallyPrime is offline: ${conn.message}`);
      return false;
    }

    console.log(`[${timestamp}] ✓ TallyPrime is active. Fetching Stock Items XML...`);
    const items = await fetchTallyStockItems(TALLY_URL);
    console.log(`[${timestamp}] Retrieved ${items.length} stock items from TallyPrime.`);

    if (items.length === 0) {
      console.warn(`[${timestamp}] No stock items found. Ensure active company is open in Tally.`);
      return false;
    }

    // Push to CRM Endpoint
    console.log(`[${timestamp}] Pushing ${items.length} items to Monipack CRM...`);
    const payload = JSON.stringify({
      items,
      options: { updateExisting: true }
    });

    const pushResult = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: CRM_HOST,
        port: CRM_PORT,
        path: '/api/tally/sync-push',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'x-tally-key': SYNC_KEY
        },
        timeout: 15000
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch (e) {
            resolve({ status: res.statusCode, raw: body });
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('CRM sync push timed out.'));
      });

      req.on('error', reject);
      req.write(payload);
      req.end();
    });

    if (pushResult.status === 200) {
      console.log(`[${timestamp}] 🎉 SYNC SUCCESSFUL! Added: ${pushResult.data.addedCount}, Updated: ${pushResult.data.updatedCount}, Total in Catalog: ${pushResult.data.totalInCatalog}`);
      return true;
    } else {
      console.error(`[${timestamp}] ❌ CRM Push failed (HTTP ${pushResult.status}):`, pushResult.data || pushResult.raw);
      return false;
    }

  } catch (err) {
    console.error(`[${timestamp}] ❌ Error during sync cycle:`, err.message);
    return false;
  }
}

// Execution Loop
if (isOnce) {
  runSyncCycle().then(() => process.exit(0));
} else {
  // Run once immediately, then interval
  runSyncCycle();
  setInterval(runSyncCycle, POLL_INTERVAL_MS);
}
