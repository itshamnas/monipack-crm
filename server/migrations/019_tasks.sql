-- Task manager: tasks for any staff login or salesman, with comments.
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'todo',
  priority VARCHAR(10) NOT NULL DEFAULT 'normal',
  due_at TIMESTAMPTZ,
  assignee_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assignee_salesman_id INTEGER REFERENCES salesmen(id) ON DELETE SET NULL,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by_name VARCHAR(120) NOT NULL DEFAULT '',
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT chk_task_status CHECK (status IN ('todo', 'in_progress', 'done')),
  CONSTRAINT chk_task_priority CHECK (priority IN ('low', 'normal', 'high', 'urgent'))
);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_user ON tasks (assignee_user_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_salesman ON tasks (assignee_salesman_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_creator ON tasks (created_by_user_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks (due_at) WHERE archived_at IS NULL AND status <> 'done';

CREATE TABLE IF NOT EXISTS task_comments (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_salesman_id INTEGER REFERENCES salesmen(id) ON DELETE SET NULL,
  author_name VARCHAR(120) NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments (task_id, created_at);
