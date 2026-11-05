import { query } from './pool.js';
import { activityToApi } from './utils.js';

export async function addActivity(act) {
  const leadId = act.leadId ? parseInt(act.leadId, 10) || null : null;
  const { rows } = await query(
    `INSERT INTO lead_activities (lead_id, lead_name, type, description)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [leadId, act.leadName || '', act.type || 'note', act.description || '']
  );
  return activityToApi(rows[0]);
}

export async function getActivities(limit = 20) {
  const { rows } = await query(
    'SELECT * FROM lead_activities ORDER BY "timestamp" DESC LIMIT $1',
    [limit]
  );
  return rows.map(activityToApi);
}
