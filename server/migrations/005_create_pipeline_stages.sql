CREATE TABLE IF NOT EXISTS pipeline_stages (
  id SERIAL PRIMARY KEY,
  stage_id VARCHAR(50) NOT NULL,
  label VARCHAR(200) NOT NULL,
  color VARCHAR(200),
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_stages_stage_id ON pipeline_stages (stage_id);
