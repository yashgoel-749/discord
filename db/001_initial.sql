BEGIN;
CREATE TABLE IF NOT EXISTS "user" (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  image text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  color text NOT NULL DEFAULT '#a78bfa',
  status text NOT NULL DEFAULT 'online' CHECK (status IN ('online','idle','dnd','offline')),
  bio text NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS session (
  id text PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS session_user_idx ON session("userId");
CREATE TABLE IF NOT EXISTS account (
  id text PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_user_idx ON account("userId");
CREATE TABLE IF NOT EXISTS verification (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification(identifier);
CREATE TABLE IF NOT EXISTS "rateLimit" (
  id text PRIMARY KEY,
  key text NOT NULL UNIQUE,
  count integer NOT NULL,
  "lastRequest" bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS servers (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 48),
  description text NOT NULL DEFAULT '',
  icon text NOT NULL,
  color text NOT NULL DEFAULT '#b9f283',
  owner_id text NOT NULL REFERENCES "user"(id),
  invite_code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS memberships (
  server_id text NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  PRIMARY KEY(server_id, user_id)
);
CREATE INDEX IF NOT EXISTS memberships_user_idx ON memberships(user_id);
CREATE TABLE IF NOT EXISTS rooms (
  id text PRIMARY KEY,
  server_id text REFERENCES servers(id) ON DELETE CASCADE,
  name text NOT NULL,
  topic text NOT NULL DEFAULT '',
  kind text NOT NULL CHECK(kind IN ('text','voice','dm')),
  dm_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'dm' AND server_id IS NULL AND dm_key IS NOT NULL) OR (kind IN ('text','voice') AND server_id IS NOT NULL AND dm_key IS NULL))
);
CREATE INDEX IF NOT EXISTS rooms_server_idx ON rooms(server_id);
CREATE TABLE IF NOT EXISTS participants (
  room_id text NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  PRIMARY KEY(room_id,user_id)
);
CREATE INDEX IF NOT EXISTS participants_user_idx ON participants(user_id);
CREATE TABLE IF NOT EXISTS messages (
  id text PRIMARY KEY,
  room_id text NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES "user"(id),
  content text NOT NULL CHECK(length(content) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  edited boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS messages_room_time_idx ON messages(room_id,created_at,id);
CREATE TABLE IF NOT EXISTS reactions (
  message_id text NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK(emoji IN ('❤️','🔥','👍','🎉','👀','🚀')),
  PRIMARY KEY(message_id,user_id,emoji)
);
CREATE TABLE IF NOT EXISTS command_limits (
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  count integer NOT NULL
);
COMMIT;
