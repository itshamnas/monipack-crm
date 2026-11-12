-- One person, one photo.
-- A salesman's record and his login share the same photo file. Whichever side changes, the other follows,
-- and a new login for an existing salesman starts with his photo (and the other way round).

CREATE OR REPLACE FUNCTION mp_user_photo_sync() RETURNS trigger AS $$
BEGIN
  IF NEW.salesman_id IS NULL OR pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' OR NEW.salesman_id IS DISTINCT FROM OLD.salesman_id THEN
    -- Newly linked: take the salesman's photo if the login has none; give ours if he has none
    IF NEW.photo_key IS NULL THEN
      SELECT photo_key INTO NEW.photo_key FROM salesmen WHERE id = NEW.salesman_id;
    ELSE
      UPDATE salesmen SET photo_key = NEW.photo_key WHERE id = NEW.salesman_id AND photo_key IS NULL;
    END IF;
  ELSIF NEW.photo_key IS DISTINCT FROM OLD.photo_key THEN
    UPDATE salesmen SET photo_key = NEW.photo_key, updated_at = now()
     WHERE id = NEW.salesman_id AND photo_key IS DISTINCT FROM NEW.photo_key;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_photo_sync ON users;
CREATE TRIGGER trg_user_photo_sync BEFORE INSERT OR UPDATE OF photo_key, salesman_id ON users
  FOR EACH ROW EXECUTE FUNCTION mp_user_photo_sync();

CREATE OR REPLACE FUNCTION mp_salesman_photo_sync() RETURNS trigger AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.photo_key IS DISTINCT FROM OLD.photo_key THEN
    UPDATE users SET photo_key = NEW.photo_key, updated_at = now()
     WHERE salesman_id = NEW.id AND photo_key IS DISTINCT FROM NEW.photo_key;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_salesman_photo_sync ON salesmen;
CREATE TRIGGER trg_salesman_photo_sync AFTER UPDATE OF photo_key ON salesmen
  FOR EACH ROW EXECUTE FUNCTION mp_salesman_photo_sync();

-- Bring existing pairs together (the login's photo wins when both have one)
UPDATE salesmen s SET photo_key = u.photo_key
  FROM users u WHERE u.salesman_id = s.id AND u.photo_key IS NOT NULL AND s.photo_key IS DISTINCT FROM u.photo_key;
UPDATE users u SET photo_key = s.photo_key
  FROM salesmen s WHERE u.salesman_id = s.id AND u.photo_key IS NULL AND s.photo_key IS NOT NULL;
