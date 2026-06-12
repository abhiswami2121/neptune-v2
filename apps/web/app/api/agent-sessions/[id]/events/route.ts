/**
 * /api/agent-sessions/[id]/events — U2.5A.2
 *
 * POST /api/agent-sessions/:id/events  — Append event to stream
 * GET  /api/agent-sessions/:id/events  — Get session events
 *
 * Auth: Bearer NEPTUNE_INTERNAL_TOKEN or session cookie
 */

import { NextRequest, NextResponse } from "next/server";
import {
  appendSessionEvent,
  getSessionEvents,
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const { type, data = {} } = body;

    if (!type || typeof type !== "string") {
      return NextResponse.json(
        { error: "Missing 'type' field" },
        { status: 400 },
      );
    }

    await appendSessionEvent(id, type, data);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("[agent-sessions] POST events error:", err);
    return NextResponse.json(
      { error: "Failed to append event" },
      { status: 500 },
    );
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
    const since = req.nextUrl.searchParams.get("since");
    const events = await getSessionEvents(
      id,
      since ? parseInt(since, 10) : undefined,
    );
    return NextResponse.json(events);
  } catch (err) {
    console.error("[agent-sessions] GET events error:", err);
    return NextResponse.json(
      { error: "Failed to get events" },
      { status: 500 },
    );
  }
}
