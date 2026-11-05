CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  legacy_id VARCHAR(50),
  name VARCHAR(255) NOT NULL,
  contact_person VARCHAR(255) DEFAULT '',
  category VARCHAR(150) DEFAULT 'Packaging Products',
  product_details TEXT DEFAULT '',
  country_code VARCHAR(10) DEFAULT '+968',
  mobile VARCHAR(20),
  phone VARCHAR(30),
  email VARCHAR(255) DEFAULT '',
  branch_id INT REFERENCES branches(id) ON DELETE SET NULL,
  branch_name VARCHAR(100),
  salesman_id INT REFERENCES salesmen(id) ON DELETE SET NULL,
  salesman_name VARCHAR(150),
  customer_location VARCHAR(255) DEFAULT '',
  status VARCHAR(50) DEFAULT 'new',
  deal_value NUMERIC(14,3) DEFAULT 0,
  quantity VARCHAR(255) DEFAULT '',
  notes TEXT DEFAULT '',
  intake_completed BOOLEAN DEFAULT false,
  source VARCHAR(100),
  lost_reason VARCHAR(255),
  date TIMESTAMPTZ,
  last_contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  archived_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_legacy_id ON leads (legacy_id) WHERE legacy_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads (phone);
CREATE INDEX IF NOT EXISTS idx_leads_mobile ON leads (mobile);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_branch_id ON leads (branch_id);
CREATE INDEX IF NOT EXISTS idx_leads_salesman_id ON leads (salesman_id);
