import { query } from './pool.js';
import { stageToApi } from './utils.js';

export async function getPipelineStages() {
  const { rows } = await query('SELECT * FROM pipeline_stages ORDER BY sort_order, id');
  return rows.map(stageToApi);
}

export async function addPipelineStage({ id, label, color }) {
  if (!label) return null;
  const stageId = id || label.toLowerCase().replace(/[^a-z0-9]/g, '_');

  // Check if already exists
  const { rows: existing } = await query(
    'SELECT * FROM pipeline_stages WHERE stage_id = $1', [stageId]
  );
  if (existing[0]) return stageToApi(existing[0]);

  // Get next sort order
  const { rows: maxRow } = await query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM pipeline_stages');

  const { rows } = await query(
    `INSERT INTO pipeline_stages (stage_id, label, color, sort_order)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [stageId, label.trim(), color || 'border-t-red-500 bg-red-50/30', maxRow[0].next]
  );
  return stageToApi(rows[0]);
}

export async function deletePipelineStage(stageId) {
  // Don't delete if only one remains
  const { rows: countRow } = await query('SELECT COUNT(*) AS cnt FROM pipeline_stages');
  if (parseInt(countRow[0].cnt) <= 1) return false;

  const { rowCount } = await query('DELETE FROM pipeline_stages WHERE stage_id = $1', [stageId]);
  return rowCount > 0;
}
