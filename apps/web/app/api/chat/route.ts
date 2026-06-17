import {
  createUIMessageStreamResponse,
  generateId,
  type InferUIMessageChunk,
} from "ai";
import { checkBotProtection } from "@/lib/botid";
import { start } from "workflow/api";
import type { WebAgentUIMessage } from "@/app/types";
import {
  claimChatActiveStreamId,
  compareAndSetChatActiveStreamId,
  createChatMessageIfNotExists,
  getChatById,
  isFirstChatMessage,
  touchChat,
  updateChat,
} from "@/lib/db/sessions";
import { createCancelableReadableStream } from "@/lib/chat/create-cancelable-readable-stream";
import { getServerSession } from "@/lib/session/get-server-session";
import {
  requireAuthenticatedUser,
  requireOwnedSessionChat,
} from "./_lib/chat-context";
import { parseChatRequestBody, requireChatIdentifiers } from "./_lib/request";
import { runAgentWorkflow } from "@/app/workflows/chat";
import { runAgentSwarm, type SwarmInput } from "@/app/workflows/agent-swarm";
import { persistAssistantMessagesWithToolResults } from "./_lib/persist-tool-results";
import { spawnSandboxStream } from "@/lib/sandbox/spawn";
import { loadRelevantSkills, buildSkillPromptAugmentation } from "@/lib/skills/router";
import { gateway, defaultModelLabel } from "@open-agents/agent";
import { streamText } from "ai";

type WebAgentUIMessageChunk = InferUIMessageChunk<WebAgentUIMessage>;

/**
 * Validate the NEPTUNE_TEST_TOKEN bearer auth for programmatic access.
 * Returns true if the request has a valid bearer token matching the env var.
 */
function isProgrammaticAuth(req: Request): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return false;
  }
  const bearerToken = authHeader.slice(7);
  // Accept NEPTUNE_INTERNAL_TOKEN, NEPTUNE_TEST_TOKEN, or NEPTUNE_E2E_TEST_TOKEN
  const candidates = [
    process.env.NEPTUNE_INTERNAL_TOKEN,
    process.env.NEPTUNE_TEST_TOKEN,
    process.env.NEPTUNE_E2E_TEST_TOKEN,
  ];
  return candidates.some((expected) => !!(expected && bearerToken === expected));
}

export async function POST(req: Request) {
  // Parse body first — needed to check sandbox mode before auth decision
  const parsedBody = await parseChatRequestBody(req);
  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const body = parsedBody.body;
  const isSandboxMode =
    body.mode === "sandbox" || body.sandboxOnly === true;
  const isChatOnlyMode = body.mode === "chat";

  // ---- CHAT-ONLY MODE: simple Q&A, no sandbox, no tools ----
  if (isChatOnlyMode) {
    // Accept Bearer token OR valid session cookie
    const isAuthorized =
      isProgrammaticAuth(req) ||
      (await getServerSession().then((s) => s?.user != null));

    if (!isAuthorized) {
      return Response.json(
        {
          error:
            "Chat mode requires Bearer token or valid session",
        },
        { status: 401 },
      );
    }

    const simpleMessages = extractSimpleMessages(
      body.messages as unknown as Record<string, unknown>[],
    );

    if (simpleMessages.length === 0) {
      return Response.json(
        { error: "At least one user message is required for chat mode" },
        { status: 400 },
      );
    }

    try {
      const { stream } = await spawnChatStream(
        simpleMessages,
        body.modelId,
      );

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    } catch (err) {
      console.error("[chat-only-error]", {
        message: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      });
      return Response.json(
        { error: "Failed to process chat request" },
        { status: 500 },
      );
    }
  }

  // ---- SANDBOX-ONLY MODE: programmatic auth + ephemeral sandbox ----
  if (isSandboxMode) {
    if (!isProgrammaticAuth(req)) {
      return Response.json(
        {
          error:
            "Sandbox mode requires Authorization: Bearer <NEPTUNE_TEST_TOKEN>",
        },
        { status: 401 },
      );
    }

    // Extract simple messages from whatever format was sent
    // Cast: sandbox callers send simple {role, content} objects, not WebAgentUIMessage[]
    const simpleMessages = extractSimpleMessages(
      body.messages as unknown as Record<string, unknown>[],
    );

    if (simpleMessages.length === 0) {
      return Response.json(
        { error: "At least one user message is required for sandbox mode" },
        { status: 400 },
      );
    }

    // Load relevant skills based on the user's prompt
    const lastUserMessage = simpleMessages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join("\n");

    const { skillContents } = await loadRelevantSkills(lastUserMessage);
    if (skillContents.length > 0) {
      const skillAugmentation = buildSkillPromptAugmentation(skillContents);
      // Prepend skill content as a system message
      simpleMessages.unshift({
        role: "system",
        content: skillAugmentation,
      });
    }

    try {
      const { sandboxId, stream } = await spawnSandboxStream(
        simpleMessages,
        body.modelId,
      );

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Sandbox-Id": sandboxId,
        },
      });
    } catch (err) {
      console.error("[chat-sandbox-error]", {
        message: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      });
      return Response.json(
        { error: "Failed to spawn sandbox" },
        { status: 500 },
      );
    }
  }

  // ---- EXISTING AUTHENTICATED CHAT FLOW ----
  // 1. Validate session
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return authResult.response;
  }
  const userId = authResult.userId;
  const session = await getServerSession();

  const botVerification = await checkBotProtection();
  if (botVerification.isBot) {
    return Response.json({ error: "Access denied" }, { status: 403 });
  }

  const { messages } = body;

  // 2. Require sessionId and chatId to ensure sandbox ownership verification
  const chatIdentifiers = requireChatIdentifiers(body);
  if (!chatIdentifiers.ok) {
    return chatIdentifiers.response;
  }
  const { sessionId, chatId } = chatIdentifiers;

  // 3. Verify session + chat ownership
  const chatContext = await requireOwnedSessionChat({
    userId,
    sessionId,
    chatId,
    forbiddenMessage: "Unauthorized",
  });
  if (!chatContext.ok) {
    return chatContext.response;
  }

  const { sessionRecord, chat } = chatContext;

  if (sessionRecord.status === "archived") {
    return Response.json({ error: "Session is archived" }, { status: 400 });
  }

  // Guard: if a workflow is already running for this chat, reconnect to it
  // instead of starting a duplicate. This prevents auto-submit from spawning
  // parallel workflows when the client sees completed tool calls mid-loop.
  if (chat.activeStreamId) {
    const existingStreamResolution = await reconcileExistingActiveStream(
      chatId,
      chat.activeStreamId,
    );

    if (existingStreamResolution.action === "resume") {
      return createUIMessageStreamResponse({
        stream: existingStreamResolution.stream,
        headers: { "x-workflow-run-id": existingStreamResolution.runId },
      });
    }

    if (existingStreamResolution.action === "conflict") {
      return Response.json(
        { error: "Another workflow is already running for this chat" },
        { status: 409 },
      );
    }
  }

  // ---- SWARM MODE: multi-specialist parallel execution ----
  const isSwarmMode = body.mode === "swarm";
  if (isSwarmMode) {
    // Validate swarm input — requires at least a user message
    const userMessages = (body.messages as WebAgentUIMessage[])
      .filter((m) => m.role === "user");
    if (userMessages.length === 0) {
      return Response.json(
        { error: "At least one user message is required for swarm mode" },
        { status: 400 },
      );
    }

    const lastUserMessage = userMessages.at(-1)!;
    const userPrompt = lastUserMessage.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n");

    // Build swarm tasks from decomposition (or single task for simple prompts)
    const swarmInput: SwarmInput = {
      tasks: [
        {
          id: "planner",
          description: `Analyze and plan: ${userPrompt.slice(0, 200)}`,
          context: "You are the architecture planner. Analyze the task and create a detailed implementation plan.",
        },
        {
          id: "coder",
          description: `Implement: ${userPrompt.slice(0, 200)}`,
          context: "You are the implementer. Write the actual code following the plan.",
        },
        {
          id: "reviewer",
          description: `Review implementation of: ${userPrompt.slice(0, 200)}`,
          context: "You are the code reviewer. Validate correctness, find bugs, and suggest improvements.",
        },
      ],
      maxStepsPerTask: 25,
    };

    try {
      await Promise.all([
        persistLatestUserMessage(chatId, messages),
        persistAssistantMessagesWithToolResults(chatId, messages),
      ]);

      const run = await start(runAgentSwarm, [swarmInput]);

      const claimed = await claimChatActiveStreamId(chatId, run.runId);
      if (!claimed) {
        try {
          const { getRun } = await import("workflow/api");
          getRun(run.runId).cancel();
        } catch { /* best-effort */ }
        return Response.json(
          { error: "Another workflow is already running for this chat" },
          { status: 409 },
        );
      }

      const stream = createCancelableReadableStream(
        run.getReadable<WebAgentUIMessageChunk>(),
      );

      return createUIMessageStreamResponse({
        stream,
        headers: {
          "x-workflow-run-id": run.runId,
          "x-swarm-mode": "true",
        },
      });
    } catch (err) {
      console.error("[chat-swarm-error]", {
        message: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      });
      return Response.json(
        { error: "Failed to start swarm workflow" },
        { status: 500 },
      );
    }
  }

  try {
    await Promise.all([
      persistLatestUserMessage(chatId, messages),
      persistAssistantMessagesWithToolResults(chatId, messages),
    ]);

    // Start the durable workflow
    const run = await start(runAgentWorkflow, [
      {
        messages,
        chatId,
        sessionId,
        userId,
        requestUrl: req.url,
        authSession: session ?? null,
        assistantId: generateId(),
        maxSteps: 500,
      },
    ]);

    // Idempotently claim the activeStreamId slot for the workflow we just
    // started. This succeeds both when the slot is still null and when the
    // workflow already self-claimed it from inside its first step.
    const claimed = await claimChatActiveStreamId(chatId, run.runId);

    if (!claimed) {
      // Another request or workflow run owns the slot — cancel our duplicate.
      try {
        const { getRun } = await import("workflow/api");
        getRun(run.runId).cancel();
      } catch {
        // Best-effort cleanup.
      }
      return Response.json(
        { error: "Another workflow is already running for this chat" },
        { status: 409 },
      );
    }

    const stream = createCancelableReadableStream(
      run.getReadable<WebAgentUIMessageChunk>(),
    );

    return createUIMessageStreamResponse({
      stream,
      headers: {
        "x-workflow-run-id": run.runId,
      },
    });
  } catch (err) {
    console.error("[chat-handler-error]", {
      message: err instanceof Error ? err.message : String(err),
      name: err instanceof Error ? err.name : "UnknownError",
      stack: err instanceof Error ? err.stack?.slice(0, 800) : undefined,
      chatId,
      sessionId,
      userId,
      timestamp: new Date().toISOString(),
    });
    return Response.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * Chat-only mode: lightweight Q&A with no sandbox provisioning.
 * Uses streamText with gateway model, no tools. Returns standard
 * UI message stream response compatible with useChat / DefaultChatTransport.
 */
const MAX_CHAT_OUTPUT_TOKENS = 4000;
const CHAT_ONLY_TIMEOUT_MS = 120_000; // 2 minute timeout for chat-only mode

async function spawnChatStream(
  messages: { role: string; content: string }[],
  modelId?: string,
): Promise<{ stream: ReadableStream<Uint8Array> }> {
  const model = gateway(modelId ?? defaultModelLabel);

  const coreMessages = messages.map((m) => ({
    role: m.role as "system" | "user" | "assistant",
    content: m.content,
  }));

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), CHAT_ONLY_TIMEOUT_MS);

  try {
    const result = streamText({
      model,
      messages: coreMessages,
      maxOutputTokens: MAX_CHAT_OUTPUT_TOKENS,
      abortSignal: abortController.signal,
    });

    const response = result.toUIMessageStreamResponse();

    // Clear timeout once stream starts — the consumer handles cleanup
    const originalBody = response.body;
    if (originalBody) {
      const reader = originalBody.getReader();
      const timedStream = new ReadableStream({
        async start(controller) {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                clearTimeout(timeoutId);
                controller.close();
                break;
              }
              controller.enqueue(value);
            }
          } catch {
            clearTimeout(timeoutId);
            controller.error(new Error("Chat stream interrupted"));
          }
        },
        cancel() {
          clearTimeout(timeoutId);
          abortController.abort();
          reader.cancel();
        },
      });
      return { stream: timedStream };
    }

    return { stream: response.body! };
  } catch {
    clearTimeout(timeoutId);
    throw new Error("Failed to initialize chat stream");
  }
}

type ExistingActiveStreamResolution =
  | {
      action: "resume";
      runId: string;
      stream: ReadableStream<WebAgentUIMessageChunk>;
    }
  | {
      action: "ready";
    }
  | {
      action: "conflict";
    };

const ACTIVE_STREAM_RECONCILIATION_MAX_ATTEMPTS = 3;

async function reconcileExistingActiveStream(
  chatId: string,
  activeStreamId: string,
): Promise<ExistingActiveStreamResolution> {
  const { getRun } = await import("workflow/api");
  let currentStreamId: string | null = activeStreamId;

  for (
    let attempt = 1;
    currentStreamId && attempt <= ACTIVE_STREAM_RECONCILIATION_MAX_ATTEMPTS;
    attempt++
  ) {
    try {
      const existingRun = getRun(currentStreamId);
      const status = await existingRun.status;
      if (status === "running" || status === "pending") {
        return {
          action: "resume",
          runId: currentStreamId,
          stream: createCancelableReadableStream(
            existingRun.getReadable<WebAgentUIMessageChunk>(),
          ),
        };
      }
    } catch {
      // Workflow not found or inaccessible — try to clear the stale stream ID.
    }

    const cleared = await compareAndSetChatActiveStreamId(
      chatId,
      currentStreamId,
      null,
    );
    if (cleared) {
      return { action: "ready" };
    }

    const latestChat = await getChatById(chatId);
    currentStreamId = latestChat?.activeStreamId ?? null;
  }

  return currentStreamId ? { action: "conflict" } : { action: "ready" };
}

/**
 * Extract simple {role, content} messages from WebAgentUIMessage[].
 * Handles both simple format (from API callers) and AI SDK UI format.
 */
function extractSimpleMessages(
  messages: Record<string, unknown>[],
): { role: string; content: string }[] {
  return messages
    .map((m) => {
      // If already simple format: { role: "user", content: "..." }
      if (
        typeof m.content === "string" &&
        typeof m.role === "string" &&
        !Array.isArray(m.parts)
      ) {
        return {
          role: m.role as string,
          content: m.content as string,
        };
      }

      // If AI SDK UI message format with parts array
      const parts = m.parts;
      if (Array.isArray(parts)) {
        const textParts = parts
          .filter((p) => {
            if (typeof p !== "object" || p === null) return false;
            return "type" in p && p.type === "text" && "text" in p;
          })
          .map((p) => (p as { text: string }).text);
        return {
          role: typeof m.role === "string" ? m.role : "user",
          content: textParts.join("\n"),
        };
      }

      return null;
    })
    .filter(
      (m): m is { role: string; content: string } =>
        m !== null && m.content.length > 0,
    );
}

async function persistLatestUserMessage(
  chatId: string,
  messages: WebAgentUIMessage[],
): Promise<void> {
  const latestMessage = messages[messages.length - 1];
  if (!latestMessage || latestMessage.role !== "user") {
    return;
  }

  try {
    const created = await createChatMessageIfNotExists({
      id: latestMessage.id,
      chatId,
      role: "user",
      parts: latestMessage,
    });

    if (!created) {
      return;
    }

    await touchChat(chatId);

    const shouldSetTitle = await isFirstChatMessage(chatId, created.id);
    if (!shouldSetTitle) {
      return;
    }

    const textContent = latestMessage.parts
      .filter(
        (part): part is { type: "text"; text: string } => part.type === "text",
      )
      .map((part) => part.text)
      .join(" ")
      .trim();

    if (textContent.length === 0) {
      return;
    }

    const title =
      textContent.length > 80 ? `${textContent.slice(0, 80)}...` : textContent;
    await updateChat(chatId, { title });
  } catch (error) {
    console.error("Failed to persist user message:", error);
  }
}
