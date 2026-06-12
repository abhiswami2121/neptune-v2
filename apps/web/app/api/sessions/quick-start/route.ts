import { nanoid } from "nanoid";
import { requireAuthenticatedUser } from "@/app/api/sessions/_lib/session-context";
import { createSessionWithInitialChat } from "@/lib/db/sessions";
import { getServerSession } from "@/lib/session/get-server-session";

/**
 * Validate the NEPTUNE_TEST_TOKEN bearer auth for programmatic access.
 */
function isProgrammaticAuth(req: Request): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return false;
  }
  const bearerToken = authHeader.slice(7);
  const expectedToken = process.env.NEPTUNE_TEST_TOKEN;
  const e2eToken = process.env.NEPTUNE_E2E_TEST_TOKEN;
  if (expectedToken && bearerToken === expectedToken) return true;
  if (e2eToken && bearerToken === e2eToken) return true;
  return false;
}

/**
 * POST /api/sessions/quick-start
 *
 * Creates a lightweight session + chat in a single call for chat-only mode.
 * No sandbox provisioning, no GitHub repo, no Vercel project — just the minimum
 * needed to own a session and start chatting with session persistence.
 *
 * Auth: Accepts Bearer token (programmatic) OR valid session cookie.
 *   - Bearer token: returns synthetic IDs (no DB persistence)
 *   - Session cookie: creates real DB session+chat owned by the user
 *
 * Body (optional):
 *   { title?: string }  — display title for the session
 *
 * Returns:
 *   { sessionId, chatId, session?, chat?, programmatic?: boolean }
 */
export async function POST(req: Request) {
  // --- Programmatic (Bearer token) auth ---
  if (isProgrammaticAuth(req)) {
    const sid = `qs_${nanoid()}`;
    const cid = `qc_${nanoid()}`;
    return Response.json({
      sessionId: sid,
      chatId: cid,
      programmatic: true,
    });
  }

  // --- Session cookie auth ---
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return authResult.response;
  }

  let title = "Chat";
  try {
    const body = await req.json();
    if (body && typeof body.title === "string" && body.title.trim().length > 0) {
      title = body.title.trim();
    }
  } catch {
    // No body or invalid JSON — use default title
  }

  const session = await getServerSession();
  const userId = authResult.userId;

  try {
    const result = await createSessionWithInitialChat({
      session: {
        id: nanoid(),
        userId,
        title,
        status: "running",
        sandboxState: null,
        lifecycleState: "active",
        lifecycleVersion: 0,
      },
      initialChat: {
        id: nanoid(),
        title: "New chat",
        modelId: null,
      },
    });

    return Response.json({
      sessionId: result.session.id,
      chatId: result.chat.id,
      session: result.session,
      chat: result.chat,
    });
  } catch (error) {
    console.error("[quick-start-error]", {
      message: error instanceof Error ? error.message : String(error),
      userId,
      timestamp: new Date().toISOString(),
    });
    return Response.json(
      { error: "Failed to create session" },
      { status: 500 },
    );
  }
}
