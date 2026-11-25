-- Remind the super admin when someone has not answered their sponsorship link for 2 days
ALTER TABLE sponsorship_links ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMPTZ;
