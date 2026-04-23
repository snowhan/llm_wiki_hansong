-- Migration: 0003_create_task_tables
-- Creates persistent storage for ingest and research task states.
-- Replaces in-memory Maps in ingest-service.ts and research-service.ts.

CREATE TABLE IF NOT EXISTS ingest_tasks (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL,
  source_path  TEXT NOT NULL,
  folder_context TEXT NOT NULL DEFAULT '',
  force        BOOLEAN NOT NULL DEFAULT FALSE,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'running', 'done', 'error')),
  detail       TEXT NOT NULL DEFAULT '',
  files_written JSONB NOT NULL DEFAULT '[]',
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ingest_tasks_project_idx ON ingest_tasks (project_id);
CREATE INDEX IF NOT EXISTS ingest_tasks_status_idx  ON ingest_tasks (status);

CREATE TABLE IF NOT EXISTS research_tasks (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL,
  topic          TEXT NOT NULL,
  search_queries JSONB NOT NULL DEFAULT '[]',
  status         TEXT NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued', 'searching', 'synthesizing', 'saving', 'done', 'error')),
  web_results    JSONB NOT NULL DEFAULT '[]',
  synthesis      TEXT NOT NULL DEFAULT '',
  saved_path     TEXT,
  error          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS research_tasks_project_idx ON research_tasks (project_id);
CREATE INDEX IF NOT EXISTS research_tasks_status_idx  ON research_tasks (status);
