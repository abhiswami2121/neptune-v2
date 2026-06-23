/**
 * /api/agent-sessions/watchdog — Phase 3 Session Lifecycle
 *
 * GET  /api/agent-sessions/watchdog          — Run watchdog: detect & transition stale sessions
 * POST /api/agent-sessions/watchdog/backfill — Backfill stuck sessions to "failed"
 *
 * Called by VPS cron every 5 minutes.
 * Auth: Bearer NEPTUNE_INTERNAL_TOKEN
 */
import { NextRequest, NextResponse } from "next/server";
import {
  transitionStaleSessions,
  backfillStuckSessions,
  validateProgrammaticAuth,
} from "@/lib/session-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!validateProgrammaticAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const transitions = await transitionStaleSessions();

    const startedToStalled = transitions.filter(
      (t) => t.from === "started" && t.to === "stalled",
    ).length;
    const stalledToFailed = transitions.filter(
      (t) => t.from === "stalled" && t.to === "failed",
    ).length;

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      transitionsApplied: transitions.length,
      startedToStalled,
      stalledToFailed,
      details: transitions.map((t) => ({
        id: t.id.slice(0, 12),
        from: t.from,
        to: t.to,
        reason: t.reason,
      })),
    });
  } catch (err) {
    console.error(
      "[watchdog] Error:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      { error: "Watchdog check failed" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  if (!validateProgrammaticAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await backfillStuckSessions();
    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (err) {
    console.error(
      "[watchdog/backfill] Error:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      { error: "Backfill failed" },
      { status: 500 },
    );
  }
}
