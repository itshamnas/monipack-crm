/**
 * SQL pieces for "who may see which lead". Scope comes from dataScope(user):
 *   {} everything · { segment: 'b2b'|'retail' } one department · { salesmanId } own leads
 */
export const LEAD_SEGMENT = (a = '') => `lead_segment(${a}branch_id, ${a}salesman_id, ${a}branch_name)`;

/** Returns { sql, params } to AND onto a leads query. `a` is the table alias with a dot ('l.') or ''. */
export function leadScopeSql(scope = {}, startIdx = 1, a = '') {
  if (scope.salesmanId !== undefined) {
    const n = parseInt(scope.salesmanId, 10);
    return { sql: ` AND ${a}salesman_id = $${startIdx}`, params: [isNaN(n) ? -1 : n] };
  }
  if (scope.segment) {
    return { sql: ` AND ${LEAD_SEGMENT(a)} = $${startIdx}`, params: [String(scope.segment)] };
  }
  return { sql: '', params: [] };
}

/** Salesman type for a department. */
export const SALESMAN_TYPE = { b2b: 'route_b2b', retail: 'branch' };
