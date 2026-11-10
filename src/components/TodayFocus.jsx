import React, { useEffect, useMemo, useState } from 'react';
import { PhoneCall, CalendarClock, ListChecks, Snowflake, Briefcase, Flame, ChevronRight, Sparkles } from 'lucide-react';
import { getMomentum, onMomentumChange } from '../utils/momentum.js';

const DAY = 86400000;
const ago = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); if (m < 60) return `${m} min`; const h = Math.floor(m / 60); if (h < 24) return `${h}h ${m % 60}m`; return `${Math.floor(h / 24)}d`; };
const firstName = (n = '') => n.split(' ')[0] || '';

/**
 * "Your day" panel for the people who work the queue (customer care, salesmen).
 * Psychology: one clear next action (reduces decision fatigue), urgency from real waiting time
 * (speed-to-lead), visible progress toward a daily goal, a streak, and a positive end-of-day recap.
 */
export default function TodayFocus({ leads = [], pipelineStages = [], currentUser, taskDue = 0, onNavigate }) {
  const role = currentUser?.role;
  const [m, setM] = useState(() => getMomentum(currentUser?.id, role));
  const [now, setNow] = useState(Date.now());
  useEffect(() => onMomentumChange(() => setM(getMomentum(currentUser?.id, role))), [currentUser?.id, role]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);

  const first = pipelineStages[0]?.id || 'new';
  const s = useMemo(() => {
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const open = leads.filter((l) => l.status !== 'won' && l.status !== 'lost');
    const waiting = leads.filter((l) => l.status === first);
    const oldest = waiting.reduce((min, l) => Math.min(min, new Date(l.createdAt || l.date || now).getTime()), now);
    const due = open.filter((l) => l.nextFollowUpAt && new Date(l.nextFollowUpAt) <= end).length;
    const quiet = open.filter((l) => now - new Date(l.updatedAt || l.date || now).getTime() > 7 * DAY).length;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const wonToday = leads.filter((l) => l.status === 'won' && new Date(l.updatedAt || 0) >= todayStart).length;
    return { open: open.length, waiting: waiting.length, oldestMs: waiting.length ? now - oldest : 0, due, quiet, wonToday };
  }, [leads, first, now]);

  const care = role === 'customer_care';
  const items = care
    ? [
      { n: s.waiting, icon: PhoneCall, label: 'new enquiries waiting for a call', sub: s.waiting ? `Oldest waiting ${ago(s.oldestMs)}. Faster calls win more deals.` : 'Queue is clear', go: () => onNavigate('customercare'), hot: s.oldestMs > 60 * 60000 },
      { n: s.due, icon: CalendarClock, label: 'follow-ups due today', sub: 'Promised calls and visits', go: () => { try { sessionStorage.setItem('mp_followups', '1'); } catch { /* ignore */ } onNavigate('leads'); } },
      { n: taskDue, icon: ListChecks, label: 'tasks due', sub: 'From you and your team', go: () => onNavigate('tasks') },
    ]
    : [
      { n: s.due, icon: CalendarClock, label: 'follow-ups due today', sub: 'Customers you promised to call or visit', go: () => { try { sessionStorage.setItem('mp_followups', '1'); } catch { /* ignore */ } onNavigate('leads'); }, hot: s.due > 0 },
      { n: taskDue, icon: ListChecks, label: 'tasks due', sub: 'Given to you by the office', go: () => onNavigate('tasks') },
      { n: s.quiet, icon: Snowflake, label: 'leads going quiet', sub: 'No update for 7+ days. One call can save them.', go: () => onNavigate('leads') },
      { n: s.open, icon: Briefcase, label: 'open leads', sub: 'Your pipeline', go: () => onNavigate('leads') },
    ];
  const next = items.find((i) => i.n > 0);
  items.sort((a, b) => (b.n > 0) - (a.n > 0)); // things to do first, finished ones after
  const pct = Math.min(1, m.today / m.goal);
  const R = 34; const C = 2 * Math.PI * R;
  const hour = new Date(now).getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <section className="mp-focus mp-enter" aria-label="Your day">
      <div className="mp-focus-main">
        <p className="mp-focus-eyebrow"><Sparkles className="w-3.5 h-3.5" /> Your day</p>
        <h2 className="mp-focus-title">{hello}{currentUser?.name ? `, ${firstName(currentUser.name)}` : ''}</h2>
        <p className="mp-focus-sub">
          {next ? <>Start with <b>{next.n} {next.label}</b>.</> : <>Everything is handled. Great time to call a quiet customer.</>}
          {hour >= 16 && m.today > 0 && <> Today you finished <b>{m.today}</b> action{m.today === 1 ? '' : 's'}{s.wonToday ? <> and the team won <b>{s.wonToday}</b> deal{s.wonToday === 1 ? '' : 's'}</> : null}.</>}
        </p>
        <div className="mp-focus-grid mp-stagger">
          {items.map(({ n, icon: Icon, label, sub, go, hot }) => (
            <button key={label} type="button" onClick={go} className={`mp-focus-item ${hot ? 'is-hot' : ''} ${n === 0 ? 'is-zero' : ''}`}>
              <span className="mp-focus-ic"><Icon className="w-4 h-4" /></span>
              <span className="min-w-0 flex-1 text-left">
                <b className="block"><span className="tabular-nums">{n}</span> {label}</b>
                <small className="block truncate">{sub}</small>
              </span>
              <ChevronRight className="w-4 h-4 opacity-50 shrink-0" />
            </button>
          ))}
        </div>
      </div>
      <div className="mp-focus-ring" aria-label={`Today ${m.today} of ${m.goal} actions`}>
        <div className="relative w-[96px] h-[96px] grid place-items-center">
          <svg width="96" height="96" viewBox="0 0 80 80" className="-rotate-90" aria-hidden="true">
            <circle cx="40" cy="40" r={R} className="mp-mom-track" strokeWidth="7" fill="none" />
            <circle cx="40" cy="40" r={R} className="mp-mom-fill" strokeWidth="7" fill="none" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} style={{ transition: 'stroke-dashoffset .9s cubic-bezier(.22,1,.36,1)' }} />
          </svg>
          <span className="absolute text-center leading-none"><b className="text-[22px] tabular-nums">{m.today}</b><small className="block text-[10.5px] mt-1 opacity-70">of {m.goal} today</small></span>
        </div>
        <p className="mp-focus-streak"><Flame className="w-4 h-4" /> {m.streak ? `${m.streak} day streak` : 'Start a streak today'}</p>
      </div>
    </section>
  );
}
