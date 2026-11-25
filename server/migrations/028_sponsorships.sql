-- Sponsorship confirmations: events Monipack co-sponsors with partner brands, approved through personal PIN links.
-- Flow: super admin prepares the event -> Monipack MD approves (or asks for changes) -> each partner brand approves.
-- Every approval is tied to the exact version it saw; once everyone has approved the agreement is locked.

CREATE TABLE IF NOT EXISTS sponsorship_events (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  poster_key VARCHAR(200),               -- event image (shown on the right of the approval page)
  banner_key VARCHAR(200),               -- wide header strip on the link page
  audience VARCHAR(120) DEFAULT '',      -- e.g. "3,000 visitors"
  audience_note VARCHAR(300) DEFAULT '',
  venue VARCHAR(200) DEFAULT '',
  venue_address VARCHAR(300) DEFAULT '',
  map_url VARCHAR(600) DEFAULT '',
  coordinator_name VARCHAR(120) DEFAULT '',
  coordinator_phone VARCHAR(40) DEFAULT '',
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  time_note VARCHAR(200) DEFAULT '',     -- e.g. "Daily 4 pm to 11 pm"
  promotion TEXT DEFAULT '',             -- how the brands will be promoted
  total_amount NUMERIC(12,3) NOT NULL DEFAULT 0,
  currency VARCHAR(8) NOT NULL DEFAULT 'OMR',
  terms TEXT DEFAULT '',
  status VARCHAR(24) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','md_pending','changes_requested','brand_pending','approved','cancelled')),
  version INT NOT NULL DEFAULT 1,
  fingerprint VARCHAR(64),               -- SHA-256 of the content of the current version
  approved_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_note VARCHAR(300),
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Who pays what: Monipack is always one party; each partner brand is another
CREATE TABLE IF NOT EXISTS sponsorship_parties (
  id SERIAL PRIMARY KEY,
  event_id INT NOT NULL REFERENCES sponsorship_events(id) ON DELETE CASCADE,
  kind VARCHAR(10) NOT NULL CHECK (kind IN ('monipack','brand')),
  company VARCHAR(200) NOT NULL,
  share_pct NUMERIC(6,3) NOT NULL DEFAULT 0,
  sort INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sp_parties_event ON sponsorship_parties (event_id, sort);

-- Marketing materials at the event (roll-up, video screening, kiosk, counter, anything)
CREATE TABLE IF NOT EXISTS sponsorship_materials (
  id SERIAL PRIMARY KEY,
  event_id INT NOT NULL REFERENCES sponsorship_events(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  qty INT NOT NULL DEFAULT 1,
  provided_by VARCHAR(200) DEFAULT '',   -- e.g. "Monipack", "Both brands"
  note VARCHAR(300) DEFAULT '',
  sort INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sp_materials_event ON sponsorship_materials (event_id, sort);

-- One personal link per approver (Monipack MD, or a brand's representative)
CREATE TABLE IF NOT EXISTS sponsorship_links (
  id SERIAL PRIMARY KEY,
  event_id INT NOT NULL REFERENCES sponsorship_events(id) ON DELETE CASCADE,
  party_id INT REFERENCES sponsorship_parties(id) ON DELETE CASCADE,
  role VARCHAR(10) NOT NULL CHECK (role IN ('md','brand')),
  person_name VARCHAR(120) NOT NULL,
  designation VARCHAR(120) DEFAULT '',
  phone VARCHAR(40) DEFAULT '',
  token VARCHAR(64) NOT NULL UNIQUE,     -- random; the link alone never opens the page without the PIN
  pin_hash VARCHAR(100) NOT NULL,
  pin_failures INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','changes_requested','revoked')),
  opened_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sp_links_event ON sponsorship_links (event_id);

-- Decisions are never edited or deleted: each approval / change request is a new row
CREATE TABLE IF NOT EXISTS sponsorship_decisions (
  id SERIAL PRIMARY KEY,
  link_id INT NOT NULL REFERENCES sponsorship_links(id) ON DELETE CASCADE,
  event_id INT NOT NULL REFERENCES sponsorship_events(id) ON DELETE CASCADE,
  decision VARCHAR(20) NOT NULL CHECK (decision IN ('approved','changes_requested')),
  version INT NOT NULL,
  fingerprint VARCHAR(64) NOT NULL,      -- what exactly they approved
  typed_name VARCHAR(120),
  signature TEXT,                        -- PNG data URL of the drawn signature
  comment TEXT,
  ip VARCHAR(64),
  user_agent VARCHAR(300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sp_decisions_event ON sponsorship_decisions (event_id, created_at);

-- Timeline shown to the super admin
CREATE TABLE IF NOT EXISTS sponsorship_activity (
  id BIGSERIAL PRIMARY KEY,
  event_id INT NOT NULL REFERENCES sponsorship_events(id) ON DELETE CASCADE,
  actor VARCHAR(160) NOT NULL,
  action VARCHAR(300) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sp_activity_event ON sponsorship_activity (event_id, created_at);

-- A decision cannot be changed or removed once made
CREATE OR REPLACE FUNCTION mp_sp_decisions_frozen() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Sponsorship decisions cannot be changed once recorded';
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_sp_decisions_frozen ON sponsorship_decisions;
CREATE TRIGGER trg_sp_decisions_frozen BEFORE UPDATE ON sponsorship_decisions
  FOR EACH ROW EXECUTE FUNCTION mp_sp_decisions_frozen();
