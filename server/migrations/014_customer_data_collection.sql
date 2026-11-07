-- Customer Data Collection: salesman links, customers, configurable fields, photos, submissions

-- Salesman types are 'branch' (retail outlet) or 'route_b2b'
UPDATE salesmen SET type = 'route_b2b' WHERE type NOT IN ('branch', 'route_b2b');

-- Personal secret link per salesman
ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS link_token VARCHAR(64);
ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS link_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS link_pin_hash TEXT;
ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS link_created_at TIMESTAMPTZ;
ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS link_last_used_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS idx_salesmen_link_token ON salesmen (link_token) WHERE link_token IS NOT NULL;

-- Field definitions the super admin manages (core fields cannot be removed)
CREATE TABLE IF NOT EXISTS customer_fields (
  id SERIAL PRIMARY KEY,
  key VARCHAR(60) NOT NULL UNIQUE,
  label VARCHAR(120) NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'text',
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_branch BOOLEAN NOT NULL DEFAULT false,
  required_route_b2b BOOLEAN NOT NULL DEFAULT false,
  is_core BOOLEAN NOT NULL DEFAULT false,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT chk_customer_field_type CHECK (type IN ('text','number','phone','email','dropdown','date','location','photo','textarea'))
);

INSERT INTO customer_fields (key, label, type, options, required_branch, required_route_b2b, is_core, sort_order) VALUES
  ('mobile',         'Mobile number',     'phone',    '[]', true,  true,  true, 10),
  ('cr_number',      'CR number',         'text',     '[]', true,  true,  true, 20),
  ('vat_number',     'VAT number',        'text',     '[]', false, false, true, 30),
  ('whatsapp',       'WhatsApp number',   'phone',    '[]', false, false, false, 40),
  ('contact_number', 'Contact number',    'phone',    '[]', false, false, false, 50),
  ('email',          'Email',             'email',    '[]', false, false, false, 60),
  ('route',          'Route',             'dropdown', '[]', false, false, false, 70),
  ('segment',        'Customer segment',  'dropdown', '["Restaurant","Cafe","Supermarket","Bakery","Hotel","Catering","Retail shop","Wholesaler","Other"]', false, false, false, 80),
  ('address',        'Address',           'textarea', '[]', false, false, false, 90),
  ('postal_code',    'Postal code',       'number',   '[]', false, false, false, 100),
  ('location',       'Location (GPS)',    'location', '[]', false, false, false, 110),
  ('photos',         'Photos (CR, VAT, shop front)', 'photo', '[]', false, false, false, 120)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  salesman_id INT REFERENCES salesmen(id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'not_started',
  mobile VARCHAR(30),
  cr_number VARCHAR(40),
  no_cr BOOLEAN NOT NULL DEFAULT false,
  no_cr_reason TEXT,
  vat_number VARCHAR(40),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  source VARCHAR(20) NOT NULL DEFAULT 'import',
  review_note TEXT,
  created_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT chk_customer_status CHECK (status IN ('not_started','submitted','complete','pending_approval')),
  CONSTRAINT chk_customer_source CHECK (source IN ('import','salesman','admin','enquiry'))
);
CREATE INDEX IF NOT EXISTS idx_customers_salesman_status ON customers (salesman_id, status) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_mobile ON customers (mobile) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_cr ON customers (LOWER(cr_number)) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_vat ON customers (LOWER(vat_number)) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS customer_files (
  id SERIAL PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label VARCHAR(30) NOT NULL DEFAULT 'other',
  storage_key TEXT NOT NULL,
  original_name VARCHAR(255),
  mime VARCHAR(60) NOT NULL,
  size_bytes INT NOT NULL,
  uploaded_via VARCHAR(20) NOT NULL DEFAULT 'link',
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT chk_customer_file_label CHECK (label IN ('cr_certificate','vat_certificate','shop_front','other'))
);
CREATE INDEX IF NOT EXISTS idx_customer_files_customer ON customer_files (customer_id);

-- What the salesman submitted, exactly as sent (kept even if the admin edits later)
CREATE TABLE IF NOT EXISTS customer_submissions (
  id SERIAL PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  salesman_id INT REFERENCES salesmen(id) ON DELETE SET NULL,
  snapshot JSONB NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_submissions_customer ON customer_submissions (customer_id);

CREATE TABLE IF NOT EXISTS customer_transfers (
  id SERIAL PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  from_salesman_id INT REFERENCES salesmen(id) ON DELETE SET NULL,
  to_salesman_id INT REFERENCES salesmen(id) ON DELETE SET NULL,
  by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  transferred_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS link_access_log (
  id SERIAL PRIMARY KEY,
  salesman_id INT REFERENCES salesmen(id) ON DELETE CASCADE,
  event VARCHAR(30) NOT NULL,
  ip_address VARCHAR(64),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_link_access_log_salesman ON link_access_log (salesman_id, created_at DESC);
