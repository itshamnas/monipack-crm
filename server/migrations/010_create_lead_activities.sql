CREATE TABLE IF NOT EXISTS lead_activities (
  id SERIAL PRIMARY KEY,
  lead_id INT REFERENCES leads(id) ON DELETE SET NULL,
  lead_name VARCHAR(150) DEFAULT '',
  type VARCHAR(50) DEFAULT 'note',
  description TEXT,
  "timestamp" TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_id ON lead_activities (lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_timestamp ON lead_activities ("timestamp" DESC);
