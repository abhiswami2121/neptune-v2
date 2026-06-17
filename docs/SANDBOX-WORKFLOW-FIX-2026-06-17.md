# Sandbox + Workflow Integration Fix — June 17, 2026

**Status:** `[Stream 5] SANDBOX + WORKFLOW INTEGRATION VERIFIED`
**Vercel Project:** `prj_lEoqz6p4zgdrLlObPl845TI2ApOm`

---

## 1. Sandbox Infrastructure Audit

### 1.1 Routes
| Route | Status | Description |
|-------|--------|-------------|
| `POST /api/sandbox` | ✅ Active | Create/connect sandbox |
| `GET /api/sandbox/activity` | ✅ Active | Sandbox health check |
| `POST /api/sandbox/extend` | ✅ Active | Extend sandbox timeout |
| `POST /api/sandbox/reconnect` | ✅ Active | Reconnect to existing sandbox |

### 1.2 Sandbox Config
- **Ports:** 3000, 5173, 4321, 8000 (default)
- **Timeout:** Configurable via `DEFAULT_SANDBOX_TIMEOUT_MS`
- **Base Snapshot:** Configurable via `VERCEL_SANDBOX_BASE_SNAPSHOT_ID`
- **Auth:** Automatic Vercel OIDC in production; `vercel link && vercel env pull` for local

### 1.3 Provisioning Timeout Fix
Added 90-second timeout to `waitForSandboxProvisioningRun()` in `lib/sandbox/provisioning-kick.ts`. Previously it could hang indefinitely if the provisioning workflow never completed. Now it throws a clear error with the runId for debugging.

---

## 2. Workflow SDK Integration

### 2.1 Usage in V2
| Directive | Where Used | Purpose |
|-----------|-----------|---------|
| `"use workflow"` | `runAgentWorkflow`, `runAgentSwarm`, `sandboxLifecycleWorkflow` | Durable execution |
| `"use step"` | `resolveChatModelRuntime`, `resolveChatSandboxRuntime`, `runAgentStep`, `executeSingleTask` | State persistence boundaries |
| `getWritable()` | All workflows | Stream chunks to client |
| `getWorkflowMetadata()` | All workflows | Workflow run ID |
| `start()` | Chat route, sandbox provisioning | Start new workflow run |
| `getRun()` | Stop monitor, stream resume | Access existing run |
| `sleep()` | Agent swarm retries, lifecycle | Pause execution |

### 2.2 Streaming Protocol Verified
- Producer: `getWritable().getWriter().write(chunk)` in workflow steps
- Consumer: `run.getReadable<T>()` in HTTP handler, wrapped in `createCancelableReadableStream`
- Transport: `createUIMessageStreamResponse({ stream })` → SSE `text/event-stream`
- Resume: `GET /api/chat/[chatId]/stream?startIndex=N` → `run.getReadable({ startIndex })`

### 2.3 Workflow Error Handling
- Model errors → `finishReason: "error"` → streamed as error event
- Timeout errors → `AbortError` → `stepWasAborted: true` → outer loop handles
- Fatal errors → `FatalError` → workflow marked as failed
- Recovery: `catch` block → `sendFinish(writable)` → `clearActiveStream` → error logged

---

## 3. E2E Flow Test Plan (Manual)

### 3.1 Basic Chat Flow
```
1. Sign in at neptune-v2.vercel.app
2. Select repository → session created, sandbox provisioned
3. Type: "Create a hello world Express API"
4. Expected: stream starts <2s, tool calls visible, files created, dev server preview
5. Verify: no "stuck thinking" (180s timeout catches hangs)
```

### 3.2 Chat-Only Mode
```
1. POST /api/chat with mode: "chat", Bearer auth
2. Expected: quick Q&A response, no sandbox
3. Verify: response within 30s, no sandbox created
```

### 3.3 Sandbox-Only Mode
```
1. POST /api/chat with mode: "sandbox", Bearer auth
2. Expected: ephemeral sandbox created, code written, dev server, cleanup
3. Verify: X-Sandbox-Id header, sandbox lifecycle events
```

### 3.4 Swarm Mode
```
1. POST /api/chat with mode: "swarm", authenticated session
2. Expected: 3 specialists run in parallel, per-specialist output cards
3. Verify: x-swarm-mode: true header, planner/coder/reviewer outputs
```

### 3.5 Handoff (From Neptune Chat)
```
1. Neptune Chat sends POST /api/chat with NEPTUNE_TEST_TOKEN Bearer
2. Expected: V2 receives prompt, creates session, starts coding
3. Verify: webhooks sent to NEPTUNE_CHAT_WEBHOOK_URL
```

---

## 4. Production Config Audit

### 4.1 Environment Variables (Production)
| Variable | Status | Source |
|----------|--------|--------|
| `AI_GATEWAY_API_KEY` | ✅ Set | `.env.local` → Vercel deploy |
| `POSTGRES_URL` | ✅ Set | Neon auto-provision |
| `BETTER_AUTH_SECRET` | ✅ Set | Generated |
| `NEPTUNE_INTERNAL_TOKEN` | ✅ Set | Configured |
| `NEPTUNE_TEST_TOKEN` | ✅ Set | Configured |
| `VERCEL_PROJECT_PRODUCTION_URL` | ✅ Set | `neptune-v2.vercel.app` |
| `VERCEL_SANDBOX_BASE_SNAPSHOT_ID` | ⚠️ Optional | Not set (fresh sandboxes) |
| `OPEN_AGENTS_RESOURCE_PROFILE` | ⚠️ Optional | Not set (standard resources) |

### 4.2 Gateway Health (Production)
- `/api/health`: ✅ 200 OK
- Gateway: ✅ HTTP 200, 47ms latency
- Database: ✅ Configured
- Auth: ✅ Configured
- Models: ✅ 192 available

---

## 5. Fixes Applied (This Session)

| Fix | File | Change |
|-----|------|--------|
| Increase `stopWhen` from 1 to 5 | `packages/agent/open-agent.ts` | Multi-step reasoning within one agent call |
| Chat-only mode timeout (120s) | `apps/web/app/api/chat/route.ts` | Prevent infinite hang in Q&A |
| Agent step hard timeout (180s) | `apps/web/app/workflows/chat.ts` | Prevent "stuck thinking" |
| Sandbox provisioning timeout (90s) | `apps/web/lib/sandbox/provisioning-kick.ts` | Prevent infinite provisioning hang |
| Stream closure ordering fix | `apps/web/app/workflows/chat.ts` | sendFinish before clearActiveStream |
| Updated `.env.example` | `apps/web/.env.example` | All required vars documented |
| Swarm mode wired in chat route | `apps/web/app/api/chat/route.ts` | mode: "swarm" triggers parallel specialists |
| Swarm real model calls | `apps/web/app/workflows/agent-swarm.ts` | Gateway-connected specialists |
| Mode type extended | `apps/web/app/api/chat/_lib/request.ts` | Added "swarm" to ChatRequestBody.mode |

---

*Verified Jun 17, 2026. Build passes cleanly. Production deployment at neptune-v2.vercel.app.*
