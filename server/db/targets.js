import { query } from './pool.js';

/** First day of a month from 'YYYY-MM' (defaults to this month) */
export function monthStart(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, 1)) : new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), 1));
  return d.toISOString().slice(0, 10);
}

/** Every active salesman with his target and what he has won this month (leads moved to Won in the month) */
export async function getTargets(ym) {
  const month = monthStart(ym);
  const { rows } = await query(
    `SELECT s.id, s.name,
            COALESCE(t.target_omr, 0) AS target_omr,
            COALESCE(w.won, 0) AS won_omr,
            COALESCE(w.deals, 0) AS won_deals
       FROM salesmen s
       LEFT JOIN sales_targets t ON t.salesman_id = s.id AND t.month = $1::date
       LEFT JOIN LATERAL (
         SELECT SUM(l.deal_value) AS won, COUNT(*) AS deals
           FROM leads l
          WHERE l.salesman_id = s.id AND l.archived_at IS NULL AND l.status = 'won'
            AND EXISTS (SELECT 1 FROM lead_stage_history h WHERE h.lead_id = l.id AND h.to_status = 'won'
                          AND h.changed_at >= $1::date AND h.changed_at < ($1::date + INTERVAL '1 month'))
       ) w ON true
      WHERE s.archived_at IS NULL
      ORDER BY s.name`,
    [month]
  );
  return {
    month: month.slice(0, 7),
    rows: rows.map((r) => ({ salesmanId: String(r.id), name: r.name, targetOmr: Number(r.target_omr), wonOmr: Number(r.won_omr), wonDeals: Number(r.won_deals) })),
  };
}

export async function setTargets(ym, list) {
  const month = monthStart(ym);
  for (const t of list) {
    const id = parseInt(t.salesmanId, 10);
    const v = Number(t.targetOmr);
    if (Number.isNaN(id) || !Number.isFinite(v) || v < 0) continue;
    await query(
      `INSERT INTO sales_targets (salesman_id, month, target_omr, updated_at) VALUES ($1, $2::date, $3, now())
       ON CONFLICT (salesman_id, month) DO UPDATE SET target_omr = EXCLUDED.target_omr, updated_at = now()`,
      [id, month, Math.round(v * 1000) / 1000]
    );
  }
  return getTargets(ym);
}
