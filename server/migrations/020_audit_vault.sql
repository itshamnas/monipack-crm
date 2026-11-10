-- Audit vault: every change made in the CRM (by anyone, super admin included), append-only.
-- Rows are chained with SHA-256 (each row stores the previous row's hash), so any edit or deletion is detectable.
-- A trigger refuses UPDATE / DELETE / TRUNCATE from the application.
CREATE TABLE IF NOT EXISTS vault_log (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_kind VARCHAR(20) NOT NULL DEFAULT 'user',      -- user | link | anonymous | system
  actor_id VARCHAR(40),
  actor_name VARCHAR(160),
  actor_role VARCHAR(40),
  category VARCHAR(30) NOT NULL DEFAULT 'other',
  action TEXT NOT NULL,
  method VARCHAR(8),
  path VARCHAR(300),
  status INT,
  ip VARCHAR(64),
  device VARCHAR(160),
  details JSONB,
  prev_hash CHAR(64) NOT NULL,
  hash CHAR(64) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vault_log_at ON vault_log (at DESC);
CREATE INDEX IF NOT EXISTS idx_vault_log_actor ON vault_log (actor_kind, actor_id);
CREATE INDEX IF NOT EXISTS idx_vault_log_category ON vault_log (category);

CREATE OR REPLACE FUNCTION vault_log_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'vault_log is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vault_log_no_update ON vault_log;
CREATE TRIGGER trg_vault_log_no_update BEFORE UPDATE OR DELETE ON vault_log FOR EACH ROW EXECUTE FUNCTION vault_log_append_only();
DROP TRIGGER IF EXISTS trg_vault_log_no_truncate ON vault_log;
CREATE TRIGGER trg_vault_log_no_truncate BEFORE TRUNCATE ON vault_log FOR EACH STATEMENT EXECUTE FUNCTION vault_log_append_only();

-- Secrets (only one-way hashes are stored)
CREATE TABLE IF NOT EXISTS app_secrets (
  key VARCHAR(60) PRIMARY KEY,
  value_hash TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Initial vault password (bcrypt hash). Change it from the vault after the first unlock.
INSERT INTO app_secrets (key, value_hash) VALUES ('vault_password', '$2b$12$fdTbdW33ZvWBM3q.DW8NmO1mBiIMeOzu2IHij2pVqGTPDdI9Vr5/m')
ON CONFLICT (key) DO NOTHING;

-- Who deleted a salesman, and when
ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS deleted_by_user_id INT REFERENCES users(id) ON DELETE SET NULL;
