import { query } from './pool.js';

export async function recordStageChange({ leadId, fromStatus, toStatus, changedBy }) {
  const numLeadId = parseInt(leadId, 10);
  if (isNaN(numLeadId)) return null;
  const { rows } = await query(
    `INSERT INTO lead_stage_history (lead_id, from_status, to_status, changed_by)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [numLeadId, fromStatus || null, toStatus, changedBy]
  );
  return rows[0];
}

export async function getStageHistory(leadId) {
  const numLeadId = parseInt(leadId, 10);
  if (isNaN(numLeadId)) return [];
  const { rows } = await query(
    'SELECT * FROM lead_stage_history WHERE lead_id = $1 ORDER BY changed_at DESC',
    [numLeadId]
  );
  return rows;
}
