CREATE TABLE IF NOT EXISTS branches (
  id SERIAL PRIMARY KEY,
  legacy_id VARCHAR(50),
  name VARCHAR(100) NOT NULL,
  city VARCHAR(100) DEFAULT 'Oman',
  phone VARCHAR(30),
  is_headquarters BOOLEAN DEFAULT false,
  default_salesman_id INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  archived_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_legacy_id ON branches (legacy_id) WHERE legacy_id IS NOT NULL;
