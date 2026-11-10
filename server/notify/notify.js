import { query } from '../db/pool.js';

/**
 * In-app notifications (the bell). notify() never throws: a failed notification must not break the action.
 */
export async function notify(userIds, { kind, title, body = '', link = '' }) {
  const ids = [...new Set((userIds || []).map((x) => parseInt(x, 10)).filter((x) => x > 0))];
  if (!ids.length) return;
  try {
    await query(
      `INSERT INTO notifications (user_id, kind, title, body, link)
       SELECT u, $2, $3, $4, $5 FROM unnest($1::int[]) AS u`,
      [ids, kind, String(title).slice(0, 200), String(body || '').slice(0, 400), String(link || '').slice(0, 80)]
    );
  } catch (err) { console.error('[notify]', err.message); }
}

/** Staff logins linked to a salesman record (salesman role). */
export async function usersForSalesman(salesmanId) {
  if (!salesmanId) return [];
  const { rows } = await query('SELECT id FROM users WHERE salesman_id = $1 AND archived_at IS NULL AND is_active', [salesmanId]);
  return rows.map((r) => r.id);
}

/** Super admins and managers (who approve customers and watch the team). */
export async function managers() {
  const { rows } = await query("SELECT id FROM users WHERE role IN ('super_admin','manager') AND archived_at IS NULL AND is_active");
  return rows.map((r) => r.id);
}

export function registerNotificationRoutes(app, { authMiddleware, asyncHandler }) {
  app.get('/api/notifications', authMiddleware, asyncHandler(async (req, res) => {
    const [{ rows }, { rows: c }] = await Promise.all([
      query('SELECT id, kind, title, body, link, created_at, read_at FROM notifications WHERE user_id = $1 ORDER BY id DESC LIMIT 30', [req.user.id]),
      query('SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [req.user.id]),
    ]);
    res.json({ unread: c[0].n, items: rows.map((r) => ({ id: String(r.id), kind: r.kind, title: r.title, body: r.body, link: r.link, at: r.created_at, read: Boolean(r.read_at) })) });
  }));
  app.post('/api/notifications/read', authMiddleware, asyncHandler(async (req, res) => {
    const id = parseInt(req.body?.id, 10);
    if (id) await query('UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2 AND read_at IS NULL', [id, req.user.id]);
    else await query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [req.user.id]);
    res.json({ ok: true });
  }));
}
