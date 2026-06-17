# MoA + Swarm Parallel Execution Patterns for Neptune V2

**Status:** `[Stream 2] MOA + SWARM RESEARCH COMPLETE`
**Scope:** Multi-agent parallel orchestration for coding workflows

---

## 0. Pattern Taxonomy

Three distinct parallel execution patterns exist for AI coding agents:

| Pattern | Description | Latency | Cost | Best For |
|---------|------------|---------|------|----------|
| **Single Model + Parallel Tools** | One model calls multiple tools simultaneously | Low | Low | Routine coding, single-file edits |
| **Multiple Models + Sequential CoT** | Chain-of-thought across models sequentially | High | High | Complex reasoning, research |
| **Multiple Models + Parallel MoA/Swarm** | Multiple models run concurrently, synthesizer merges | Medium | High | Complex multi-step tasks, safety-critical code |

---

## 1. Pattern 1: Single Model + Parallel Tool Calls

### 1.1 Architecture
```
User Input → Model (DeepSeek V4 Pro) → [tool_call_1, tool_call_2, tool_call_3] (parallel)
                                            ↓              ↓              ↓
                                        file_read      bash_run       grep_search
                                            ↓              ↓              ↓
                                        [result_1]    [result_2]    [result_3]
                                            ↘              ↓              ↙
                                              Model continues reasoning...
```

### 1.2 AI SDK v6 Implementation

The AI SDK v6 supports parallel tool calls natively. When a model returns multiple tool calls in a single response, the SDK executes them concurrently:

```typescript
import { streamText, tool, stepCountIs } from "ai";

const result = streamText({
  model: gateway("deepseek/deepseek-v4-pro"),
  messages,
  tools: {
    read: tool({
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => await sandbox.readFile(path),
    }),
    bash: tool({
      inputSchema: z.object({ command: z.string() }),
      execute: async ({ command }) => await sandbox.exec(command),
    }),
    grep: tool({
      inputSchema: z.object({ pattern: z.string() }),
      execute: async ({ pattern }) => await sandbox.exec(`grep -r "${pattern}"`),
    }),
  },
  stopWhen: stepCountIs(5),
});
```

**How parallel tool calls work:**
1. Model sends response with multiple `tool_use` blocks
2. AI SDK executes all tool calls concurrently via `Promise.all`
3. All results are collected and sent back to the model
4. Model continues reasoning with all results available

### 1.3 Provider Support

| Provider | Parallel Tool Calls | Mechanism |
|----------|-------------------|-----------|
| **DeepSeek V4 Pro** | ✅ Native | Multiple `tool_calls` in single response |
| **Claude Sonnet 4.6** | ✅ Native | Multiple `tool_use` content blocks |
| **OpenAI GPT-5** | ✅ Native | Multiple `function_call` in single response |
| **Kimi K2.7 Code** | ✅ Native | Multiple `function_call` in single response |
| **GLM 5.2** | ✅ Native | Multiple `tool_calls` in single response |

### 1.4 V2 Default: ToolLoopAgent with Parallel Tools

```typescript
// Default mode: Single model, parallel tool calls
export const openAgent = new ToolLoopAgent({
  model: gateway("deepseek/deepseek-v4-pro"),
  tools: {
    read: readFileTool(),
    write: writeFileTool(),
    edit: editFileTool(),
    grep: grepTool(),
    glob: globTool(),
    bash: bashTool(),
    task: taskTool,
    skill: skillTool,
    web_fetch: webFetchTool,
  },
  stopWhen: stepCountIs(1),  // One model call per step
  // The AI SDK handles parallel tool execution within each step
});
```

**Key benefit:** All 12 tools can be called in parallel within a single model turn. The model might decide to `grep` for patterns AND `glob` for files AND `read` a config all at once.

---

## 2. Pattern 2: MoA (Mixture of Agents) — Multiple Models, Parallel

### 2.1 Architecture
```
User Input ──────────────────────────────────────────────────────────────
    │                   │                   │                   │
    ▼                   ▼                   ▼                   ▼
Claude Sonnet 4.6   DeepSeek V4 Pro    GPT-5 Codex      Kimi K2.7 Code
  (architect)         (implementer)     (reviewer)       (code-search)
    │                   │                   │                   │
    │ "The task needs  │ "Here's the     │ "Found bug in   │ "Related pattern
    │  these components:"│ implementation:"  │ error handling:"│ found in repo..."
    │                   │                   │                   │
    └─────────┬─────────┴─────────┬─────────┴─────────┬─────────┘
              │                   │                   │
              └───────────────────┬───────────────────┘
                                  ▼
                         SYNC MODEL (Claude Sonnet 4.6)
                         Merges all specialist outputs
                                  │
                                  ▼
                         FINAL RESPONSE (code + review)
```

### 2.2 When to Use MoA
- Complex multi-file changes requiring architectural decisions
- Safety-critical code (payment processing, auth)
- User explicitly requests "multiple experts"
- Refactoring >5 files
- New feature implementation with unclear requirements

### 2.3 When NOT to Use MoA
- Simple single-file edits
- Trivial bug fixes
- Quick Q&A questions
- Chat-only mode

### 2.4 AI SDK Implementation Pattern

```typescript
import { generateText, tool } from "ai";

interface SpecialistResult {
  role: SpecialistRole;
  modelId: string;
  content: string;
  toolCalls?: unknown[];
  durationMs: number;
}

async function runMoAWorkflow(input: string, sandbox: Sandbox) {
  "use workflow";
  const writable = getWritable<UIMessageChunk>();
  
  // 1. Launch specialists in parallel
  const specialists: Promise<SpecialistResult>[] = [
    runSpecialist("architect", "anthropic/claude-sonnet-4.6", input, sandbox),
    runSpecialist("implementer", "deepseek/deepseek-v4-pro", input, sandbox),
    runSpecialist("reviewer", "openai/gpt-5-codex", input, sandbox),
  ];
  
  // 2. Stream individual progress
  const writer = writable.getWriter();
  await writer.write({
    type: "moa-progress",
    phase: "specialists-running",
    count: specialists.length,
  });
  writer.releaseLock();
  
  // 3. Wait for all specialists
  const results = await Promise.all(specialists);
  
  // 4. Merge via synthesizer
  const synthesis = await generateText({
    model: gateway("anthropic/claude-sonnet-4.6"),
    messages: [
      { role: "system", content: SYNTHESIZER_PROMPT },
      { role: "user", content: formatSpecialistResults(results) },
    ],
  });
  
  // 5. Stream final result
  const finalWriter = writable.getWriter();
  await finalWriter.write({ type: "text-delta", text: synthesis.text });
  finalWriter.releaseLock();
}

async function runSpecialist(
  role: SpecialistRole,
  modelId: string,
  input: string,
  sandbox: Sandbox,
): Promise<SpecialistResult> {
  "use step";
  const start = Date.now();
  
  const result = await generateText({
    model: gateway(modelId),
    messages: [
      { role: "system", content: SPECIALIST_PROMPTS[role] },
      { role: "user", content: input },
    ],
    tools: role === "implementer" ? codingTools : analysisTools,
  });
  
  return {
    role,
    modelId,
    content: result.text,
    durationMs: Date.now() - start,
  };
}
```

### 2.5 Specialist Role Definitions

| Role | Model | Task | Tools |
|------|-------|------|-------|
| **Architect** | `claude-sonnet-4.6` | Analyze requirements, design architecture, break into subtasks | read, grep, glob |
| **Implementer** | `deepseek/deepseek-v4-pro` | Write code, implement changes | all tools (read, write, edit, bash, grep, glob) |
| **Reviewer** | `gpt-5-codex` | Validate code, find bugs, suggest improvements | read, grep, bash (test) |
| **Code Searcher** | `kimi/k2.7-code` | Find related patterns, existing implementations | read, grep, glob |
| **Synthesizer** | `claude-sonnet-4.6` | Merge specialist outputs into coherent response | none (text only) |

---

## 3. Pattern 3: Swarm (Planner + Coder + Reviewer)

### 3.1 Architecture
```
User Input: "Add auth middleware to Express API"
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│                   PLANNER (Claude Sonnet 4.6)             │
│  "Auth middleware needs:                                  │
│   1. JWT verification in middleware.ts                    │
│   2. User model with bcrypt hashing                       │
│   3. Login/register routes                                │
│   4. Type definitions for Request.user"                   │
│  Plan → stream to UI as "Architecture Plan" card          │
└─────────────────────────────────────────────────────────┘
    │ (plan emitted, continues in parallel with coder)
    │
    ├──────────────────┬──────────────────┐
    ▼                  ▼                  ▼
┌────────────┐  ┌────────────┐  ┌────────────┐
│   CODER    │  │  CODER     │  │  CODER     │
│  (DeepSeek)│  │  (DeepSeek)│  │  (DeepSeek)│
│  Task 1    │  │  Task 2    │  │  Task 3    │
│ middleware │  │ user model │  │ routes     │
└────────────┘  └────────────┘  └────────────┘
    │                  │                  │
    └──────────────────┬──────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│              REVIEWER (GPT-5 Codex)                       │
│  "Checklist:                                              │
│   ✅ JWT verification correct                             │
│   ✅ Password hashing uses bcrypt                         │
│   ❌ Missing rate limiting on login route — FIXED         │
│   ✅ All types properly defined"                          │
│  Review → stream to UI as "Code Review" card              │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│              SYNTHESIZER                                  │
│  "Final output: 3 files changed, 2 files created"         │
│  → PR description, commit message, diff summary           │
└─────────────────────────────────────────────────────────┘
```

### 3.2 V2 Swarm Implementation

The existing `agent-swarm.ts` provides the foundation. Here's the enhanced version for coding:

```typescript
import { getWorkflowMetadata, getWritable, sleep } from "workflow";
import { generateText, tool, type UIMessageChunk } from "ai";

export interface SwarmCodingInput {
  prompt: string;
  sandbox: AgentSandboxContext;
  mode: "default" | "swarm";
}

export async function runAgentSwarm(input: SwarmCodingInput) {
  "use workflow";
  const { workflowRunId } = getWorkflowMetadata();
  const writable = getWritable<UIMessageChunk>();
  
  // Phase 1: Planning
  emitSwarmPhase(writable, "planning", "start");
  const plan = await runPlanner(input.prompt);
  emitSwarmPhase(writable, "planning", "complete", { plan });
  
  // Phase 2: Parallel coding tasks
  emitSwarmPhase(writable, "coding", "start", { taskCount: plan.tasks.length });
  const codeResults = await Promise.all(
    plan.tasks.map(task => runCoder(task, input.sandbox))
  );
  emitSwarmPhase(writable, "coding", "complete", { results: codeResults });
  
  // Phase 3: Review
  emitSwarmPhase(writable, "review", "start");
  const review = await runReviewer(plan, codeResults);
  emitSwarmPhase(writable, "review", "complete", { review });
  
  // Phase 4: Synthesize
  emitSwarmPhase(writable, "synthesis", "start");
  const final = await synthesize(plan, codeResults, review);
  emitSwarmPhase(writable, "synthesis", "complete", { final });
  
  return final;
}
```

### 3.3 Task Decomposition

The planner breaks a user request into atomic tasks. Example:

**User:** "Add RBAC authorization to the existing Express API"

**Planner decomposes into:**
1. `task_1`: Create `Permission` type/enum in `types/auth.ts`
2. `task_2`: Create `requirePermission` middleware in `middleware/rbac.ts`
3. `task_3`: Add `role` and `permissions` fields to `User` model
4. `task_4`: Update login endpoint to include permissions in JWT payload
5. `task_5`: Add RBAC middleware to protected routes
6. `task_6`: Write unit tests for RBAC middleware

Tasks 1-4 are independent → run in parallel
Task 5 depends on 2, 3 → runs after
Task 6 depends on 2 → runs after

---

## 4. Decision Matrix: When to Use Each Pattern

### 4.1 Default Mode (Single Model + Parallel Tools)
```
CONDITIONS:
├─ Routine code changes: ✅
├─ Single-file edits: ✅
├─ Bug fixes (known location): ✅  
├─ Q&A about codebase: ✅
├─ Running tests/build: ✅
└─ Simple refactoring: ✅

TRIGGER: Always (default mode)
MODEL: deepseek/deepseek-v4-pro
TOOLS: All 12 tools, parallel where supported
STOP_WHEN: stepCountIs(1) per cycle, outer loop up to 500
```

### 4.2 Swarm Mode (Planner + Coders + Reviewer)
```
CONDITIONS:
├─ New feature with >3 files: ✅
├─ Architectural changes: ✅
├─ User toggles "Swarm" in UI: ✅  
├─ "Audit" or "Review" requests: ✅
├─ Safety-critical changes: ✅
└─ Unknown codebase (needs exploration): ✅

TRIGGER: User selects "Swarm" mode from chat header dropdown
MODELS:
├─ Planner: anthropic/claude-sonnet-4.6
├─ Coders: deepseek/deepseek-v4-pro (1 per task)
├─ Reviewer: openai/gpt-5-codex
└─ Synthesizer: anthropic/claude-sonnet-4.6
```

### 4.3 MoA Mode (Multiple Models, Full Parallel)
```
CONDITIONS:
├─ Extremely complex refactoring: ✅
├─ User requests "multiple experts": ✅
├─ Performance-critical optimization: ✅
├─ Security audit: ✅
└─ Cross-cutting concerns: ✅

TRIGGER: User explicitly requests "MoA" or "all experts"
MODELS:
├─ Architect: anthropic/claude-sonnet-4.6
├─ Implementer: deepseek/deepseek-v4-pro
├─ Reviewer: openai/gpt-5-codex
├─ Code Searcher: kimi/k2.7-code
└─ Synthesizer: anthropic/claude-sonnet-4.6
COST: ~5× single model (all run in parallel)
LATENCY: ~2× single model (slowest specialist + synthesis)
```

---

## 5. Provider Routing Strategy

### 5.1 Default Provider Selector

```typescript
const PROVIDER_MAP = {
  default: "deepseek/deepseek-v4-pro",    // Default coder
  planner: "anthropic/claude-sonnet-4.6", // Best at architecture
  reviewer: "openai/gpt-5-codex",        // Best at code review
  searcher: "kimi/k2.7-code",            // Best at code search
  fallback: "deepseek/deepseek-v4-flash", // Fast fallback
  alternative: {
    coder: "kimi/k2.7-code",             // Alternative coder
    reviewer: "google/gemini-3-flash",    // Alternative reviewer
  },
};
```

### 5.2 Provider Strengths

| Provider | Strength | Best Role |
|----------|----------|-----------|
| `deepseek/deepseek-v4-pro` | Fast, accurate code generation | Default coder |
| `anthropic/claude-sonnet-4.6` | Architecture, planning, reasoning | Planner, Architect |
| `openai/gpt-5-codex` | Code review, bug detection | Reviewer |
| `kimi/k2.7-code` | Code search, pattern matching | Searcher |
| `google/gemini-3-flash` | Fast cheap inference | Light reviewer |
| `deepseek/deepseek-v4-flash` | Budget coding | Budget coder |
| `anthropic/claude-opus-4.7` | Complex reasoning | Deep architect |

### 5.3 AI Gateway BYOK for Per-Provider Keys

```typescript
const result = await generateText({
  model: gateway("anthropic/claude-sonnet-4.6"),
  providerOptions: {
    gateway: {
      byok: {
        anthropic: [{ apiKey: process.env.ANTHROPIC_API_KEY }],
        deepseek: [{ apiKey: process.env.DEEPSEEK_API_KEY }],
      },
    } satisfies GatewayProviderOptions,
  },
});
```

---

## 6. UI Components for Swarm/MoA

### 6.1 Mode Selector (Chat Header)
```typescript
// Dropdown in chat header
<ModeSelector
  options={[
    { id: "default", label: "Default (DeepSeek V4 Pro)", icon: "zap" },
    { id: "swarm", label: "Swarm (Planner + Coder + Reviewer)", icon: "users" },
    { id: "moa", label: "MoA (All Experts)", icon: "brain" },
  ]}
  selected={currentMode}
  onChange={setMode}
/>
```

### 6.2 Swarm Progress Cards
```typescript
// Per-specialist streaming card
<SwarmCard
  specialist="planner"
  status="streaming"      // "pending" | "streaming" | "complete" | "error"
  model="Claude Sonnet 4.6"
  progress="Analyzing architecture..."
/>

<SwarmCard
  specialist="coder-1"
  status="streaming"
  model="DeepSeek V4 Pro"
  progress="Writing middleware/auth.ts..."
/>

<SwarmCard
  specialist="reviewer"
  status="pending"
  model="GPT-5 Codex"
/>
```

### 6.3 Synthesizer Output Panel
```typescript
<SynthesisPanel
  plan={planOutput}
  codeChanges={codeResults}
  review={reviewOutput}
  finalOutput={synthesisText}
/>
```

---

## 7. Implementation Plan for V2

### 7.1 Phase 1: Default Mode (Stream 3)
- Fix `ToolLoopAgent` timeout and error handling
- Ensure parallel tool calls work with all 12 tools
- DeepSeek V4 Pro as default coder

### 7.2 Phase 2: Swarm Mode Toggle (Stream 4)
- Add mode selector to chat header
- Wire `runAgentSwarm()` from `agent-swarm.ts`
- Connect to actual agent tools (not stubs)
- Stream planner, coder, reviewer outputs as separate cards

### 7.3 Phase 3: MoA Optional (Future)
- Full MoA with all 4 specialists
- Smart task decomposition
- Dynamic specialist assignment based on task type

### 7.4 Mode Flow in Chat Route
```typescript
// In POST /api/chat route.ts
if (body.mode === "swarm") {
  // Start swarm workflow
  const run = await start(runAgentSwarm, [swarmInput]);
  // Return stream with SwarmCard chunks
  return createUIMessageStreamResponse({
    stream: run.getReadable<UIMessageChunk>(),
    headers: { "x-workflow-run-id": run.runId },
  });
}

// Default: single model + parallel tools
const run = await start(runAgentWorkflow, [options]);
```

---

## 8. Parallel Execution in Workflow SDK

The Workflow SDK v5 supports parallel execution of steps:

```typescript
// Parallel: steps run concurrently within a workflow
const [planResult, searchResult] = await Promise.all([
  runArchitectStep(input),       // "use step"
  runCodeSearchStep(input),      // "use step"
]);

// Sequential: one after another
const plan = await runArchitectStep(input);
const code = await runCoderStep(plan);
```

**Key constraint:** Each step is individually durable. If a step fails, only that step's Promise rejects. Other parallel steps continue. Use `Promise.allSettled` for graceful degradation.

---

## 9. Cost Comparison

| Pattern | Models per Run | API Calls | Est. Cost per Task | Use Frequency |
|---------|---------------|-----------|-------------------|---------------|
| Default (single + tools) | 1 | 1-5 | $0.01-0.05 | 90% |
| Swarm (3 specialists) | 4-5 | 6-15 | $0.10-0.50 | 8% |
| MoA (4 specialists) | 6-8 | 10-25 | $0.30-1.00 | 2% |

---

*Compiled Jun 17, 2026. Provider capabilities verified against production AI Gateway at neptune-v2.vercel.app (192 models available).*
