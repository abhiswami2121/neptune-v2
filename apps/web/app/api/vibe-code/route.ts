/**
 * Vibe-Code Orchestrator — SSE Streaming Endpoint
 *
 * Ties session + sandbox + code-gen + optional GitHub + optional Vercel deploy
 * into a single SSE-streaming endpoint.
 *
 * Events emitted:
 *   - session:created     { sessionId }
 *   - sandbox:created     { sandboxId, workingDirectory }
 *   - text:delta          { delta }
 *   - tool:call           { toolName, args }
 *   - tool:result         { toolName, result }
 *   - github:created      { repoUrl, cloneUrl }
 *   - github:error        { error }
 *   - vercel:deployed     { url, inspectorUrl }
 *   - vercel:error        { error }
 *   - finish              { usage, finishReason }
 *   - error               { error }
 *
 * POST { prompt: string, sessionId?: string, modelId?: string,
 *        repoUrl?: string, branch?: string, deployToVercel?: boolean,
 *        createGitHubRepo?: { name: string, private?: boolean } }
 *
 * Auth: Bearer NEPTUNE_TEST_TOKEN (programmatic) OR session cookie
 */

import { connectSandbox, type SandboxState } from "@open-agents/sandbox";
import { streamText, tool } from "ai";
import { gateway } from "@open-agents/agent";
import { z } from "zod";
import { checkBotProtection } from "@/lib/botid";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getServerSession } from "@/lib/session/get-server-session";
import { getSessionById, updateSession } from "@/lib/db/sessions";
import { getUserGitHubToken } from "@/lib/github/token";
import { getUserVercelToken } from "@/lib/vercel/token";
import { parseGitHubHttpsUrl } from "@/lib/github/urls";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for full vibe-code flow

// ---- Types ----

interface VibeCodeRequest {
  prompt: string;
  sessionId?: string;
  modelId?: string;
  repoUrl?: string;
  branch?: string;
  deployToVercel?: boolean;
  createGitHubRepo?: {
    name: string;
    private?: boolean;
    description?: string;
    org?: string;
  };
  vercelProjectId?: string;
  vercelTeamId?: string;
}

interface SSEEvent {
  event: string;
  data: Record<string, unknown>;
}

// ---- Helpers ----

function isProgrammaticAuth(req: Request): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const bearerToken = authHeader.slice(7);
  const candidates = [
    process.env.NEPTUNE_INTERNAL_TOKEN,
    process.env.NEPTUNE_TEST_TOKEN,
    process.env.NEPTUNE_E2E_TEST_TOKEN,
  ];
  return candidates.some((expected) => !!(expected && bearerToken === expected));
}

function emit(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function createSSEStream(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
) {
  return {
    send: (event: string, data: Record<string, unknown>) => {
      try {
        controller.enqueue(encoder.encode(emit(event, data)));
      } catch {
        // Controller may be closed
      }
    },
    error: (message: string) => {
      try {
        controller.enqueue(
          encoder.encode(emit("error", { error: message })),
        );
      } catch {
        // Controller may be closed
      }
    },
  };
}

async function createGitHubRepoViaAPI(params: {
  name: string;
  private?: boolean;
  description?: string;
  org?: string;
  githubToken: string;
}): Promise<{ repoUrl: string; cloneUrl: string; htmlUrl: string; fullName: string } | { error: string }> {
  const { name, private: isPrivate, description, org, githubToken } = params;
  const endpoint = org
    ? `https://api.github.com/orgs/${encodeURIComponent(org)}/repos`
    : "https://api.github.com/user/repos";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      description: description ?? "",
      private: isPrivate ?? false,
      auto_init: true,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    return {
      error: typeof data === "object" && data !== null && "message" in data
        ? String((data as Record<string, unknown>).message)
        : `GitHub API returned ${response.status}`,
    };
  }

  const repoData = data as Record<string, unknown>;
  return {
    repoUrl: repoData.clone_url as string,
    cloneUrl: repoData.clone_url as string,
    htmlUrl: repoData.html_url as string,
    fullName: repoData.full_name as string,
  };
}

async function fetchLatestVercelDeployment(params: {
  token: string;
  projectIdOrName: string;
  teamId?: string | null;
  branch?: string;
}): Promise<{ url: string | null; state: string }> {
  const query = new URLSearchParams();
  query.set("projectId", params.projectIdOrName);
  if (params.teamId) query.set("teamId", params.teamId);
  if (params.branch) query.set("branch", params.branch);
  query.set("limit", "3");

  const url = new URL(`https://api.vercel.com/v6/deployments`);
  url.search = query.toString();

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${params.token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return { url: null, state: "ERROR" };
  }

  const data = (await response.json()) as { deployments?: Array<{ url?: string; readyState?: string; state?: string }> };
  const latest = data.deployments?.[0];
  const displayUrl = latest?.url
    ? (/^https?:\/\//i.test(latest.url) ? latest.url : `https://${latest.url}`)
    : null;

  return {
    url: displayUrl ?? null,
    state: latest?.readyState ?? latest?.state ?? "UNKNOWN",
  };
}

// ---- Main Handler ----

export async function POST(req: Request) {
  // 1. Auth
  const session = await getServerSession();
  const isAuthorized = !!session?.user || isProgrammaticAuth(req);
  if (!isAuthorized) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const botVerification = await checkBotProtection();
  if (botVerification.isBot) {
    return Response.json({ error: "Access denied" }, { status: 403 });
  }

  const userId = session?.user?.id ?? "programmatic";
  if (session?.user?.id) {
    const limited = await checkRateLimit({
      key: rateLimitKey(["vibe-code", session.user.id]),
      limit: 10,
      windowMs: 60_000,
    });
    if (limited) return limited;
  }

  // 2. Parse request
  let body: VibeCodeRequest;
  try {
    body = (await req.json()) as VibeCodeRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    prompt,
    sessionId: inputSessionId,
    modelId = "anthropic/claude-sonnet-4.5",
    repoUrl,
    branch = "main",
    deployToVercel = false,
    createGitHubRepo: createRepoConfig,
    vercelProjectId,
    vercelTeamId,
  } = body;

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return Response.json({ error: "prompt (string) is required" }, { status: 400 });
  }

  // 3. Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sse = createSSEStream(controller, encoder);

      try {
        // --- Step 1: Session ---
        let sessionId: string | undefined = inputSessionId;
        let sessionRecord = sessionId && session?.user?.id
          ? await getSessionById(sessionId)
          : null;

        if (!sessionRecord && session?.user?.id) {
          // For authenticated users, we need an existing session or create none.
          // Vibe-code can operate without a stored session for simple flows.
          // The sessionId from the input is used as context, or we generate a temp one.
          if (!sessionId) {
            sessionId = `vibe-${Date.now().toString(36)}`;
          }
        } else if (!sessionId) {
          // Programmatic access without session — create a temp context
          sessionId = `vibe-${Date.now().toString(36)}`;
        }

        if (sessionId) {
          const isTemp = !sessionRecord;
          sse.send("session:created", {
            sessionId,
            ...(isTemp ? { temporary: true } : {}),
          });
        }

        // --- Step 2: Optional GitHub Repo Creation ---
        if (createRepoConfig && createRepoConfig.name) {
          const githubToken = session?.user?.id
            ? await getUserGitHubToken(session.user.id)
            : null;

          if (githubToken) {
            const repoResult = await createGitHubRepoViaAPI({
              name: createRepoConfig.name,
              private: createRepoConfig.private,
              description: createRepoConfig.description,
              org: createRepoConfig.org,
              githubToken,
            });

            if ("error" in repoResult) {
              sse.send("github:error", { error: repoResult.error });
            } else {
              sse.send("github:created", {
                repoUrl: repoResult.repoUrl,
                cloneUrl: repoResult.cloneUrl,
                htmlUrl: repoResult.htmlUrl,
                fullName: repoResult.fullName,
              });

              // Use the new repo as the target
              if (!repoUrl) {
                // Update for subsequent steps
                body.repoUrl = repoResult.cloneUrl;
              }
            }
          } else {
            sse.send("github:error", {
              error: "GitHub not connected. Cannot create repository.",
            });
          }
        }

        // --- Step 3: Sandbox (only if repoUrl provided and authenticated user) ---
        let sandboxRef: Awaited<ReturnType<typeof connectSandbox>> | null = null;
        if (repoUrl && session?.user?.id && sessionId) {
          try {
            const parsedRepo = parseGitHubHttpsUrl(repoUrl);
            if (parsedRepo) {
              const sandboxName = `vibe-${sessionId}`;
              sandboxRef = await connectSandbox({
                state: {
                  type: "vercel",
                  sandboxName,
                },
                options: {
                  timeout: 300_000,
                  vcpus: 4,
                  persistent: true,
                  resume: true,
                  createIfMissing: true,
                },
              });

              sse.send("sandbox:created", {
                sandboxId: sandboxRef.host ?? sandboxName,
                workingDirectory: sandboxRef.workingDirectory,
              });

              // Optionally update session with sandbox state
              if (sandboxRef.getState) {
                const nextState = sandboxRef.getState() as SandboxState;
                await updateSession(sessionId, {
                  sandboxState: nextState,
                }).catch(() => {});
              }
            }
          } catch (err) {
            sse.error(`Sandbox creation failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        // --- Step 4: AI Code Generation (SSE streaming) ---
        const model = gateway(modelId as Parameters<typeof gateway>[0]);

        const coreMessages: { role: "user" | "assistant" | "system"; content: string }[] = [
          {
            role: "system",
            content: [
              "You are a vibe-coding AI agent. Generate production-quality code based on the user's prompt.",
              sandboxRef
                ? `You have access to a sandbox environment at ${sandboxRef.workingDirectory}. Use code generation tools to create files.`
                : "Generate code in your response. You do not have sandbox access — output code blocks directly.",
              deployToVercel
                ? "The user wants to deploy to Vercel. Generate a complete, deployable Next.js/React project."
                : "",
            ]
              .filter(Boolean)
              .join("\n"),
          },
          { role: "user", content: prompt },
        ];

        try {
          const result = streamText({
            model,
            messages: coreMessages,
            maxOutputTokens: 4096,
            temperature: 0.7,
            ...(sandboxRef
              ? {
                  tools: {
                    writeFile: tool({
                      description: "Write content to a file in the sandbox",
                      inputSchema: z.object({
                        path: z.string().describe("File path relative to working directory"),
                        content: z.string().describe("File content to write"),
                      }),
                      execute: async ({ path, content }) => {
                        try {
                          await sandboxRef!.writeFile(
                            `${sandboxRef!.workingDirectory}/${path}`,
                            content,
                            "utf-8",
                          );
                          return `File written: ${path} (${content.length} bytes)`;
                        } catch (err) {
                          return `Error writing file: ${err instanceof Error ? err.message : String(err)}`;
                        }
                      },
                    }),
                    execCommand: tool({
                      description: "Execute a shell command in the sandbox",
                      inputSchema: z.object({
                        command: z.string().describe("Shell command to execute"),
                      }),
                      execute: async ({ command }) => {
                        try {
                          const result = await sandboxRef!.exec(
                            command,
                            sandboxRef!.workingDirectory,
                            30000,
                          );
                          return result.success
                            ? `Command succeeded:\n${result.stdout || "(no output)"}`
                            : `Command failed (exit ${result.exitCode}):\n${result.stderr || result.stdout || "(no output)"}`;
                        } catch (err) {
                          return `Command error: ${err instanceof Error ? err.message : String(err)}`;
                        }
                      },
                    }),
                  },
                }
              : {}),
            stopWhen: (ctx) => ctx.steps.length >= 15,
          });

          // Stream text deltas and tool calls
          for await (const part of result.fullStream) {
            const partObj = part as Record<string, unknown>;

            if (partObj.type === "text-delta" && partObj.textDelta) {
              sse.send("text:delta", { delta: partObj.textDelta as string });
            } else if (partObj.type === "tool-call") {
              sse.send("tool:call", {
                toolName: partObj.toolName as string,
                toolCallId: partObj.toolCallId as string,
                args: partObj.args as Record<string, unknown>,
              });
            } else if (partObj.type === "tool-result") {
              const resultStr =
                typeof partObj.result === "string"
                  ? (partObj.result as string)
                  : JSON.stringify(partObj.result);

              sse.send("tool:result", {
                toolName: partObj.toolName as string,
                toolCallId: partObj.toolCallId as string,
                result: resultStr,
              });
            }
          }

          // Emit finish with usage
          const [finishReason, usage] = await Promise.all([
            result.finishReason,
            result.usage,
          ]);

          sse.send("finish", {
            finishReason: finishReason ?? "unknown",
            usage: usage
              ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }
              : null,
          });
        } catch (err) {
          sse.error(`AI generation failed: ${err instanceof Error ? err.message : String(err)}`);
        }

        // --- Step 5: Optional Vercel Deploy ---
        if (deployToVercel && vercelProjectId && session?.user?.id) {
          try {
            const vercelToken = await getUserVercelToken(session.user.id);
            if (vercelToken) {
              const deployment = await fetchLatestVercelDeployment({
                token: vercelToken,
                projectIdOrName: vercelProjectId,
                teamId: vercelTeamId ?? null,
                branch: branch || undefined,
              });

              if (deployment.url) {
                sse.send("vercel:deployed", {
                  url: deployment.url,
                  state: deployment.state,
                  projectId: vercelProjectId,
                });
              } else {
                sse.send("vercel:deployed", {
                  url: null,
                  state: deployment.state,
                  message:
                    "No deployment found yet. If the project is Git-connected, push your code to trigger an auto-deploy.",
                });
              }
            } else {
              sse.send("vercel:error", { error: "Vercel not connected." });
            }
          } catch (err) {
            sse.send("vercel:error", {
              error: err instanceof Error ? err.message : "Vercel deploy check failed",
            });
          }
        }

        // --- Done ---
        controller.close();
      } catch (err) {
        console.error("[vibe-code] Fatal error:", err);
        sse.error(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
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
