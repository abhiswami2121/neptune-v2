CREATE TABLE "agent_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"goal" text,
	"model" text,
	"status" text DEFAULT 'started' NOT NULL,
	"mode" text DEFAULT 'sandbox',
	"repo" text,
	"branch" text,
	"pr_url" text,
	"deploy_url" text,
	"error" text,
	"sandbox_id" text,
	"chat_id" text,
	"v2_session_id" text,
	"duration_ms" integer,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coding_agent_memory" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"repo" text NOT NULL,
	"session_id" text NOT NULL,
	"fact_type" text NOT NULL,
	"fact" text NOT NULL,
	"embedding" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_accessed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coding_agent_memory" ADD CONSTRAINT "coding_agent_memory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_sessions_status_idx" ON "agent_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_sessions_created_at_idx" ON "agent_sessions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cam_user_repo_idx" ON "coding_agent_memory" USING btree ("user_id","repo");--> statement-breakpoint
CREATE INDEX "cam_fact_type_idx" ON "coding_agent_memory" USING btree ("fact_type");--> statement-breakpoint
CREATE INDEX "cam_created_at_idx" ON "coding_agent_memory" USING btree ("created_at");