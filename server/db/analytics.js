import { query } from './pool.js';
import { activityToApi } from './utils.js';
import { leadScopeSql } from './scope.js';

/**
 * @param {{ salesmanId?: string|number }} scope - when set, every figure covers only that salesman's leads
 */
export async function getAnalytics(scope = {}) {
  const sc = leadScopeSql(scope, 1);
  const own = sc.params.length > 0; // any limited scope (own leads or one department)
  const leadWhere = `archived_at IS NULL${sc.sql}`;
  const p = sc.params;
  const scopedLeadIds = `SELECT id FROM leads WHERE TRUE${sc.sql}`;

  // Lead counts by status
  const { rows: statusCounts } = await query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'new') AS new_leads,
      COUNT(*) FILTER (WHERE status = 'contacted') AS contacted,
      COUNT(*) FILTER (WHERE status = 'quotation_sent') AS quote_sent,
      COUNT(*) FILTER (WHERE status = 'sample_sent') AS sample_sent,
      COUNT(*) FILTER (WHERE status = 'won') AS won,
      COUNT(*) FILTER (WHERE status = 'lost') AS lost,
      COALESCE(SUM(deal_value), 0) AS pipeline_value
    FROM leads WHERE ${leadWhere}
  `, p);

  const s = statusCounts[0];
  const totalLeads = parseInt(s.total);
  const wonLeads = parseInt(s.won);
  const lostLeads = parseInt(s.lost);
  const closed = wonLeads + lostLeads;
  const conversionRate = closed > 0 ? Number(((wonLeads / closed) * 100).toFixed(1)) : 0;

  // Category breakdown
  const { rows: catRows } = await query(
    `SELECT category, COUNT(*) AS cnt FROM leads WHERE ${leadWhere} GROUP BY category`, p
  );
  const categoryCounts = {};
  catRows.forEach(r => { categoryCounts[r.category || 'Other'] = parseInt(r.cnt); });

  // Branch breakdown
  const { rows: branchRows } = await query(
    `SELECT branch_name, COUNT(*) AS cnt FROM leads WHERE ${leadWhere} GROUP BY branch_name`, p
  );
  const branchCounts = {};
  branchRows.forEach(r => { branchCounts[r.branch_name || 'Ghala'] = parseInt(r.cnt); });

  // Quotation count
  const { rows: qCount } = await query(
    own
      ? `SELECT COUNT(*) AS cnt FROM quotations WHERE archived_at IS NULL AND lead_id IN (${scopedLeadIds})`
      : 'SELECT COUNT(*) AS cnt FROM quotations WHERE archived_at IS NULL',
    p
  );

  // Recent activities from lead_activities
  const { rows: recentRows } = await query(
    own
      ? `SELECT * FROM lead_activities WHERE lead_id IN (${scopedLeadIds}) ORDER BY "timestamp" DESC LIMIT 35`
      : 'SELECT * FROM lead_activities ORDER BY "timestamp" DESC LIMIT 35',
    p
  );

  return {
    totalLeads,
    newLeads: parseInt(s.new_leads),
    contactedLeads: parseInt(s.contacted),
    quoteSentLeads: parseInt(s.quote_sent),
    sampleSentLeads: parseInt(s.sample_sent),
    wonLeads,
    lostLeads,
    totalPipelineValueOMR: Number(Number(s.pipeline_value).toFixed(3)),
    totalQuotations: parseInt(qCount[0].cnt),
    conversionRate,
    categoryCounts,
    branchCounts,
    recentActivities: recentRows.map(activityToApi),
  };
}
