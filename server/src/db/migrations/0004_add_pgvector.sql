-- Enable pgvector extension (requires PostgreSQL 14+ with pgvector installed)
CREATE EXTENSION IF NOT EXISTS vector;

-- wiki_embeddings table stores page embeddings for semantic search.
-- Scoped by project_id so multi-project deployments share a single table.
CREATE TABLE IF NOT EXISTS wiki_embeddings (
  id          BIGSERIAL PRIMARY KEY,
  project_id  TEXT        NOT NULL,
  page_id     TEXT        NOT NULL,
  embedding   VECTOR(1536),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, page_id)
);

-- Index for fast approximate nearest-neighbor search (cosine distance)
CREATE INDEX IF NOT EXISTS wiki_embeddings_embedding_idx
  ON wiki_embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
