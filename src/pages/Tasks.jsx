import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Search, X, Check, Calendar, Flag, MessageSquare, Trash2, Loader2, List, Kanban, User, Users, Send, ChevronDown, Link2,
} from 'lucide-react';
import { avatarStyle } from '../components/ui/BranchPicker.jsx';
import { openPrintable, tableHtml, chipsHtml } from '../utils/pdfReport.js';

/**
 * Task manager (Linear / Asana style).
 * Everyone: My tasks. Customer care: can give tasks to others. Super admin / manager: all tasks.
 * List grouped by due date, or a board (To do / In progress / Done) with drag & drop.
 */
const STATUS = [
  { id: 'todo', label: 'To do', dot: '#94A3B8' },
  { id: 'in_progress', label: 'In progress', dot: '#2563EB' },
  { id: 'done', label: 'Done', dot: '#0E9F6E' },
];
const PRIORITY = [
  { id: 'urgent', label: 'Urgent', cls: 'text-red-700 bg-red-50', flag: '#DC2626' },
  { id: 'high', label: 'High', cls: 'text-orange-700 bg-orange-50', flag: '#EA580C' },
  { id: 'normal', label: 'Normal', cls: 'text-slate-600 bg-slate-100', flag: '#94A3B8' },
  { id: 'low', label: 'Low', cls: 'text-slate-500 bg-slate-50', flag: '#CBD5E1' },
];
const P = Object.fromEntries(PRIORITY.map((p) => [p.id, p]));
const ROLE_NAME = { super_admin: 'Super admin', manager: 'Manager', customer_care: 'Customer care', salesman: 'Salesman login', salesman_link: 'Salesman (link)' };
const initials = (s = '') => s.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
const DAY = 86400000;
const startOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const bucketOf = (t) => {
  if (t.status === 'done') return 'done';
  if (!t.dueAt) return 'nodate';
  const due = new Date(t.dueAt); const today = startOfDay();
  if (due < today) return 'overdue';
  if (due < new Date(today.getTime() + DAY)) return 'today';
  if (due < new Date(today.getTime() + 7 * DAY)) return 'week';
  return 'later';
};
const BUCKETS = [
  { id: 'overdue', label: 'Overdue', tone: 'text-red-700' },
  { id: 'today', label: 'Today', tone: 'text-amber-700' },
  { id: 'week', label: 'Next 7 days', tone: 'text-slate-700' },
  { id: 'later', label: 'Later', tone: 'text-slate-700' },
  { id: 'nodate', label: 'No due date', tone: 'text-slate-500' },
  { id: 'done', label: 'Done', tone: 'text-emerald-700' },
];
const dueText = (iso) => {
  if (!iso) return '';
  const d = new Date(iso); const today = startOfDay();
  const day = Math.round((startOfDay(d) - today) / DAY);
  const time = d.getHours() || d.getMinutes() ? ` ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : '';
  if (day === 0) return `Today${time}`;
  if (day === 1) return `Tomorrow${time}`;
  if (day === -1) return 'Yesterday';
  if (day < 0) return `${-day} days late`;
  return d.toLocaleDateString('en-GB', { weekday: day < 7 ? 'short' : undefined, day: 'numeric', month: 'short' });
};
const toLocalInput = (iso) => { if (!iso) return ''; const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const quick = (days, hour = 17) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
const keyOf = (a) => (a ? `${a.kind}:${a.id}` : '');

export default function Tasks({ authFetch, showToast, currentUser, onTasksChanged }) {
  const perms = currentUser?.permissions || [];
  const canAssign = perms.includes('tasks.assign');
  const canAll = perms.includes('tasks.manage');
  const [scope, setScope] = useState('mine');
  const [view, setView] = useState(() => { try { return localStorage.getItem('mp_tasks_view') || 'list'; } catch { return 'list'; } });
  const [tasks, setTasks] = useState(null);
  const [people, setPeople] = useState([]);
  const [q, setQ] = useState('');
  const [who, setWho] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickWho, setQuickWho] = useState('');
  const [quickDue, setQuickDue] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await authFetch(`/api/tasks?scope=${scope}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not load tasks');
      setTasks(d);
    } catch (e) { showToast?.(e.message, 'error'); setTasks([]); }
  }, [authFetch, scope, showToast]);
  useEffect(() => { setTasks(null); load(); }, [load]);
  useEffect(() => {
    authFetch('/api/tasks/assignees').then((r) => (r.ok ? r.json() : [])).then(setPeople).catch(() => {});
  }, [authFetch]);
  useEffect(() => { try { localStorage.setItem('mp_tasks_view', view); } catch { /* ignore */ } }, [view]);

  const changed = async () => { await load(); onTasksChanged?.(); };

  const visible = useMemo(() => {
    let list = tasks || [];
    const t = q.trim().toLowerCase();
    if (t) list = list.filter((x) => `${x.title} ${x.description} ${x.leadName} ${x.customerName} ${x.assignee?.name || ''}`.toLowerCase().includes(t));
    if (who) list = list.filter((x) => keyOf(x.assignee) === who);
    return list;
  }, [tasks, q, who]);
  const counts = useMemo(() => {
    const c = { overdue: 0, today: 0, open: 0, done: 0 };
    (tasks || []).forEach((x) => { const b = bucketOf(x); if (b === 'done') c.done++; else { c.open++; if (b === 'overdue') c.overdue++; if (b === 'today') c.today++; } });
    return c;
  }, [tasks]);

  const patch = async (id, body, silent) => {
    // optimistic for status changes
    if (body.status) setTasks((list) => list.map((x) => (x.id === id ? { ...x, status: body.status, completedAt: body.status === 'done' ? new Date().toISOString() : null } : x)));
    try {
      const r = await authFetch(`/api/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not update the task');
      setTasks((list) => list.map((x) => (x.id === id ? d : x)));
      if (!silent && body.status === 'done') showToast?.('Task done');
      onTasksChanged?.();
      return d;
    } catch (e) { showToast?.(e.message, 'error'); load(); return null; }
  };

  const addQuick = async (e) => {
    e?.preventDefault();
    const title = quickTitle.trim();
    if (title.length < 2) return;
    setBusy(true);
    try {
      const [kind, id] = (quickWho || '').split(':');
      const r = await authFetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, dueAt: quickDue || null, assignee: kind ? { kind, id } : null }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not add the task');
      setQuickTitle('');
      showToast?.(d.assignee && !people.find((p) => p.me && keyOf(p) === keyOf(d.assignee)) ? `Task given to ${d.assignee.name}` : 'Task added');
      await changed();
    } catch (err) { showToast?.(err.message, 'error'); }
    setBusy(false);
  };

  const exportPdf = () => {
    const list = visible.filter((x) => showDone || x.status !== 'done');
    openPrintable({
      docType: 'Task list',
      title: { mine: 'My tasks', created: 'Tasks I gave', all: 'All tasks' }[scope] || 'Tasks',
      subtitle: `${list.length} task${list.length === 1 ? '' : 's'}`,
      meta: [['Open', counts.open], ['Overdue', counts.overdue]],
      bodyHtml: chipsHtml([['Open', counts.open], ['Overdue', counts.overdue], ['Due today', counts.today], ['Done', counts.done]])
        + tableHtml([{ label: 'Task' }, { label: 'Status' }, { label: 'Priority' }, { label: 'Due' }, { label: 'Assigned to' }, { label: 'From' }],
          list.map((x) => [x.title, STATUS.find((s) => s.id === x.status)?.label, P[x.priority]?.label, x.dueAt ? new Date(x.dueAt).toLocaleString('en-GB') : '', x.assignee?.name || '', x.createdByName])),
    });
  };

  const meKey = people.find((p) => p.me) ? keyOf(people.find((p) => p.me)) : '';
  const tabs = [
    { id: 'mine', label: 'My tasks', icon: User },
    { id: 'created', label: 'Tasks I gave', icon: Send },
    ...(canAll ? [{ id: 'all', label: 'All tasks', icon: Users }] : []),
  ];

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-4 pb-24 md:pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto min-w-0">
          <h1 className="text-[24px] leading-tight font-extrabold text-slate-900">Tasks</h1>
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11.5px] font-bold">
            <span className="px-2.5 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600 tabular-nums">{counts.open} open</span>
            {counts.overdue > 0 && <span className="px-2.5 py-0.5 rounded-full bg-red-50 text-red-700 tabular-nums">{counts.overdue} overdue</span>}
            {counts.today > 0 && <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 tabular-nums">{counts.today} due today</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex p-1 rounded-xl bg-slate-100 border border-slate-200" role="tablist" aria-label="Task view">
            {[['list', List, 'List'], ['board', Kanban, 'Board']].map(([v, Icon, label]) => (
              <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`flex items-center gap-1.5 px-3 min-h-[34px] rounded-lg text-xs font-bold transition ${view === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>
                <Icon className="w-3.5 h-3.5" /><span>{label}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={exportPdf} className="mp-btn mp-btn-line min-h-[40px] hidden sm:inline-flex">PDF</button>
          <button type="button" onClick={() => setOpenId('new')} className="mp-btn mp-btn-red min-h-[40px]"><Plus className="w-4 h-4" /> New task</button>
        </div>
      </div>

      {/* Scope tabs */}
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto mp-noscrollbar">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setScope(id)} className={`relative flex items-center gap-1.5 px-3 h-10 text-[13px] font-semibold whitespace-nowrap transition ${scope === id ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}>
            <Icon className="w-4 h-4" />{label}
            {scope === id && <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded bg-[#D0121B] mp-bar" />}
          </button>
        ))}
      </div>

      {/* Quick add */}
      <form onSubmit={addQuick} className="bg-white rounded-2xl border border-slate-200 shadow-[0_1px_3px_rgba(16,24,40,0.06)] p-2 flex flex-wrap items-center gap-2">
        <span className="w-8 h-8 grid place-items-center rounded-lg bg-red-50 text-[#D0121B] shrink-0"><Plus className="w-4 h-4" /></span>
        <input value={quickTitle} onChange={(e) => setQuickTitle(e.target.value)} placeholder={canAssign ? 'Add a task and press Enter… e.g. “Call Sohar Wholesale about samples”' : 'Add a task for yourself and press Enter…'}
          className="flex-1 min-w-[200px] h-10 px-1 text-[14px] bg-transparent outline-none border-0 focus:shadow-none" maxLength={200} aria-label="New task title" />
        <select value={quickDue} onChange={(e) => setQuickDue(e.target.value)} className="h-9 px-2 rounded-lg border border-slate-200 text-xs bg-white" aria-label="Due">
          <option value="">No due date</option>
          <option value={quick(0)}>Today</option>
          <option value={quick(1, 10)}>Tomorrow</option>
          <option value={quick(3, 10)}>In 3 days</option>
          <option value={quick(7, 10)}>Next week</option>
        </select>
        {canAssign && (
          <select value={quickWho} onChange={(e) => setQuickWho(e.target.value)} className="h-9 px-2 rounded-lg border border-slate-200 text-xs bg-white max-w-[200px]" aria-label="Assign to">
            <option value="">Me</option>
            <PeopleOptions people={people.filter((p) => !p.me)} />
          </select>
        )}
        <button type="submit" disabled={busy || quickTitle.trim().length < 2} className="mp-btn mp-btn-dark min-h-[36px] text-xs disabled:opacity-40">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}</button>
      </form>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="mp-fchip min-w-[220px]">
          <Search className="w-3.5 h-3.5" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks…" className="bg-transparent outline-none border-0 text-[12.5px] w-full focus:shadow-none" aria-label="Search tasks" />
          {q && <button type="button" onClick={() => setQ('')} aria-label="Clear"><X className="w-3.5 h-3.5" /></button>}
        </label>
        {(canAssign || canAll) && scope !== 'mine' && (
          <label className={`mp-fchip ${who ? 'on' : ''}`}>
            <User className="w-3.5 h-3.5" />
            <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Person">
              <option value="">Everyone</option>
              <PeopleOptions people={people} />
            </select>
            <ChevronDown className="w-3.5 h-3.5 opacity-60" />
          </label>
        )}
        {view === 'list' && (
          <button type="button" onClick={() => setShowDone((v) => !v)} className={`mp-fchip ${showDone ? 'on' : ''}`} aria-pressed={showDone}>
            <Check className="w-3.5 h-3.5" /> Show done ({counts.done})
          </button>
        )}
      </div>

      {/* Body */}
      {!tasks ? (
        <div className="grid gap-2">{[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-2xl bg-white border border-slate-200 animate-pulse" />)}</div>
      ) : view === 'list' ? (
        <div className="space-y-4">
          {BUCKETS.filter((b) => b.id !== 'done' || showDone).map((b) => {
            const items = visible.filter((x) => bucketOf(x) === b.id);
            if (!items.length) return null;
            return (
              <section key={b.id} aria-label={b.label}>
                <h2 className={`flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.08em] mb-2 ${b.tone}`}>{b.label}<span className="text-slate-400 tabular-nums">{items.length}</span></h2>
                <ul className="bg-white rounded-2xl border border-slate-200 shadow-[0_1px_3px_rgba(16,24,40,0.06)] divide-y divide-slate-100 overflow-hidden mp-stagger">
                  {items.map((t) => <TaskRow key={t.id} t={t} onOpen={() => setOpenId(t.id)} onToggle={() => patch(t.id, { status: t.status === 'done' ? 'todo' : 'done' })} showAssignee={scope !== 'mine'} />)}
                </ul>
              </section>
            );
          })}
          {!visible.filter((x) => showDone || x.status !== 'done').length && (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-50 text-emerald-600 grid place-items-center"><Check className="w-6 h-6" /></div>
              <p className="mt-3 font-bold">{q || who ? 'No tasks match.' : scope === 'mine' ? 'You are all caught up.' : 'No open tasks.'}</p>
              <p className="text-sm text-slate-500 mt-1">Add a task above{canAssign ? ' and give it to anyone in the team' : ''}.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="mp-board flex" style={{ height: 'calc(100dvh - 360px)' }}>
          {STATUS.map((s, i) => {
            const items = visible.filter((x) => x.status === s.id);
            return (
              <section key={s.id} className={`mp-col ${dragId ? 'transition' : ''}`} style={{ flexBasis: 340, animationDelay: `${i * 50}ms` }}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('is-over'); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove('is-over'); }}
                onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('is-over'); const id = e.dataTransfer.getData('text/plain') || dragId; setDragId(null); const t = (tasks || []).find((x) => x.id === id); if (t && t.status !== s.id) patch(id, { status: s.id }); }}>
                <header className="mp-col-head flex items-center gap-2">
                  <i className="w-2.5 h-2.5 rounded-full" style={{ background: s.dot }} />
                  <h3 className="text-[12.5px] font-bold flex-1">{s.label}</h3>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600 tabular-nums">{items.length}</span>
                </header>
                <div className="mp-col-body mp-stagger">
                  {items.map((t) => (
                    <article key={t.id} draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); setDragId(t.id); }} onDragEnd={() => setDragId(null)}
                      onClick={() => setOpenId(t.id)} className={`mp-lc cursor-pointer ${dragId === t.id ? 'is-dragging' : ''}`}>
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 shrink-0" style={{ color: P[t.priority]?.flag }} title={`${P[t.priority]?.label} priority`}><Flag className="w-3.5 h-3.5" fill="currentColor" /></span>
                        <h4 className={`text-[13px] font-semibold leading-snug flex-1 ${t.status === 'done' ? 'line-through text-slate-400' : 'text-slate-900'}`}>{t.title}</h4>
                      </div>
                      <Meta t={t} showAssignee />
                    </article>
                  ))}
                  {!items.length && <div className="mp-col-empty">{dragId ? 'Drop here' : 'Nothing here'}</div>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {openId && (
        <TaskPanel
          id={openId}
          authFetch={authFetch}
          people={people}
          canAssign={canAssign}
          meKey={meKey}
          showToast={showToast}
          onClose={() => setOpenId(null)}
          onSaved={async () => { await changed(); }}
        />
      )}
    </div>
  );
}

function PeopleOptions({ people }) {
  const staff = people.filter((p) => p.kind === 'user');
  const sms = people.filter((p) => p.kind === 'salesman');
  return (
    <>
      {staff.length > 0 && <optgroup label="Staff logins">{staff.map((p) => <option key={keyOf(p)} value={keyOf(p)}>{p.name}{p.me ? ' (me)' : ''} · {ROLE_NAME[p.role] || p.role}</option>)}</optgroup>}
      {sms.length > 0 && <optgroup label="Salesmen (on their link)">{sms.map((p) => <option key={keyOf(p)} value={keyOf(p)}>{p.name}{p.linkOn ? '' : ' (link off)'}</option>)}</optgroup>}
    </>
  );
}

function Meta({ t, showAssignee }) {
  const b = bucketOf(t);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11.5px]">
      {t.dueAt && t.status !== 'done' && (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold ${b === 'overdue' ? 'bg-red-50 text-red-700' : b === 'today' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
          <Calendar className="w-3 h-3" />{dueText(t.dueAt)}
        </span>
      )}
      {(t.leadName || t.customerName) && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold max-w-[180px] truncate"><Link2 className="w-3 h-3 shrink-0" />{t.leadName || t.customerName}</span>}
      {t.commentCount > 0 && <span className="inline-flex items-center gap-1 text-slate-500"><MessageSquare className="w-3 h-3" />{t.commentCount}</span>}
      {showAssignee && t.assignee && (
        <span className="ml-auto inline-flex items-center gap-1.5 text-slate-600" title={`Assigned to ${t.assignee.name}`}>
          <span className="w-5 h-5 rounded-full grid place-items-center text-[8.5px] font-bold text-white" style={avatarStyle(t.assignee.name)}>{initials(t.assignee.name)}</span>
          <span className="hidden sm:inline max-w-[110px] truncate">{t.assignee.name}</span>
        </span>
      )}
    </div>
  );
}

function TaskRow({ t, onOpen, onToggle, showAssignee }) {
  const done = t.status === 'done';
  return (
    <li className="group flex items-start gap-3 px-3 sm:px-4 py-3 hover:bg-slate-50/80 transition-colors">
      <button type="button" onClick={onToggle} aria-label={done ? 'Mark as not done' : 'Mark as done'} title={done ? 'Mark as not done' : 'Mark as done'}
        className={`mt-0.5 w-6 h-6 shrink-0 rounded-full border-2 grid place-items-center transition ${done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 text-transparent hover:border-emerald-500 hover:text-emerald-500'}`}>
        <Check className="w-3.5 h-3.5" strokeWidth={3} />
      </button>
      <button type="button" onClick={onOpen} className="flex-1 min-w-0 text-left">
        <span className="flex items-center gap-2">
          {t.priority !== 'normal' && t.priority !== 'low' && <Flag className="w-3.5 h-3.5 shrink-0" style={{ color: P[t.priority]?.flag }} fill="currentColor" />}
          <span className={`text-[13.5px] font-semibold truncate ${done ? 'line-through text-slate-400' : 'text-slate-900'}`}>{t.title}</span>
          {t.status === 'in_progress' && <span className="shrink-0 text-[10.5px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">In progress</span>}
        </span>
        {t.description && <span className="block text-[12px] text-slate-500 truncate mt-0.5">{t.description}</span>}
        <Meta t={t} showAssignee={showAssignee} />
      </button>
    </li>
  );
}

function TaskPanel({ id, authFetch, people, canAssign, meKey, showToast, onClose, onSaved }) {
  const isNew = id === 'new';
  const [task, setTask] = useState(isNew ? { title: '', description: '', status: 'todo', priority: 'normal', dueAt: null, assignee: null, comments: [], access: { edit: true, status: true } } : null);
  const [form, setForm] = useState(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState('');
  const titleRef = useRef(null);

  useEffect(() => {
    if (isNew) { setForm({ title: '', description: '', status: 'todo', priority: 'normal', dueAt: null, who: meKey || '' }); setTimeout(() => titleRef.current?.focus(), 80); return; }
    authFetch(`/api/tasks/${id}`).then(async (r) => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not open the task');
      setTask(d);
      setForm({ title: d.title, description: d.description, status: d.status, priority: d.priority, dueAt: d.dueAt, who: keyOf(d.assignee) });
    }).catch((e) => { showToast?.(e.message, 'error'); onClose(); });
  }, [id, isNew, authFetch, meKey, showToast, onClose]);

  const canEdit = isNew || task?.access?.edit;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e) => {
    e?.preventDefault();
    if (!form || form.title.trim().length < 2) { showToast?.('Give the task a title', 'error'); return; }
    setBusy('save');
    try {
      const [kind, pid] = (form.who || '').split(':');
      const body = canEdit
        ? { title: form.title.trim(), description: form.description, status: form.status, priority: form.priority, dueAt: form.dueAt || null, ...(kind ? { assignee: { kind, id: pid } } : {}) }
        : { status: form.status };
      const r = await authFetch(isNew ? '/api/tasks' : `/api/tasks/${id}`, { method: isNew ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not save the task');
      showToast?.(isNew ? 'Task added' : 'Task saved');
      await onSaved();
      onClose();
    } catch (err) { showToast?.(err.message, 'error'); }
    setBusy('');
  };

  const remove = async () => {
    if (!window.confirm('Delete this task? This cannot be undone.')) return;
    setBusy('delete');
    try {
      const r = await authFetch(`/api/tasks/${id}`, { method: 'DELETE' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not delete');
      showToast?.('Task deleted');
      await onSaved(); onClose();
    } catch (err) { showToast?.(err.message, 'error'); }
    setBusy('');
  };

  const sendComment = async () => {
    if (!comment.trim()) return;
    setBusy('comment');
    try {
      const r = await authFetch(`/api/tasks/${id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: comment }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not add the comment');
      setTask((t) => ({ ...t, comments: d }));
      setComment('');
      onSaved();
    } catch (err) { showToast?.(err.message, 'error'); }
    setBusy('');
  };

  const inp = 'w-full h-11 text-[13.5px] bg-white border border-slate-200 rounded-xl px-3 focus:outline-none focus:ring-4 focus:ring-red-500/10 focus:border-red-500 transition disabled:bg-slate-50 disabled:text-slate-500';
  const lbl = 'block text-[12px] font-semibold text-slate-700 mb-1.5';

  return (
    <div className="mp-sheet-layer" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="mp-sheet" onSubmit={save} role="dialog" aria-modal="true" aria-label={isNew ? 'New task' : 'Task'}
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') onClose(); }}>
        <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-slate-200 flex items-start gap-3 shrink-0">
          <div className="flex-1 min-w-0">
            <h3 className="text-[19px] font-bold text-slate-900 mp-display">{isNew ? 'New task' : 'Task'}</h3>
            <p className="text-[12.5px] text-slate-500 truncate">{isNew ? 'What needs doing, by whom and when' : task ? `Given by ${task.createdByName || '—'} · ${new Date(task.createdAt).toLocaleDateString('en-GB')}` : 'Loading…'}</p>
          </div>
          <button type="button" onClick={onClose} className="w-10 h-10 grid place-items-center rounded-xl border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        {!form ? (
          <div className="flex-1 grid place-items-center text-slate-500"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-4 overscroll-contain">
            <div>
              <label className={lbl} htmlFor="task-title">Task</label>
              <input id="task-title" ref={titleRef} value={form.title} onChange={(e) => set('title', e.target.value)} disabled={!canEdit} maxLength={200} placeholder="e.g. Call Sohar Wholesale about samples" className={`${inp} text-[15px] font-semibold`} />
            </div>
            <div>
              <label className={lbl} htmlFor="task-desc">Details</label>
              <textarea id="task-desc" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} disabled={!canEdit} placeholder="Anything that helps get it done…" className={`${inp} h-auto py-2.5`} />
            </div>

            <div>
              <span className={lbl}>Status</span>
              <div className="flex p-1 rounded-xl bg-slate-100 border border-slate-200 w-full sm:w-fit" role="radiogroup" aria-label="Status">
                {STATUS.map((s) => (
                  <button key={s.id} type="button" role="radio" aria-checked={form.status === s.id} onClick={() => set('status', s.id)}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 min-h-[36px] rounded-lg text-xs font-bold transition ${form.status === s.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                    <i className="w-2 h-2 rounded-full" style={{ background: s.dot }} />{s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className={lbl}>Priority</span>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Priority">
                  {PRIORITY.map((p) => (
                    <button key={p.id} type="button" disabled={!canEdit} role="radio" aria-checked={form.priority === p.id} onClick={() => set('priority', p.id)}
                      className={`inline-flex items-center gap-1 min-h-[34px] px-2.5 rounded-lg text-[12px] font-semibold border transition disabled:opacity-60 ${form.priority === p.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>
                      <Flag className="w-3 h-3" style={{ color: form.priority === p.id ? '#fff' : p.flag }} fill="currentColor" />{p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={lbl} htmlFor="task-who">Assigned to</label>
                <select id="task-who" value={form.who} onChange={(e) => set('who', e.target.value)} disabled={!canEdit || !canAssign} className={`${inp} cursor-pointer`}>
                  {!canAssign && <option value={form.who}>{task?.assignee?.name || 'Me'}</option>}
                  {canAssign && <PeopleOptions people={people} />}
                </select>
              </div>
            </div>

            <div>
              <label className={lbl} htmlFor="task-due">Due</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {[['Today', 0, 17], ['Tomorrow', 1, 10], ['In 3 days', 3, 10], ['Next week', 7, 10]].map(([l, d, h]) => (
                  <button key={l} type="button" disabled={!canEdit} onClick={() => set('dueAt', quick(d, h))} className="min-h-[32px] px-3 rounded-lg text-[12px] font-semibold border border-slate-200 bg-white text-slate-600 hover:border-slate-300 disabled:opacity-60">{l}</button>
                ))}
                {form.dueAt && canEdit && <button type="button" onClick={() => set('dueAt', null)} className="min-h-[32px] px-3 rounded-lg text-[12px] font-semibold text-rose-600 hover:bg-rose-50">No due date</button>}
              </div>
              <input id="task-due" type="datetime-local" value={toLocalInput(form.dueAt)} onChange={(e) => set('dueAt', e.target.value ? new Date(e.target.value).toISOString() : null)} disabled={!canEdit} className={`${inp} max-w-xs`} />
            </div>

            {(task?.leadName || task?.customerName) && (
              <p className="text-[12.5px] text-slate-600 flex items-center gap-1.5"><Link2 className="w-4 h-4 text-blue-600" /> Linked to <b>{task.leadName || task.customerName}</b></p>
            )}
            {!canEdit && <p className="text-[12px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">You can change the status and add comments. Only {task?.createdByName || 'the person who gave it'} or a manager can change the rest.</p>}

            {!isNew && task && (
              <section className="pt-2 border-t border-slate-100">
                <h4 className="text-[13px] font-bold mb-3 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-slate-400" /> Comments <span className="text-slate-400 font-semibold">{task.comments?.length || 0}</span></h4>
                <ol className="space-y-3 mb-3">
                  {(task.comments || []).map((c) => (
                    <li key={c.id} className="flex gap-2.5">
                      <span className="w-7 h-7 rounded-full grid place-items-center text-[10px] font-bold text-white shrink-0" style={avatarStyle(c.author)}>{initials(c.author)}</span>
                      <div className="min-w-0 flex-1 bg-slate-50 rounded-2xl rounded-tl-md px-3 py-2">
                        <div className="flex items-baseline gap-2"><b className="text-[12.5px]">{c.author}</b><span className="text-[11px] text-slate-400">{new Date(c.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
                        <p className="text-[13px] text-slate-700 whitespace-pre-wrap break-words">{c.body}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="flex gap-2">
                  <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a comment…" maxLength={2000} className={inp}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) { e.preventDefault(); sendComment(); } }} />
                  <button type="button" onClick={sendComment} disabled={busy === 'comment' || !comment.trim()} className="shrink-0 w-11 h-11 grid place-items-center rounded-xl bg-slate-900 text-white disabled:opacity-40" aria-label="Send comment">
                    {busy === 'comment' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </section>
            )}
          </div>
        )}

        <div className="px-5 sm:px-6 py-3.5 border-t border-slate-200 flex items-center gap-2 shrink-0 bg-white mp-sheet-foot">
          {!isNew && task?.access?.edit && (
            <button type="button" onClick={remove} disabled={busy === 'delete'} className="flex items-center gap-1.5 px-3 min-h-[42px] text-[12.5px] font-semibold text-rose-600 hover:bg-rose-50 rounded-xl">
              <Trash2 className="w-4 h-4" /><span className="hidden sm:inline">Delete</span>
            </button>
          )}
          <span className="hidden md:inline text-[11.5px] text-slate-400 mr-auto"><kbd className="mp-kbd">Ctrl</kbd> + <kbd className="mp-kbd">Enter</kbd> to save</span>
          <button type="button" onClick={onClose} className="ml-auto md:ml-0 px-4 min-h-[42px] text-[13px] font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
          <button type="submit" disabled={!form || busy === 'save'} className="mp-btn mp-btn-red min-h-[42px] px-5 text-[13px] disabled:opacity-50">
            {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {isNew ? 'Add task' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
