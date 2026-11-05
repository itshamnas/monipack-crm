CREATE TABLE IF NOT EXISTS salesmen (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(30),
  type VARCHAR(20) NOT NULL DEFAULT 'branch',
  branch_id INT REFERENCES branches(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  archived_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_salesmen_branch_id ON salesmen (branch_id);
CREATE INDEX IF NOT EXISTS idx_salesmen_name ON salesmen (name);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_branches_default_salesman'
      AND table_name = 'branches'
  ) THEN
    ALTER TABLE branches ADD CONSTRAINT fk_branches_default_salesman
      FOREIGN KEY (default_salesman_id) REFERENCES salesmen(id) ON DELETE SET NULL;
  END IF;
END$$;
