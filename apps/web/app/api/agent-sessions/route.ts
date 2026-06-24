/**
 * /api/agent-sessions — U2.5A.2
 *
 * POST   /api/agent-sessions        — Start a new agent session
 * GET    /api/agent-sessions        — List all agent sessions
 *
 * Auth: Bearer NEPTUNE_INTERNAL_TOKEN or session cookie
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createAgentSession,
  listAgentSessions,
  validateProgrammaticAuth,
} from "@/lib/session-store";
import { auth } from "@/lib/auth/config";

async function isAuthorized(req: NextRequest): Promise<boolean> {
  // Programmatic auth
  if (validateProgrammaticAuth(req)) return true;

  // Session cookie auth
  try {
    const baSession = await auth.api.getSession({ headers: req.headers });
    return !!baSession?.user;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));

    const session = await createAgentSession({
      goal: body.goal,
      model: body.model,
      mode: body.mode || "sandbox",
      repo: body.repo,
      branch: body.branch,
      chatId: body.chatId,
      v2SessionId: body.sessionId,
    });

    return NextResponse.json(session, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const cause = err instanceof Error && err.cause ? ' | cause: ' + String(err.cause) : '';
    console.error('[agent-sessions] POST error [' + msg.slice(0,200) + cause + ']', err);
    return NextResponse.json(
      { error: "Failed to create session", detail: msg.slice(0, 300), hint: "DB table agent_sessions may be missing — run migration 0037" },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0");

    const result = await listAgentSessions(limit, offset);

    return NextResponse.json(result);
  } catch (err) {
    console.error("[agent-sessions] GET error:", err);
    return NextResponse.json(
      { error: "Failed to list sessions" },
      { status: 500 },
    );
  }
}
