-- Migration: Create app_settings table for persistent key-value configuration
-- Replaces the app-state.json file-based storage

CREATE TABLE IF NOT EXISTS "app_settings" (
  "key"        TEXT        PRIMARY KEY,
  "value"      JSONB       NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
