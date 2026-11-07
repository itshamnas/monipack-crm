-- Follow-up reminders on leads, and monthly sales targets per salesman.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_follow_up_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_note VARCHAR(300) NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_leads_next_follow_up ON leads (next_follow_up_at) WHERE archived_at IS NULL AND next_follow_up_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS sales_targets (
  salesman_id INTEGER NOT NULL REFERENCES salesmen(id) ON DELETE CASCADE,
  month DATE NOT NULL,                      -- first day of the month
  target_omr NUMERIC(14, 3) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (salesman_id, month)
);
