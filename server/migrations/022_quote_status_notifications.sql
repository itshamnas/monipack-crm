-- Quotation status flow (draft / sent / accepted / rejected; expired is worked out from date + validity)
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS status_reason VARCHAR(255);
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS created_by_user_id INT REFERENCES users(id) ON DELETE SET NULL;

-- In-app notifications (the bell)
CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(30) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body VARCHAR(400) DEFAULT '',
  link VARCHAR(80) DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (user_id) WHERE read_at IS NULL;
