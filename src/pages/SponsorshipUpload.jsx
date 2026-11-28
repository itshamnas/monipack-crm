import React, { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Loader2, CheckCircle2, AlertTriangle, Lock, ShieldCheck, RotateCcw, UploadCloud, CalendarDays, MapPin } from 'lucide-react';
import { getApiUrl } from '../api/config.js';
import { photoPair } from '../utils/imageShrink.js';

/**
 * /u/<token>: anyone with this link (and the PIN, if the super admin set one) can add event photos.
 * Photos are shrunk on the phone, then uploaded two at a time with a tick on each one.
 */
const token = window.location.pathname.split('/')[2] || '';
const KEY = `mp-up-${token.slice(0, 12)}`;
const call = async (p, opts = {}) => {
  const session = sessionStorage.getItem(KEY);
  const r = await fetch(getApiUrl(`/api/up/${encodeURIComponent(token)}${p}`), {
    ...opts, headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session}` } : {}), ...(opts.headers || {}) },
  });
  return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) };
};
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { timeZone: 'Asia/Muscat', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '');

function Banner({ url }) {
  return url
    ? <div className="w-full bg-slate-900"><img src={getApiUrl(url)} alt="" className="block w-full max-h-[200px] sm:max-h-[240px] object-cover" /></div>
    : <div className="w-full bg-[#0F172A] text-white"><div className="max-w-3xl mx-auto px-4 py-3 flex justify-between text-[13px]"><b className="text-[16px]">monipack</b><span className="text-slate-300">www.monipack.com</span></div></div>;
}

export default function SponsorshipUpload() {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [pin, setPin] = useState(''); const [pinErr, setPinErr] = useState(''); const [pinBusy, setPinBusy] = useState(false);
  const [name, setName] = useState(() => { try { return localStorage.getItem('mp-up-name') || ''; } catch { return ''; } });
  const [phone, setPhone] = useState('');
  const [items, setItems] = useState([]); // { id, file, preview, state: waiting|working|done|failed, error }
  const [nameErr, setNameErr] = useState('');
  const pick = useRef(null); const cam = useRef(null);
  const running = useRef(0);

  useEffect(() => {
    document.title = 'Share event photos · Monipack';
    call('').then((r) => (r.ok ? setInfo(r.body) : setError(r.body.error || 'This link is not valid.')));
  }, []);

  const unlock = async (e) => {
    e?.preventDefault();
    if (pin.length !== 6) { setPinErr('Enter all 6 digits.'); return; }
    setPinBusy(true); setPinErr('');
    const r = await call('/unlock', { method: 'POST', body: JSON.stringify({ pin }) });
    setPinBusy(false);
    if (!r.ok) { setPinErr(r.body.error || 'Could not open.'); setPin(''); return; }
    if (r.body.session) sessionStorage.setItem(KEY, r.body.session);
    setInfo(r.body);
  };
  useEffect(() => { if (pin.length === 6) unlock(); }, [pin]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (id, patch) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const uploadOne = async (it) => {
    update(it.id, { state: 'working', error: '' });
    try {
      const pair = await photoPair(it.file).catch(() => { throw new Error('This photo type cannot be read here. Please share it as a JPG.'); });
      const r = await call('/photos', { method: 'POST', body: JSON.stringify({ ...pair, name: name.trim(), phone: phone.trim() }) });
      if (r.status === 401) { sessionStorage.removeItem(KEY); window.location.reload(); return; }
      if (!r.ok) throw new Error(r.body.error || 'Upload failed. Tap to try again.');
      update(it.id, { state: 'done' });
    } catch (e) { update(it.id, { state: 'failed', error: e.message }); }
  };
  // Two uploads at a time
  useEffect(() => {
    const waiting = items.filter((x) => x.state === 'waiting');
    while (running.current < 2 && waiting.length) {
      const it = waiting.shift();
      running.current += 1;
      uploadOne(it).finally(() => { running.current -= 1; setItems((xs) => [...xs]); });
      update(it.id, { state: 'working' });
    }
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = (fileList) => {
    if (name.trim().length < 2) { setNameErr('Please write your name first.'); return; }
    setNameErr('');
    try { localStorage.setItem('mp-up-name', name.trim()); } catch { /* private mode */ }
    const next = [...fileList].filter((f) => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name)).map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file: f, preview: URL.createObjectURL(f), state: 'waiting', error: '',
    }));
    if (!next.length) return;
    setItems((xs) => [...next, ...xs]);
  };

  const done = items.filter((x) => x.state === 'done').length;
  const busy = items.some((x) => x.state === 'waiting' || x.state === 'working');
  const failed = items.filter((x) => x.state === 'failed');

  if (error) return (
    <div className="min-h-screen bg-slate-50"><Banner />
      <main className="max-w-md mx-auto px-4 py-16 text-center"><AlertTriangle className="w-10 h-10 mx-auto text-amber-500" /><p className="mt-3 text-[16px] font-semibold">{error}</p></main></div>
  );
  if (!info) return <div className="min-h-screen grid place-items-center bg-slate-50"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <Banner url={info.bannerUrl} />
      <main className="max-w-3xl mx-auto px-3 sm:px-5 py-5 sm:py-8 space-y-4">
        <section className="bg-white rounded-3xl border border-slate-200 p-5 flex gap-4 items-center">
          {info.posterUrl && <img src={getApiUrl(info.posterUrl)} alt="" className="w-20 h-24 sm:w-24 sm:h-28 object-cover rounded-2xl border border-slate-200 shrink-0" />}
          <div className="min-w-0">
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#CC1A22]">Share your event photos</p>
            <h1 className="text-[22px] sm:text-[26px] leading-tight font-extrabold text-slate-900 mt-0.5">{info.title}</h1>
            <p className="mt-1 text-[13.5px] text-slate-600 flex flex-wrap gap-x-3 gap-y-0.5">
              {info.startsAt && <span className="inline-flex items-center gap-1"><CalendarDays className="w-4 h-4" />{fmt(info.startsAt)}</span>}
              {info.venue && <span className="inline-flex items-center gap-1"><MapPin className="w-4 h-4" />{info.venue}</span>}
            </p>
          </div>
        </section>

        {info.needsPin && !info.unlocked ? (
          <form onSubmit={unlock} className="bg-white rounded-3xl border border-slate-200 p-6 text-center max-w-md mx-auto">
            <span className="mx-auto w-12 h-12 rounded-2xl bg-slate-900 text-white grid place-items-center"><Lock className="w-5 h-5" /></span>
            <p className="mt-3 text-[15px] text-slate-700">Enter the 6-digit PIN Monipack gave you.</p>
            <label htmlFor="up-pin" className="sr-only">PIN</label>
            <input id="up-pin" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" autoFocus disabled={pinBusy}
              className="mt-4 w-full h-14 text-center text-[26px] tracking-[0.45em] font-bold rounded-2xl border-2 border-slate-300 focus:border-[#2F5BEA] focus:outline-none" placeholder="••••••" />
            {pinErr && <p role="alert" className="mt-3 text-[14px] font-semibold text-rose-700">{pinErr}</p>}
            <button type="submit" disabled={pinBusy || pin.length !== 6} className="mt-4 w-full h-12 rounded-2xl bg-[#2F5BEA] text-white font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2">
              {pinBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />} Open
            </button>
          </form>
        ) : (
          <>
            <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block"><span className="block text-[13px] font-bold text-slate-700 mb-1.5">Your name</span>
                  <input value={name} onChange={(e) => { setName(e.target.value); setNameErr(''); }} autoComplete="name" placeholder="e.g. Ahmed Al Balushi"
                    className={`w-full h-12 px-4 rounded-2xl border text-[16px] focus:outline-none focus:border-[#2F5BEA] ${nameErr ? 'border-rose-400' : 'border-slate-300'}`} /></label>
                <label className="block"><span className="block text-[13px] font-bold text-slate-700 mb-1.5">Mobile (optional)</span>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="+968 9..."
                    className="w-full h-12 px-4 rounded-2xl border border-slate-300 text-[16px] focus:outline-none focus:border-[#2F5BEA]" /></label>
              </div>
              {nameErr && <p role="alert" className="text-[14px] font-semibold text-rose-700 -mt-2">{nameErr}</p>}
              <div className="grid grid-cols-2 sm:grid-cols-[1fr_auto] gap-2">
                <button type="button" onClick={() => (name.trim().length < 2 ? setNameErr('Please write your name first.') : pick.current.click())}
                  className="h-14 rounded-2xl bg-[#CC1A22] text-white text-[16px] font-extrabold inline-flex items-center justify-center gap-2 col-span-2 sm:col-span-1">
                  <ImagePlus className="w-5 h-5" /> Choose photos
                </button>
                <button type="button" onClick={() => (name.trim().length < 2 ? setNameErr('Please write your name first.') : cam.current.click())}
                  className="sm:hidden h-12 rounded-2xl border border-slate-300 bg-white font-bold inline-flex items-center justify-center gap-2 col-span-2">
                  <Camera className="w-5 h-5" /> Take a photo
                </button>
              </div>
              <input ref={pick} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-hidden="true" data-pick="photos" onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
              <input ref={cam} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" data-pick="camera" onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
              <p className="text-[12.5px] text-slate-500">Photos go straight to Monipack. You can choose many at once; keep this page open until each one shows a tick.</p>
            </section>

            {items.length > 0 && (
              <section className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-3" aria-live="polite">
                  {busy ? <Loader2 className="w-5 h-5 animate-spin text-[#2F5BEA]" /> : failed.length ? <AlertTriangle className="w-5 h-5 text-amber-500" /> : <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                  <b className="text-[15px]">{busy ? `Uploading… ${done} of ${items.length}` : failed.length ? `${done} uploaded, ${failed.length} failed` : `${done} photo${done === 1 ? '' : 's'} uploaded. Thank you!`}</b>
                  {failed.length > 0 && !busy && (
                    <button type="button" onClick={() => setItems((xs) => xs.map((x) => (x.state === 'failed' ? { ...x, state: 'waiting' } : x)))} className="ml-auto inline-flex items-center gap-1 min-h-[40px] px-3 rounded-full border border-slate-300 text-[13px] font-bold"><RotateCcw className="w-4 h-4" /> Try again</button>
                  )}
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden mb-4"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${(done / items.length) * 100}%` }} /></div>
                <ul className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {items.map((x) => (
                    <li key={x.id} className="relative aspect-square rounded-xl overflow-hidden bg-slate-100" title={x.error || ''}>
                      <img src={x.preview} alt="" className={`w-full h-full object-cover ${x.state === 'done' ? '' : 'opacity-70'}`} />
                      <span className="absolute inset-0 grid place-items-center">
                        {x.state === 'working' && <Loader2 className="w-7 h-7 animate-spin text-white drop-shadow" />}
                        {x.state === 'waiting' && <UploadCloud className="w-6 h-6 text-white drop-shadow" />}
                        {x.state === 'failed' && <AlertTriangle className="w-7 h-7 text-amber-400 drop-shadow" />}
                      </span>
                      {x.state === 'done' && <span className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-emerald-600 text-white grid place-items-center"><CheckCircle2 className="w-4 h-4" /></span>}
                    </li>
                  ))}
                </ul>
                {failed[0]?.error && !busy && <p className="mt-3 text-[13px] text-amber-800">{failed[0].error}</p>}
              </section>
            )}
          </>
        )}
        <footer className="py-6 text-center text-[12.5px] text-slate-500">Morooj Nizwa International LLC · www.monipack.com · www.shop.monipack.com</footer>
      </main>
    </div>
  );
}
