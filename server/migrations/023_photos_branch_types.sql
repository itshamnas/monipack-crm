-- Branch type: retail (shop / showroom) or b2b (route / wholesale). Set by the super admin.
ALTER TABLE branches ADD COLUMN IF NOT EXISTS type VARCHAR(10) NOT NULL DEFAULT 'retail';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'branches_type_check') THEN
    ALTER TABLE branches ADD CONSTRAINT branches_type_check CHECK (type IN ('retail', 'b2b'));
  END IF;
END $$;
-- Best first guess: a branch whose salesmen are all route / B2B is a B2B branch
UPDATE branches b SET type = 'b2b'
WHERE b.type = 'retail'
  AND EXISTS (SELECT 1 FROM salesmen s WHERE s.archived_at IS NULL AND (s.branch_id = b.id OR s.id = b.default_salesman_id))
  AND NOT EXISTS (SELECT 1 FROM salesmen s WHERE s.archived_at IS NULL AND (s.branch_id = b.id OR s.id = b.default_salesman_id) AND s.type <> 'route_b2b');

-- Profile photos (stored as files with an unguessable name)
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_key VARCHAR(80);
ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS photo_key VARCHAR(80);
