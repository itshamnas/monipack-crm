import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Private folder for uploaded photos/PDFs (never served directly by the web server). */
export function uploadRoot() {
  return path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads'));
}

/** Save bytes and return the storage key (relative path). */
export function saveFile(buffer, ext) {
  const now = new Date();
  const key = path.posix.join(
    'customers',
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    `${crypto.randomUUID()}.${ext}`
  );
  const full = path.join(uploadRoot(), key);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, buffer, { mode: 0o640 });
  return key;
}

/** Read a stored file; refuses any key that would leave the upload folder. */
export function readFile(key) {
  const root = uploadRoot();
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error('Invalid storage key');
  return fs.readFileSync(full);
}
