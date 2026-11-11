/**
 * Money report: won / lost / open value, per person, by period, with lost-reason breakdown.
 * Every figure respects the viewer's scope (own leads, one department, or everything).
 *
 * A lead's value = latest quotation total for it; until there is a quotation, the deal value typed on the lead.
 * Times are Oman time (UTC+4). Weeks start on Sunday. Quarters are Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec.
 */
import { query } from '../db/pool.js';
import { leadScopeSql } from '../db/scope.js';
import { dataScope } from '../auth/permissions.js';

const TZ_MS = 4 * 3600 * 1000; // Asia/Muscat, no daylight saving
const DAY = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const LEAD_VALUE = `COALESCE(
  (SELECT q.grand_total_omr FROM quotations q WHERE q.lead_id = l.id AND q.archived_at IS NULL AND q.grand_total_omr > 0 ORDER BY q.created_at DESC LIMIT 1),
  NULLIF(l.deal_value, 0), 0)`;

// Oman-local calendar helpers (work on a Date whose UTC fields hold Oman wall time)
const local = (d) => new Date(d.getTime() + TZ_MS);
const fromLocal = (y, m, day) => new Date(Date.UTC(y, m, day) - TZ_MS); // Oman midnight -> real instant
const fmt = (d) => { const l = local(d); return `${l.getUTCDate()} ${MONTHS[l.getUTCMonth()]} ${l.getUTCFullYear()}`; };

/** Start/end (end exclusive) for a period, shifted by `offset` periods (0 = current, -1 = previous). */
export function periodRange(period = 'month', offset = 0, now = new Date()) {
  const l = local(now);
  const y = l.getUTCFullYear(); const m = l.getUTCMonth(); const d = l.getUTCDate();
  let from; let to; let label;
  if (period === 'week') {
    const start = d - l.getUTCDay() + offset * 7; // Sunday
    from = fromLocal(y, m, start); to = fromLocal(y, m, start + 7);
    label = `Week of ${fmt(from)}`;
  } else if (period === 'quarter') {
    const q0 = Math.floor(m / 3) * 3 + offset * 3;
    from = fromLocal(y, q0, 1); to = fromLocal(y, q0 + 3, 1);
    const lf = local(from);
    label = `Q${Math.floor(lf.getUTCMonth() / 3) + 1} ${lf.getUTCFullYear()}`;
  } else if (period === 'year') {
    from = fromLocal(y + offset, 0, 1); to = fromLocal(y + offset + 1, 0, 1);
    label = String(y + offset);
  } else {
    from = fromLocal(y, m + offset, 1); to = fromLocal(y, m + offset + 1, 1);
    const lf = local(from);
    label = `${MONTHS[lf.getUTCMonth()]} ${lf.getUTCFullYear()}`;
  }
  return { from, to, label };
}

function parseDay(s) {
  const mm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  return mm ? fromLocal(+mm[1], +mm[2] - 1, +mm[3]) : null;
}

/** Custom range from YYYY-MM-DD to YYYY-MM-DD (inclusive), plus the same-length range just before it. */
export function customRange(fromS, toS) {
  const from = parseDay(fromS); const toDay = parseDay(toS);
  if (!from || !toDay || toDay < from) return null;
  const to = new Date(toDay.getTime() + DAY);
  if (to - from > 3 * 366 * DAY) return null;
  const len = to - from;
  return {
    cur: { from, to, label: `${fmt(from)} – ${fmt(toDay)}` },
    prev: { from: new Date(from - len), to: from, label: `${fmt(new Date(from - len))} – ${fmt(new Date(from - DAY))}` },
  };
}

function bucketsFor(range, period) {
  const span = (range.to - range.from) / DAY;
  const unit = period === 'year' || span > 200 ? 'month' : period === 'quarter' || span > 45 ? 'week' : 'day';
  const out = [];
  const l = local(range.from);
  let cur = range.from;
  if (unit === 'week') cur = fromLocal(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() - l.getUTCDay());
  if (unit === 'month') cur = fromLocal(l.getUTCFullYear(), l.getUTCMonth(), 1);
  while (cur < range.to && out.length < 400) {
    const c = local(cur);
    let next;
    let label;
    if (unit === 'day') { next = new Date(cur.getTime() + DAY); label = `${c.getUTCDate()} ${MONTHS[c.getUTCMonth()]}`; }
    else if (unit === 'week') { next = new Date(cur.getTime() + 7 * DAY); label = `${c.getUTCDate()} ${MONTHS[c.getUTCMonth()]}`; }
    else { next = fromLocal(c.getUTCFullYear(), c.getUTCMonth() + 1, 1); label = `${MONTHS[c.getUTCMonth()]}${period === 'year' ? '' : ` ${String(c.getUTCFullYear()).slice(2)}`}`; }
    out.push({ from: new Date(Math.max(cur, range.from)), to: new Date(Math.min(next, range.to)), label });
    cur = next;
  }
  return { unit, buckets: out };
}

const n = (v) => Number(v || 0);
const r3 = (v) => Math.round(n(v) * 1000) / 1000;

async function totalsFor(scope, range) {
  const sc = leadScopeSql(scope, 3, 'l.');
  const { rows } = await query(
    `SELECT
       COUNT(*) FILTER (WHERE l.status = 'won' AND l.closed_at >= $1 AND l.closed_at < $2) AS won_c,
       COALESCE(SUM(v.val) FILTER (WHERE l.status = 'won' AND l.closed_at >= $1 AND l.closed_at < $2), 0) AS won_v,
       COUNT(*) FILTER (WHERE l.status = 'lost' AND l.closed_at >= $1 AND l.closed_at < $2) AS lost_c,
       COALESCE(SUM(v.val) FILTER (WHERE l.status = 'lost' AND l.closed_at >= $1 AND l.closed_at < $2), 0) AS lost_v,
       COUNT(*) FILTER (WHERE l.created_at >= $1 AND l.created_at < $2) AS new_c,
       COALESCE(SUM(v.val) FILTER (WHERE l.created_at >= $1 AND l.created_at < $2), 0) AS new_v,
       AVG(EXTRACT(EPOCH FROM (l.closed_at - l.created_at)) / 86400) FILTER (WHERE l.status = 'won' AND l.closed_at >= $1 AND l.closed_at < $2) AS days_c
     FROM leads l CROSS JOIN LATERAL (SELECT ${LEAD_VALUE} AS val) v
     WHERE l.archived_at IS NULL${sc.sql}`,
    [range.from, range.to, ...sc.params]
  );
  const t = rows[0];
  const won = { count: n(t.won_c), value: r3(t.won_v) };
  const lost = { count: n(t.lost_c), value: r3(t.lost_v) };
  const closed = won.count + lost.count;
  return {
    won, lost,
    created: { count: n(t.new_c), value: r3(t.new_v) },
    winRate: closed ? Math.round((won.count / closed) * 1000) / 10 : null,
    avgDeal: won.count ? r3(won.value / won.count) : 0,
    avgDaysToClose: t.days_c == null ? null : Math.round(n(t.days_c) * 10) / 10,
  };
}

export async function valueReport(user, { period = 'month', offset = 0, from, to } = {}) {
  const scope = dataScope(user);
  let cur; let prev;
  if (period === 'custom') {
    const c = customRange(from, to);
    if (!c) throw Object.assign(new Error('Choose a valid date range (up to 3 years).'), { status: 400 });
    ({ cur, prev } = c);
  } else {
    if (!['week', 'month', 'quarter', 'year'].includes(period)) period = 'month';
    const off = Math.max(-120, Math.min(0, parseInt(offset, 10) || 0));
    cur = periodRange(period, off);
    prev = periodRange(period, off - 1);
  }

  const sc = leadScopeSql(scope, 3, 'l.');
  const scOpen = leadScopeSql(scope, 1, 'l.');
  const { unit, buckets } = bucketsFor(cur, period);

  const [totals, prevTotals, openRow, peopleRows, reasonRows, trendRows] = await Promise.all([
    totalsFor(scope, cur),
    totalsFor(scope, prev),
    // Current open pipeline (right now, not limited to the period)
    query(
      `SELECT COUNT(*) AS c, COALESCE(SUM(v.val), 0) AS v FROM leads l CROSS JOIN LATERAL (SELECT ${LEAD_VALUE} AS val) v
       WHERE l.archived_at IS NULL AND l.status NOT IN ('won', 'lost')${scOpen.sql}`, scOpen.params),
    // Per person
    query(
      `SELECT l.salesman_id AS sid, COALESCE(s.name, NULLIF(l.salesman_name, ''), 'Not assigned') AS name, s.type, s.photo_key,
         COUNT(*) FILTER (WHERE l.status = 'won' AND l.closed_at >= $1 AND l.closed_at < $2) AS won_c,
         COALESCE(SUM(v.val) FILTER (WHERE l.status = 'won' AND l.closed_at >= $1 AND l.closed_at < $2), 0) AS won_v,
         COUNT(*) FILTER (WHERE l.status = 'lost' AND l.closed_at >= $1 AND l.closed_at < $2) AS lost_c,
         COALESCE(SUM(v.val) FILTER (WHERE l.status = 'lost' AND l.closed_at >= $1 AND l.closed_at < $2), 0) AS lost_v,
         COUNT(*) FILTER (WHERE l.status NOT IN ('won', 'lost')) AS open_c,
         COALESCE(SUM(v.val) FILTER (WHERE l.status NOT IN ('won', 'lost')), 0) AS open_v,
         COUNT(*) FILTER (WHERE l.created_at >= $1 AND l.created_at < $2) AS new_c
       FROM leads l
       LEFT JOIN salesmen s ON s.id = l.salesman_id
       CROSS JOIN LATERAL (SELECT ${LEAD_VALUE} AS val) v
       WHERE l.archived_at IS NULL${sc.sql}
       GROUP BY 1, 2, 3, 4`, [cur.from, cur.to, ...sc.params]),
    // Lost reasons in the period
    query(
      `SELECT COALESCE(NULLIF(trim(l.lost_reason), ''), '') AS reason, COUNT(*) AS c, COALESCE(SUM(v.val), 0) AS v
       FROM leads l CROSS JOIN LATERAL (SELECT ${LEAD_VALUE} AS val) v
       WHERE l.archived_at IS NULL AND l.status = 'lost' AND l.closed_at >= $1 AND l.closed_at < $2${sc.sql}
       GROUP BY 1 ORDER BY 3 DESC, 2 DESC`, [cur.from, cur.to, ...sc.params]),
    // Trend: won / lost value per bucket, new enquiries per bucket
    query(
      `WITH b AS (SELECT * FROM unnest($1::timestamptz[], $2::timestamptz[]) WITH ORDINALITY AS t(f, e, i))
       SELECT b.i,
         COALESCE(SUM(v.val) FILTER (WHERE l.status = 'won' AND l.closed_at >= b.f AND l.closed_at < b.e), 0) AS won_v,
         COALESCE(SUM(v.val) FILTER (WHERE l.status = 'lost' AND l.closed_at >= b.f AND l.closed_at < b.e), 0) AS lost_v,
         COUNT(l.id) FILTER (WHERE l.created_at >= b.f AND l.created_at < b.e) AS new_c
       FROM b
       LEFT JOIN leads l ON l.archived_at IS NULL
         AND ((l.closed_at >= b.f AND l.closed_at < b.e) OR (l.created_at >= b.f AND l.created_at < b.e))${leadScopeSql(scope, 3, 'l.').sql}
       LEFT JOIN LATERAL (SELECT ${LEAD_VALUE} AS val) v ON l.id IS NOT NULL
       GROUP BY b.i ORDER BY b.i`,
      [buckets.map((x) => x.from), buckets.map((x) => x.to), ...leadScopeSql(scope, 3, 'l.').params]),
  ]);

  const people = peopleRows.rows.map((r) => {
    const wonC = n(r.won_c); const lostC = n(r.lost_c);
    return {
      id: r.sid != null ? String(r.sid) : null,
      name: r.name,
      type: r.type || null,
      photoUrl: r.photo_key ? `/api/photos/${r.photo_key}` : null,
      won: { count: wonC, value: r3(r.won_v) },
      lost: { count: lostC, value: r3(r.lost_v) },
      open: { count: n(r.open_c), value: r3(r.open_v) },
      created: n(r.new_c),
      winRate: wonC + lostC ? Math.round((wonC / (wonC + lostC)) * 1000) / 10 : null,
    };
  }).filter((p) => p.won.count || p.lost.count || p.open.count || p.created)
    .sort((a, b) => b.won.value - a.won.value || b.open.value - a.open.value || a.name.localeCompare(b.name));

  return {
    period,
    unit,
    scope: scope.segment ? { segment: scope.segment } : scope.salesmanId !== undefined ? { own: true } : { all: true },
    range: { from: cur.from, to: cur.to, label: cur.label },
    prev: { from: prev.from, to: prev.to, label: prev.label },
    totals: { ...totals, open: { count: n(openRow.rows[0].c), value: r3(openRow.rows[0].v) } },
    prevTotals,
    people,
    lostReasons: reasonRows.rows.map((r) => ({ reason: r.reason, count: n(r.c), value: r3(r.v) })),
    trend: buckets.map((b, i) => {
      const t = trendRows.rows.find((x) => Number(x.i) === i + 1) || {};
      return { label: b.label, won: r3(t.won_v), lost: r3(t.lost_v), created: n(t.new_c) };
    }),
  };
}

export function registerReportRoutes(app, { authMiddleware, requirePermission, asyncHandler, audit }) {
  app.get('/api/reports/value', authMiddleware, requirePermission('reports.view'), asyncHandler(async (req, res) => {
    try {
      res.json(await valueReport(req.user, req.query));
    } catch (e) {
      if (e.status === 400) return res.status(400).json({ error: e.message });
      throw e;
    }
  }));
  // The PDF is made in the browser; this records who exported what (and refuses people without export rights)
  app.post('/api/reports/export-log', authMiddleware, requirePermission('reports.export'), asyncHandler(async (req, res) => {
    const label = String(req.body?.label || '').slice(0, 120);
    await audit?.(req, `Exported the money report (PDF): ${label}`);
    res.json({ ok: true });
  }));
}
