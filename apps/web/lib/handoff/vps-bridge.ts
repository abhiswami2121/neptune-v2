/**
 * VPS Handoff Bridge — dispatches long-running coding tasks from V2 Neptune
 * to VPS Hermes (Claude Agent API) when tasks exceed V2 sandbox capabilities.
 *
 * Decision matrix from handoff-decision SKILL.md:
 *   HAND OFF TO VPS if: > 30 min runtime | multi-repo (3+) | system-level ops |
 *                       production secrets | risky DB migrations | cron management |
 *                       filesystem outside sandbox
 *
 * Module exports:
 *   - dispatchToVps: Send a mission brief to VPS Hermes
 *   - pollVpsSession: Check status of a dispatched VPS session
 *   - retrieveVpsResult: Get final output + artifacts from completed session
 *   - cancelVpsSession: Cancel a running VPS session
 *   - isVpsAvailable: Health-check the VPS Claude Agent API
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VpsMissionBrief {
  /** Clear description of what to do */
  task: string;
  /** Target repository (owner/repo format) */
  repo: string;
  /** Estimated runtime, e.g. "45 minutes" */
  estimatedRuntime: string;
  /** Which rule triggered the handoff */
  reasonForHandoff:
    | "long_runtime"
    | "multi_repo"
    | "system_level"
    | "production_secrets"
    | "risky_migration"
    | "cron_management"
    | "filesystem_work"
    | "vps_health";
  /** How to verify completion */
  successCriteria: string[];
  /** Expected output files */
  filesToProduce: string[];
  /** Optional: priority override (default: "normal") */
  priority?: "low" | "normal" | "high" | "critical";
  /** Optional: context from V2 to help VPS understand the task */
  context?: string;
}

export interface DispatchResult {
  success: boolean;
  sessionId?: string;
  taskId?: string;
  statusUrl?: string;
  error?: string;
  /** Human-readable summary of what was dispatched */
  summary: string;
}

export type VpsSessionStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "unknown";

export interface SessionStatus {
  sessionId: string;
  status: VpsSessionStatus;
  startedAt?: string;
  finishedAt?: string;
  toolCallCount?: number;
  progress?: string;
  error?: string;
}

export interface VpsResult {
  sessionId: string;
  status: VpsSessionStatus;
  /** Final output from the VPS session */
  output?: string;
  /** Any files produced during the session */
  artifacts?: Array<{ path: string; content: string }>;
  /** Links to commits/PRs created by the VPS */
  commitLinks?: string[];
  /** Error details if the session failed */
  error?: string;
  /** Session summary from Hermes */
  summary?: string;
  /** Tool call statistics */
  stats?: {
    totalToolCalls: number;
    bashCalls: number;
    nativeCalls: number;
    durationMs: number;
  };
}

export interface CancelResult {
  success: boolean;
  sessionId: string;
  error?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Base URL for the VPS Claude Agent API. Configurable via env for dev/prod. */
const VPS_AGENT_URL =
  process.env.VPS_CLAUDE_AGENT_URL ?? "http://localhost:8102";

/** Auth token for VPS API. Must match CLAUDE_AGENT_API_TOKEN on the VPS. */
const VPS_AUTH_TOKEN =
  process.env.VPS_HANDOFF_TOKEN ?? process.env.NEPTUNE_TEST_TOKEN ?? "";

/** Max poll attempts before declaring a timeout */
const MAX_POLL_ATTEMPTS = 120;

/** Milliseconds between polls */
const POLL_INTERVAL_MS = 15_000; // 15 seconds

/** Session timeout in milliseconds (30 minutes) */
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (VPS_AUTH_TOKEN) {
    headers["Authorization"] = `Bearer ${VPS_AUTH_TOKEN}`;
  }

  return headers;
}

function generateTaskId(): string {
  return `v2-handoff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Map handoff reason codes to human-readable labels for the VPS mission prompt.
 */
function reasonLabel(reason: VpsMissionBrief["reasonForHandoff"]): string {
  const labels: Record<VpsMissionBrief["reasonForHandoff"], string> = {
    long_runtime: "Estimated runtime exceeds V2 sandbox limit (>30 min)",
    multi_repo: "Task spans 3+ repositories",
    system_level: "Requires system-level access (pm2, cron, env)",
    production_secrets: "Involves production secret rotation",
    risky_migration: "Risky database migration requiring VPS validation",
    cron_management: "Cron job management requiring VPS infrastructure",
    filesystem_work: "File system operations outside sandbox scope",
    vps_health: "VPS health operations (nginx, SSL, pm2 logs)",
  };
  return labels[reason] ?? reason;
}

/**
 * Build a system prompt for the VPS agent from a mission brief.
 */
function buildMissionPrompt(brief: VpsMissionBrief): string {
  const priority = brief.priority ?? "normal";
  const contextBlock = brief.context
    ? `\n\n## Context from V2 Neptune\n${brief.context}`
    : "";

  return `## MISSION DISPATCHED FROM NEPTUNE V2

**Task:** ${brief.task}
**Repository:** ${brief.repo}
**Estimated Runtime:** ${brief.estimatedRuntime}
**Handoff Reason:** ${reasonLabel(brief.reasonForHandoff)}
**Priority:** ${priority.toUpperCase()}

### Success Criteria
${brief.successCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}

### Expected Output Files
${brief.filesToProduce.map((f) => `- \`${f}\``).join("\n")}
${contextBlock}

### Instructions
1. Read the task and context carefully
2. Execute the mission using native tools (Read, Write, Edit, Bash, Grep, Glob)
3. Verify each success criterion before declaring done
4. Write a proof file at /home/hermes/data/${generateTaskId()}_complete.json
5. Reply with a summary of what was done and any issues encountered

You have been dispatched by Neptune V2. Report completion via the SessionDataStore.`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Dispatch a mission to VPS Hermes via the Claude Agent API.
 *
 * Sends a POST to /v1/sessions to create a new VPS session with the mission
 * brief as the initial message. The VPS agent (Hermes) picks up the session
 * and executes the mission.
 *
 * @example
 * const result = await dispatchToVps({
 *   task: "Run full database migration across all tenants",
 *   repo: "abhiswami2121/neptune-v2",
 *   estimatedRuntime: "45 minutes",
 *   reasonForHandoff: "risky_migration",
 *   successCriteria: ["All tenant DBs migrated", "No data loss"],
 *   filesToProduce: ["migration-report.json"],
 * });
 */
export async function dispatchToVps(
  brief: VpsMissionBrief,
): Promise<DispatchResult> {
  const taskId = generateTaskId();
  const missionPrompt = buildMissionPrompt(brief);

  if (!VPS_AUTH_TOKEN) {
    return {
      success: false,
      taskId,
      error:
        "VPS_HANDOFF_TOKEN or NEPTUNE_TEST_TOKEN not configured. Set env var to enable VPS handoff.",
      summary: "Handoff blocked: missing auth token",
    };
  }

  try {
    const response = await fetch(`${VPS_AGENT_URL}/v1/sessions`, {
      method: "POST",
      headers: buildAuthHeaders(),
      body: JSON.stringify({
        mode: "mission",
        task_id: taskId,
        repo: brief.repo,
        priority: brief.priority ?? "normal",
        prompt: missionPrompt,
        metadata: {
          source: "neptune-v2",
          reason_for_handoff: brief.reasonForHandoff,
          estimated_runtime: brief.estimatedRuntime,
        },
      }),
      signal: AbortSignal.timeout(30_000), // 30s timeout for dispatch
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      return {
        success: false,
        taskId,
        error: `VPS API returned ${response.status}: ${errorBody.slice(0, 200)}`,
        summary: `Handoff failed: VPS API returned ${response.status}`,
      };
    }

    const data = await response.json();
    const sessionId = data.id ?? data.session_id ?? data.sessionId;

    if (!sessionId) {
      return {
        success: false,
        taskId,
        error: "VPS API did not return a session ID",
        summary: "Handoff failed: no session ID in response",
      };
    }

    return {
      success: true,
      sessionId,
      taskId,
      statusUrl: `${VPS_AGENT_URL}/v1/sessions/${sessionId}`,
      summary: `Mission dispatched to VPS Hermes. Session: ${sessionId}. Reason: ${brief.reasonForHandoff}.`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Classify specific errors
    if (message.includes("ENOTFOUND") || message.includes("ECONNREFUSED")) {
      return {
        success: false,
        taskId,
        error: `VPS is unreachable at ${VPS_AGENT_URL}. Is the Claude Agent API running?`,
        summary: "Handoff failed: VPS unreachable",
      };
    }

    if (message.includes("timeout") || message.includes("aborted")) {
      return {
        success: false,
        taskId,
        error: "VPS dispatch timed out after 30 seconds",
        summary: "Handoff failed: dispatch timeout",
      };
    }

    return {
      success: false,
      taskId,
      error: message,
      summary: "Handoff failed: unexpected error",
    };
  }
}

/**
 * Poll a VPS session for its current status.
 *
 * Makes a GET request to the VPS Claude Agent API to check whether a
 * dispatched mission is still running, completed, or failed.
 *
 * @example
 * const status = await pollVpsSession("session_abc123");
 * if (status.status === "completed") {
 *   const result = await retrieveVpsResult("session_abc123");
 * }
 */
export async function pollVpsSession(
  sessionId: string,
): Promise<SessionStatus> {
  if (!sessionId) {
    return {
      sessionId: "",
      status: "unknown",
      error: "No session ID provided",
    };
  }

  try {
    const response = await fetch(
      `${VPS_AGENT_URL}/v1/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: "GET",
        headers: buildAuthHeaders(),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!response.ok) {
      if (response.status === 404) {
        return {
          sessionId,
          status: "unknown",
          error: "Session not found on VPS",
        };
      }

      return {
        sessionId,
        status: "unknown",
        error: `VPS API returned ${response.status}`,
      };
    }

    const data = await response.json();

    return {
      sessionId,
      status: normalizeStatus(data.status ?? data.state),
      startedAt: data.started_at ?? data.startedAt ?? data.created_at,
      finishedAt: data.finished_at ?? data.finishedAt ?? data.completed_at,
      toolCallCount: data.tool_call_count ?? data.toolCallCount,
      progress: data.progress ?? data.current_task,
      error: data.error ?? data.error_message,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    return {
      sessionId,
      status: "unknown",
      error: `Failed to poll VPS session: ${message}`,
    };
  }
}

/**
 * Retrieve the final result of a completed VPS session.
 *
 * Fetches the session output, any produced artifacts, and summary from
 * the VPS Claude Agent API. Only works for completed or failed sessions.
 *
 * @example
 * const result = await retrieveVpsResult("session_abc123");
 * console.log(result.output);
 * console.log(result.summary);
 */
export async function retrieveVpsResult(
  sessionId: string,
): Promise<VpsResult> {
  if (!sessionId) {
    return {
      sessionId: "",
      status: "unknown",
      error: "No session ID provided",
    };
  }

  try {
    // Fetch session messages and artifacts
    const [messagesResponse, artifactsResponse] = await Promise.all([
      fetch(
        `${VPS_AGENT_URL}/v1/sessions/${encodeURIComponent(sessionId)}/messages`,
        {
          method: "GET",
          headers: buildAuthHeaders(),
          signal: AbortSignal.timeout(15_000),
        },
      ),
      fetch(
        `${VPS_AGENT_URL}/v1/sessions/${encodeURIComponent(sessionId)}/artifacts`,
        {
          method: "GET",
          headers: buildAuthHeaders(),
          signal: AbortSignal.timeout(15_000),
        },
      ),
    ]);

    // Parse messages
    let output: string | undefined;
    let summary: string | undefined;
    let commitLinks: string[] = [];
    let sessionStatus: VpsSessionStatus = "unknown";

    if (messagesResponse.ok) {
      const messages = await messagesResponse.json();
      const messagesArray = Array.isArray(messages)
        ? messages
        : messages.messages ?? messages.data ?? [];

      // Extract last assistant message as output
      const lastAssistantMsg = messagesArray
        .filter((m: { role?: string }) => m.role === "assistant")
        .at(-1);

      if (lastAssistantMsg) {
        output =
          typeof lastAssistantMsg.content === "string"
            ? lastAssistantMsg.content
            : JSON.stringify(lastAssistantMsg.content);
      }

      // Extract summary if present
      const summaryMsg = messagesArray.find(
        (m: { role?: string }) => m.role === "system" && m.content?.includes?.("SUMMARY"),
      );
      if (summaryMsg?.content) {
        summary = summaryMsg.content;
      }

      // Extract GH links from output
      const ghLinkPattern = /https:\/\/github\.com\/[^\s\)]+/g;
      commitLinks = (output ?? "").match(ghLinkPattern) ?? [];
    }

    // Parse artifacts
    let artifacts: VpsResult["artifacts"] = [];
    if (artifactsResponse.ok) {
      const artifactsData = await artifactsResponse.json();
      const artifactsArray = Array.isArray(artifactsData)
        ? artifactsData
        : artifactsData.artifacts ?? artifactsData.files ?? [];

      artifacts = artifactsArray.map(
        (a: { path?: string; file?: string; content?: string; data?: string }) => ({
          path: a.path ?? a.file ?? "unknown",
          content: a.content ?? a.data ?? "",
        }),
      );
    }

    // Get session status
    const statusResult = await pollVpsSession(sessionId);
    sessionStatus = statusResult.status;

    return {
      sessionId,
      status: sessionStatus,
      output,
      artifacts,
      commitLinks,
      error: statusResult.error,
      summary,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    return {
      sessionId,
      status: "unknown",
      error: `Failed to retrieve VPS result: ${message}`,
    };
  }
}

/**
 * Cancel a running VPS session.
 *
 * Sends a cancellation request to stop a long-running session that is
 * no longer needed.
 *
 * @example
 * const result = await cancelVpsSession("session_abc123");
 * if (result.success) console.log("Session cancelled");
 */
export async function cancelVpsSession(
  sessionId: string,
): Promise<CancelResult> {
  if (!sessionId) {
    return {
      success: false,
      sessionId: "",
      error: "No session ID provided",
    };
  }

  try {
    const response = await fetch(
      `${VPS_AGENT_URL}/v1/sessions/${encodeURIComponent(sessionId)}/cancel`,
      {
        method: "POST",
        headers: buildAuthHeaders(),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        success: false,
        sessionId,
        error: `VPS API returned ${response.status}: ${body.slice(0, 200)}`,
      };
    }

    return {
      success: true,
      sessionId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      sessionId,
      error: `Failed to cancel VPS session: ${message}`,
    };
  }
}

/**
 * Check if the VPS Claude Agent API is healthy and reachable.
 *
 * @example
 * const available = await isVpsAvailable();
 * if (!available) console.log("VPS is down, handling inline instead");
 */
export async function isVpsAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${VPS_AGENT_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5_000),
    });

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Poll a VPS session until it completes or times out.
 *
 * Use for synchronous-style waiting. For large operations, prefer
 * pollVpsSession() in a background job to avoid blocking the request.
 *
 * @param sessionId - The VPS session ID to poll
 * @param options.pollIntervalMs - Time between polls (default: 15s)
 * @param options.maxAttempts - Max polls before timeout (default: 120)
 * @returns The final result or a timeout error
 *
 * @example
 * const result = await waitForVpsCompletion("session_abc123");
 * if (result.status === "completed") {
 *   console.log("Mission accomplished:", result.summary);
 * }
 */
export async function waitForVpsCompletion(
  sessionId: string,
  options?: {
    pollIntervalMs?: number;
    maxAttempts?: number;
  },
): Promise<VpsResult> {
  const interval = options?.pollIntervalMs ?? POLL_INTERVAL_MS;
  const maxAttempts = options?.maxAttempts ?? MAX_POLL_ATTEMPTS;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const status = await pollVpsSession(sessionId);

    if (status.status === "completed" || status.status === "failed") {
      return retrieveVpsResult(sessionId);
    }

    if (status.status === "cancelled") {
      return {
        sessionId,
        status: "cancelled",
        error: "Session was cancelled",
      };
    }

    // Check for timeout
    if (attempt >= maxAttempts) {
      return {
        sessionId,
        status: "running",
        error: `Session still running after ${maxAttempts} poll attempts (${(maxAttempts * interval) / 1000}s)`,
      };
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  // Should never reach here (loop exits above)
  return retrieveVpsResult(sessionId);
}

/**
 * Decision engine: should this task be handed off to VPS?
 *
 * Implements the decision matrix from handoff-decision SKILL.md.
 *
 * @returns { handoff: boolean, reason: string }
 *
 * @example
 * const decision = shouldHandoffToVps({
 *   estimatedMinutes: 45,
 *   repoCount: 1,
 *   requiresSystemAccess: false,
 * });
 * // => { handoff: true, reason: "long_runtime" }
 */
export function shouldHandoffToVps(params: {
  estimatedMinutes?: number;
  repoCount?: number;
  requiresSystemAccess?: boolean;
  requiresSecretRotation?: boolean;
  isRiskyMigration?: boolean;
  isCronManagement?: boolean;
  requiresFilesystemAccess?: boolean;
  vpsHealthOps?: boolean;
}): { handoff: boolean; reason: string } {
  if ((params.estimatedMinutes ?? 0) > 30) {
    return {
      handoff: true,
      reason: `Estimated runtime (${params.estimatedMinutes} min) exceeds V2 sandbox limit of 30 min`,
    };
  }

  if ((params.repoCount ?? 1) >= 3) {
    return {
      handoff: true,
      reason: `Task spans ${params.repoCount} repositories (threshold: 3+)`,
    };
  }

  if (params.requiresSystemAccess) {
    return {
      handoff: true,
      reason: "Task requires system-level access (pm2, cron, nginx, etc.)",
    };
  }

  if (params.requiresSecretRotation) {
    return {
      handoff: true,
      reason: "Task involves production secret rotation",
    };
  }

  if (params.isRiskyMigration) {
    return {
      handoff: true,
      reason: "Risky database migration requires VPS validation",
    };
  }

  if (params.isCronManagement) {
    return {
      handoff: true,
      reason: "Cron job management requires VPS infrastructure",
    };
  }

  if (params.requiresFilesystemAccess) {
    return {
      handoff: true,
      reason: "File system operations outside sandbox scope",
    };
  }

  if (params.vpsHealthOps) {
    return {
      handoff: true,
      reason: "VPS health operations require local system access",
    };
  }

  return {
    handoff: false,
    reason: "Task can be handled inline by V2 Neptune",
  };
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

function normalizeStatus(raw: string | undefined): VpsSessionStatus {
  if (!raw) return "unknown";

  const normalized = raw.toLowerCase().trim();

  if (normalized === "running" || normalized === "in_progress" || normalized === "active") {
    return "running";
  }
  if (normalized === "completed" || normalized === "done" || normalized === "success") {
    return "completed";
  }
  if (normalized === "failed" || normalized === "error") {
    return "failed";
  }
  if (normalized === "cancelled" || normalized === "canceled") {
    return "cancelled";
  }
  if (normalized === "pending" || normalized === "queued") {
    return "pending";
  }

  return "unknown";
}
