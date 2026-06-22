/**
 * /api/agent-sessions/[id]/checkpoint — Phase 2 Durability
 *
 * GET  /api/agent-sessions/:id/checkpoint  — Load latest checkpoint state
 * POST /api/agent-sessions/:id/checkpoint  — Force a checkpoint save (manual)
 *
 * Auth: Bearer NEPTUNE_INTERNAL_TOKEN
 * Used by: Auto-continue resume, admin dashboard
 */

import { NextRequest, NextResponse } from "next/server";
import {
  loadSessionCheckpoint,
  saveSessionCheckpoint,
  validateProgrammaticAuth,
  getAgentSession,
} from "@/lib/session-store";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!validateProgrammaticAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    // Verify session exists
    const session = await getAgentSession(id);
    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 },
      );
    }

    const checkpoint = await loadSessionCheckpoint(id);

    return NextResponse.json({
      sessionId: id,
      status: session.status,
      model: session.model,
      goal: session.goal,
      startedAt: session.startedAt,
      checkpoint: checkpoint ?? null,
      // Include summary for resume context
      resumeAvailable:
        checkpoint !== null &&
        session.status !== "completed" &&
        session.status !== "aborted",
    });
  } catch (err) {
    console.error("[checkpoint] GET error:", err);
    return NextResponse.json(
      { error: "Failed to load checkpoint" },
      { status: 500 },
    );
  }
}

/**
 * POST — Manual checkpoint save. Used by external triggers or admin operations.
 * Body: { checkpointJson, checkpointCount, status?, error? }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!validateProgrammaticAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json();

    // Verify session exists
    const session = await getAgentSession(id);
    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 },
      );
    }

    await saveSessionCheckpoint(id, {
      checkpointJson: body.checkpointJson ?? {},
      checkpointCount: body.checkpointCount ?? 0,
      status: body.status,
      error: body.error,
    });

    return NextResponse.json({
      sessionId: id,
      saved: true,
      checkpointCount: body.checkpointCount ?? 0,
    });
  } catch (err) {
    console.error("[checkpoint] POST error:", err);
    return NextResponse.json(
      { error: "Failed to save checkpoint" },
      { status: 500 },
    );
  }
}
