BEGIN;
CREATE TABLE IF NOT EXISTS user_presence (
  session_id text NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  tab_id uuid NOT NULL,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  closed boolean NOT NULL DEFAULT false,
  PRIMARY KEY (session_id,tab_id)
);
CREATE INDEX IF NOT EXISTS user_presence_live_idx ON user_presence(user_id,expires_at) WHERE NOT closed;
ALTER TABLE command_limits ADD COLUMN IF NOT EXISTS presence_window_start timestamptz NOT NULL DEFAULT now();
ALTER TABLE command_limits ADD COLUMN IF NOT EXISTS presence_count integer NOT NULL DEFAULT 0;
COMMIT;
