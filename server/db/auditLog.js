import { query } from './pool.js';
import { auditLogToApi } from './utils.js';

export async function addAuditEntry(entry) {
  const userId = entry.userId ? parseInt(entry.userId, 10) || null : null;
  const { rows } = await query(
    `INSERT INTO audit_log (event_type, user_id, user_name, target_email, ip_address, description, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      entry.type || entry.eventType || 'system',
      userId,
      entry.userName || '',
      entry.targetEmail || '',
      entry.ipAddress || '',
      entry.description || '',
      entry.metadata ? JSON.stringify(entry.metadata) : null,
    ]
  );
  return auditLogToApi(rows[0]);
}

export async function getAuditLogs(limit = 100) {
  const { rows } = await query(
    'SELECT * FROM audit_log ORDER BY created_at DESC LIMIT $1',
    [limit]
  );
  return rows.map(auditLogToApi);
}
