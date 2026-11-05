CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  name_ar VARCHAR(255) DEFAULT '',
  category VARCHAR(150) DEFAULT 'Packaging Products',
  brand VARCHAR(100) DEFAULT 'Monipack',
  description TEXT DEFAULT '',
  unit VARCHAR(20) DEFAULT 'PCS',
  price_omr NUMERIC(14,3) DEFAULT 0,
  stock INT DEFAULT 0,
  source VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  archived_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku ON products (sku);
