import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, Smartphone, KeyRound, Loader2, Copy, Printer, DatabaseBackup, Send, CheckCircle2, XCircle } from 'lucide-react';

/**
 * Super admin: 2-step login (authenticator app) and the daily off-site backup.
 */
export default function SecurityCard({ authFetch, showToast }) {
  const [tfa, setTfa] = useState(null);
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState(null);
  const [off, setOff] = useState(false);
  const [offPw, setOffPw] = useState('');
  const [offCode, setOffCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [bk, setBk] = useState(null);

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([authFetch('/api/auth/2fa'), authFetch('/api/backup/status')]);
      if (a.ok) setTfa(await a.json());
      if (b.ok) setBk(await b.json());
    } catch { /* offline */ }
  }, [authFetch]);
  useEffect(() => { load(); }, [load]);

  const post = async (path, body) => {
    const r = await authFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || d.message || 'Something went wrong.');
    return d;
  };

  const start = async () => { setBusy('start'); setErr(''); try { setSetup(await post('/api/auth/2fa/setup')); setCode(''); } catch (e) { setErr(e.message); } setBusy(''); };
  const confirm = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.replace(/\s/g, ''))) { setErr('Enter the 6-digit code your app shows.'); return; }
    setBusy('enable'); setErr('');
    try { const d = await post('/api/auth/2fa/enable', { code: code.replace(/\s/g, '') }); setCodes(d.recoveryCodes); setSetup(null); showToast?.('2-step login is on.'); load(); } catch (ex) { setErr(ex.message); }
    setBusy('');
  };
  const disable = async (e) => {
    e.preventDefault();
    if (!offPw || !offCode) { setErr('Enter your password and a code.'); return; }
    setBusy('off'); setErr('');
    try { await post('/api/auth/2fa/disable', { password: offPw, code: offCode.trim() }); setOff(false); setOffPw(''); setOffCode(''); showToast?.('2-step login is off.'); load(); } catch (ex) { setErr(ex.message); }
    setBusy('');
  };
  const newCodes = async () => {
    const c = window.prompt('Enter the current 6-digit code from your app to make new recovery codes:');
    if (!c) return;
    try { const d = await post('/api/auth/2fa/recovery', { code: c.trim() }); setCodes(d.recoveryCodes); load(); } catch (ex) { showToast?.(ex.message, 'error'); }
  };
  const sendBackup = async () => {
    setBusy('backup');
    try { const d = await post('/api/backup/email-now'); showToast?.(d.message); } catch (ex) { showToast?.(ex.message, 'error'); }
    setBusy(''); load();
  };
  const printCodes = () => {
    const w = window.open('', '_blank', 'noopener,width=480,height=640');
    if (!w) return;
    w.document.write(`<title>Monipack CRM recovery codes</title><body style="font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;padding:32px"><h2>Monipack CRM: 2-step recovery codes</h2><p>Each code works once. Keep this paper somewhere safe.</p><pre style="font-size:20px;line-height:1.8">${codes.join('\n')}</pre><p>${new Date().toLocaleString('en-GB')}</p></body>`);
    w.document.close(); w.print();
  };

  const inp = 'w-full h-11 px-3 rounded-xl border border-slate-300 text-sm';
  return (
    <section className="grid lg:grid-cols-2 gap-4" aria-label="Security">
      {/* 2-step login */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-start gap-3">
          <span className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${tfa?.enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
            {tfa?.enabled ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-[15px]">2-step login {tfa && <span className={`ml-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${tfa.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{tfa.enabled ? 'On' : 'Off'}</span>}</h3>
            <p className="text-[13px] text-slate-500 mt-0.5">After your password, the CRM asks for a 6-digit code from an app on your phone (Google Authenticator or Microsoft Authenticator). Someone who steals your password still cannot sign in.</p>
          </div>
        </div>

        {err && <p className="mt-3 text-sm text-rose-700" role="alert">{err}</p>}

        {codes && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">Save these recovery codes now. They are shown only once.</p>
            <p className="text-xs text-amber-800 mt-0.5">If you lose your phone, each code lets you sign in once.</p>
            <pre className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-[15px] text-slate-900">{codes.map((c) => <span key={c}>{c}</span>)}</pre>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="mp-btn mp-btn-line" onClick={() => { navigator.clipboard?.writeText(codes.join('\n')); showToast?.('Codes copied.'); }}><Copy className="w-4 h-4" /> Copy</button>
              <button type="button" className="mp-btn mp-btn-line" onClick={printCodes}><Printer className="w-4 h-4" /> Print</button>
              <button type="button" className="mp-btn mp-btn-dark" onClick={() => setCodes(null)}>I saved them</button>
            </div>
          </div>
        )}

        {!codes && tfa && !tfa.enabled && !setup && (
          <button type="button" onClick={start} disabled={busy === 'start'} className="mt-4 mp-btn mp-btn-dark">{busy === 'start' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />} Turn on 2-step login</button>
        )}

        {setup && (
          <form onSubmit={confirm} className="mt-4 grid sm:grid-cols-[auto_1fr] gap-4 items-start">
            <img src={setup.qr} alt="QR code to scan with your authenticator app" className="w-[180px] h-[180px] rounded-xl border border-slate-200 bg-white" />
            <div className="space-y-2 text-sm">
              <p><b>1.</b> Install <b>Google Authenticator</b> or <b>Microsoft Authenticator</b> on your phone.</p>
              <p><b>2.</b> Tap <b>+</b> and scan this QR code. No camera? Type this key: <code className="select-all font-mono text-[12.5px] bg-slate-100 px-1.5 py-0.5 rounded">{setup.secret}</code></p>
              <p><b>3.</b> Enter the 6-digit code it shows:</p>
              <input value={code} onChange={(e) => { setCode(e.target.value); setErr(''); }} inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456" className={`${inp} tracking-[0.3em] text-lg max-w-[180px]`} aria-label="6-digit code" />
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={busy === 'enable'} className="mp-btn mp-btn-dark">{busy === 'enable' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Confirm</button>
                <button type="button" onClick={() => { setSetup(null); setErr(''); }} className="mp-btn mp-btn-line">Cancel</button>
              </div>
            </div>
          </form>
        )}

        {!codes && tfa?.enabled && !off && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className={`text-xs ${tfa.recoveryCodesLeft <= 2 ? 'text-rose-700 font-semibold' : 'text-slate-500'}`}>{tfa.recoveryCodesLeft} recovery code{tfa.recoveryCodesLeft === 1 ? '' : 's'} left</span>
            <button type="button" onClick={newCodes} className="mp-btn mp-btn-line"><KeyRound className="w-4 h-4" /> New recovery codes</button>
            <button type="button" onClick={() => { setOff(true); setErr(''); }} className="mp-btn mp-btn-line text-rose-700">Turn off</button>
          </div>
        )}

        {off && (
          <form onSubmit={disable} className="mt-4 space-y-2 max-w-sm">
            <input type="password" value={offPw} onChange={(e) => setOffPw(e.target.value)} placeholder="Your sign-in password" autoComplete="current-password" className={inp} aria-label="Your sign-in password" />
            <input value={offCode} onChange={(e) => setOffCode(e.target.value)} placeholder="6-digit code or a recovery code" autoComplete="one-time-code" className={inp} aria-label="Code" />
            <div className="flex gap-2">
              <button type="submit" disabled={busy === 'off'} className="mp-btn mp-btn-red">{busy === 'off' ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Turn off 2-step login</button>
              <button type="button" onClick={() => setOff(false)} className="mp-btn mp-btn-line">Cancel</button>
            </div>
          </form>
        )}
      </div>

      {/* Backup */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-start gap-3">
          <span className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${bk?.configured ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}><DatabaseBackup className="w-5 h-5" /></span>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-[15px]">Daily backup by email {bk && <span className={`ml-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${bk.configured ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{bk.configured ? 'On' : 'Not set up'}</span>}</h3>
            <p className="text-[13px] text-slate-500 mt-0.5">Every night at 02:30 the whole CRM database is encrypted and emailed{bk?.to ? <> to <b>{bk.to}</b></> : ''}, so your data survives even if the server is lost.</p>
          </div>
        </div>
        {bk && !bk.configured && (
          <div className="mt-4 rounded-2xl bg-slate-50 border border-slate-200 p-3.5 text-[13px] text-slate-700">
            <p>To switch it on, paste this in the Hostinger VPS terminal and answer the questions. Your email password stays on the server.</p>
            <code className="mt-2 block select-all font-mono text-[12px] bg-white border border-slate-200 rounded-lg px-2.5 py-2 break-all">bash /opt/monipack-crm/deploy/setup-email-backup.sh</code>
          </div>
        )}
        {bk?.last?.at && (
          <p className={`mt-3 text-[13px] flex items-center gap-1.5 ${bk.last.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
            {bk.last.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            Last run {new Date(bk.last.at).toLocaleString('en-GB')}: {bk.last.message}
          </p>
        )}
        {bk?.configured && (
          <button type="button" onClick={sendBackup} disabled={busy === 'backup'} className="mt-4 mp-btn mp-btn-line">{busy === 'backup' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Email a backup now</button>
        )}
      </div>
    </section>
  );
}
