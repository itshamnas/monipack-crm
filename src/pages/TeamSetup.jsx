import React, { useMemo, useState } from 'react';
import { Download, ClipboardPaste, CheckCircle2, AlertTriangle, Loader2, Copy, Printer, MessageCircle, Users, ArrowRight, RotateCcw } from 'lucide-react';
import { openPrintable, tableHtml, noteHtml } from '../utils/pdfReport.js';

/**
 * Settings → Team setup (super admin): paste branches, salesmen and staff from Excel, check, then create them all at once.
 * The server does the real work (see server/settings/teamSetup.js); "Check" runs it without saving.
 */
const JOB_WORDS = [
  ['b2b_salesman', /^(b2b|route|wholesale)\s*(sales\s*man|salesman|sales|rep)/],
  ['branch_salesman', /^(branch|shop|retail|showroom)?\s*(sales\s*man|salesman|sales\s*rep|rep)$/],
  ['b2b_manager', /^b2b\s*(sales\s*)?manager/],
  ['retail_manager', /^(retail|branch|shop|branches)\s*(sales\s*)?manager/],
  ['general_manager', /^(gm|general\s*manager|g\.m\.?|manager)$/],
  ['customer_care', /^(customer\s*care|cc|call\s*cent(er|re)|customer\s*service)/],
  ['branch', /^(branch|shop|showroom|store|outlet)$/],
];
const JOB_LABEL = {
  branch: 'Branch (shop)', branch_salesman: 'Branch salesman', b2b_salesman: 'B2B salesman',
  general_manager: 'General Manager', b2b_manager: 'B2B Manager', retail_manager: 'Retail / Branch Manager', customer_care: 'Customer Care',
};
const jobOf = (t) => {
  const s = String(t || '').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (JOB_LABEL[s.replace(/ /g, '_')]) return s.replace(/ /g, '_');
  return JOB_WORDS.find(([, re]) => re.test(s))?.[0] || '';
};

function splitLine(line) {
  if (line.includes('\t')) return line.split('\t');
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if ((ch === ',' || ch === ';') && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
export function parseTeam(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').filter((l) => l.replace(/[\t,; ]/g, '').length);
  if (lines.length && /^\s*"?job"?\s*[\t,;]/i.test(lines[0])) lines.shift();
  return lines.map((l) => {
    const [job, name, branch, city, phone, email] = splitLine(l).map((c) => c.trim());
    return { jobText: job || '', job: jobOf(job), name: name || '', branch: branch || '', city: city || '', phone: phone || '', email: email || '' };
  });
}

const TEMPLATE = [
  ['Job', 'Name', 'Branch', 'City', 'WhatsApp', 'Email'],
  ['Branch', 'Nizwa Shop', '', 'Nizwa', '+968 2541 0000', ''],
  ['Branch salesman', 'Ahmed Al Hinai', 'Nizwa Shop', 'Nizwa', '+968 9123 4567', 'ahmed@monipack.com'],
  ['B2B salesman', 'Salim Al Hadhrami', '', 'Muscat', '+968 9234 5678', 'salim@monipack.com'],
  ['General manager', 'Full name', '', '', '+968 9...', 'gm@monipack.com'],
  ['B2B manager', 'Full name', '', '', '+968 9...', 'b2b@monipack.com'],
  ['Retail manager', 'Full name', '', '', '+968 9...', 'retail@monipack.com'],
  ['Customer care', 'Full name', '', '', '+968 9...', 'care@monipack.com'],
];

const card = 'bg-white rounded-3xl border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.04)]';
const btn = 'inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[40px] px-4 rounded-full text-[13px] font-bold transition active:scale-[0.97] disabled:opacity-50';

export default function TeamSetup({ authFetch, showToast, onDone }) {
  const [text, setText] = useState('');
  const [check, setCheck] = useState(null); // server preview
  const [done, setDone] = useState(null);   // server result after creating
  const [busy, setBusy] = useState('');
  const rows = useMemo(() => parseTeam(text), [text]);
  const counts = useMemo(() => rows.reduce((m, r) => ({ ...m, [r.job || 'unknown']: (m[r.job || 'unknown'] || 0) + 1 }), {}), [rows]);

  const downloadTemplate = () => {
    const csv = TEMPLATE.map((r) => r.map((c) => (/[",]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = 'monipack-team-setup.csv';
    document.body.appendChild(a); a.click(); a.remove();
  };

  const send = async (dryRun) => {
    setBusy(dryRun ? 'check' : 'create');
    try {
      const r = await authFetch('/api/team-setup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun, rows: rows.map(({ job, jobText, name, branch, city, phone, email }) => ({ job: job || jobText, name, branch, city, phone, email })) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not check the list');
      if (dryRun || !d.ok) { setCheck(d); if (!dryRun && !d.ok) showToast('Nothing was saved: fix the rows marked in red first.', 'error'); }
      else { setDone(d); setCheck(null); showToast(`Team added: ${d.logins.length} new login${d.logins.length === 1 ? '' : 's'}`); onDone?.(); }
    } catch (e) { showToast(e.message, 'error'); }
    setBusy('');
  };

  const loginText = (l) => `${l.name} (${l.job})\nSign in: ${window.location.origin}\nEmail: ${l.email}\nTemporary password: ${l.password}\nYou will choose your own password after signing in.`;
  const copyAll = async () => {
    try { await navigator.clipboard.writeText(done.logins.map(loginText).join('\n\n')); showToast('Copied'); } catch { showToast('Could not copy. Use Print instead.', 'error'); }
  };
  const printLogins = () => {
    const ok = openPrintable({
      docType: 'Staff logins', title: 'New CRM logins', subtitle: 'Temporary passwords: each person chooses their own at first sign-in',
      meta: [['Logins', done.logins.length]],
      bodyHtml: noteHtml('Keep this page private and destroy it once everyone has signed in.')
        + tableHtml([{ label: 'Name' }, { label: 'Job' }, { label: 'Email' }, { label: 'Temporary password' }], done.logins.map((l) => [l.name, l.job, l.email, l.password])),
    });
    if (!ok) showToast('Allow pop-ups to print', 'error');
  };
  const waLink = (l) => {
    const n = String(l.phone || '').replace(/\D/g, '');
    return n ? `https://wa.me/${n}?text=${encodeURIComponent(`Assalamu alaikum ${l.name.split(' ')[0]}, your Monipack CRM login:\n\n${loginText(l)}`)}` : '';
  };

  if (done) {
    return (
      <div className="space-y-4">
        <div className={`${card} p-5 sm:p-6`}>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-7 h-7 text-emerald-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <h2 className="text-[18px] font-bold">Team added</h2>
              <p className="text-sm text-slate-600 mt-0.5">{done.results.length} rows saved. Branches, salesmen and logins are ready.</p>
            </div>
          </div>
          {done.logins.length > 0 && (
            <>
              <p className="mt-4 p-3 rounded-2xl bg-amber-50 text-amber-900 text-sm border border-amber-200">
                <b>These temporary passwords are shown only now.</b> Send each person theirs, or print the list. They choose their own password the first time they sign in.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={`${btn} bg-slate-900 text-white`} onClick={copyAll}><Copy className="w-4 h-4" /> Copy all</button>
                <button type="button" className={`${btn} bg-white border border-slate-200`} onClick={printLogins}><Printer className="w-4 h-4" /> Print list</button>
              </div>
              <ul className="mt-3 divide-y divide-slate-100 rounded-2xl border border-slate-200 overflow-hidden">
                {done.logins.map((l) => (
                  <li key={l.email} className="p-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="flex-1 min-w-[180px]"><b className="block text-[14px]">{l.name}</b><span className="text-[12.5px] text-slate-500">{l.job} · {l.email}</span></span>
                    <code className="px-2.5 py-1 rounded-lg bg-slate-100 text-[14px] font-bold tracking-wide select-all">{l.password}</code>
                    {waLink(l) && <a href={waLink(l)} target="_blank" rel="noopener noreferrer" className={`${btn} bg-emerald-600 text-white`}><MessageCircle className="w-4 h-4" /> Send on WhatsApp</a>}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-4 text-sm text-slate-600">Next: in <b>Staff logins</b>, tick <b>Can export</b> for any manager who should download reports. In <b>Salesmen &amp; links</b>, switch on the personal link for salesmen without a login.</p>
          <button type="button" className={`${btn} mt-4 bg-white border border-slate-200`} onClick={() => { setDone(null); setText(''); }}><RotateCcw className="w-4 h-4" /> Add more</button>
        </div>
      </div>
    );
  }

  const byLine = new Map((check?.results || []).map((r) => [r.line, r]));
  return (
    <div className="space-y-4">
      <div className={`${card} p-5 sm:p-6`}>
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-700 grid place-items-center shrink-0"><Users className="w-5 h-5" /></span>
          <div className="min-w-0">
            <h2 className="text-[18px] font-bold">Add your team from Excel</h2>
            <p className="text-sm text-slate-600 mt-0.5">Branches, salesmen and staff logins in one go. Nothing is saved until you press <b>Add everyone</b>.</p>
          </div>
        </div>
        <ol className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
          <li className="p-3 rounded-2xl bg-slate-50"><b className="block">1. Download the template</b><span className="text-slate-600">Open it in Excel. Replace the example rows with your people and shops, one per row.</span>
            <button type="button" className={`${btn} mt-2 bg-white border border-slate-200 w-full`} onClick={downloadTemplate}><Download className="w-4 h-4" /> Template (Excel / CSV)</button></li>
          <li className="p-3 rounded-2xl bg-slate-50"><b className="block">2. Copy and paste</b><span className="text-slate-600">In Excel select all the rows (the heading row too is fine), copy, and paste them in the box below.</span></li>
          <li className="p-3 rounded-2xl bg-slate-50"><b className="block">3. Check, then add</b><span className="text-slate-600">Press Check to see exactly what will be created. Fix anything in red, then press Add everyone.</span></li>
        </ol>
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-semibold text-slate-800 min-h-[44px] flex items-center">What to write in each column</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-left text-slate-500"><tr><th className="py-1.5 pr-3">Job</th><th className="py-1.5 pr-3">Name</th><th className="py-1.5 pr-3">Branch</th><th className="py-1.5 pr-3">Email</th></tr></thead>
              <tbody className="align-top">
                <tr className="border-t"><td className="py-1.5 pr-3 font-semibold">Branch</td><td className="pr-3">The shop name</td><td className="pr-3">empty</td><td>empty</td></tr>
                <tr className="border-t"><td className="py-1.5 pr-3 font-semibold">Branch salesman</td><td className="pr-3">His name</td><td className="pr-3">His shop, exactly as in the Branch row</td><td>Only if he needs a login</td></tr>
                <tr className="border-t"><td className="py-1.5 pr-3 font-semibold">B2B salesman</td><td className="pr-3">His name</td><td className="pr-3">empty: he gets his own B2B entry under his name</td><td>Only if he needs a login</td></tr>
                <tr className="border-t"><td className="py-1.5 pr-3 font-semibold">General manager · B2B manager · Retail manager · Customer care</td><td className="pr-3">Their name</td><td className="pr-3">empty</td><td>Required</td></tr>
              </tbody>
            </table>
            <p className="mt-2 text-slate-500">City and WhatsApp are optional. A WhatsApp number written without +968 is taken as Omani. Names already in the CRM are kept, not doubled.</p>
          </div>
        </details>
      </div>

      <div className={`${card} p-4 sm:p-5`}>
        <label htmlFor="team-paste" className="flex items-center gap-2 text-[14px] font-bold"><ClipboardPaste className="w-4 h-4" /> Paste your rows here</label>
        <textarea id="team-paste" value={text} onChange={(e) => { setText(e.target.value); setCheck(null); }} rows={8} spellCheck={false}
          placeholder={'Branch\tNizwa Shop\t\tNizwa\t+968 2541 0000\t\nBranch salesman\tAhmed Al Hinai\tNizwa Shop\tNizwa\t+968 9123 4567\tahmed@monipack.com'}
          className="mt-2 w-full rounded-2xl border border-slate-300 p-3 font-mono text-[13px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-200" />
        {rows.length > 0 && (
          <p className="mt-2 text-[13px] text-slate-600">
            {rows.length} row{rows.length === 1 ? '' : 's'}: {Object.entries(counts).map(([k, n]) => `${n} ${k === 'unknown' ? 'unknown job' : JOB_LABEL[k]}`).join(' · ')}
          </p>
        )}
      </div>

      {rows.length > 0 && (
        <div className={`${card} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[760px]">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                <tr><th className="px-3 py-2.5 w-10">#</th><th className="px-3 py-2.5">Job</th><th className="px-3 py-2.5">Name</th><th className="px-3 py-2.5">Branch</th><th className="px-3 py-2.5">City</th><th className="px-3 py-2.5">WhatsApp</th><th className="px-3 py-2.5">Email</th><th className="px-3 py-2.5">{check ? 'What happens' : ''}</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 align-top">
                {rows.map((r, i) => {
                  const res = byLine.get(i + 1);
                  const bad = res?.problem || (!r.job && 'Unknown job');
                  return (
                    <tr key={i} className={bad ? 'bg-rose-50/60' : ''}>
                      <td className="px-3 py-2 text-slate-400 tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2 font-semibold">{r.job ? JOB_LABEL[r.job] : <span className="text-rose-700">{r.jobText || 'empty'}</span>}</td>
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="px-3 py-2">{r.branch}</td>
                      <td className="px-3 py-2">{r.city}</td>
                      <td className="px-3 py-2 tabular-nums">{r.phone}</td>
                      <td className="px-3 py-2">{r.email}</td>
                      <td className="px-3 py-2 min-w-[220px]">
                        {bad ? <span className="text-rose-700 font-semibold flex gap-1"><AlertTriangle className="w-4 h-4 shrink-0" />{bad}</span>
                          : res ? <ul className="text-emerald-800 space-y-0.5">{res.actions.map((a) => <li key={a}>{a}</li>)}</ul> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-slate-100 flex flex-wrap items-center gap-2">
            {check && (check.ok
              ? <span className="text-sm font-semibold text-emerald-700 flex items-center gap-1.5 mr-auto"><CheckCircle2 className="w-4 h-4" /> All rows are fine. {check.logins.length} login{check.logins.length === 1 ? '' : 's'} will be created.</span>
              : <span className="text-sm font-semibold text-rose-700 flex items-center gap-1.5 mr-auto"><AlertTriangle className="w-4 h-4" /> {check.problems} row{check.problems === 1 ? '' : 's'} to fix. Correct them in Excel and paste again.</span>)}
            <button type="button" className={`${btn} bg-white border border-slate-200 ${check ? '' : 'ml-auto'}`} disabled={!!busy} onClick={() => send(true)}>
              {busy === 'check' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Check
            </button>
            <button type="button" className={`${btn} bg-[#CC1A22] text-white`} disabled={!!busy || !check?.ok} onClick={() => send(false)}
              title={check?.ok ? '' : 'Press Check first'}>
              {busy === 'create' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />} Add everyone
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
