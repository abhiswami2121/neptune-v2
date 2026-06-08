/**
 * Ephemeral sandbox spawner for programmatic sandbox-only coding.
 *
 * Creates a Vercel Sandbox MicroVM, runs the open-agent in it,
 * streams SSE lifecycle + agent events, and cleans up after.
 *
 * Used by: /api/chat when mode === 'sandbox' with bearer auth
 */
import { VercelSandbox } from "@open-agents/sandbox/vercel";
import { openAgent } from "@open-agents/agent";

export interface SandboxSpawnResult {
  sandboxId: string;
  workingDirectory: string;
  stream: ReadableStream<Uint8Array>;
}

/**
 * Map simple {role, content} messages to AI SDK message format.
 */
function toCoreMessages(
  messages: { role: string; content: string }[],
): { role: "system" | "user" | "assistant"; content: string }[] {
  return messages.map((m) => ({
    role: m.role as "system" | "user" | "assistant",
    content: m.content,
  }));
}

/**
 * Spawn an ephemeral Vercel Sandbox and run the open-agent in it.
 *
 * Yields SSE events:
 *  - sandbox.created  { sandboxId, workingDirectory }
 *  - text-delta       { textDelta }          (AI SDK raw chunks)
 *  - tool-call        { toolCallId, ... }    (agent tool invocations)
 *  - tool-result      { toolCallId, ... }    (agent tool results)
 *  - finish           { finishReason, usage }
 *  - sandbox.destroyed { sandboxId }
 *  - error            { message }
 */
export async function spawnSandboxStream(
  messages: { role: string; content: string }[],
  modelId?: string,
): Promise<SandboxSpawnResult> {
  // 1. Create ephemeral Vercel Sandbox (no git source — empty MicroVM)
  const sandbox = await VercelSandbox.create({
    timeout: 5 * 60 * 1000, // 5 minute proactive timeout
    vcpus: 1,
    persistent: false,
    skipGitWorkspaceBootstrap: true,
  });

  const sandboxId = sandbox.id;
  const workingDirectory = sandbox.workingDirectory;

  // 2. Build sandbox context for the agent
  const sandboxContext = {
    state: sandbox.getState(),
    workingDirectory,
    environmentDetails: sandbox.environmentDetails,
  };

  // 3. Create SSE stream
  const encoder = new TextEncoder();
  let isCleanedUp = false;

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: string, data: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      // Emit sandbox.created
      enqueue("sandbox.created", { sandboxId, workingDirectory });

      try {
        // Convert messages and run agent
        const coreMessages = toCoreMessages(messages);

        const result = await openAgent.stream({
          messages: coreMessages,
          options: {
            sandbox: sandboxContext,
            ...(modelId ? { model: modelId } : {}),
          },
        });

        // Stream raw AI SDK events interleaved with lifecycle tracking
        let lastToolName: string | null = null;
        for await (const part of result.fullStream) {
          // Track file writes for lifecycle events
          if (
            part.type === "tool-call" &&
            "toolName" in part &&
            part.toolName === "write"
          ) {
            lastToolName = "write";
          }

          if (
            part.type === "tool-result" &&
            "toolName" in part &&
            part.toolName === "write"
          ) {
            // Emit file.written lifecycle event when write tool completes
            enqueue("file.written", {
              toolCallId:
                "toolCallId" in part ? part.toolCallId : "unknown",
              result: "result" in part ? part.result : undefined,
            });
          }

          if (part.type === "tool-result" && "toolName" in part && part.toolName === "bash") {
            enqueue("execution.result", {
              toolCallId:
                "toolCallId" in part ? part.toolCallId : "unknown",
              result: "result" in part ? part.result : undefined,
            });
          }

          // Forward raw AI SDK event
          enqueue(part.type, part as unknown as Record<string, unknown>);
        }

        // Emit finish event with metadata
        const [finishReason, usage] = await Promise.all([
          result.finishReason,
          result.totalUsage,
        ]);

        enqueue("finish", {
          finishReason,
          usage: usage
            ? {
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
              }
            : null,
        });
      } catch (err) {
        console.error("[sandbox-spawn-error]", {
          sandboxId,
          message: err instanceof Error ? err.message : String(err),
          name: err instanceof Error ? err.name : "UnknownError",
          timestamp: new Date().toISOString(),
        });

        enqueue("error", {
          message: err instanceof Error ? err.message : String(err),
          sandboxId,
        });
      } finally {
        // 4. Cleanup: stop and destroy sandbox
        if (!isCleanedUp) {
          isCleanedUp = true;
          try {
            await sandbox.stop();
          } catch (cleanupErr) {
            console.error("[sandbox-cleanup-error]", {
              sandboxId,
              message:
                cleanupErr instanceof Error
                  ? cleanupErr.message
                  : String(cleanupErr),
            });
          }
          enqueue("sandbox.destroyed", { sandboxId });
        }

        controller.close();
      }
    },

    cancel() {
      // Client disconnected — cleanup
      if (!isCleanedUp) {
        isCleanedUp = true;
        sandbox.stop().catch((err) => {
          console.error("[sandbox-cancel-cleanup-error]", {
            sandboxId,
            message: err instanceof Error ? err.message : String(err),
          });
        });
      }
    },
  });

  return {
    sandboxId,
    workingDirectory,
    stream,
  };
}
