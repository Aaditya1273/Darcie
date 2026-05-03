-- ══════════════════════════════════════════════════════════════════
-- Darcie — Database Schema
-- Run once in: Supabase Dashboard → SQL Editor → New Query → Run
-- Connection: postgresql://postgres.voybtucowpcmmnirostn:PASSWORD@...
-- ══════════════════════════════════════════════════════════════════

-- ── Extensions ───────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";        -- pgvector for memory search

-- ── Users + Sessions (Auth) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  name          TEXT,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user  ON sessions(user_id);

-- ── Conversations ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     TEXT NOT NULL,
  title       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);

-- ── Messages ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id   UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role              TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content           TEXT NOT NULL,
  metadata          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);

-- ── Memories (pgvector — 1024 dims for Cohere embed-v3) ───────────
CREATE TABLE IF NOT EXISTS memories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     TEXT NOT NULL,
  content     TEXT NOT NULL,
  embedding   vector(1024),
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_vec
  ON memories USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ── Assets (generated images, PPTs, reports) ──────────────────────
CREATE TABLE IF NOT EXISTS assets (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           TEXT NOT NULL,
  conversation_id   UUID REFERENCES conversations(id),
  type              TEXT NOT NULL CHECK (type IN ('image','ppt','report','video','audio')),
  file_url          TEXT,
  prompt            TEXT,
  metadata          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_assets_user ON assets(user_id);

-- ── API usage (rate limiting) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_usage (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT NOT NULL,
  endpoint   TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_api_usage_user ON api_usage(user_id, created_at);
-- No RPC functions needed — vector search runs inline via postgres.js
-- Vector query used in chat_memory.ts:
--   SELECT content, 1 - (embedding <=> $vec::vector) AS similarity
--   FROM memories WHERE user_id = $uid AND similarity > 0.65
--   ORDER BY embedding <=> $vec::vector LIMIT 5
