-- One customer record for everything: every lead (enquiry) belongs to a customer.
-- Existing leads are matched to customers by mobile (last 8 digits) or exact name; the rest become new customers.
-- Safe to run more than once.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS customer_id INT REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_customer_id ON leads (customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_mobile8 ON customers (RIGHT(regexp_replace(COALESCE(mobile, ''), '\D', '', 'g'), 8));

DO $$
DECLARE
  l RECORD;
  digits TEXT;
  key8 TEXT;
  cid INT;
  norm TEXT;
BEGIN
  FOR l IN SELECT * FROM leads WHERE customer_id IS NULL AND archived_at IS NULL ORDER BY id LOOP
    digits := regexp_replace(COALESCE(NULLIF(l.mobile, ''), l.phone, ''), '\D', '', 'g');
    key8 := CASE WHEN length(digits) >= 8 THEN RIGHT(digits, 8) ELSE NULL END;
    cid := NULL;

    IF key8 IS NOT NULL THEN
      SELECT id INTO cid FROM customers
       WHERE archived_at IS NULL AND RIGHT(regexp_replace(COALESCE(mobile, ''), '\D', '', 'g'), 8) = key8
       ORDER BY id LIMIT 1;
    END IF;

    IF cid IS NULL THEN
      SELECT MIN(id) INTO cid FROM customers
       WHERE archived_at IS NULL AND LOWER(TRIM(name)) = LOWER(TRIM(l.name))
       HAVING COUNT(*) = 1;
    END IF;

    IF cid IS NULL THEN
      norm := CASE
        WHEN length(digits) = 8 THEN '+968' || digits
        WHEN length(digits) = 11 AND LEFT(digits, 3) = '968' THEN '+' || digits
        WHEN length(digits) BETWEEN 9 AND 15 THEN '+' || digits
        ELSE NULL END;
      INSERT INTO customers (name, salesman_id, status, mobile, data, source, review_note)
      VALUES (
        COALESCE(NULLIF(TRIM(l.name), ''), 'Customer'),
        l.salesman_id,
        'not_started',
        norm,
        CASE WHEN COALESCE(l.customer_location, '') <> '' THEN jsonb_build_object('address', l.customer_location) ELSE '{}'::jsonb END,
        'enquiry',
        NULL
      )
      RETURNING id INTO cid;
    END IF;

    UPDATE leads SET customer_id = cid WHERE id = l.id;
  END LOOP;
END$$;
