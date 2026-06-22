-- 0038_add_checkpoint_to_agent_sessions
-- Phase 2: Add checkpoint state columns for durable long-running sessions
--
-- Adds:
--   checkpoint_json     — JSONB column storing full session checkpoint state
--   parent_session_id   — Links to parent session for auto-continue chains
--   checkpoint_count    — Number of checkpoints emitted (for UI)
--
-- Migration is additive and backwards-compatible.

ALTER TABLE agent_sessions
  ADD COLUMN IF NOT EXISTS checkpoint_json JSONB,
  ADD COLUMN IF NOT EXISTS parent_session_id TEXT,
  ADD COLUMN IF NOT EXISTS checkpoint_count INTEGER NOT NULL DEFAULT 0;

-- Index for querying checkpoint chains (auto-continue lineage)
CREATE INDEX IF NOT EXISTS agent_sessions_parent_idx
  ON agent_sessions(parent_session_id)
  WHERE parent_session_id IS NOT NULL;
