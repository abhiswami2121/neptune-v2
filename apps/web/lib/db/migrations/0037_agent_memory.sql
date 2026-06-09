CREATE TABLE IF NOT EXISTS "coding_agent_memory" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "repo" text NOT NULL,
  "session_id" text NOT NULL,
  "fact_type" text NOT NULL CHECK (fact_type IN ('preference', 'decision', 'pattern', 'gotcha')),
  "fact" text NOT NULL,
  "embedding" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "last_accessed_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "cam_user_repo_idx" ON "coding_agent_memory" ("user_id", "repo");
CREATE INDEX IF NOT EXISTS "cam_fact_type_idx" ON "coding_agent_memory" ("fact_type");
CREATE INDEX IF NOT EXISTS "cam_created_at_idx" ON "coding_agent_memory" ("created_at");
