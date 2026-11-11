-- Quotation → pipeline: remember when the "quotation expired" reminder was sent (once per quotation)
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS expiry_reminded_at TIMESTAMPTZ;
-- Existing quotations that already expired get no reminder flood
UPDATE quotations SET expiry_reminded_at = now()
 WHERE expiry_reminded_at IS NULL AND date IS NOT NULL AND date + (COALESCE(validity_days, 30) || ' days')::interval < now();
