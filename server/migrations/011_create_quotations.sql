CREATE SEQUENCE IF NOT EXISTS quotation_number_seq START WITH 1000;

CREATE TABLE IF NOT EXISTS quotations (
  id SERIAL PRIMARY KEY,
  legacy_id VARCHAR(50),
  code VARCHAR(50) NOT NULL,
  lead_id INT REFERENCES leads(id) ON DELETE SET NULL,
  customer_name VARCHAR(255) DEFAULT 'Valued Customer',
  address TEXT DEFAULT 'Muscat, Sultanate of Oman',
  attn VARCHAR(200) DEFAULT '',
  date DATE,
  validity_days INT DEFAULT 30,
  sales_rep VARCHAR(150),
  status VARCHAR(30) DEFAULT 'sent',
  subtotal_omr NUMERIC(14,3) DEFAULT 0,
  enable_vat BOOLEAN DEFAULT true,
  vat_rate NUMERIC(5,2) DEFAULT 5,
  vat_amount_omr NUMERIC(14,3) DEFAULT 0,
  grand_total_omr NUMERIC(14,3) DEFAULT 0,
  terms JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  archived_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotations_code ON quotations (code);

CREATE TABLE IF NOT EXISTS quotation_items (
  id SERIAL PRIMARY KEY,
  quotation_id INT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  seq INT NOT NULL,
  product_id INT REFERENCES products(id) ON DELETE SET NULL,
  item VARCHAR(255) DEFAULT 'Custom Packaging Item',
  description TEXT DEFAULT '',
  quantity NUMERIC(14,3) DEFAULT 1,
  unit VARCHAR(20) DEFAULT 'PCS',
  unit_price_omr NUMERIC(14,3) DEFAULT 0,
  total_omr NUMERIC(14,3) DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation_id ON quotation_items (quotation_id);
