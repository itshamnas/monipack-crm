import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, FileDown, TrendingUp, TrendingDown, Trophy, XCircle, Wallet, Percent, Timer, Coins, FileText, Send, CheckCircle2, Ban } from 'lucide-react';
import { Seg } from './Home.jsx';
import Avatar from '../components/ui/Avatar.jsx';
import { lostReasonLabel } from '../utils/lostReasons.js';
import { openPendingWindow, openPrintable, chipsHtml, tableHtml, noteHtml, esc } from '../utils/pdfReport.js';

const WON = '#0E9F6E';
const LOST = '#E0453A';
const omr = (v, d = 0) => `OMR ${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const short = (v) => {
  const n = Number(v || 0);
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K`;
  return String(Math.round(n));
};
/** Big numbers shortened on the cards (full figure on hover) */
const big = (v) => (Math.abs(Number(v || 0)) >= 100000 ? `OMR ${short(v)}` : omr(v));
const r3 = (v) => Math.round(Number(v || 0) * 1000) / 1000;
const pctChange = (cur, prev) => (prev ? Math.round(((cur - prev) / prev) * 100) : cur ? null : 0);
const cols = (...names) => names.map((label, i) => ({ label, num: i > 0 }));
const TYPE_LABEL = { route_b2b: 'B2B', branch: 'Retail' };

function Delta({ cur, prev, goodUp = true }) {
  const p = pctChange(cur, prev);
  if (p === 0) return <span className="text-[11px] mpd-mute">same as before</span>;
  if (p === null) return <span className="text-[11px] mpd-mute">nothing last period</span>;
  const up = p > 0;
  const good = up === goodUp;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: good ? WON : LOST }}>
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />{up ? '+' : ''}{p}% <span className="mpd-mute font-normal">vs last</span>
    </span>
  );
}

function Kpi({ icon: Icon, label, value, sub, delta, tone, title }) {
  return (
    <div className="mpd-card p-4 min-w-0">
      <div className="flex items-center gap-2 text-[11.5px] mpd-mute">
        <span className="grid place-items-center rounded-lg shrink-0" style={{ width: 26, height: 26, background: `${tone}1A`, color: tone }}><Icon className="w-3.5 h-3.5" aria-hidden="true" /></span>
        {label}
      </div>
      <b className="block mt-2 text-[22px] leading-tight font-semibold tabular-nums truncate" title={title}>{value}</b>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {sub && <span className="text-[11px] mpd-mute">{sub}</span>}
        {delta}
      </div>
    </div>
  );
}

/** Won value above the line, lost value below it, one column per day / week / month. */
function TrendChart({ trend }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...trend.map((t) => Math.max(t.won, t.lost)));
  const H = 92; // px per half
  const every = Math.ceil(trend.length / 12);
  return (
    <div className="px-4 pb-4">
      <div className="flex items-center gap-4 text-[11.5px] mb-2" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: WON }} />Won (above the line)</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: LOST }} />Lost (below the line)</span>
      </div>
      <div className="relative" onPointerLeave={() => setHover(null)}>
        <div className="flex items-stretch gap-[2px]" style={{ height: H * 2 + 1 }} role="img" aria-label="Won and lost value over time">
          {trend.map((t, i) => (
            <button
              key={i}
              type="button"
              className="relative flex-1 min-w-0 flex flex-col outline-none"
              onPointerEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${t.label}: won ${omr(t.won)}, lost ${omr(t.lost)}, ${t.created} new enquiries`}
            >
              <span className="flex-1 flex items-end justify-center">
                <span className="w-full max-w-[22px] rounded-t transition-[height]" style={{ height: `${(t.won / max) * H}px`, background: WON, opacity: hover === null || hover === i ? 1 : 0.45 }} />
              </span>
              <span className="h-px w-full" style={{ background: 'var(--d-line2)' }} />
              <span className="flex-1 flex items-start justify-center">
                <span className="w-full max-w-[22px] rounded-b transition-[height]" style={{ height: `${(t.lost / max) * H}px`, background: LOST, opacity: hover === null || hover === i ? 0.85 : 0.35 }} />
              </span>
            </button>
          ))}
        </div>
        <div className="flex gap-[2px] mt-1.5" aria-hidden="true">
          {trend.map((t, i) => <span key={i} className="flex-1 min-w-0 text-center text-[10px] mpd-mute truncate">{i % every === 0 ? t.label : ''}</span>)}
        </div>
        {hover !== null && trend[hover] && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg px-3 py-2 text-[11.5px] shadow-lg whitespace-nowrap"
            style={{
              top: H - 40,
              ...((hover + 0.5) / trend.length > 0.5
                ? { right: `calc(${(1 - hover / trend.length) * 100}% + 8px)` }
                : { left: `calc(${((hover + 1) / trend.length) * 100}% + 8px)` }),
              background: 'var(--d-panel, #fff)', border: '1px solid var(--d-line2)', color: 'var(--d-text)',
            }}
          >
            <b className="block mb-0.5">{trend[hover].label}</b>
            <span className="block"><i className="inline-block w-2 h-2 rounded-sm mr-1.5" style={{ background: WON }} />Won {omr(trend[hover].won)}</span>
            <span className="block"><i className="inline-block w-2 h-2 rounded-sm mr-1.5" style={{ background: LOST }} />Lost {omr(trend[hover].lost)}</span>
            <span className="block mpd-mute">{trend[hover].created} new enquiries</span>
          </div>
        )}
      </div>
      <details className="mt-3 text-[12px]">
        <summary className="cursor-pointer mpd-mute">Show as a table</summary>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-left tabular-nums">
            <thead><tr className="mpd-mute"><th className="py-1 pr-3 font-medium">Period</th><th className="py-1 pr-3 font-medium text-right">Won</th><th className="py-1 pr-3 font-medium text-right">Lost</th><th className="py-1 font-medium text-right">New enquiries</th></tr></thead>
            <tbody>{trend.map((t, i) => <tr key={i} style={{ borderTop: '1px solid var(--d-line)' }}><td className="py-1 pr-3">{t.label}</td><td className="py-1 pr-3 text-right">{omr(t.won)}</td><td className="py-1 pr-3 text-right">{omr(t.lost)}</td><td className="py-1 text-right">{t.created}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

export default function Money({ authFetch, currentUser, showToast }) {
  const [period, setPeriod] = useState('month');
  const [offset, setOffset] = useState(0);
  const [custom, setCustom] = useState(() => {
    const t = new Date(); const f = new Date(t.getFullYear(), t.getMonth(), 1);
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { from: iso(f), to: iso(t) };
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sort, setSort] = useState('won');
  const canExport = Boolean(currentUser?.permissions?.includes('reports.export'));

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const qs = period === 'custom' ? `period=custom&from=${custom.from}&to=${custom.to}` : `period=${period}&offset=${offset}`;
    try {
      const res = await authFetch(`/api/reports/value?${qs}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not load the report.');
      setData(body);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [authFetch, period, offset, custom]);
  useEffect(() => { load(); }, [load]);

  const people = useMemo(() => {
    const list = [...(data?.people || [])];
    const key = { won: (p) => p.won.value, lost: (p) => p.lost.value, open: (p) => p.open.value, rate: (p) => p.winRate ?? -1 }[sort];
    return list.sort((a, b) => key(b) - key(a));
  }, [data, sort]);
  const maxPerson = Math.max(1, ...people.map((p) => Math.max(p.won.value, p.lost.value, p.open.value)));
  const reasonsTotal = (data?.lostReasons || []).reduce((s, r) => s + r.value, 0);
  const t = data?.totals; const pt = data?.prevTotals;
  const scopeLabel = data?.scope?.segment ? `${data.scope.segment === 'b2b' ? 'B2B' : 'Retail'} department` : data?.scope?.own ? 'Your own leads' : 'Whole company';

  const exportPdf = async () => {
    if (!data) return;
    const win = openPendingWindow();
    try {
      const res = await authFetch('/api/reports/export-log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: `${data.range.label} · ${scopeLabel}` }) });
      if (!res.ok) { win?.close(); showToast?.('You are not allowed to export reports.', 'error'); return; }
      const bodyHtml = [
        chipsHtml([
          ['Won', `${omr(t.won.value)} (${t.won.count})`],
          ['Lost', `${omr(t.lost.value)} (${t.lost.count})`],
          ['Open now', `${omr(t.open.value)} (${t.open.count})`],
          ['Win rate', t.winRate == null ? '—' : `${t.winRate}%`],
          ['Average deal', omr(t.avgDeal)],
          ['New enquiries', String(t.created.count)],
        ]),
        noteHtml(`Compared with ${esc(data.prev.label)}: won ${esc(omr(pt.won.value))} (${pt.won.count}), lost ${esc(omr(pt.lost.value))} (${pt.lost.count}).`),
        '<h3>Quotations prepared</h3>',
        chipsHtml([
          ['Prepared', `${omr(data.quotes.prepared.value)} (${data.quotes.prepared.count})`],
          ['Accepted', `${omr(data.quotes.accepted.value)} (${data.quotes.accepted.count})`],
          ['Waiting', `${omr(data.quotes.sent.value + data.quotes.draft.value)} (${data.quotes.sent.count + data.quotes.draft.count})`],
          ['Rejected / expired', `${omr(data.quotes.rejected.value + data.quotes.expired.value)} (${data.quotes.rejected.count + data.quotes.expired.count})`],
        ]),
        data.quoteBy.length ? tableHtml(cols('Prepared by', 'Quotations', 'Total quoted', 'Accepted'), data.quoteBy.map((p) => [p.name, String(p.prepared.count), omr(p.prepared.value), `${omr(p.accepted.value)} · ${p.accepted.count}`])) : '',
        '<h3>Each person</h3>',
        tableHtml(cols('Salesman', 'Won', 'Lost', 'Open now', 'Win rate', 'New'), people.map((p) => [
          `${p.name}${p.type ? ` (${TYPE_LABEL[p.type] || ''})` : ''}`,
          `${omr(p.won.value)} · ${p.won.count}`, `${omr(p.lost.value)} · ${p.lost.count}`, `${omr(p.open.value)} · ${p.open.count}`,
          p.winRate == null ? '—' : `${p.winRate}%`, String(p.created),
        ])),
        '<h3>Why deals were lost</h3>',
        data.lostReasons.length
          ? tableHtml(cols('Reason', 'Deals', 'Value', 'Share of lost value'), data.lostReasons.map((r) => [lostReasonLabel(r.reason), String(r.count), omr(r.value), reasonsTotal ? `${Math.round((r.value / reasonsTotal) * 100)}%` : '—']))
          : noteHtml('No deals were lost in this period.'),
        `<h3>By ${data.unit}</h3>`,
        tableHtml(cols('Period', 'Won', 'Lost', 'New enquiries'), data.trend.map((x) => [x.label, omr(x.won), omr(x.lost), String(x.created)])),
      ].join('');
      openPrintable({
        docType: 'Sales report',
        title: `Money report · ${data.range.label}`,
        subtitle: scopeLabel,
        meta: [['Period', data.range.label], ['Covers', scopeLabel]],
        bodyHtml,
        win,
      });
    } catch {
      win?.close();
      showToast?.('Could not make the PDF.', 'error');
    }
  };

  const periodOpts = [['week', 'Week'], ['month', 'Month'], ['quarter', 'Quarter'], ['year', 'Year'], ['custom', 'Custom']];

  return (
    <div className="mpd">
      <div className="mpd-wrap space-y-4">
        {/* Filters: one row */}
        <section className="mpd-card p-3 sm:p-4 flex flex-wrap items-center gap-2.5" aria-label="Report period">
          <div className="mr-auto min-w-0">
            <h1 className="text-[18px] font-semibold leading-tight">Money</h1>
            <p className="text-[11.5px] mpd-mute">{scopeLabel} · {data?.range?.label || '…'}</p>
          </div>
          <Seg options={periodOpts} value={period} onChange={(v) => { setPeriod(v); setOffset(0); }} />
          {period !== 'custom' ? (
            <span className="inline-flex items-center gap-1">
              <button type="button" className="mpd-chip" onClick={() => setOffset((o) => o - 1)} aria-label="Previous period"><ChevronLeft className="w-4 h-4" /></button>
              <button type="button" className="mpd-chip disabled:opacity-40" onClick={() => setOffset((o) => Math.min(0, o + 1))} disabled={offset >= 0} aria-label="Next period"><ChevronRight className="w-4 h-4" /></button>
              {offset < 0 && <button type="button" className="mpd-chip" onClick={() => setOffset(0)}>Now</button>}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[12px]">
              <label className="sr-only" htmlFor="m-from">From</label>
              <input id="m-from" type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="mpd-chip" />
              <span className="mpd-mute">to</span>
              <label className="sr-only" htmlFor="m-to">To</label>
              <input id="m-to" type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="mpd-chip" />
            </span>
          )}
          {canExport && (
            <button type="button" onClick={exportPdf} disabled={!data} className="mpd-btn inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-[12.5px] font-semibold text-white disabled:opacity-50" style={{ background: '#D0121B' }}>
              <FileDown className="w-4 h-4" aria-hidden="true" /> Export PDF
            </button>
          )}
        </section>

        {error && <div className="mpd-card p-4 text-[13px]" role="alert" style={{ color: LOST }}>{error}</div>}

        {data && (
          <div className={`space-y-4 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              <Kpi icon={Trophy} tone={WON} label="Won" value={big(t.won.value)} title={omr(t.won.value, 3)} sub={`${t.won.count} deals`} delta={<Delta cur={t.won.value} prev={pt.won.value} />} />
              <Kpi icon={XCircle} tone={LOST} label="Lost" value={big(t.lost.value)} title={omr(t.lost.value, 3)} sub={`${t.lost.count} deals`} delta={<Delta cur={t.lost.value} prev={pt.lost.value} goodUp={false} />} />
              <Kpi icon={Wallet} tone="#3D5AF0" label="Open right now" value={big(t.open.value)} title={omr(t.open.value, 3)} sub={`${t.open.count} leads still in play`} />
              <Kpi icon={Percent} tone="#3D5AF0" label="Win rate" value={t.winRate == null ? '—' : `${t.winRate}%`} sub="of deals closed" delta={t.winRate != null && pt.winRate != null ? <span className="text-[11px] mpd-mute">last: {pt.winRate}%</span> : null} />
              <Kpi icon={Coins} tone="#B7791F" label="Average won deal" value={omr(t.avgDeal)} delta={<Delta cur={t.avgDeal} prev={pt.avgDeal} />} />
              <Kpi icon={Timer} tone="#64748B" label="Days to win" value={t.avgDaysToClose == null ? '—' : `${t.avgDaysToClose}`} sub="from enquiry to won" />
            </div>

            {data.quotes && (
              <section className="mpd-card" aria-labelledby="m-quotes">
                <div className="mpd-card-h"><div><h2 id="m-quotes">Quotations prepared</h2><p>Every quotation made in {data.range.label}, by the date it was created · its total including VAT</p></div></div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-4">
                  {[
                    [FileText, '#3D5AF0', 'Prepared', data.quotes.prepared, <Delta key="d" cur={data.quotes.prepared.value} prev={data.prevQuotes.prepared.value} />],
                    [CheckCircle2, WON, 'Accepted', data.quotes.accepted, data.quotes.acceptRate != null ? <span key="r" className="text-[11px] mpd-mute">{data.quotes.acceptRate}% of decided</span> : null],
                    [Send, '#B7791F', 'Waiting for answer', { count: data.quotes.sent.count + data.quotes.draft.count, value: r3(data.quotes.sent.value + data.quotes.draft.value) }, null],
                    [Ban, LOST, 'Rejected or expired', { count: data.quotes.rejected.count + data.quotes.expired.count, value: r3(data.quotes.rejected.value + data.quotes.expired.value) }, null],
                  ].map(([Icon, tone, label, v, extra]) => (
                    <div key={label} className="rounded-xl p-3.5 min-w-0" style={{ border: '1px solid var(--d-line)' }}>
                      <div className="flex items-center gap-2 text-[11.5px] mpd-mute">
                        <span className="grid place-items-center rounded-lg shrink-0" style={{ width: 24, height: 24, background: `${tone}1A`, color: tone }}><Icon className="w-3.5 h-3.5" aria-hidden="true" /></span>{label}
                      </div>
                      <b className="block mt-1.5 text-[19px] font-semibold tabular-nums truncate" title={omr(v.value, 3)}>{big(v.value)}</b>
                      <div className="flex flex-wrap items-center gap-x-2 text-[11px] mpd-mute"><span>{v.count} quotation{v.count === 1 ? '' : 's'}</span>{extra}</div>
                    </div>
                  ))}
                </div>
                <div className="overflow-x-auto px-2 pb-3 pt-2">
                  <table className="w-full text-[12.5px] tabular-nums">
                    <thead><tr className="mpd-mute text-left"><th className="py-2 px-2 font-medium">Prepared by</th><th className="py-2 px-2 font-medium text-right">Quotations</th><th className="py-2 px-2 font-medium text-right">Total quoted</th><th className="py-2 px-2 font-medium text-right">Accepted</th></tr></thead>
                    <tbody>
                      {data.quoteBy.length === 0 && <tr><td colSpan={4} className="py-6 text-center mpd-mute">No quotations made in this period.</td></tr>}
                      {data.quoteBy.map((p) => (
                        <tr key={p.name} style={{ borderTop: '1px solid var(--d-line)' }}>
                          <td className="py-2 px-2"><span className="flex items-center gap-2.5 min-w-[150px]"><Avatar name={p.name} photoUrl={p.photoUrl} size={28} /><b className="font-semibold truncate">{p.name}</b></span></td>
                          <td className="py-2 px-2 text-right">{p.prepared.count}</td>
                          <td className="py-2 px-2 text-right font-medium">{omr(p.prepared.value)}</td>
                          <td className="py-2 px-2 text-right">{omr(p.accepted.value)} <span className="mpd-mute">· {p.accepted.count}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4">
              <section className="mpd-card" aria-labelledby="m-trend">
                <div className="mpd-card-h"><div><h2 id="m-trend">Won and lost over time</h2><p>By {data.unit} · compared period: {data.prev.label}</p></div></div>
                <TrendChart trend={data.trend} />
              </section>

              <section className="mpd-card" aria-labelledby="m-lost">
                <div className="mpd-card-h"><div><h2 id="m-lost">Why deals were lost</h2><p>{t.lost.count} lost · {omr(t.lost.value)}</p></div></div>
                <div className="px-4 pb-4 space-y-2.5">
                  {data.lostReasons.length === 0 && <p className="text-[12.5px] mpd-mute py-6 text-center">No deals lost in this period.</p>}
                  {data.lostReasons.map((r) => {
                    const share = reasonsTotal ? (r.value / reasonsTotal) * 100 : 0;
                    return (
                      <div key={r.reason || 'none'}>
                        <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                          <span className="truncate">{lostReasonLabel(r.reason)}</span>
                          <span className="tabular-nums shrink-0"><b className="font-semibold">{omr(r.value)}</b> <span className="mpd-mute">· {r.count} · {Math.round(share)}%</span></span>
                        </div>
                        <div className="mt-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--d-line)' }} aria-hidden="true">
                          <div className="h-2 rounded-full" style={{ width: `${Math.max(2, share)}%`, background: LOST, opacity: r.reason ? 0.9 : 0.4 }} />
                        </div>
                      </div>
                    );
                  })}
                  {data.lostReasons.some((r) => !r.reason) && <p className="text-[11px] mpd-mute pt-1">"Reason not recorded" are deals lost before the CRM started asking why.</p>}
                </div>
              </section>
            </div>

            <section className="mpd-card" aria-labelledby="m-people">
              <div className="mpd-card-h flex-wrap">
                <div className="flex-1 min-w-[180px]"><h2 id="m-people">Each person</h2><p>Won and lost in {data.range.label}; open is right now</p></div>
                <Seg small options={[['won', 'Won'], ['lost', 'Lost'], ['open', 'Open'], ['rate', 'Win rate']]} value={sort} onChange={setSort} />
              </div>
              <div className="overflow-x-auto px-2 pb-3">
                <table className="w-full text-[12.5px] tabular-nums">
                  <thead>
                    <tr className="mpd-mute text-left">
                      <th className="py-2 px-2 font-medium">Salesman</th>
                      <th className="py-2 px-2 font-medium">Won</th>
                      <th className="py-2 px-2 font-medium">Lost</th>
                      <th className="py-2 px-2 font-medium">Open now</th>
                      <th className="py-2 px-2 font-medium text-right">Win rate</th>
                      <th className="py-2 px-2 font-medium text-right">New</th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.length === 0 && <tr><td colSpan={6} className="py-8 text-center mpd-mute">No activity in this period.</td></tr>}
                    {people.map((p) => (
                      <tr key={p.id || p.name} style={{ borderTop: '1px solid var(--d-line)' }}>
                        <td className="py-2 px-2">
                          <span className="flex items-center gap-2.5 min-w-[160px]">
                            <Avatar name={p.name} photoUrl={p.photoUrl} size={30} />
                            <span className="min-w-0"><b className="block font-semibold truncate">{p.name}</b>{p.type && <small className="mpd-mute">{TYPE_LABEL[p.type]}</small>}</span>
                          </span>
                        </td>
                        {[['won', WON], ['lost', LOST], ['open', '#3D5AF0']].map(([k, c]) => (
                          <td key={k} className="py-2 px-2 min-w-[130px]">
                            <span className="block font-medium">{omr(p[k].value)} <span className="mpd-mute font-normal">· {p[k].count}</span></span>
                            <span className="block mt-1 h-1.5 rounded-full" style={{ width: `${Math.max(p[k].value ? 3 : 0, (p[k].value / maxPerson) * 100)}%`, background: c, opacity: 0.85 }} aria-hidden="true" />
                          </td>
                        ))}
                        <td className="py-2 px-2 text-right">{p.winRate == null ? '—' : `${p.winRate}%`}</td>
                        <td className="py-2 px-2 text-right">{p.created}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <p className="text-[11px] mpd-mute px-1">A lead's value is its latest quotation total; before a quotation, the deal value typed on the lead. Weeks start on Sunday. Oman time.</p>
          </div>
        )}
        {!data && loading && <div className="mpd-card p-10 text-center mpd-mute text-[13px]">Loading…</div>}
      </div>
    </div>
  );
}
