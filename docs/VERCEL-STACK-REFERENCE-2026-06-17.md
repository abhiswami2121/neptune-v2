# Vercel Stack Reference — Canonical Architecture for Neptune V2

**Status:** `[Stream 1] VERCEL STACK DEEP RESEARCH COMPLETE`
**Based on:** open-agents Vercel template, AI SDK v6.0.194, Workflow SDK v5.0.0-beta.4/5, Vercel docs (Jun 17, 2026)

---

## 0. Stack Overview

| Layer | Package | Version | Purpose |
|-------|---------|---------|---------|
| AI SDK Core | `ai` | `^6.0.194` (catalog) | `streamText`, `ToolLoopAgent`, `tool()`, `createGateway()` |
| AI SDK React | `@ai-sdk/react` | `^3.0.167` (catalog) | `useChat`, `DefaultChatTransport`, UI streaming |
| AI SDK Anthropic | `@ai-sdk/anthropic` | `^3.0.70` (catalog) | Anthropic provider adapter |
| AI SDK OpenAI | `@ai-sdk/openai` | `^3.0.53` (catalog) | OpenAI provider adapter |
| Workflow SDK | `workflow` | `5.0.0-beta.5` | `'use workflow'`, `'use step'`, `start()`, `getWritable()` |
| Workflow AI | `@workflow/ai` | `5.0.0-beta.4` | AI SDK + Workflow integration |
| Next.js | `next` | `16.2.1` | App Router, Route Handlers, SSR |
| React | `react` | `19.2.3` | UI components |
| Better Auth | `better-auth` | `^1.6.5` | Vercel + GitHub OAuth |
| Drizzle | `drizzle-orm` | `^0.45.1` | PostgreSQL ORM |
| Sandbox | `@open-agents/sandbox` | `workspace:*` | Vercel Sandbox abstraction |

---

## 1. AI SDK Core — `streamText` API

### 1.1 Import Path
```typescript
import { streamText, generateText, tool, stepCountIs } from "ai";
```

### 1.2 Complete `streamText` Options
```typescript
const result = streamText({
  model: gateway("deepseek/deepseek-v4-pro"),  // LanguageModel
  messages: coreMessages,                       // ModelMessage[]
  maxOutputTokens: 4096,                        // optional, max tokens
  tools: {                                      // ToolSet
    readFile: tool({
      description: "Read a file",
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => readFile(path),
    }),
  },
  stopWhen: stepCountIs(5),                     // multi-step tool loop control
  toolChoice: "auto",                           // 'auto' | 'required' | 'none'
  experimental_context: { ... },                // passed to tool execute()
  onError: ({ error }) => { ... },              // error callback
  onChunk: ({ chunk }) => { ... },              // every chunk
  onFinish: ({ text, finishReason, usage, steps, totalUsage }) => { ... },
  onStepFinish: ({ toolCalls, toolResults, ... }) => { ... },
});
```

### 1.3 Return Type — `streamText` Result
| Property | Type | Description |
|----------|------|-------------|
| `result.textStream` | `ReadableStream & AsyncIterable` | text-only stream (immediate) |
| `result.fullStream` | `AsyncIterable<StreamPart>` | typed events (immediate) |
| `result.toUIMessageStreamResponse()` | `Response` | SSE response for `useChat` |
| `result.text` | `Promise<string>` | final text |
| `result.finishReason` | `Promise<FinishReason>` | "stop" \| "tool-calls" \| "length" \| "error" \| "other" |
| `result.usage` | `Promise<LanguageModelUsage>` | final step usage |
| `result.totalUsage` | `Promise<LanguageModelUsage>` | all steps usage |
| `result.steps` | `Promise<StepResult[]>` | per-step details |
| `result.response` | `Promise<ResponseMetadata>` | response metadata |
| `result.toolCalls` | `Promise<ToolCall[]>` | last step tool calls |
| `result.toolResults` | `Promise<ToolResult[]>` | last step tool results |

### 1.4 `fullStream` Event Types
| Event | When |
|-------|------|
| `start` | Stream begins |
| `start-step` | Each step begins |
| `text-start`, `text-delta`, `text-end` | Text output |
| `reasoning-start`, `reasoning-delta`, `reasoning-end` | Model reasoning |
| `tool-call` | Tool invocation requested |
| `tool-input-start`, `tool-input-delta`, `tool-input-end` | Tool input streaming |
| `tool-result` | Tool execution completed |
| `tool-error` | Tool execution failed |
| `finish-step` | Step completed |
| `finish` | Full generation done |
| `error` | Stream error |
| `raw` | Raw provider value |

---

## 2. AI SDK Core — `ToolLoopAgent` API

### 2.1 Import Path
```typescript
import { ToolLoopAgent, stepCountIs, isLoopFinished, hasToolCall, type ToolSet } from "ai";
```

### 2.2 Constructor Parameters
```typescript
const agent = new ToolLoopAgent({
  model: defaultModel,                    // LanguageModel (default model)
  instructions: systemPrompt,             // string — system prompt
  tools: {                                // ToolSet
    read: readFileTool(),
    write: writeFileTool(),
    bash: bashTool(),
    // ...
  },
  stopWhen: stepCountIs(1),              // stop condition
  
  // Optional lifecycle hooks:
  prepareStep: ({ messages, model, steps }) => {
    // Modify messages before each step (e.g., add cache control)
    return { messages: addCacheControl({ messages, model }) };
  },
  
  prepareCall: ({ options, messages, tools, ...settings }) => {
    // Full customization: model, tools, instructions, context
    // Validates options via callOptionsSchema
    return {
      ...settings,
      model: callModel,
      tools: activeTools,
      instructions: prompt,
    };
  },
  
  callOptionsSchema: z.object({           // Zod schema for prepareCall options
    sandbox: z.custom<AgentSandboxContext>(),
    model: z.custom<OpenAgentModelInput>().optional(),
    customInstructions: z.string().optional(),
  }),
});
```

### 2.3 `stream()` Method
```typescript
const result = await agent.stream({
  messages: modelMessages,          // ModelMessage[] — conversation history
  options: {                        // validated by callOptionsSchema
    sandbox: { state, workingDirectory, currentBranch },
    model: "deepseek/deepseek-v4-pro",
  },
  abortSignal: controller.signal,   // AbortSignal for cancellation
});

// result.toUIMessageStream() returns stream of UIMessageChunk
for await (const part of result.toUIMessageStream<WebAgentUIMessage>({
  originalMessages,
  generateMessageId: () => messageId,
  sendStart: false,
  sendFinish: false,
  messageMetadata: ({ part }) => metadata,
  onFinish: ({ responseMessage }) => { ... },
})) {
  const writer = writable.getWriter();
  await writer.write(part);
  writer.releaseLock();
}
```

### 2.4 `stopWhen` Conditions
| Built-in | Signature | Description |
|----------|-----------|-------------|
| `stepCountIs(n)` | `(n: number) => StopCondition` | Stop after N model calls |
| `hasToolCall(name)` | `(name: string) => StopCondition` | Stop when tool is called |
| `isLoopFinished()` | `() => StopCondition` | Stop when model finishes naturally |

**Default:** `stepCountIs(20)` when not specified.

---

## 3. AI Gateway BYOK — `createGateway()` Pattern

### 3.1 Import Path
```typescript
import { createGateway, wrapLanguageModel, defaultSettingsMiddleware } from "ai";
```

### 3.2 Basic Usage (Environment-based)
```typescript
// Reads AI_GATEWAY_API_KEY from process.env automatically
const gateway = createGateway({
  headers: {
    "http-referer": "https://my-app.vercel.app",
    "x-title": "My App",
  },
});

const model = gateway("deepseek/deepseek-v4-pro");
```

### 3.3 Explicit Config
```typescript
const gateway = createGateway({
  baseURL: "https://my-custom-gateway.com/v1",
  apiKey: process.env.AI_GATEWAY_API_KEY,
  headers: { "http-referer": "..." },
});
```

### 3.4 Request-Scoped BYOK
```typescript
import type { GatewayProviderOptions } from "@ai-sdk/gateway";

const result = await generateText({
  model: gateway("anthropic/claude-sonnet-4.6"),
  prompt: "...",
  providerOptions: {
    gateway: {
      byok: {
        anthropic: [{ apiKey: process.env.ANTHROPIC_API_KEY }],
        openai: [{ apiKey: process.env.OPENAI_API_KEY }],
      },
    } satisfies GatewayProviderOptions,
  },
});
```

### 3.5 Model ID Format
```
{provider}/{model-name}
```
Examples: `deepseek/deepseek-v4-pro`, `anthropic/claude-sonnet-4.6`, `openai/gpt-5.3-codex`, `google/gemini-3-flash`

### 3.6 `wrapLanguageModel` Pattern
```typescript
model = wrapLanguageModel({
  model,
  middleware: defaultSettingsMiddleware({
    settings: {
      providerOptions: {
        anthropic: {
          thinking: { type: "adaptive" },
          effort: "medium",
        },
        openai: {
          store: false,
        },
      },
    },
  }),
});
```

---

## 4. Workflow SDK v5

### 4.1 Import Paths
```typescript
// Workflow function imports
import { getWorkflowMetadata, getWritable, sleep, FatalError } from "workflow";

// API / HTTP-side imports
import { start, getRun } from "workflow/api";

// Next.js integration
import { withWorkflow } from "workflow/next";
```

### 4.2 The `"use workflow"` Directive
```typescript
export async function runAgentWorkflow(options: Options) {
  "use workflow";  // ← marks this as durable workflow
  
  const { workflowRunId } = getWorkflowMetadata();
  const writable = getWritable<UIMessageChunk>();
  
  // Workflow body — can call steps, sleep, etc.
}
```

**Key properties:**
- Function becomes durable — survives deployments, crashes
- State is persisted at each `"use step"` boundary
- Can be `sleep()`ed for minutes or months
- Execution is deterministic replay (no side effects in workflow body)

### 4.3 The `"use step"` Directive
```typescript
async function loadSession(chatId: string) {
  "use step";  // ← step boundary — result is cached
  
  const chat = await getChatById(chatId);
  if (!chat) throw new Error("Chat not found");
  return chat;
}
```

**Key properties:**
- Result is cached/memoized — if replay hits this, cached value is returned
- Side effects (DB reads, API calls) go inside steps
- Steps must be pure from the workflow's perspective
- **Stream operations must happen in steps** (not in workflow body)

### 4.4 Streaming API

**Writing (from step):**
```typescript
const writable = getWritable<UIMessageChunk>();
const writer = writable.getWriter();
try {
  await writer.write(chunk);
} finally {
  writer.releaseLock();
}
```

**Reading (from HTTP handler):**
```typescript
const run = await start(runAgentWorkflow, [options]);
const stream = run.getReadable<UIMessageChunk>();

// Reconnect with startIndex for resume
const stream = run.getReadable<UIMessageChunk>({ startIndex: -10 });

return new Response(stream, {
  headers: { "Content-Type": "text/event-stream" },
});
```

**Named streams (multiple channels):**
```typescript
const logStream = getWritable<LogEntry>({ namespace: "logs" });
const metricsStream = getWritable<Metric>({ namespace: "metrics" });

// Consumer
run.getReadable<LogEntry>({ namespace: "logs" });
```

### 4.5 Run Lifecycle
```typescript
const run = await start(workflow, [args]);
// run.runId — unique ID
// run.status — Promise<"pending" | "running" | "completed" | "failed" | "cancelled">
// run.getReadable<T>() — readable stream
// run.cancel() — cancel the run

// Direct access by ID
const existingRun = getRun(runId);
const status = await existingRun.status;
```

### 4.6 `sleep()` API
```typescript
import { sleep } from "workflow";

// Absolute date
await sleep(new Date("2026-06-18T09:00:00Z"));

// Relative duration
await sleep("30m");    // 30 minutes
await sleep("2h");     // 2 hours
await sleep("7d");     // 7 days

// From timestamp
await sleep({ seconds: 3600 });
```

### 4.7 Error Handling
```typescript
import { FatalError } from "workflow";

// FatalError: stops workflow, marks as failed
throw new FatalError("Cannot proceed without valid sandbox");

// Regular Error: step fails but workflow continues
throw new Error("Transient database error");
```

---

## 5. Vercel Sandbox

### 5.1 Import Path (in V2)
```typescript
import { VercelSandbox } from "@open-agents/sandbox/vercel";
import { connectSandbox, type SandboxState } from "@open-agents/sandbox";
```

### 5.2 Sandbox Lifecycle
```typescript
// Create ephemeral sandbox
const sandbox = await VercelSandbox.create({
  timeout: 5 * 60 * 1000,    // 5 minutes
  vcpus: 1,                    // CPU cores
  persistent: false,           // ephemeral
  skipGitWorkspaceBootstrap: true,
});

// Create persistent sandbox (default)
const sandbox = await VercelSandbox.create({
  timeout: 30 * 60 * 1000,    // 30 minutes
  snapshotId: "snap_xxx",     // optional base snapshot
});

// Connect to existing sandbox
const sandbox = await connectSandbox(sandboxState, {
  ports: [3000, 5173, 4321, 8000],
});

// Operations
await sandbox.readFile("src/app.ts", "utf-8");
await sandbox.writeFile("src/app.ts", content, "utf-8");
await sandbox.exec("npm install", workingDirectory, 60000);
await sandbox.exec("npm run dev", workingDirectory, 0);  // 0 = no timeout

// Lifecycle
const { sandboxId, workingDirectory, currentBranch } = sandbox;
await sandbox.stop();  // persistent: auto-saves state
```

### 5.3 Authentication
- **Production (Vercel):** Automatic via `VERCEL_OIDC_TOKEN`
- **Local development:** `vercel link && vercel env pull` to get development token
- **External/CI:** Access tokens via `VERCEL_SANDBOX_TOKEN`

---

## 6. Canonical Chat → Workflow → Agent → Stream Cycle

### 6.1 Complete Flow
```
1. CLIENT: useChat({ transport: new DefaultChatTransport() })
   ↓
2. POST /api/chat
   ├─ Auth: requireAuthenticatedUser() → Better Auth session
   ├─ Ownership: requireOwnedSessionChat() → sessionId + chatId
   ├─ Active Stream Check: reconcileExistingActiveStream()
   │   └─ Resume if found, 409 conflict if busy
   ├─ Persist: persistLatestUserMessage() + persistAssistantMessagesWithToolResults()
   ├─ Start Workflow: start(runAgentWorkflow, [{ messages, chatId, ..., maxSteps: 500 }])
   ├─ Claim Slot: claimChatActiveStreamId(chatId, run.runId)
   └─ Return Stream: createUIMessageStreamResponse({ stream: run.getReadable() })
   
3. WORKFLOW: runAgentWorkflow() ("use workflow")
   ├─ Self-claim: claimActiveStream() (from inside workflow)
   ├─ Resolve Models: resolveChatModelRuntime() ("use step")
   ├─ Resolve Sandbox: resolveChatSandboxRuntime() ("use step")
   │   ├─ getReadySessionSandbox() → kick/wait for provisioning if needed
   │   ├─ connectSandbox() → Vercel Sandbox connection
   │   └─ discoverSkills() → project skills from sandbox
   ├─ FOR each step (max 500):
   │   └─ runAgentStep() ("use step")
   │       ├─ agent.stream({ messages, options }) → ToolLoopAgent
   │       │   ├─ prepareCall: gateway(modelId) → AI Gateway BYOK
   │       │   ├─ Model call → streamText → AI Gateway → Provider
   │       │   ├─ Tool calls → bash/read/write/grep/glob → Sandbox
   │       │   └─ stopWhen: stepCountIs(1) → returns after 1 model cycle
   │       ├─ For each part in result.toUIMessageStream():
   │       │   └─ writable.write(part) → Stream to client
   │       └─ Return: { responseMessage, finishReason, usage }
   │   └─ shouldContinue? finishReason === "tool-calls" && !pauseForToolInteraction
   ├─ Post-finish: auto-commit → auto-PR → Slack notify
   └─ Cleanup: clearActiveStream + sendFinish + closeStream
   
4. CLIENT READS: useChat consumes SSE stream
   ├─ text-start → text-delta → text-end (model output)
   ├─ tool-call → tool-result (tool execution)
   └─ finish → stream ends
```

### 6.2 Key Contracts

**Chat Route → Workflow:** `start(workflowFn, [args])` starts durable execution. Returns immediately with `runId`.

**Workflow → Client:** `getWritable<UIMessageChunk>()` from step → `writer.write(part)` → `run.getReadable()` in HTTP handler.

**Client Reconnect:** `GET /api/chat/[chatId]/stream?startIndex=N` → `getRun(activeStreamId).getReadable({ startIndex })` → resumes from position.

**Cancel:** Client sends `POST /api/chat/[chatId]/stop` → `getRun(activeStreamId).cancel()` → workflow receives abort signal.

### 6.3 Error Contract
| Error Location | How It Manifests |
|---------------|-----------------|
| Model call fails | `finishReason: "error"` + `fullStream` error event |
| Gateway timeout | Model call hangs → workflow step timeout → "other" finish reason |
| Sandbox provision fail | `resolveChatSandboxRuntime` throws → workflow fails |
| Tool execution error | `tool-error` event in `fullStream` |
| Workflow cancelled | `AbortError` → `runAgentStep` returns `stepWasAborted: true` |

---

## 7. Our Fork's Divergences from Open-Agents Canonical

| Feature | Open-Agents Canonical | Neptune V2 Fork |
|---------|----------------------|-----------------|
| Chat-only mode | ❌ Not present | ✅ `mode: "chat"` — lightweight Q&A |
| Sandbox-only mode | ❌ Not present | ✅ `mode: "sandbox"` — programmatic access |
| Programmatic auth | ❌ Session only | ✅ `NEPTUNE_TEST_TOKEN` Bearer auth |
| Agent Swarm | ❌ Not present | ✅ `runAgentSwarm()` parallel sub-agents |
| Chat handoff | ❌ Not present | ✅ Neptune Chat → V2 `spawnCodingAgent` |
| Slack notifications | ❌ Not present | ✅ `notifySlack()` lifecycle events |
| Agent sessions | ❌ Not present | ✅ `notifyAgentSession()` tracking |
| Gateway model selection | Basic | Extended with preferences, variants, auto-mode |
| Managed trial limits | Present | Removed (not applicable) |

---

## 8. Environment Variables Reference

### 8.1 Required for Runtime
```env
POSTGRES_URL=             # Neon PostgreSQL connection string
BETTER_AUTH_SECRET=       # 32-byte random base64 for session signing
AI_GATEWAY_API_KEY=       # Vercel AI Gateway key (format: vck_...)
```

### 8.2 Required for Sign-in
```env
NEXT_PUBLIC_VERCEL_APP_CLIENT_ID=
VERCEL_APP_CLIENT_SECRET=
```

### 8.3 Required for GitHub Integration
```env
NEXT_PUBLIC_GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=
NEXT_PUBLIC_GITHUB_APP_SLUG=
GITHUB_WEBHOOK_SECRET=
```

### 8.4 Required for Neptune Integration
```env
NEPTUNE_INTERNAL_TOKEN=   # Internal API auth
NEPTUNE_TEST_TOKEN=       # Programmatic/sandbox auth
VERCEL_TOKEN=             # Vercel personal access token
VERCEL_TEAM_ID=           # Vercel team slug
GITHUB_TOKEN=             # GitHub personal access token
VERCEL_PROJECT_PRODUCTION_URL=  # Canonical URL for webhooks
```

### 8.5 Optional
```env
DEEPSEEK_API_KEY=         # BYOK for DeepSeek (dashboard-configured or per-request)
ANTHROPIC_API_KEY=        # BYOK for Anthropic
OPEN_AGENTS_RESOURCE_PROFILE=hobby  # Lower resource defaults
VERCEL_SANDBOX_BASE_SNAPSHOT_ID=    # Base snapshot for fresh sandboxes
ELEVENLABS_API_KEY=       # Voice transcription
SLACK_BOT_TOKEN=          # Slack notifications
JARVIS_ADMIN_CHANNEL_ID=  # Slack channel ID
REDIS_URL=                # Skills metadata cache
KV_URL=                   # Vercel KV
```

---

## 9. Import Map — Canonical Paths

```typescript
// AI SDK Core
import { streamText, generateText, tool, stepCountIs, ToolLoopAgent, type ToolSet, type LanguageModel, createGateway, wrapLanguageModel, defaultSettingsMiddleware, convertToModelMessages, createUIMessageStreamResponse, generateId, type InferUIMessageChunk, type UIMessageChunk, type FinishReason, type LanguageModelUsage, type ModelMessage, pruneMessages, isToolUIPart, type GatewayModelId } from "ai";

// AI SDK Providers
import type { AnthropicLanguageModelOptions } from "@ai-sdk/anthropic";
import type { OpenAIResponsesProviderOptions } from "@ai-sdk/openai";

// AI SDK React
import { useChat } from "@ai-sdk/react";

// Workflow SDK
import { getWorkflowMetadata, getWritable, sleep, FatalError } from "workflow";
import { start, getRun } from "workflow/api";
import { withWorkflow } from "workflow/next";

// Vercel Sandbox (via open-agents adapter)
import { VercelSandbox } from "@open-agents/sandbox/vercel";
import { connectSandbox, type SandboxState } from "@open-agents/sandbox";

// Agent tools
import { readFileTool, writeFileTool, editFileTool, grepTool, globTool, bashTool, taskTool, skillTool, webFetchTool, todoWriteTool, askUserQuestionTool } from "@open-agents/agent";

// Gateway + Model
import { gateway, defaultModelLabel, openAgent } from "@open-agents/agent";
```

---

*Compiled Jun 17, 2026 from Vercel docs, AI SDK docs, Workflow SDK docs, open-agents GitHub, and live production deployment analysis.*
