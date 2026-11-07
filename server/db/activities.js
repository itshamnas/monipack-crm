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

/** One lead's history: notes, calls, stage changes (newest first) */
export async function getLeadTimeline(leadId, limit = 200) {
  const id = parseInt(leadId, 10);
  if (Number.isNaN(id)) return [];
  const [{ rows: acts }, { rows: hist }] = await Promise.all([
    query('SELECT * FROM lead_activities WHERE lead_id = $1 ORDER BY "timestamp" DESC LIMIT $2', [id, limit]),
    query('SELECT * FROM lead_stage_history WHERE lead_id = $1 ORDER BY changed_at DESC LIMIT $2', [id, limit]),
  ]);
  const items = [
    ...acts.map((a) => ({ kind: 'activity', ...activityToApi(a) })),
    ...hist.map((h) => ({ kind: 'stage', id: `h${h.id}`, type: 'stage', fromStatus: h.from_status, toStatus: h.to_status, by: h.changed_by, timestamp: new Date(h.changed_at).toISOString() })),
  ];
  // stage changes are also logged as activities; keep the activity text and drop the duplicate history rows
  const seen = new Set(acts.filter((a) => a.type === 'status_change').map((a) => Math.round(new Date(a.timestamp).getTime() / 5000)));
  return items
    .filter((it) => it.kind !== 'stage' || !seen.has(Math.round(new Date(it.timestamp).getTime() / 5000)))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
}
