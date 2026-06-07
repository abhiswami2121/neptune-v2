/**
 * Internal test endpoint for programmatic model streaming validation.
 *
 * Auth: X-Neptune-Test-Token header must match NEPTUNE_TEST_TOKEN env var.
 * Does NOT use the main auth system — this is an isolated test path.
 *
 * Request: POST { modelId: string, messages: [{ role: "user", content: string }] }
 * Response: SSE stream of text-delta chunks (same format as Vercel AI SDK streamText)
 *
 * Used by: /home/hermes/scripts/test_v2_chat_session.py (v2-app-test mode)
 */
import { streamText, type CoreMessage } from "ai";
import { gateway } from "@open-agents/agent";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // Auth: shared secret token
  const testToken = req.headers.get("x-neptune-test-token");
  const expectedToken = process.env.NEPTUNE_TEST_TOKEN;

  if (!expectedToken) {
    return Response.json(
      { error: "NEPTUNE_TEST_TOKEN not configured on server" },
      { status: 500 },
    );
  }

  if (!testToken || testToken !== expectedToken) {
    return Response.json(
      { error: "Invalid or missing X-Neptune-Test-Token" },
      { status: 401 },
    );
  }

  // Parse request
  let body: { modelId?: string; messages?: { role: string; content: string }[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { modelId, messages } = body;

  if (!modelId || typeof modelId !== "string") {
    return Response.json(
      { error: "modelId (string) is required" },
      { status: 400 },
    );
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return Response.json(
      { error: "messages (array) is required" },
      { status: 400 },
    );
  }

  // Validate message format
  const coreMessages: CoreMessage[] = messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  try {
    // This is the KEY line — calls gateway() which routes through
    // Vercel AI Gateway, picking up BYOK keys automatically.
    const model = gateway(modelId);

    console.log("[test-chat-stream]", {
      modelId,
      messageCount: messages.length,
      timestamp: new Date().toISOString(),
    });

    const result = streamText({
      model,
      messages: coreMessages,
      maxTokens: 200,
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    console.error("[test-chat-stream-error]", {
      modelId,
      message: err instanceof Error ? err.message : String(err),
      name: err instanceof Error ? err.name : "UnknownError",
      stack: err instanceof Error ? err.stack?.slice(0, 800) : undefined,
      timestamp: new Date().toISOString(),
    });

    return Response.json(
      {
        error: "Stream failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
