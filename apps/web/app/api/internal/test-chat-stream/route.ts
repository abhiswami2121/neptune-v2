/**
 * Internal test endpoint for programmatic model streaming validation.
 *
 * Auth: X-Neptune-Test-Token header must match NEPTUNE_TEST_TOKEN env var.
 * Does NOT use the main auth system — this is an isolated test path.
 *
 * Request: POST { modelId: string, messages: [{ role: "user", content: string }] }
 * Response: { ok: true, modelId, content, finishReason, usage } or { ok: false, error }
 *
 * Used by: /home/hermes/scripts/test_v2_chat_session.py (v2-app-test mode)
 */
import { generateText, type CoreMessage } from "ai";
import { gateway } from "@open-agents/agent";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // Auth: shared secret token
  const testToken = req.headers.get("x-neptune-test-token");
  const expectedToken = process.env.NEPTUNE_TEST_TOKEN;

  if (!expectedToken) {
    return Response.json(
      { ok: false, error: "NEPTUNE_TEST_TOKEN not configured on server" },
      { status: 500 },
    );
  }

  if (!testToken || testToken !== expectedToken) {
    return Response.json(
      { ok: false, error: "Invalid or missing X-Neptune-Test-Token" },
      { status: 401 },
    );
  }

  // Parse request
  let body: { modelId?: string; messages?: { role: string; content: string }[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { modelId, messages } = body;

  if (!modelId || typeof modelId !== "string") {
    return Response.json(
      { ok: false, error: "modelId (string) is required" },
      { status: 400 },
    );
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return Response.json(
      { ok: false, error: "messages (array) is required" },
      { status: 400 },
    );
  }

  const coreMessages: CoreMessage[] = messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  try {
    const model = gateway(modelId);

    console.log("[test-chat-stream]", {
      modelId,
      messageCount: messages.length,
      timestamp: new Date().toISOString(),
    });

    const result = await generateText({
      model,
      messages: coreMessages,
      maxTokens: 200,
    });

    return Response.json({
      ok: true,
      modelId,
      content: result.text,
      finishReason: result.finishReason,
      usage: {
        promptTokens: result.usage?.promptTokens,
        completionTokens: result.usage?.completionTokens,
      },
    });
  } catch (err) {
    console.error("[test-chat-stream-error]", {
      modelId,
      message: err instanceof Error ? err.message : String(err),
      name: err instanceof Error ? err.name : "UnknownError",
      timestamp: new Date().toISOString(),
    });

    return Response.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
