-- Migration: Create authentication tables
-- Run automatically on server startup via db/migrate.ts

CREATE TABLE IF NOT EXISTS "users" (
  "id"            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "username"      TEXT        UNIQUE NOT NULL,
  "password_hash" TEXT        NOT NULL,
  "role"          TEXT        NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  "status"        TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended')),
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "refresh_tokens" (
  "id"          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "token_hash"  TEXT        UNIQUE NOT NULL,
  "expires_at"  TIMESTAMPTZ NOT NULL,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
