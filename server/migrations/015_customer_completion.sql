-- Customer completion: richer fields, % complete, documents, admin lock.
-- Safe to run more than once.

-- New field types and field settings
ALTER TABLE customer_fields DROP CONSTRAINT IF EXISTS chk_customer_field_type;
ALTER TABLE customer_fields ADD CONSTRAINT chk_customer_field_type CHECK (type IN
  ('text','number','phone','email','dropdown','multiselect','yesno','date','location','governorate','city','document','photo','textarea'));
ALTER TABLE customer_fields ADD COLUMN IF NOT EXISTS admin_only BOOLEAN NOT NULL DEFAULT false;   -- only the super admin sees / fills it
ALTER TABLE customer_fields ADD COLUMN IF NOT EXISTS show_if JSONB;                              -- e.g. {"key":"vat_registered","equals":"Yes"}
ALTER TABLE customer_fields ADD COLUMN IF NOT EXISTS doc_label VARCHAR(30);                      -- document fields: which file label fills it

-- Customers: super admin can lock a customer so the salesman can no longer add details
ALTER TABLE customers ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT false;

-- The requested fields (insert new ones, then set label / type / order / rules for all of them)
INSERT INTO customer_fields (key, label, type) VALUES
  ('shop_name', 'Building / shop name', 'text'),
  ('customer_type', 'Customer type', 'dropdown'),
  ('categories', 'Customer categories', 'multiselect'),
  ('governorate', 'Governorate', 'governorate'),
  ('city', 'City (wilayat)', 'city'),
  ('vat_registered', 'VAT registered', 'yesno'),
  ('cr_paper', 'CR paper', 'document'),
  ('vat_certificate', 'VAT certificate', 'document'),
  ('customer_status', 'Customer status', 'dropdown')
ON CONFLICT (key) DO NOTHING;

UPDATE customer_fields f SET
  label = v.label, type = v.type, sort_order = v.sort_order,
  required_branch = v.req, required_route_b2b = v.req,
  is_hidden = false, admin_only = v.admin_only, show_if = v.show_if, doc_label = v.doc_label,
  options = CASE WHEN jsonb_array_length(f.options) = 0 THEN v.options ELSE f.options END,
  updated_at = now()
FROM (VALUES
  ('mobile',          'Mobile number',        'phone',       10,  true,  false, NULL::jsonb, NULL, '[]'::jsonb),
  ('cr_number',       'CR number',            'text',        20,  true,  false, NULL, NULL, '[]'),
  ('route',           'Route name',           'dropdown',    30,  true,  false, NULL, NULL, '[]'),
  ('shop_name',       'Building / shop name', 'text',        40,  false, false, NULL, NULL, '[]'),
  ('segment',         'Customer segment',     'dropdown',    50,  false, false, NULL, NULL,
     '["Restaurant","Cafe","Bakery","Catering","Hotel","Supermarket","Hypermarket","Grocery","Wholesaler","Retail shop","Other"]'),
  ('customer_type',   'Customer type',        'dropdown',    60,  false, false, NULL, NULL,
     '["Cash customer","Credit customer","Key account","Distributor","Government / institution"]'),
  ('categories',      'Customer categories',  'multiselect', 70,  false, false, NULL, NULL,
     '["Disposable products","Food containers","Paper products","Plastic bags","Aluminium foil & containers","Cups & lids","Cleaning & hygiene","Printed packaging"]'),
  ('governorate',     'Governorate',          'governorate', 80,  false, false, NULL, NULL, '[]'),
  ('city',            'City (wilayat)',       'city',        90,  false, false, NULL, NULL, '[]'),
  ('address',         'Area / address',       'textarea',    100, false, false, NULL, NULL, '[]'),
  ('postal_code',     'Postal code',          'number',      110, false, false, NULL, NULL, '[]'),
  ('location',        'Google Maps location', 'location',    120, false, false, NULL, NULL, '[]'),
  ('vat_registered',  'VAT registered',       'yesno',       130, false, false, NULL, NULL, '[]'),
  ('vat_number',      'VAT number',           'text',        140, false, false, '{"key":"vat_registered","equals":"Yes"}', NULL, '[]'),
  ('cr_paper',        'CR paper',             'document',    150, false, false, NULL, 'cr_certificate', '[]'),
  ('vat_certificate', 'VAT certificate',      'document',    160, false, false, '{"key":"vat_registered","equals":"Yes"}', 'vat_certificate', '[]'),
  ('customer_status', 'Customer status',      'dropdown',    170, false, true,  NULL, NULL,
     '["Active","New","On hold","Inactive","Blocked"]')
) AS v(key, label, type, sort_order, req, admin_only, show_if, doc_label, options)
WHERE f.key = v.key;

-- Fields not in the new list are hidden (their data is kept; the super admin can show them again)
UPDATE customer_fields SET is_hidden = true, updated_at = now()
WHERE key IN ('whatsapp', 'contact_number', 'email', 'photos');
