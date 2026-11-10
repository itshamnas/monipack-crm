import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, ListChecks, Trophy, UserPlus, ShieldCheck, Inbox } from 'lucide-react';

const ICON = { task: ListChecks, won: Trophy, lead: UserPlus, approval: ShieldCheck };
const ago = (d) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));
  if (m < 1) return 'now'; if (m < 60) return `${m}m`; const h = Math.floor(m / 60); if (h < 24) return `${h}h`; return `${Math.floor(h / 24)}d`;
};

/** Header bell: new leads assigned to you, tasks given to you, approvals waiting, deals won. Checks every minute. */
export default function NotificationBell({ authFetch, onNavigate }) {
  const [data, setData] = useState({ unread: 0, items: [] });
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const prevUnread = useRef(0);

  const load = useCallback(async () => {
    try {
      const r = await authFetch('/api/notifications');
      if (!r.ok) return;
      const d = await r.json();
      setData(d);
      if (d.unread > prevUnread.current && prevUnread.current !== -1 && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        try { new Notification('Monipack CRM', { body: d.items[0]?.title || 'You have a new notification', icon: '/icons/icon-192x192.png' }); } catch { /* ignore */ }
      }
      prevUnread.current = d.unread;
    } catch { /* offline */ }
  }, [authFetch]);

  useEffect(() => { prevUnread.current = -1; load().then(() => { if (prevUnread.current === -1) prevUnread.current = 0; }); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const markAll = async () => {
    setData((d) => ({ unread: 0, items: d.items.map((i) => ({ ...i, read: true })) }));
    await authFetch('/api/notifications/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
  };
  const openItem = async (n) => {
    setOpen(false);
    if (!n.read) {
      setData((d) => ({ unread: Math.max(0, d.unread - 1), items: d.items.map((i) => (i.id === n.id ? { ...i, read: true } : i)) }));
      authFetch('/api/notifications/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: n.id }) }).catch(() => {});
    }
    if (n.link) onNavigate?.(n.link);
  };
  const toggle = () => {
    setOpen((v) => !v);
    if ('Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission(); } catch { /* ignore */ } }
  };

  return (
    <div className="relative" ref={box}>
      <button type="button" onClick={toggle} className="mp-bell relative w-9 h-9 grid place-items-center rounded-xl border border-slate-200 bg-white/80 text-slate-600 hover:text-slate-900" aria-label={`Notifications${data.unread ? `, ${data.unread} unread` : ''}`} aria-expanded={open}>
        <Bell className={`w-[18px] h-[18px] ${data.unread ? 'mp-bell-ring' : ''}`} />
        {data.unread > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#E1222B] text-white text-[10px] font-bold grid place-items-center tabular-nums ring-2 ring-white">{data.unread > 99 ? '99+' : data.unread}</span>}
      </button>
      {open && (
        <div className="mp-mom-pop" style={{ width: 340, padding: 0 }} role="dialog" aria-label="Notifications">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <b className="text-[14px]">Notifications</b>
            {data.unread > 0 && <button type="button" onClick={markAll} className="text-[12px] font-semibold text-blue-700 inline-flex items-center gap-1"><CheckCheck className="w-4 h-4" /> Mark all read</button>}
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {data.items.length === 0 && <li className="px-4 py-8 text-center text-[13px] text-slate-500"><Inbox className="w-6 h-6 mx-auto mb-2 opacity-60" />Nothing new. New leads, tasks and approvals will show here.</li>}
            {data.items.map((n) => {
              const Icon = ICON[n.kind] || Bell;
              return (
                <li key={n.id}>
                  <button type="button" onClick={() => openItem(n)} className={`w-full text-left flex gap-3 px-4 py-3 hover:bg-slate-50 ${n.read ? '' : 'bg-blue-50/40'}`}>
                    <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${n.kind === 'won' ? 'bg-amber-50 text-amber-600' : n.kind === 'approval' ? 'bg-violet-50 text-violet-600' : 'bg-blue-50 text-blue-600'}`}><Icon className="w-4 h-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[13px] leading-snug ${n.read ? 'text-slate-600' : 'font-semibold text-slate-900'}`}>{n.title}</span>
                      {n.body && <span className="block text-[12px] text-slate-500 truncate">{n.body}</span>}
                    </span>
                    <span className="text-[11px] text-slate-400 shrink-0">{ago(n.at)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
