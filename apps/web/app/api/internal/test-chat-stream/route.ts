/**
 * Internal test endpoint for programmatic model streaming validation.
 *
 * Auth: X-Neptune-Test-Token header must match NEPTUNE_TEST_TOKEN env var.
 * Does NOT use the main auth system — this is an isolated test path.
 *
 * Request: POST {
 *   modelId?: string,           // Explicit model (skips auto mode)
 *   autoMode?: boolean,         // Enable auto mode classification
 *   messages: [{ role: "user", content: string }]
 * }
 * Response: {
 *   ok: true, modelId, content, finishReason, usage,
 *   autoClassification?: { taskClass, tier, reason }  // when auto mode active
 * } or { ok: false, error }
 *
 * Used by: /home/hermes/scripts/test_v2_chat_session.py (v2-app-test mode)
 */
import { generateText } from "ai";
import { gateway, classifyTask, extractUserMessages } from "@open-agents/agent";

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
  let body: {
    modelId?: string;
    autoMode?: boolean;
    messages?: { role: string; content: string }[];
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { modelId, autoMode, messages } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return Response.json(
      { ok: false, error: "messages (array) is required" },
      { status: 400 },
    );
  }

  // ---- AUTO MODE: classify prompt to pick model tier ----
  let resolvedModelId = modelId;
  let autoClassification: ReturnType<typeof classifyTask> | null = null;

  if (!modelId && autoMode === true) {
    const userMsgs = extractUserMessages(messages);
    if (userMsgs.length > 0) {
      autoClassification = classifyTask(userMsgs);
      resolvedModelId = autoClassification.modelId;
    }
  }

  // Fallback if no model resolved
  if (!resolvedModelId) {
    resolvedModelId = "deepseek/deepseek-v4-flash";
  }

  const coreMessages = messages.map((m) => ({
    role: m.role as "user" | "assistant" | "system",
    content: m.content,
  }));

  try {
    const model = gateway(resolvedModelId);

    console.log("[test-chat-stream]", {
      modelId: resolvedModelId,
      messageCount: messages.length,
      autoMode: autoMode === true,
      autoClassification: autoClassification
        ? {
            taskClass: autoClassification.taskClass,
            tier: autoClassification.tier,
            reason: autoClassification.reason,
          }
        : null,
      timestamp: new Date().toISOString(),
    });

    const result = await generateText({
      model,
      messages: coreMessages,
      maxOutputTokens: 200,
    });

    return Response.json({
      ok: true,
      modelId: resolvedModelId,
      content: result.text,
      finishReason: result.finishReason,
      usage: {
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
      },
      autoClassification: autoClassification
        ? {
            taskClass: autoClassification.taskClass,
            tier: autoClassification.tier,
            reason: autoClassification.reason,
            signals: autoClassification.signals,
          }
        : null,
    });
  } catch (err) {
    console.error("[test-chat-stream-error]", {
      modelId: resolvedModelId,
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
