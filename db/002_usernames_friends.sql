BEGIN;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS username_changed_at timestamptz;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS friend_request_privacy text NOT NULL DEFAULT 'everyone'
  CHECK (friend_request_privacy IN ('everyone','communities','no_one'));
CREATE UNIQUE INDEX IF NOT EXISTS user_username_unique ON "user" (lower(username));

DO $$
DECLARE
  person record;
  base text;
  candidate text;
  suffix integer;
BEGIN
  FOR person IN SELECT id,name FROM "user" WHERE username IS NULL ORDER BY id FOR UPDATE LOOP
    base := trim(both '._' from regexp_replace(lower(person.name), '[^a-z0-9_.]+', '_', 'g'));
    base := trim(both '._' from regexp_replace(left(base,20), '\.{2,}', '.', 'g'));
    IF length(base) < 3 THEN base := 'member'; END IF;
    IF base IN ('admin','relay','support','system','everyone','here') THEN base := 'user_' || base; END IF;
    candidate := base;
    suffix := 0;
    WHILE EXISTS (SELECT 1 FROM "user" WHERE lower(username)=candidate) LOOP
      suffix := suffix + 1;
      candidate := trim(trailing '._' from left(base,20-length(suffix::text))) || suffix::text;
    END LOOP;
    UPDATE "user" SET username=candidate WHERE id=person.id;
  END LOOP;
END $$;
ALTER TABLE "user" ALTER COLUMN username SET NOT NULL;

CREATE TABLE IF NOT EXISTS friendships (
  id text PRIMARY KEY,
  requester_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  addressee_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending','accepted','blocked')),
  blocked_by text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requester_id <> addressee_id),
  CHECK (blocked_by <@ ARRAY[requester_id,addressee_id]),
  CHECK ((status='blocked') = (cardinality(blocked_by)>0))
);
CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_unique
  ON friendships (least(requester_id,addressee_id),greatest(requester_id,addressee_id));
CREATE INDEX IF NOT EXISTS friendships_requester_idx ON friendships(requester_id);
CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON friendships(addressee_id);
ALTER TABLE command_limits ADD COLUMN IF NOT EXISTS friend_window_start timestamptz NOT NULL DEFAULT now();
ALTER TABLE command_limits ADD COLUMN IF NOT EXISTS friend_count integer NOT NULL DEFAULT 0;
COMMIT;
