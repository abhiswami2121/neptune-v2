/**
 * /api/agent-sessions/[id] — U2.5A.2
 *
 * GET    /api/agent-sessions/:id        — Get session detail
 * PATCH  /api/agent-sessions/:id        — Update session (status, error, etc.)
 *
 * Auth: Bearer NEPTUNE_INTERNAL_TOKEN or session cookie
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getAgentSession,
  updateAgentSession,
  validateProgrammaticAuth,
} from "@/lib/session-store";
import { auth } from "@/lib/auth/config";

async function isAuthorized(req: NextRequest): Promise<boolean> {
  if (validateProgrammaticAuth(req)) return true;
  try {
    const baSession = await auth.api.getSession({ headers: req.headers });
    return !!baSession?.user;
  } catch {
    return false;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const session = await getAgentSession(id);

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(session);
  } catch (err) {
    console.error("[agent-sessions] GET/:id error:", err);
    return NextResponse.json(
      { error: "Failed to get session" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json();

    const updated = await updateAgentSession(id, {
      status: body.status,
      goal: body.goal,
      model: body.model,
      repo: body.repo,
      branch: body.branch,
      prUrl: body.prUrl,
      deployUrl: body.deployUrl,
      error: body.error,
      sandboxId: body.sandboxId,
      durationMs: body.durationMs,
    });

    if (!updated) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[agent-sessions] PATCH/:id error:", err);
    return NextResponse.json(
      { error: "Failed to update session" },
      { status: 500 },
    );
  }
}
