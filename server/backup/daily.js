import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import { appendVault } from '../audit/vault.js';

/**
 * Daily off-site backup: a full database dump (pg_dump, compressed), encrypted with AES-256-GCM
 * using BACKUP_PASSPHRASE, saved on the server and emailed to BACKUP_EMAIL_TO.
 * Configure with: bash deploy/setup-email-backup.sh  (runs on the server; nobody else sees the passwords).
 * Restore: node deploy/decrypt-backup.mjs file.mpbak > monipack.dump ; pg_restore -d <db> monipack.dump
 *
 * File format: "MPBK1" | salt(16) | iv(12) | tag(16) | ciphertext
 */
const MAGIC = Buffer.from('MPBK1');
const MAX_EMAIL_BYTES = 20 * 1024 * 1024; // most mail services accept 25 MB
const DIR = process.env.BACKUP_DIR || '/var/lib/monipack-crm/backups';
let last = { at: null, ok: null, message: 'No backup has run yet.', bytes: 0, emailed: false };

export const backupConfigured = () => Boolean(process.env.BACKUP_PASSPHRASE && process.env.BACKUP_EMAIL_TO && process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

function dump() {
  return new Promise((resolve, reject) => {
    const p = spawn('pg_dump', ['--format=custom', '--compress=9', '--no-owner', '--no-privileges', '--dbname', process.env.DATABASE_URL], { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = []; let err = '';
    p.stdout.on('data', (c) => chunks.push(c));
    p.stderr.on('data', (c) => { err += c; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`pg_dump failed: ${err.trim().slice(0, 300)}`))));
  });
}

export function encrypt(buf, passphrase) {
  const salt = crypto.randomBytes(16); const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([MAGIC, salt, iv, c.getAuthTag(), enc]);
}

export function decrypt(file, passphrase) {
  if (!file.subarray(0, 5).equals(MAGIC)) throw new Error('Not a Monipack backup file.');
  const salt = file.subarray(5, 21); const iv = file.subarray(21, 33); const tag = file.subarray(33, 49);
  const key = crypto.scryptSync(passphrase, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(file.subarray(49)), d.final()]);
}

export async function runBackup({ reason = 'daily' } = {}) {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const name = `monipack-crm-${stamp}.mpbak`;
  try {
    if (!backupConfigured()) throw new Error('Email backup is not set up yet. Run: bash /opt/monipack-crm/deploy/setup-email-backup.sh');
    const raw = await dump();
    const file = encrypt(raw, process.env.BACKUP_PASSPHRASE);
    try {
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(path.join(DIR, name), file, { mode: 0o600 });
      for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.mpbak')).sort().slice(0, -14)) fs.unlinkSync(path.join(DIR, f));
    } catch { /* keeping a local copy is a bonus, the email is the off-site copy */ }

    const port = Number(process.env.SMTP_PORT || 465);
    const tx = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
    const big = file.length > MAX_EMAIL_BYTES;
    const mb = (file.length / 1048576).toFixed(2);
    await tx.sendMail({
      from: `"Monipack CRM backup" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: process.env.BACKUP_EMAIL_TO,
      subject: `Monipack CRM backup ${new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Muscat' })}${big ? ' (too large to attach)' : ''}`,
      text: big
        ? `Today's backup is ${mb} MB, too large to email. It is saved on the server as ${path.join(DIR, name)}.`
        : `Attached is today's encrypted CRM backup (${mb} MB).\n\nKeep this email. To restore, you need this file and your backup passphrase.\nThe file cannot be opened without the passphrase.\n\nMonipack CRM`,
      attachments: big ? [] : [{ filename: name, content: file, contentType: 'application/octet-stream' }],
    });
    last = { at: new Date().toISOString(), ok: true, message: big ? `Backup made (${mb} MB) but too large to email; saved on the server.` : `Backup emailed (${mb} MB).`, bytes: file.length, emailed: !big };
  } catch (err) {
    last = { at: new Date().toISOString(), ok: false, message: err.message, bytes: 0, emailed: false };
  }
  await appendVault({ actorKind: 'system', actorName: 'Daily backup', category: 'security', action: `${last.ok ? 'Backup' : 'Backup FAILED'} (${reason}): ${last.message}`.slice(0, 480), method: 'SYSTEM', path: 'backup', status: last.ok ? 200 : 500 }).catch(() => {});
  return last;
}

/** Runs once a day at 02:30 Oman time. */
export function startBackupSchedule() {
  if (process.env.NODE_ENV === 'test') return;
  let lastDay = null;
  const tick = () => {
    const now = new Date();
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Muscat', hour: '2-digit', minute: '2-digit', year: 'numeric', month: '2-digit', day: '2-digit', hour12: false }).formatToParts(now).map((p) => [p.type, p.value]));
    const day = `${parts.year}-${parts.month}-${parts.day}`;
    if (Number(parts.hour) === 2 && Number(parts.minute) >= 30 && lastDay !== day && backupConfigured()) {
      lastDay = day;
      runBackup({ reason: 'daily' });
    }
  };
  const t = setInterval(tick, 60 * 1000);
  if (t.unref) t.unref();
}

export function registerBackupRoutes(app, { authMiddleware, asyncHandler }) {
  const superOnly = (req, res, next) => (req.user?.role === 'super_admin' ? next() : res.status(403).json({ error: 'Super admin only.' }));
  app.get('/api/backup/status', authMiddleware, superOnly, (req, res) => {
    res.json({ configured: backupConfigured(), to: process.env.BACKUP_EMAIL_TO ? String(process.env.BACKUP_EMAIL_TO).replace(/^(.{2}).*(@.*)$/, '$1•••$2') : null, last });
  });
  app.post('/api/backup/email-now', authMiddleware, superOnly, asyncHandler(async (req, res) => {
    const r = await runBackup({ reason: `sent now by ${req.user.name}` });
    res.status(r.ok ? 200 : 400).json(r);
  }));
}

// CLI: node server/backup/daily.js --now   (used by the setup script to send a test backup)
if (process.argv[1] && process.argv[1].endsWith(path.join('backup', 'daily.js')) && process.argv.includes('--now')) {
  runBackup({ reason: 'test from setup' }).then((r) => { console.log(r.ok ? `OK: ${r.message}` : `FAILED: ${r.message}`); process.exit(r.ok ? 0 : 1); });
}
