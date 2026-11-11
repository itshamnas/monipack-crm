-- Departments: B2B manager and Retail manager roles, and one place that decides a lead's department.
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_role;
ALTER TABLE users ADD CONSTRAINT chk_users_role
  CHECK (role IN ('super_admin', 'manager', 'b2b_manager', 'retail_manager', 'customer_care', 'salesman'));

-- A lead belongs to 'b2b' or 'retail': by its branch, else its branch name, else its salesman's type.
CREATE OR REPLACE FUNCTION lead_segment(p_branch integer, p_salesman integer, p_branch_name text)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT b.type FROM branches b WHERE b.id = p_branch AND b.archived_at IS NULL),
    (SELECT b.type FROM branches b WHERE p_branch_name IS NOT NULL AND lower(trim(b.name)) = lower(trim(p_branch_name)) AND b.archived_at IS NULL ORDER BY b.id LIMIT 1),
    (SELECT CASE s.type WHEN 'route_b2b' THEN 'b2b' WHEN 'branch' THEN 'retail' END FROM salesmen s WHERE s.id = p_salesman)
  )
$$;

-- Read-only share links (lead for a salesman, department pipeline for a manager), and outgoing message log
CREATE TABLE IF NOT EXISTS view_links (
  id SERIAL PRIMARY KEY,
  token VARCHAR(64) NOT NULL UNIQUE,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('lead', 'pipeline', 'task')),
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  task_id INTEGER,
  segment VARCHAR(10),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  salesman_id INTEGER REFERENCES salesmen(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_opened_at TIMESTAMPTZ,
  open_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_view_links_lead ON view_links (lead_id);

CREATE TABLE IF NOT EXISTS outbox_messages (
  id SERIAL PRIMARY KEY,
  channel VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
  to_phone VARCHAR(40),
  to_name VARCHAR(160),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  salesman_id INTEGER REFERENCES salesmen(id) ON DELETE SET NULL,
  kind VARCHAR(30) NOT NULL,
  body TEXT NOT NULL,
  link_token VARCHAR(64),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'manual', 'skipped')),
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox_messages (status, created_at);

-- Staff phone numbers (for WhatsApp alerts) and when a lead was won/lost (for period reports)
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(40);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
UPDATE leads l SET closed_at = COALESCE(
  (SELECT max(h.changed_at) FROM lead_stage_history h WHERE h.lead_id = l.id AND h.to_status = l.status),
  l.updated_at, l.created_at)
WHERE l.status IN ('won', 'lost') AND l.closed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_closed_at ON leads (closed_at) WHERE closed_at IS NOT NULL;

-- Keep closed_at right whenever a lead's status changes
CREATE OR REPLACE FUNCTION leads_set_closed_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('won', 'lost') THEN
    IF (TG_OP = 'INSERT' AND NEW.closed_at IS NULL) OR (TG_OP = 'UPDATE' AND (OLD.status IS DISTINCT FROM NEW.status OR NEW.closed_at IS NULL)) THEN
      NEW.closed_at := now();
    END IF;
  ELSE
    NEW.closed_at := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_leads_closed_at ON leads;
CREATE TRIGGER trg_leads_closed_at BEFORE INSERT OR UPDATE OF status ON leads
  FOR EACH ROW EXECUTE FUNCTION leads_set_closed_at();
