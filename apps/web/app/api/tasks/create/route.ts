/**
 * /api/tasks/create — Accept handoff tasks from Neptune Chat (V1)
 *
 * M-FIX-2026-06-24: Replaced in-memory globalThis.__handoffTasks with
 * Postgres-backed persistence. On Vercel serverless, global variables
 * are wiped on cold starts, causing all handoff tasks to disappear.
 *
 * Now uses raw SQL (same approach as session-store.ts) for idempotent
 * table creation + CRUD. No Drizzle migration needed.
 */
import { NextRequest, NextResponse } from "next/server";

export interface HandoffTask {
  id: string;
  source: "neptune-chat";
  goal: string;
  repo_url: string;
  vercel_deploy_status: "pending" | "building" | "deployed" | "failed";
  github_pr_url: string | null;
  vercel_deploy_url: string | null;
  created_at: string;
  updated_at: string;
}

// ── DB helpers ───────────────────────────────────────────────────────────────

let tableEnsured = false;

async function ensureHandoffTasksTable(): Promise<void> {
  if (tableEnsured) return;

  const N2_URL = process.env.NEPTUNE_V2_POSTGRES_URL;
  const P_URL = process.env.POSTGRES_URL;

  const isPlaceholder = (url: string | undefined): boolean =>
    !url || url.startsWith("<") || url === "undefined" || url === "null";

  const DB_URL = (!isPlaceholder(N2_URL) ? N2_URL : null)
    || (!isPlaceholder(P_URL) ? P_URL : null)
    || "";

  if (!DB_URL) {
    console.error("[handoff-tasks] No valid Postgres URL found");
    throw new Error("No valid Postgres URL found for handoff_tasks table");
  }

  const pg = await import("postgres");
  const sql_client = pg.default(DB_URL, {
    max: 1,
    idle_timeout: 10,
    connect_timeout: 10,
  });

  try {
    // Pre-flight ping
    await sql_client.unsafe("SELECT 1 AS ok");

    // Create table (idempotent)
    await sql_client.unsafe(`
      CREATE TABLE IF NOT EXISTS handoff_tasks (
        id text PRIMARY KEY NOT NULL,
        source text DEFAULT 'neptune-chat' NOT NULL,
        goal text NOT NULL,
        repo_url text NOT NULL,
        vercel_deploy_status text DEFAULT 'pending' NOT NULL,
        github_pr_url text,
        vercel_deploy_url text,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      )
    `);

    // Index for listing
    await sql_client.unsafe(`
      CREATE INDEX IF NOT EXISTS handoff_tasks_created_at_idx
        ON handoff_tasks (created_at DESC)
    `);

    await sql_client.end();
    console.log("[handoff-tasks] ✅ handoff_tasks table ensured");
    tableEnsured = true;
  } catch (err) {
    console.error("[handoff-tasks] ⚠️ Could not ensure table:", (err as Error).message);
    await sql_client.end().catch(() => {});
    throw err;
  }
}

async function getDbClient() {
  const N2_URL = process.env.NEPTUNE_V2_POSTGRES_URL;
  const P_URL = process.env.POSTGRES_URL;
  const isPlaceholder = (url: string | undefined): boolean =>
    !url || url.startsWith("<") || url === "undefined" || url === "null";
  const DB_URL = (!isPlaceholder(N2_URL) ? N2_URL : null)
    || (!isPlaceholder(P_URL) ? P_URL : null)
    || "";

  const pg = await import("postgres");
  return pg.default(DB_URL, { max: 5, idle_timeout: 10, connect_timeout: 10 });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { source, goal, repo_url, chat_id } = body;

    if (!goal || !repo_url) {
      return NextResponse.json(
        { error: "goal and repo_url are required" },
        { status: 400 }
      );
    }

    const task: HandoffTask = {
      id: `handoff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      source: source || "neptune-chat",
      goal,
      repo_url,
      vercel_deploy_status: "pending",
      github_pr_url: null,
      vercel_deploy_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Persist to DB instead of in-memory globalThis
    await ensureHandoffTasksTable();
    const sql_client = await getDbClient();
    try {
      await sql_client.unsafe(
        `INSERT INTO handoff_tasks (id, source, goal, repo_url, vercel_deploy_status, github_pr_url, vercel_deploy_url, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          task.id,
          task.source,
          task.goal,
          task.repo_url,
          task.vercel_deploy_status,
          task.github_pr_url,
          task.vercel_deploy_url,
          task.created_at,
          task.updated_at,
        ]
      );
    } finally {
      await sql_client.end();
    }

    return NextResponse.json({ success: true, task }, { status: 201 });
  } catch (err) {
    console.error("[handoff-tasks] Create error:", (err as Error).message);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
