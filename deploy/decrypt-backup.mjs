#!/usr/bin/env node
// Decrypt a Monipack CRM backup:  node deploy/decrypt-backup.mjs monipack-crm-2026-11-10-02-30.mpbak > monipack.dump
// It asks for the backup passphrase. Restore into an EMPTY database:  pg_restore --no-owner -d <database> monipack.dump
import fs from 'fs';
import readline from 'readline';
import { decrypt } from '../server/backup/daily.js';

const file = process.argv[2];
if (!file) { console.error('Usage: node deploy/decrypt-backup.mjs <file.mpbak> > monipack.dump'); process.exit(1); }
const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: true });
rl.stdoutMuted = true;
rl._writeToOutput = function w(s) { if (!rl.stdoutMuted) rl.output.write(s); };
process.stderr.write('Backup passphrase: ');
rl.question('', (pass) => {
  rl.close(); process.stderr.write('\n');
  try { process.stdout.write(decrypt(fs.readFileSync(file), pass)); process.stderr.write('Decrypted.\n'); } catch (e) { console.error(`Could not decrypt: ${e.message}`); process.exit(1); }
});
