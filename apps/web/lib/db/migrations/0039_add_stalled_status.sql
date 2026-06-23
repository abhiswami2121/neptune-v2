-- 0039_add_stalled_status
-- Phase 3: Add "stalled" to agent_sessions status check constraint
-- This supports the session lifecycle watchdog (started → stalled → failed)

-- Drop the existing check constraint (drizzle generates named constraints)
-- The constraint name follows drizzle pattern: tablename_status_check
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_sessions_status_check'
    AND conrelid = 'agent_sessions'::regclass
  ) THEN
    ALTER TABLE agent_sessions DROP CONSTRAINT agent_sessions_status_check;
  END IF;
END $$;

-- Add the updated check constraint with "stalled"
ALTER TABLE agent_sessions ADD CONSTRAINT agent_sessions_status_check
  CHECK (status IN ('started', 'running', 'completed', 'failed', 'aborted', 'stalled'));
