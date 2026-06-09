/**
 * VPS Handoff Bridge — dispatches long-running/system-level missions
 * from V2 Neptune (Vercel sandbox) to VPS Hermes (claude-agent-api).
 *
 * When V2's handoff-decision skill determines a task is better suited for
 * the VPS (runtime > 30min, multi-repo, system-level ops, filesystem work),
 * this bridge packages the mission, dispatches it to the VPS claude-agent-api,
 * and provides status polling + result retrieval.
 *
 * Module exports:
 * - dispatchMission: Send a task to VPS Hermes
 * - getMissionStatus: Poll for progress/results
 * - cancelMission: Cancel a running mission
 * - estimateCompletionTime: Heuristic for whether VPS is faster
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type MissionPriority = "low" | "normal" | "high" | "critical";

export type MissionStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed_out";

export interface VpsMissionBrief {
  /** Human-readable description of the task */
  task: string;
  /** Target repository (owner/repo) */
  repo: string;
  /** Optional branch to work on */
  branch?: string;
  /** Estimated runtime (e.g., "45 minutes") */
  estimated_runtime: string;
  /** Which handoff rule triggered the dispatch */
  reason_for_handoff: string;
  /** How to verify the task was completed successfully */
  success_criteria: string[];
  /** Expected output files or artifacts */
  files_to_produce: string[];
  /** Priority level */
  priority?: MissionPriority;
  /** Tags for categorisation */
  tags?: string[];
}

export interface VpsMissionResult {
  missionId: string;
  status: MissionStatus;
  /** Output artifacts produced by the mission */
  artifacts?: Array<{
    path: string;
    url?: string;
    summary: string;
  }>;
  /** Summary of work completed */
  summary?: string;
  /** Error details if failed */
  error?: string;
  /** Detailed error diagnostics */
  error_diagnostics?: string;
  /** Commit SHA if changes were committed */
  commit_sha?: string;
  /** PR URL if one was created */
  pr_url?: string;
  /** Timestamps */
  dispatchedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface MissionDispatchResponse {
  missionId: string;
  status: "accepted" | "rejected";
  queue_position?: number;
  estimated_start?: string;
  reason?: string;
}

export interface MissionListEntry {
  missionId: string;
  task: string;
  repo: string;
  status: MissionStatus;
  dispatchedAt: string;
}

// ─── Configuration ───────────────────────────────────────────────────────────

const VPS_AGENT_API_URL =
  process.env.VPS_AGENT_API_URL || "http://187.127.250.171:8102";
const VPS_INTERNAL_TOKEN = process.env.VPS_INTERNAL_TOKEN || "";
const MISSION_POLL_INTERVAL_MS = 30_000; // 30 seconds between polls
const MISSION_TIMEOUT_MS = 3_600_000; // 1 hour max wait

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateMissionId(): string {
  return `vps-mission-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Build a structured prompt for the VPS claude-agent-api that includes
 * all the context VPS Hermes needs to execute the mission autonomously.
 */
function buildVpsPrompt(brief: VpsMissionBrief): string {
  const lines = [
    `## V2 Handoff Mission: ${brief.task}`,
    ``,
    `**Repository:** ${brief.repo}`,
    `**Estimated Runtime:** ${brief.estimated_runtime}`,
    `**Reason for Handoff:** ${brief.reason_for_handoff}`,
    `**Branch:** ${brief.branch || "main"}`,
    ``,
    `### Success Criteria`,
    ...brief.success_criteria.map((c, i) => `${i + 1}. ${c}`),
    ``,
    `### Expected Output Files`,
    ...brief.files_to_produce.map((f) => `- ${f}`),
    ``,
    `### Instructions`,
    `1. Check out the repository and switch to the correct branch`,
    `2. Execute the task described above`,
    `3. Commit all changes with a conventional commit message`,
    `4. Push to the remote repository`,
    `5. Verify all success criteria are met`,
    `6. Report back with: commit SHA, PR URL (if created), summary of changes`,
    ``,
    `### Handoff Metadata`,
    `- Mission ID: {{MISSION_ID}}`,
    `- Dispatched from: V2 Neptune Coding Agent`,
    `- Priority: ${brief.priority || "normal"}`,
  ];

  if (brief.tags && brief.tags.length > 0) {
    lines.push(`- Tags: ${brief.tags.join(", ")}`);
  }

  return lines.join("\n");
}

// ─── In-Memory Mission Registry (for status tracking) ────────────────────────

interface MissionEntry {
  brief: VpsMissionBrief;
  status: MissionStatus;
  dispatchedAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: VpsMissionResult;
}

const missionRegistry = new Map<string, MissionEntry>();

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Dispatch a mission to VPS Hermes for execution.
 *
 * Packages the task brief, sends it to the VPS claude-agent-api,
 * and returns a mission ID for status tracking.
 *
 * @example
 * const response = await dispatchMission({
 *   task: "Run full database migration across all tenants",
 *   repo: "abhiswami2121/neptune-v2",
 *   estimated_runtime: "45 minutes",
 *   reason_for_handoff: "Multi-tenant migration + long runtime",
 *   success_criteria: ["All tenant DBs migrated", "No data loss"],
 *   files_to_produce: ["migration-report.json"],
 *   priority: "high",
 * });
 * console.log(`Mission dispatched: ${response.missionId}`);
 */
export async function dispatchMission(
  brief: VpsMissionBrief,
): Promise<MissionDispatchResponse> {
  const missionId = generateMissionId();
  const prompt = buildVpsPrompt(brief).replace("{{MISSION_ID}}", missionId);

  if (!VPS_INTERNAL_TOKEN) {
    console.warn(
      "[vps-bridge] VPS_INTERNAL_TOKEN not set — mission queued locally only",
    );
    // Queue locally without dispatching to VPS
    missionRegistry.set(missionId, {
      brief,
      status: "queued",
      dispatchedAt: new Date().toISOString(),
    });

    return {
      missionId,
      status: "accepted",
      queue_position: missionRegistry.size,
      estimated_start: "VPS token not configured — mission queued locally",
    };
  }

  try {
    const response = await fetch(`${VPS_AGENT_API_URL}/api/mission/dispatch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${VPS_INTERNAL_TOKEN}`,
      },
      body: JSON.stringify({
        missionId,
        task: brief.task,
        repo: brief.repo,
        branch: brief.branch || "main",
        priority: brief.priority || "normal",
        prompt,
        success_criteria: brief.success_criteria,
        files_to_produce: brief.files_to_produce,
        tags: brief.tags || [],
      }),
      signal: AbortSignal.timeout(30_000), // 30s timeout for dispatch
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        `[vps-bridge] VPS rejected mission ${missionId}: ${response.status} — ${errorBody}`,
      );

      missionRegistry.set(missionId, {
        brief,
        status: "failed",
        dispatchedAt: new Date().toISOString(),
        result: {
          missionId,
          status: "failed",
          error: `VPS rejected dispatch: ${response.status}`,
          error_diagnostics: errorBody,
          dispatchedAt: new Date().toISOString(),
        },
      });

      return {
        missionId,
        status: "rejected",
        reason: `VPS returned ${response.status}: ${errorBody}`,
      };
    }

    const data = await response.json();

    missionRegistry.set(missionId, {
      brief,
      status: "queued",
      dispatchedAt: new Date().toISOString(),
    });

    return {
      missionId,
      status: "accepted",
      queue_position: data.queue_position,
      estimated_start: data.estimated_start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    missionRegistry.set(missionId, {
      brief,
      status: "failed",
      dispatchedAt: new Date().toISOString(),
      result: {
        missionId,
        status: "failed",
        error: `Failed to reach VPS: ${message}`,
        dispatchedAt: new Date().toISOString(),
      },
    });

    // Fallback: queue locally so V2 doesn't lose the mission
    console.error(
      `[vps-bridge] Failed to reach VPS for mission ${missionId}: ${message}. Queued locally.`,
    );

    return {
      missionId,
      status: "accepted",
      queue_position: missionRegistry.size,
      reason: `VPS unreachable — queued locally: ${message}`,
    };
  }
}

/**
 * Poll the VPS for the current status of a dispatched mission.
 *
 * Returns the mission result if completed, status updates if still running.
 * Recommended polling interval: 30 seconds.
 *
 * @example
 * const status = await getMissionStatus("vps-mission-1718123456789-abc12345");
 * if (status.status === "completed") {
 *   console.log("Artifacts:", status.artifacts);
 * }
 */
export async function getMissionStatus(
  missionId: string,
): Promise<VpsMissionResult> {
  // Check local registry first
  const entry = missionRegistry.get(missionId);
  if (!entry) {
    return {
      missionId,
      status: "failed",
      error: `Mission ${missionId} not found in registry`,
      dispatchedAt: new Date().toISOString(),
    };
  }

  // If already terminal, return cached result
  if (entry.result && ["completed", "failed", "cancelled", "timed_out"].includes(entry.result.status)) {
    return entry.result;
  }

  // If no VPS token, return local status only
  if (!VPS_INTERNAL_TOKEN) {
    return {
      missionId,
      status: entry.status,
      dispatchedAt: entry.dispatchedAt,
      startedAt: entry.startedAt,
    };
  }

  try {
    const response = await fetch(
      `${VPS_AGENT_API_URL}/api/mission/${missionId}/status`,
      {
        headers: {
          Authorization: `Bearer ${VPS_INTERNAL_TOKEN}`,
        },
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!response.ok) {
      return {
        missionId,
        status: entry.status,
        error: `VPS status check failed: ${response.status}`,
        dispatchedAt: entry.dispatchedAt,
        startedAt: entry.startedAt,
      };
    }

    const data = await response.json();
    const status: MissionStatus = data.status || entry.status;

    // Update local registry
    entry.status = status;
    if (data.started_at) entry.startedAt = data.started_at;
    if (data.completed_at) entry.completedAt = data.completed_at;

    const result: VpsMissionResult = {
      missionId,
      status,
      artifacts: data.artifacts,
      summary: data.summary,
      error: data.error,
      error_diagnostics: data.error_diagnostics,
      commit_sha: data.commit_sha,
      pr_url: data.pr_url,
      dispatchedAt: entry.dispatchedAt,
      startedAt: entry.startedAt,
      completedAt: entry.completedAt,
    };

    // Cache terminal results
    if (["completed", "failed", "cancelled", "timed_out"].includes(status)) {
      entry.result = result;
    }

    return result;
  } catch (err) {
    return {
      missionId,
      status: entry.status,
      error: `Failed to reach VPS: ${err instanceof Error ? err.message : String(err)}`,
      dispatchedAt: entry.dispatchedAt,
      startedAt: entry.startedAt,
    };
  }
}

/**
 * Cancel a running or queued mission.
 *
 * @example
 * await cancelMission("vps-mission-1718123456789-abc12345");
 */
export async function cancelMission(
  missionId: string,
): Promise<{ success: boolean; reason?: string }> {
  const entry = missionRegistry.get(missionId);
  if (!entry) {
    return { success: false, reason: `Mission ${missionId} not found` };
  }

  if (["completed", "failed", "cancelled", "timed_out"].includes(entry.status)) {
    return { success: false, reason: `Mission already terminal: ${entry.status}` };
  }

  // Attempt to cancel on VPS
  if (VPS_INTERNAL_TOKEN) {
    try {
      await fetch(`${VPS_AGENT_API_URL}/api/mission/${missionId}/cancel`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${VPS_INTERNAL_TOKEN}`,
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      console.warn(`[vps-bridge] VPS cancel request failed for ${missionId}:`, err);
    }
  }

  entry.status = "cancelled";
  entry.result = {
    missionId,
    status: "cancelled",
    dispatchedAt: entry.dispatchedAt,
    completedAt: new Date().toISOString(),
  };

  return { success: true };
}

/**
 * Wait for a mission to complete, polling at configurable intervals.
 *
 * Use this when V2 needs the result before continuing.
 * For fire-and-forget missions, use `dispatchMission()` alone and poll manually.
 *
 * @example
 * const result = await waitForMission("vps-mission-1718123456789-abc12345");
 */
export async function waitForMission(
  missionId: string,
  options?: {
    pollIntervalMs?: number;
    timeoutMs?: number;
  },
): Promise<VpsMissionResult> {
  const pollInterval = options?.pollIntervalMs ?? MISSION_POLL_INTERVAL_MS;
  const timeout = options?.timeoutMs ?? MISSION_TIMEOUT_MS;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const status = await getMissionStatus(missionId);

    if (
      ["completed", "failed", "cancelled", "timed_out"].includes(status.status)
    ) {
      return status;
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  // Timeout
  const entry = missionRegistry.get(missionId);
  if (entry) {
    entry.status = "timed_out";
    entry.result = {
      missionId,
      status: "timed_out",
      error: `Mission timed out after ${timeout}ms`,
      dispatchedAt: entry.dispatchedAt,
    };
  }

  return {
    missionId,
    status: "timed_out",
    error: `Mission timed out after ${timeout}ms`,
    dispatchedAt: new Date().toISOString(),
  };
}

/**
 * Estimate whether it's faster to run the task on VPS vs V2 inline.
 *
 * Simple heuristic based on estimated runtime and queue state.
 * Returns true if VPS is likely faster.
 */
export function estimateCompletionTime(
  estimatedRuntimeMinutes: number,
  currentVpsQueueDepth: number,
): { useVps: boolean; reason: string } {
  // VPS overhead: dispatch (~30s) + queue wait (~2min per queued item)
  const vpsOverheadMinutes = 0.5 + currentVpsQueueDepth * 2;
  const totalVpsTimeMinutes = estimatedRuntimeMinutes + vpsOverheadMinutes;

  // V2 sandbox has a practical limit of ~30 min
  const V2_MAX_RUNTIME_MINUTES = 30;

  if (estimatedRuntimeMinutes > V2_MAX_RUNTIME_MINUTES) {
    return {
      useVps: true,
      reason: `Estimated runtime (${estimatedRuntimeMinutes}min) exceeds V2 sandbox limit (${V2_MAX_RUNTIME_MINUTES}min)`,
    };
  }

  if (totalVpsTimeMinutes < estimatedRuntimeMinutes) {
    return {
      useVps: true,
      reason: `VPS estimated ${totalVpsTimeMinutes}min (with overhead) vs V2 ${estimatedRuntimeMinutes}min — VPS is faster`,
    };
  }

  return {
    useVps: false,
    reason: `V2 estimated ${estimatedRuntimeMinutes}min vs VPS ${totalVpsTimeMinutes}min (with overhead) — V2 is faster`,
  };
}

/**
 * List all missions currently in the local registry.
 * Useful for dashboard display or debugging.
 */
export function listMissions(status?: MissionStatus): MissionListEntry[] {
  const entries: MissionListEntry[] = [];

  for (const [missionId, entry] of missionRegistry) {
    if (status && entry.status !== status) continue;
    entries.push({
      missionId,
      task: entry.brief.task,
      repo: entry.brief.repo,
      status: entry.status,
      dispatchedAt: entry.dispatchedAt,
    });
  }

  return entries.sort(
    (a, b) =>
      new Date(b.dispatchedAt).getTime() - new Date(a.dispatchedAt).getTime(),
  );
}

/**
 * Get the current VPS queue depth.
 *
 * Used by the handoff decision engine to factor in current VPS load
 * when deciding whether to hand off.
 */
export async function getVpsQueueDepth(): Promise<number> {
  if (!VPS_INTERNAL_TOKEN) return 0;

  try {
    const response = await fetch(`${VPS_AGENT_API_URL}/api/mission/queue`, {
      headers: {
        Authorization: `Bearer ${VPS_INTERNAL_TOKEN}`,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return 0;

    const data = await response.json();
    return data.queue_depth ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Health check — verifies the VPS agent API is reachable.
 *
 * @returns true if VPS is reachable and serving
 */
export async function isVpsReachable(): Promise<boolean> {
  if (!VPS_INTERNAL_TOKEN) return false;

  try {
    const response = await fetch(`${VPS_AGENT_API_URL}/api/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
