import { query } from '../db/pool.js';
import { notify, usersForSalesman } from '../notify/notify.js';

// Tell the person a task was given to (not when you give it to yourself)
async function notifyAssignee(actor, task, verb) {
  const a = task?.assignee; if (!a) return;
  const ids = a.kind === 'user' ? [a.id] : await usersForSalesman(a.id);
  const others = ids.filter((id) => String(id) !== String(actor.id));
  await notify(others, { kind: 'task', title: `${actor.name} ${verb}: ${task.title}`, body: task.dueAt ? `Due ${new Date(task.dueAt).toLocaleString('en-GB', { timeZone: 'Asia/Muscat', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : '', link: 'tasks' });
}

/**
 * Task manager: data access + staff API routes.
 * Who sees what:
 *  - tasks.manage (super admin, manager): every task, can edit or delete any task
 *  - tasks.assign (customer care): can give tasks to others; sees tasks assigned to or created by them
 *  - tasks.use (everyone, incl. salesman logins): own tasks; can create tasks for themselves
 * Salesmen without a login see and update their tasks from their secret link (see customers/routes.js).
 */
export const STATUSES = ['todo', 'in_progress', 'done'];
export const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

const SELECT = `
  SELECT t.*, u.name AS assignee_user_name, u.role AS assignee_user_role, s.name AS assignee_salesman_name,
         l.name AS lead_name, c.name AS customer_name,
         (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id) AS comment_count
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assignee_user_id
    LEFT JOIN salesmen s ON s.id = t.assignee_salesman_id
    LEFT JOIN leads l ON l.id = t.lead_id
    LEFT JOIN customers c ON c.id = t.customer_id`;

const iso = (d) => (d ? new Date(d).toISOString() : null);
export function taskToApi(r) {
  return {
    id: String(r.id),
    title: r.title,
    description: r.description || '',
    status: r.status,
    priority: r.priority,
    dueAt: iso(r.due_at),
    assignee: r.assignee_user_id
      ? { kind: 'user', id: String(r.assignee_user_id), name: r.assignee_user_name || '', role: r.assignee_user_role || '' }
      : r.assignee_salesman_id
        ? { kind: 'salesman', id: String(r.assignee_salesman_id), name: r.assignee_salesman_name || '' }
        : null,
    createdById: r.created_by_user_id != null ? String(r.created_by_user_id) : null,
    createdByName: r.created_by_name || '',
    leadId: r.lead_id != null ? String(r.lead_id) : null,
    leadName: r.lead_name || '',
    customerId: r.customer_id != null ? String(r.customer_id) : null,
    customerName: r.customer_name || '',
    commentCount: Number(r.comment_count || 0),
    completedAt: iso(r.completed_at),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

const toInt = (v) => { const n = parseInt(v, 10); return Number.isNaN(n) ? null : n; };
const cleanDate = (v) => { if (v === null || v === undefined || v === '') return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? undefined : d.toISOString(); };

/** Visibility filter for a staff user */
function scopeSql(user, scope, params) {
  const me = toId(user.id);
  const mySm = toInt(user.salesmanId);
  // built only when used, so every pushed parameter appears in the SQL
  const mine = () => `(t.assignee_user_id = $${params.push(me)}${mySm ? ` OR t.assignee_salesman_id = $${params.push(mySm)}` : ''})`;
  const created = () => `t.created_by_user_id = $${params.push(me)}`;
  const canAll = user.permissions?.includes('tasks.manage');
  if (scope === 'mine') return mine();
  if (scope === 'created') return created();
  if (scope === 'all' && canAll) return 'TRUE';
  return canAll ? 'TRUE' : `(${mine()} OR ${created()})`;
}
const toId = (v) => toInt(v) ?? -1;

export async function listTasks(user, { scope = 'mine', status, assigneeKind, assigneeId, q } = {}) {
  const params = [];
  const where = ['t.archived_at IS NULL', scopeSql(user, scope, params)];
  if (STATUSES.includes(status)) where.push(`t.status = $${params.push(status)}`);
  if (assigneeKind === 'user' && toInt(assigneeId)) where.push(`t.assignee_user_id = $${params.push(toInt(assigneeId))}`);
  if (assigneeKind === 'salesman' && toInt(assigneeId)) where.push(`t.assignee_salesman_id = $${params.push(toInt(assigneeId))}`);
  if (q) where.push(`(t.title ILIKE $${params.push(`%${String(q).slice(0, 80)}%`)} OR t.description ILIKE $${params.length})`);
  const { rows } = await query(
    `${SELECT} WHERE ${where.join(' AND ')}
     ORDER BY (t.status = 'done'), t.due_at ASC NULLS LAST,
              CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, t.created_at DESC
     LIMIT 2000`,
    params
  );
  return rows.map(taskToApi);
}

export async function getTask(id) {
  const n = toInt(id);
  if (n === null) return null;
  const { rows } = await query(`${SELECT} WHERE t.id = $1 AND t.archived_at IS NULL`, [n]);
  return rows[0] ? { row: rows[0], task: taskToApi(rows[0]) } : null;
}

/** Can this staff user see / fully edit / only update status of a task row? */
export function accessFor(user, row) {
  const me = toInt(user.id);
  const mySm = toInt(user.salesmanId);
  const isAssignee = (row.assignee_user_id != null && row.assignee_user_id === me) || (mySm && row.assignee_salesman_id === mySm);
  const isCreator = row.created_by_user_id != null && row.created_by_user_id === me;
  const manage = user.permissions?.includes('tasks.manage');
  return { see: manage || isAssignee || isCreator, edit: manage || isCreator, status: manage || isCreator || isAssignee };
}

async function validAssignee(kind, id) {
  const n = toInt(id);
  if (!kind || n === null) return null;
  if (kind === 'user') {
    const { rows } = await query('SELECT id FROM users WHERE id = $1 AND archived_at IS NULL AND is_active = true', [n]);
    return rows[0] ? { user: n } : false;
  }
  if (kind === 'salesman') {
    const { rows } = await query('SELECT id FROM salesmen WHERE id = $1 AND archived_at IS NULL', [n]);
    return rows[0] ? { salesman: n } : false;
  }
  return false;
}

export async function createTask(user, body) {
  const title = String(body.title || '').trim().slice(0, 200);
  if (title.length < 2) throw httpError(400, 'Give the task a title.');
  const priority = PRIORITIES.includes(body.priority) ? body.priority : 'normal';
  const status = STATUSES.includes(body.status) ? body.status : 'todo';
  const due = cleanDate(body.dueAt);
  if (due === undefined) throw httpError(400, 'The due date is not valid.');
  let target = await validAssignee(body.assignee?.kind, body.assignee?.id);
  if (target === false) throw httpError(400, 'That person was not found.');
  if (!target) target = { user: toInt(user.id) }; // no assignee = my own task
  const isSelf = target.user === toInt(user.id) || (target.salesman && target.salesman === toInt(user.salesmanId));
  if (!isSelf && !user.permissions?.includes('tasks.assign')) throw httpError(403, 'You can only create tasks for yourself.');
  const { rows } = await query(
    `INSERT INTO tasks (title, description, status, priority, due_at, assignee_user_id, assignee_salesman_id, created_by_user_id, created_by_name, lead_id, customer_id, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [title, String(body.description || '').slice(0, 5000), status, priority, due, target.user || null, target.salesman || null,
      toInt(user.id), user.name || '', toInt(body.leadId), toInt(body.customerId), status === 'done' ? new Date().toISOString() : null]
  );
  return (await getTask(rows[0].id)).task;
}

export async function updateTask(user, row, body, access) {
  const sets = [];
  const params = [];
  const set = (col, v) => sets.push(`${col} = $${params.push(v)}`);
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) throw httpError(400, 'Unknown status.');
    set('status', body.status);
    set('completed_at', body.status === 'done' ? (row.completed_at || new Date().toISOString()) : null);
  }
  const fullEdit = ['title', 'description', 'priority', 'dueAt', 'assignee', 'leadId', 'customerId'].some((k) => body[k] !== undefined);
  if (fullEdit && !access.edit) throw httpError(403, 'Only the person who created this task (or a manager) can change it. You can change its status and add comments.');
  if (body.title !== undefined) { const t = String(body.title).trim().slice(0, 200); if (t.length < 2) throw httpError(400, 'Give the task a title.'); set('title', t); }
  if (body.description !== undefined) set('description', String(body.description || '').slice(0, 5000));
  if (body.priority !== undefined) { if (!PRIORITIES.includes(body.priority)) throw httpError(400, 'Unknown priority.'); set('priority', body.priority); }
  if (body.dueAt !== undefined) { const d = cleanDate(body.dueAt); if (d === undefined) throw httpError(400, 'The due date is not valid.'); set('due_at', d); }
  if (body.assignee !== undefined) {
    const target = body.assignee ? await validAssignee(body.assignee.kind, body.assignee.id) : null;
    if (target === false) throw httpError(400, 'That person was not found.');
    const isSelf = !target || target.user === toInt(user.id) || (target.salesman && target.salesman === toInt(user.salesmanId));
    if (!isSelf && !user.permissions?.includes('tasks.assign')) throw httpError(403, 'You cannot give tasks to other people.');
    set('assignee_user_id', target?.user || (target ? null : toInt(user.id)));
    set('assignee_salesman_id', target?.salesman || null);
  }
  if (body.leadId !== undefined) set('lead_id', toInt(body.leadId));
  if (body.customerId !== undefined) set('customer_id', toInt(body.customerId));
  if (!sets.length) throw httpError(400, 'Nothing to change.');
  sets.push('updated_at = now()');
  await query(`UPDATE tasks SET ${sets.join(', ')} WHERE id = $${params.push(row.id)}`, params);
  return (await getTask(row.id)).task;
}

export async function archiveTask(id) {
  await query('UPDATE tasks SET archived_at = now(), updated_at = now() WHERE id = $1', [toInt(id)]);
}

export async function listComments(taskId) {
  const { rows } = await query('SELECT * FROM task_comments WHERE task_id = $1 ORDER BY created_at ASC LIMIT 500', [toInt(taskId)]);
  return rows.map((c) => ({ id: String(c.id), author: c.author_name, authorUserId: c.author_user_id != null ? String(c.author_user_id) : null, body: c.body, createdAt: iso(c.created_at) }));
}
export async function addComment(taskId, { userId = null, salesmanId = null, name }, body) {
  const text = String(body || '').trim().slice(0, 2000);
  if (!text) throw httpError(400, 'Write a comment first.');
  await query('INSERT INTO task_comments (task_id, author_user_id, author_salesman_id, author_name, body) VALUES ($1, $2, $3, $4, $5)', [toInt(taskId), userId, salesmanId, name || '', text]);
  await query('UPDATE tasks SET updated_at = now() WHERE id = $1', [toInt(taskId)]);
  return listComments(taskId);
}

/** People a user may give tasks to */
export async function assignees(user) {
  if (!user.permissions?.includes('tasks.assign')) {
    return [{ kind: 'user', id: String(user.id), name: user.name, role: user.role, me: true }];
  }
  const [{ rows: users }, { rows: sms }] = await Promise.all([
    query("SELECT id, name, role FROM users WHERE archived_at IS NULL AND is_active = true ORDER BY CASE role WHEN 'super_admin' THEN 0 WHEN 'manager' THEN 1 WHEN 'customer_care' THEN 2 ELSE 3 END, name"),
    query('SELECT id, name, link_enabled FROM salesmen WHERE archived_at IS NULL ORDER BY name'),
  ]);
  return [
    ...users.map((u) => ({ kind: 'user', id: String(u.id), name: u.name, role: u.role, me: String(u.id) === String(user.id) })),
    ...sms.map((s) => ({ kind: 'salesman', id: String(s.id), name: s.name, role: 'salesman_link', linkOn: Boolean(s.link_enabled) })),
  ];
}

// ---- Salesman link side ----
export async function tasksForSalesman(salesmanId) {
  const { rows } = await query(
    `${SELECT} WHERE t.archived_at IS NULL AND t.assignee_salesman_id = $1
     ORDER BY (t.status = 'done'), t.due_at ASC NULLS LAST, t.created_at DESC LIMIT 500`,
    [toInt(salesmanId)]
  );
  return rows.map(taskToApi);
}

export function httpError(status, message) { return Object.assign(new Error(message), { status }); }

export function registerTaskRoutes(app, { authMiddleware, requirePermission, asyncHandler, db }) {
  const use = requirePermission('tasks.use');
  const wrap = (fn) => asyncHandler(async (req, res) => {
    try { await fn(req, res); } catch (e) { if (e.status) return res.status(e.status).json({ error: e.message }); throw e; }
  });
  const load = async (req, res) => {
    const found = await getTask(req.params.id);
    if (!found) { res.status(404).json({ error: 'Task not found' }); return null; }
    const access = accessFor(req.user, found.row);
    if (!access.see) { res.status(404).json({ error: 'Task not found' }); return null; }
    return { ...found, access };
  };

  app.get('/api/tasks/assignees', authMiddleware, use, wrap(async (req, res) => res.json(await assignees(req.user))));
  app.get('/api/tasks', authMiddleware, use, wrap(async (req, res) => {
    res.json(await listTasks(req.user, { scope: req.query.scope, status: req.query.status, assigneeKind: req.query.assigneeKind, assigneeId: req.query.assigneeId, q: req.query.q }));
  }));
  app.post('/api/tasks', authMiddleware, use, wrap(async (req, res) => {
    const t = await createTask(req.user, req.body || {});
    await notifyAssignee(req.user, t, 'gave you a task');
    res.status(201).json(t);
  }));
  app.get('/api/tasks/:id', authMiddleware, use, wrap(async (req, res) => {
    const f = await load(req, res); if (!f) return;
    res.json({ ...f.task, access: f.access, comments: await listComments(f.task.id) });
  }));
  app.patch('/api/tasks/:id', authMiddleware, use, wrap(async (req, res) => {
    const f = await load(req, res); if (!f) return;
    if (!f.access.status) return res.status(403).json({ error: 'You cannot change this task.' });
    const t = await updateTask(req.user, f.row, req.body || {}, f.access);
    if (req.body?.assignee !== undefined && `${t.assignee?.kind}:${t.assignee?.id}` !== `${f.task.assignee?.kind}:${f.task.assignee?.id}`) await notifyAssignee(req.user, t, 'gave you a task');
    if (req.body?.status === 'done' && f.task.status !== 'done' && String(f.row.created_by_user_id) !== String(req.user.id)) {
      await notify([f.row.created_by_user_id], { kind: 'task', title: `${req.user.name} finished: ${t.title}`, link: 'tasks' });
    }
    res.json(t);
  }));
  app.delete('/api/tasks/:id', authMiddleware, use, wrap(async (req, res) => {
    const f = await load(req, res); if (!f) return;
    if (!f.access.edit) return res.status(403).json({ error: 'Only the person who created this task (or a manager) can delete it.' });
    await archiveTask(f.task.id);
    await db.addAuditEntry({ type: 'tasks', userId: req.user.id, userName: req.user.name, description: `Task deleted: ${f.task.title}` }).catch(() => {});
    res.json({ ok: true });
  }));
  app.post('/api/tasks/:id/comments', authMiddleware, use, wrap(async (req, res) => {
    const f = await load(req, res); if (!f) return;
    res.status(201).json(await addComment(f.task.id, { userId: parseInt(req.user.id, 10), name: req.user.name }, req.body?.body));
  }));
}
