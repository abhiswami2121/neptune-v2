/**
 * Internal test endpoint for programmatic agent coding validation.
 *
 * Auth: X-Neptune-Test-Token header must match NEPTUNE_TEST_TOKEN env var.
 * Does NOT use the main auth system — this is an isolated test path.
 *
 * Sends a streaming SSE response with a tool-equipped agent that can write files.
 * Tests: text-delta streaming, tool-call emission, tool-result processing, finish.
 *
 * Request: POST { modelId: string, messages: [{ role: "user", content: string }] }
 * Response: SSE stream with events: text-delta, tool-call, tool-result, finish, error
 *
 * Used by: /home/hermes/scripts/test_v2_chat_session.py (coding mode)
 */
import { streamText, tool } from "ai";
import { gateway } from "@open-agents/agent";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

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

  const coreMessages = messages.map((m) => ({
    role: m.role as "user" | "assistant" | "system",
    content: m.content,
  }));

  const model = gateway(modelId);

  console.log("[test-coding]", {
    modelId,
    messageCount: messages.length,
    timestamp: new Date().toISOString(),
  });

  // Create a streaming response with SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const result = streamText({
          model,
          messages: coreMessages,
          maxOutputTokens: 500,
          tools: {
            writeFile: tool({
              description:
                "Write content to a file. Use this to create source code files.",
              inputSchema: z.object({
                filename: z.string().describe("Name of the file to create"),
                content: z.string().describe("The file content to write"),
              }),
              execute: async ({ filename, content }) => {
                // In test mode: just confirm the write, don't touch filesystem
                const truncated =
                  content.length > 200 ? content.slice(0, 200) + "..." : content;
                return `File written: ${filename} (${content.length} bytes). Content preview: ${truncated}`;
              },
            }),
          },
          stopWhen: (ctx) => ctx.steps.length >= 3, // Max 3 steps
        });

        for await (const part of result.fullStream) {
          const event = JSON.stringify(part) + "\n\n";
          controller.enqueue(encoder.encode(event));
        }

        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: "finish",
              finishReason: await result.finishReason,
              usage: {
                inputTokens: (await result.usage)?.inputTokens,
                outputTokens: (await result.usage)?.outputTokens,
              },
            }) + "\n\n",
          ),
        );
      } catch (err) {
        console.error("[test-coding-error]", {
          modelId,
          message: err instanceof Error ? err.message : String(err),
          name: err instanceof Error ? err.name : "UnknownError",
          timestamp: new Date().toISOString(),
        });

        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: "error",
              error: err instanceof Error ? err.message : String(err),
            }) + "\n\n",
          ),
        );
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
