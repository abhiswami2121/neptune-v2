/**
 * /api/tasks — List handoff tasks from Neptune Chat (V1)
 *
 * M-FIX-2026-06-24: Replaced in-memory globalThis.__handoffTasks with
 * Postgres-backed queries. On Vercel serverless, global variables
 * are wiped on cold starts, causing all handoff tasks to disappear.
 */
import { NextResponse } from "next/server";

async function getDbClient() {
  const N2_URL = process.env.NEPTUNE_V2_POSTGRES_URL;
  const P_URL = process.env.POSTGRES_URL;
  const isPlaceholder = (url: string | undefined): boolean =>
    !url || url.startsWith("<") || url === "undefined" || url === "null";
  const DB_URL = (!isPlaceholder(N2_URL) ? N2_URL : null)
    || (!isPlaceholder(P_URL) ? P_URL : null)
    || "";

  if (!DB_URL) return null;

  const pg = await import("postgres");
  return pg.default(DB_URL, { max: 5, idle_timeout: 10, connect_timeout: 10 });
}

export async function GET() {
  try {
    const sql_client = await getDbClient();
    if (!sql_client) {
      // No DB configured — return empty (graceful degradation)
      return NextResponse.json({ tasks: [], total: 0 });
    }

    try {
      const rows = await sql_client.unsafe(
        `SELECT id, source, goal, repo_url, vercel_deploy_status, github_pr_url, vercel_deploy_url, created_at, updated_at
         FROM handoff_tasks
         ORDER BY created_at DESC
         LIMIT 200`
      );

      const tasks = rows.map((row: Record<string, unknown>) => ({
        id: row.id as string,
        source: (row.source as string) || "neptune-chat",
        goal: row.goal as string,
        repo_url: row.repo_url as string,
        vercel_deploy_status: (row.vercel_deploy_status as string) || "pending",
        github_pr_url: row.github_pr_url as string | null,
        vercel_deploy_url: row.vercel_deploy_url as string | null,
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
      }));

      return NextResponse.json({ tasks, total: tasks.length });
    } finally {
      await sql_client.end();
    }
  } catch (err) {
    console.error("[handoff-tasks] List error:", (err as Error).message);
    // Graceful degradation — return empty if DB is down
    return NextResponse.json({ tasks: [], total: 0, error: "DB unavailable" });
  }
}
