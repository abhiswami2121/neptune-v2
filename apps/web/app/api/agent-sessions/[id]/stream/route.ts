/**
 * /api/agent-sessions/[id]/stream — U2.5A.2
 *
 * GET /api/agent-sessions/:id/stream — SSE event stream for real-time updates
 *
 * Auth: Bearer NEPTUNE_INTERNAL_TOKEN or session cookie
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getAgentSession,
  generateSSEStream,
  validateProgrammaticAuth,
} from "@/lib/session-store";
import { auth } from "@/lib/auth/config";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes max for SSE

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

  const { id } = await params;

  // Verify session exists
  const session = await getAgentSession(id);
  if (!session) {
    return NextResponse.json(
      { error: "Session not found" },
      { status: 404 },
    );
  }

  // If already terminal, return immediately with final state
  if (["completed", "failed", "aborted"].includes(session.status)) {
    return new Response(
      `data: ${JSON.stringify({ type: "terminal", status: session.status, completedAt: session.completedAt })}\n\n`,
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const abortController = new AbortController();

      // Close stream if client disconnects
      req.signal.addEventListener("abort", () => {
        abortController.abort();
        controller.close();
      });

      try {
        for await (const chunk of generateSSEStream(id, abortController.signal)) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        console.error("[agent-sessions] SSE error:", err);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", message: "Stream error" })}\n\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
