-- Event photo uploads: the super admin makes an upload link (optionally with a PIN); anyone with it can add photos.
CREATE TABLE IF NOT EXISTS sponsorship_upload_links (
  id SERIAL PRIMARY KEY,
  event_id INT NOT NULL REFERENCES sponsorship_events(id) ON DELETE CASCADE,
  token VARCHAR(64) NOT NULL UNIQUE,
  label VARCHAR(120) NOT NULL DEFAULT '',
  pin_hash VARCHAR(100),                 -- NULL = no PIN needed
  pin_failures INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  max_photos INT NOT NULL DEFAULT 1000,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sp_uplinks_event ON sponsorship_upload_links (event_id);

CREATE TABLE IF NOT EXISTS sponsorship_photos (
  id SERIAL PRIMARY KEY,
  event_id INT NOT NULL REFERENCES sponsorship_events(id) ON DELETE CASCADE,
  link_id INT REFERENCES sponsorship_upload_links(id) ON DELETE SET NULL,
  file_key VARCHAR(80) NOT NULL,
  thumb_key VARCHAR(80) NOT NULL,
  bytes INT NOT NULL DEFAULT 0,
  width INT, height INT,
  uploader_name VARCHAR(120) NOT NULL,
  uploader_phone VARCHAR(40) DEFAULT '',
  caption VARCHAR(300) DEFAULT '',
  ip VARCHAR(64), user_agent VARCHAR(300),
  uploaded_by_user INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sp_photos_event ON sponsorship_photos (event_id, created_at);
