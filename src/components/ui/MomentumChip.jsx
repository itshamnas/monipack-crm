import React, { useEffect, useRef, useState } from 'react';
import { Flame } from 'lucide-react';
import { getMomentum, onMomentumChange } from '../../utils/momentum.js';

/**
 * Header chip: today's progress ring toward the daily goal + streak in days.
 * Click for a small card with the week and best streak.
 */
export default function MomentumChip({ currentUser }) {
  const uid = currentUser?.id; const role = currentUser?.role;
  const [m, setM] = useState(() => getMomentum(uid, role));
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => { setM(getMomentum(uid, role)); return onMomentumChange(() => setM(getMomentum(uid, role))); }, [uid, role]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  if (!uid) return null;
  const pct = Math.min(1, m.today / m.goal);
  const R = 9; const C = 2 * Math.PI * R;
  const done = m.today >= m.goal;
  const maxW = Math.max(m.goal, ...m.week.map((w) => w.n));
  return (
    <div className="relative" ref={box}>
      <button type="button" onClick={() => setOpen((v) => !v)} className={`mp-mom ${done ? 'is-done' : ''}`} aria-expanded={open}
        title={`Today ${m.today} of ${m.goal} · ${m.streak} day streak`} aria-label={`Today ${m.today} of ${m.goal} actions, ${m.streak} day streak`}>
        <svg width="24" height="24" viewBox="0 0 24 24" className="-rotate-90" aria-hidden="true">
          <circle cx="12" cy="12" r={R} className="mp-mom-track" strokeWidth="3" fill="none" />
          <circle cx="12" cy="12" r={R} className="mp-mom-fill" strokeWidth="3" fill="none" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />
        </svg>
        <span className="mp-mom-n tabular-nums">{m.today}<i>/{m.goal}</i></span>
        {m.streak > 0 && <span className="mp-mom-st"><Flame className="w-3.5 h-3.5" />{m.streak}</span>}
      </button>
      {open && (
        <div className="mp-mom-pop" role="dialog" aria-label="Your momentum">
          <p className="mp-mom-h">{done ? 'Daily goal reached. Nice work.' : `${m.goal - m.today} more to reach today's goal`}</p>
          <div className="mp-mom-bar"><i style={{ width: `${pct * 100}%` }} /></div>
          <div className="mp-mom-week" aria-label="Last 7 days">
            {m.week.map((w, i) => (
              <span key={i} title={`${w.n} actions`}><i style={{ height: `${Math.max(w.n ? 12 : 4, (w.n / maxW) * 100)}%` }} className={w.n >= m.goal ? 'hit' : ''} /><small>{w.day}</small></span>
            ))}
          </div>
          <div className="mp-mom-foot">
            <span><Flame className="w-3.5 h-3.5" /> {m.streak} day{m.streak === 1 ? '' : 's'} in a row</span>
            <span>Best {m.best}</span>
          </div>
          <p className="mp-mom-note">Every lead, stage move, note, quotation, task and customer you save counts. Fridays never break a streak.</p>
        </div>
      )}
    </div>
  );
}
