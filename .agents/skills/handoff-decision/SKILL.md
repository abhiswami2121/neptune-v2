---
name: handoff-decision
description: Decision framework for when to handle coding tasks inline vs hand off to VPS Hermes or Claude Code. Determines task routing based on runtime, scope, and system access needs. Triggers on "handoff", "offload", "VPS", "long running", "multi-repo", "system-level", "Hermes", "delegate", "who should handle this", "dispatch", "route to".
---

You are a task routing decision engine. For every coding task, you decide: handle it yourself (V2 Neptune) or hand off to VPS Hermes (for long-running/system-level work).

## Decision Matrix

### HANDLE INLINE (V2 Neptune)

| Task Type | Examples | Rationale |
|-----------|----------|-----------|
| Single-repo coding | New feature, bug fix, UI change | V2 has sandbox + git integration |
| API endpoint additions | New route handler, middleware | Well within sandbox capabilities |
| Test writing | Unit tests, integration tests | Sandbox can run test suites |
| Documentation updates | README, doc comments, wiki | Fast, no long-running ops needed |
| UI components | New component, style change | V2 has browser preview |
| Config changes | vercel.json, next.config | Quick, easy to verify |
| Dependencies | `pnpm add`, version bumps | Sandbox has package manager |
| Refactoring (< 500 LOC) | Extract function, rename | Fast, within sandbox |
| Code review fixes | Address PR comments | Quick iterations |

### HAND OFF TO VPS HERMES

| Task Type | Examples | Rationale |
|-----------|----------|-----------|
| Long-running compute | > 30 min estimated | V2 sandbox has time limits |
| Multi-repo changes | 3+ repos coordinated | V2 operates one repo at a time |
| System-level ops | pm2 restart, cron edit, env rotation | Requires VPS shell access |
| Heavy data analysis | > 10K rows, complex aggregation | VPS has full database access |
| Production secrets rotation | Token rotation, key changes | Needs VPS-level security |
| Database migrations (risky) | Schema changes on prod data | Needs VPS validation |
| Cron job management | Add/edit/delete cron jobs | VPS cron infrastructure |
| File system work | Outside sandbox scope | VPS has full filesystem |
| VPS health operations | Nginx config, SSL, pm2 logs | System administration |
| E2B sandbox orchestration | Multi-sandbox coordination | VPS manages E2B fleet |

## Handoff Protocol

When handing off to VPS Hermes:

### 1. Prepare the Mission Brief

```typescript
interface VpsMissionBrief {
  task: string;              // Clear description of what to do
  repo: string;              // Target repository
  estimated_runtime: string; // e.g., "45 minutes"
  reason_for_handoff: string; // Which rule triggered handoff
  success_criteria: string[]; // How to verify completion
  files_to_produce: string[]; // Expected output files
}
```

### 2. Dispatch via VPS Bridge

```typescript
// V2 calls VPS bridge to dispatch mission
await vpsBridge.dispatchMission({
  task: "Run full database migration across all tenants",
  repo: "abhiswami2121/neptune-v2",
  estimated_runtime: "45 minutes",
  reason_for_handoff: "Multi-tenant migration + long runtime",
  success_criteria: ["All tenant DBs migrated", "No data loss"],
  files_to_produce: ["migration-report.json"]
});
```

### 3. Monitor Progress

- VPS sends periodic status updates
- V2 can poll for progress
- On completion: VPS returns result + artifacts
- On failure: VPS returns error + diagnostic info

### 4. Post-Handoff

- Record the handoff in session memory
- Update task board with VPS mission ID
- Resume normal V2 operations (don't block on VPS)

## Hybrid Scenarios

Some tasks start in V2 and hand off midway:

```
Start in V2 → V2 does initial work → V2 commits → 
→ Detects long-running step needed → Prepares handoff → 
→ Dispatches to VPS → VPS continues → VPS commits result → 
→ V2 picks up verification
```

## When to ASK Before Handing Off

- Unclear if task is multi-repo
- User might prefer inline even if slow
- First time using VPS for this type of task
- Cost implications (VPS has usage limits)

## Anti-Patterns

- ❌ Hand off a 5-minute fix to VPS (overhead > task time)
- ❌ Try to run a 2-hour migration in V2 sandbox
- ❌ Hand off without a clear success criteria
- ❌ Assume VPS knows the context — brief it fully
- ❌ Block V2 waiting for VPS — hand off and continue

## Decision Flowchart

```
Task received
    ↓
Is it estimated > 30 min? ──YES→ HAND OFF TO VPS
    ↓ NO
Is it multi-repo (3+ repos)? ──YES→ HAND OFF TO VPS
    ↓ NO
Is it system-level (cron, pm2, env)? ──YES→ HAND OFF TO VPS
    ↓ NO
Is it file system outside sandbox? ──YES→ HAND OFF TO VPS
    ↓ NO
HANDLE INLINE (V2 Neptune)
```

## VPS Bridge Integration

The handoff decision engine is backed by the **VPS Handoff Bridge** (`lib/handoff/vps-bridge.ts`). Key integration points:

### dispatchMission()
```typescript
import { dispatchMission } from "@/lib/handoff/vps-bridge";

const response = await dispatchMission({
  task: "Database migration: add index to 5M-row table",
  repo: "abhiswami2121/neptune-v2",
  estimated_runtime: "45 minutes",
  reason_for_handoff: "Long-running DB migration + V2 sandbox timeout risk",
  success_criteria: ["Index created successfully", "No query regressions", "Migration reversible"],
  files_to_produce: ["migration-report.json"],
  priority: "high",
  tags: ["database", "migration", "postgres"],
});
```

### getMissionStatus()
```typescript
import { getMissionStatus } from "@/lib/handoff/vps-bridge";

// Poll every 30s
const status = await getMissionStatus(response.missionId);
if (status.status === "completed") {
  console.log("Commit:", status.commit_sha);
  console.log("PR:", status.pr_url);
}
```

### waitForMission()
```typescript
import { waitForMission } from "@/lib/handoff/vps-bridge";

// Block until complete (with timeout)
const result = await waitForMission(response.missionId, {
  pollIntervalMs: 30_000,
  timeoutMs: 3_600_000, // 1 hour
});
```

### Queue-Aware Handoff
```typescript
import { getVpsQueueDepth, estimateCompletionTime } from "@/lib/handoff/vps-bridge";

const queueDepth = await getVpsQueueDepth();
const decision = estimateCompletionTime(45, queueDepth); // 45 min estimate + queue overhead
// { useVps: true, reason: "Estimated runtime (45min) exceeds V2 sandbox limit (30min)" }
```

### VPS Health Check
```typescript
import { isVpsReachable } from "@/lib/handoff/vps-bridge";

if (!(await isVpsReachable())) {
  // VPS is down — run inline with reduced scope, or queue for later
}
```

## Discovery-Before-Code Protocol 🔍

**CRITICAL: Before creating ANY new file, V2 MUST discover existing code first.**

This protocol was added after a Phase 6 grading finding: V2 duplicated existing PreferencesSection (1082 lines) by creating a standalone SettingsForm without discovering the existing implementation.

### Protocol Steps

1. **Search the codebase** — Before writing a new component, function, or utility:
   - Run `query_code_graph` with the task's key terms (e.g., "model preference", "settings form")
   - Run `Grep` for similar file names or function signatures in the target directory
   - Run `Glob` to list existing files in the target directory

2. **Read existing patterns** — Before writing, read at least 2 related files:
   - If building a component: read 2+ existing components in the same directory
   - If building a utility: read 2+ existing utilities following the same pattern
   - Identify the established conventions: auto-save vs Save button, hook-driven vs prop-driven, server vs client component

3. **Extend, don't replace** — If a similar component/function exists:
   - Add props/variants to the existing component rather than creating a new one
   - If a fundamentally different UX is needed, add a variant mode (e.g., `compact` prop)
   - Only create a new file if the existing one CANNOT be reasonably extended

4. **Adopt established UX conventions** — Match what the app already does:
   - If the app uses auto-save on change, don't build a Save button
   - If the app uses `useUserPreferences()` hook, don't fetch preferences as props
   - If the app uses shadcn/ui ModelCombobox, don't build a custom Select

### Trigger Keywords
"before building", "discover first", "check existing", "codebase search", "pattern match", "existing component", "don't duplicate", "discovery protocol"
