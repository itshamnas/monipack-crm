-- Roles & individual user security
-- Roles: super_admin, manager, customer_care, salesman

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS salesman_id INT REFERENCES salesmen(id) ON DELETE SET NULL;

-- One login per salesman record
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_salesman_id ON users (salesman_id) WHERE salesman_id IS NOT NULL;

-- Old 'admin' role becomes 'manager'
UPDATE users SET role = 'manager', updated_at = now() WHERE role = 'admin';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_users_role' AND table_name = 'users'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT chk_users_role
      CHECK (role IN ('super_admin', 'manager', 'customer_care', 'salesman'));
  END IF;
END$$;

-- Backfill lead ownership: the old screens saved only the salesman's name.
UPDATE leads l
SET salesman_id = s.id
FROM salesmen s
WHERE l.salesman_id IS NULL
  AND l.salesman_name IS NOT NULL
  AND LOWER(TRIM(l.salesman_name)) = LOWER(TRIM(s.name))
  AND s.archived_at IS NULL;
