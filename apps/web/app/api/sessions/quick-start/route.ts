import { nanoid } from "nanoid";
import { requireAuthenticatedUser } from "@/app/api/sessions/_lib/session-context";
import { createSessionWithInitialChat } from "@/lib/db/sessions";
import { getServerSession } from "@/lib/session/get-server-session";

/**
 * POST /api/sessions/quick-start
 *
 * Creates a lightweight session + chat in a single call for chat-only mode.
 * No sandbox provisioning, no GitHub repo, no Vercel project — just the minimum
 * needed to own a session and start chatting with session persistence.
 *
 * Body (optional):
 *   { title?: string }  — display title for the session
 *
 * Returns:
 *   { sessionId, chatId, session, chat }
 */
export async function POST(req: Request) {
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
