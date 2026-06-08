/**
 * Ephemeral sandbox spawner for programmatic sandbox-only coding.
 *
 * Creates a Vercel Sandbox MicroVM, runs a tool-equipped model in it,
 * streams SSE lifecycle + agent events, and cleans up after.
 *
 * Used by: /api/chat when mode === 'sandbox' with bearer auth
 */
import { VercelSandbox } from "@open-agents/sandbox/vercel";
import { streamText, tool } from "ai";
import { gateway, defaultModelLabel } from "@open-agents/agent";
import { z } from "zod";

export interface SandboxSpawnResult {
  sandboxId: string;
  workingDirectory: string;
  stream: ReadableStream<Uint8Array>;
}

const MAX_STEPS = 5;
const BASH_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_TOKENS = 2000;
const SANDBOX_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Spawn an ephemeral Vercel Sandbox and run a tool-equipped model in it.
 *
 * Yields SSE events:
 *  - sandbox.created  { sandboxId, workingDirectory }
 *  - text-delta       { textDelta }          (AI SDK raw chunks)
 *  - tool-call        { toolCallId, ... }    (model tool invocations)
 *  - tool-result      { toolCallId, ... }    (model tool results)
 *  - file.written     { toolCallId, result } (writeFile tool completed)
 *  - execution.result { toolCallId, result } (bash tool completed)
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
    timeout: SANDBOX_TIMEOUT_MS,
    vcpus: 1,
    persistent: false,
    skipGitWorkspaceBootstrap: true,
  });

  const sandboxId = sandbox.id;
  const workingDirectory = sandbox.workingDirectory;

  // 2. Create SSE stream with real sandbox-backed tools
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
        const model = gateway(modelId ?? defaultModelLabel);

        // Convert simple {role, content} messages to CoreMessage format
        const coreMessages = messages.map((m) => ({
          role: m.role as "system" | "user" | "assistant",
          content: m.content,
        }));

        const result = streamText({
          model,
          messages: coreMessages,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          tools: {
            writeFile: tool({
              description:
                "Write content to a file in the sandbox. Use this to create source code files before executing them.",
              inputSchema: z.object({
                filename: z
                  .string()
                  .describe("File path relative to the sandbox working directory"),
                content: z.string().describe("The complete file content to write"),
              }),
              execute: async ({ filename, content }) => {
                await sandbox.writeFile(filename, content, "utf-8");
                return `File written: ${filename} (${content.length} bytes)`;
              },
            }),
            readFile: tool({
              description:
                "Read the contents of a file from the sandbox filesystem.",
              inputSchema: z.object({
                filename: z.string().describe("File path to read"),
              }),
              execute: async ({ filename }) => {
                return await sandbox.readFile(filename, "utf-8");
              },
            }),
            bash: tool({
              description:
                "Execute a bash command in the sandbox. Use this to compile, run tests, execute scripts, or install dependencies.",
              inputSchema: z.object({
                command: z.string().describe("The bash command to execute"),
              }),
              execute: async ({ command }) => {
                const execResult = await sandbox.exec(
                  command,
                  workingDirectory,
                  BASH_TIMEOUT_MS,
                );
                return [
                  `Exit code: ${execResult.exitCode}`,
                  execResult.stdout
                    ? `Stdout:\n${execResult.stdout}`
                    : "(no stdout)",
                  execResult.stderr
                    ? `Stderr:\n${execResult.stderr}`
                    : "(no stderr)",
                ].join("\n");
              },
            }),
          },
          stopWhen: (ctx) => ctx.steps.length >= MAX_STEPS,
        });

        // Stream raw AI SDK events + emit lifecycle events for key tool results
        for await (const part of result.fullStream) {
          // Track writeFile completions → file.written event
          if (
            part.type === "tool-result" &&
            "toolName" in part &&
            part.toolName === "writeFile"
          ) {
            enqueue("file.written", {
              toolCallId:
                "toolCallId" in part ? part.toolCallId : "unknown",
              result: "result" in part ? part.result : undefined,
            });
          }

          // Track bash completions → execution.result event
          if (
            part.type === "tool-result" &&
            "toolName" in part &&
            part.toolName === "bash"
          ) {
            enqueue("execution.result", {
              toolCallId:
                "toolCallId" in part ? part.toolCallId : "unknown",
              result: "result" in part ? part.result : undefined,
            });
          }

          // Forward raw AI SDK event chunks
          enqueue(part.type, part as unknown as Record<string, unknown>);
        }

        // Emit finish event with usage metadata
        const [finishReason, usage] = await Promise.all([
          result.finishReason,
          result.usage,
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
        // 3. Cleanup: stop and destroy sandbox
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
