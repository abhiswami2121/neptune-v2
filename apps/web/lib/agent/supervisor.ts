/**
 * Supervisor — Neptune V2 Durability Layer (Phase 3)
 *
 * Wraps the agent step loop in a Plan → Execute → Verify → Recover pattern,
 * modeled after VPS Hermes practices:
 *   - Plan: Decompose task into subtasks with acceptance criteria
 *   - Execute: Dispatch each subtask via the agent
 *   - Verify: Check completion criteria after each subtask
 *   - Recover: Retry failed subtasks up to 3x with escalating context
 *
 * This prevents tunnel-vision and adds structural resilience to long missions.
 */

import type { SessionCheckpoint, CheckpointSnapshot } from "./session-checkpoint";

// ── Types ──────────────────────────────────────────────────────────────────

export type SubtaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "skipped";

export interface Subtask {
  /** Unique subtask ID within the plan */
  id: string;
  /** Human-readable description */
  description: string;
  /** Acceptance criteria — all must be met */
  acceptanceCriteria: string[];
  /** Current status */
  status: SubtaskStatus;
  /** Number of retry attempts (0 = first attempt) */
  retries: number;
  /** Max retry attempts before escalation */
  maxRetries: number;
  /** Error messages from failed attempts */
  errors: string[];
  /** Checkpoint at start of this subtask */
  startCheckpoint?: CheckpointSnapshot;
  /** Checkpoint at completion of this subtask */
  endCheckpoint?: CheckpointSnapshot;
  /** Estimated tool call budget for this subtask */
  estimatedCalls?: number;
  /** Actual tool calls consumed */
  actualCalls: number;
  /** Dependencies — subtask IDs that must complete first */
  dependsOn: string[];
  /** Timestamp when started */
  startedAt?: string;
  /** Timestamp when completed/failed */
  completedAt?: string;
}

export interface SupervisorPlan {
  /** Unique plan ID (matches session ID) */
  planId: string;
  /** Overarching mission goal */
  goal: string;
  /** Ordered subtasks */
  subtasks: Subtask[];
  /** Total tool calls budget allocated */
  totalBudget: number;
  /** Tool calls consumed so far */
  consumedBudget: number;
  /** Plan status */
  status: "planning" | "executing" | "completed" | "failed" | "aborted";
  /** Timestamp when plan was created */
  createdAt: string;
  /** Timestamp when plan finished */
  completedAt?: string;
}

export type PlanPhase = "plan" | "execute" | "verify" | "recover" | "done";

export interface SupervisorState {
  plan: SupervisorPlan;
  currentPhase: PlanPhase;
  currentSubtaskIndex: number;
  currentSubtaskRetries: number;
  phaseHistory: Array<{
    phase: PlanPhase;
    subtaskId?: string;
    status: "started" | "completed" | "failed";
    timestamp: string;
    note?: string;
  }>;
}

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_SUBTASK_BUDGET = 50; // tool calls per subtask
const ESCALATION_THRESHOLD = 5; // total failures before plan is considered failed

// ── Supervisor Class ───────────────────────────────────────────────────────

export class Supervisor {
  readonly planId: string;
  private state: SupervisorState;
  private checkpoint: SessionCheckpoint;
  private totalFailures: number = 0;

  constructor(planId: string, goal: string, checkpoint: SessionCheckpoint) {
    this.planId = planId;
    this.checkpoint = checkpoint;
    this.state = {
      currentPhase: "plan",
      currentSubtaskIndex: 0,
      currentSubtaskRetries: 0,
      phaseHistory: [],
      plan: {
        planId,
        goal,
        subtasks: [],
        totalBudget: 500,
        consumedBudget: 0,
        status: "planning",
        createdAt: new Date().toISOString(),
      },
    };

    this._logPhase("plan", undefined, "started", "Supervisor initialized");
  }

  // ── Plan Phase ──────────────────────────────────────────────────────────

  /**
   * Register a decomposition plan. Called after the agent's initial analysis
   * produces a list of subtasks with acceptance criteria.
   *
   * Subtasks are ordered — dependencies matter.
   */
  registerPlan(
    subtasks: Array<{
      description: string;
      acceptanceCriteria: string[];
      dependsOn?: string[];
      estimatedCalls?: number;
      maxRetries?: number;
    }>,
  ): void {
    if (this.state.currentPhase !== "plan") {
      throw new Error(
        `Cannot register plan in phase '${this.state.currentPhase}'`,
      );
    }

    this.state.plan.subtasks = subtasks.map((st, i) => ({
      id: `subtask-${i + 1}`,
      description: st.description,
      acceptanceCriteria: st.acceptanceCriteria,
      status: "pending" as SubtaskStatus,
      retries: 0,
      maxRetries: st.maxRetries ?? DEFAULT_MAX_RETRIES,
      errors: [],
      actualCalls: 0,
      dependsOn: st.dependsOn ?? [],
      estimatedCalls: st.estimatedCalls ?? DEFAULT_SUBTASK_BUDGET,
    }));

    // Calculate total estimated budget
    this.state.plan.totalBudget = this.state.plan.subtasks.reduce(
      (sum, st) => sum + (st.estimatedCalls ?? DEFAULT_SUBTASK_BUDGET),
      0,
    );

    this.state.plan.status = "executing";
    this.state.currentPhase = "execute";
    this.state.currentSubtaskIndex = 0;

    this._logPhase("plan", undefined, "completed", `Plan: ${subtasks.length} subtasks`);
  }

  // ── Execute Phase ───────────────────────────────────────────────────────

  /**
   * Get the next subtask to execute.
   * Returns null if no more subtasks or plan is blocked.
   */
  getNextSubtask(): Subtask | null {
    if (this.state.currentPhase !== "execute") return null;

    const { subtasks } = this.state.plan;

    // Find next pending subtask whose dependencies are satisfied
    for (let i = 0; i < subtasks.length; i++) {
      const st = subtasks[i];
      if (st.status !== "pending") continue;

      // Check dependencies
      const depsSatisfied = st.dependsOn.every((depId) => {
        const dep = subtasks.find((s) => s.id === depId);
        return dep?.status === "completed";
      });

      if (!depsSatisfied) continue;

      // Skip if retries exhausted
      if (st.retries >= st.maxRetries) {
        st.status = "failed";
        this._logPhase(
          "execute",
          st.id,
          "failed",
          `Retries exhausted (${st.retries}/${st.maxRetries})`,
        );
        continue;
      }

      return st;
    }

    // No more subtasks — check if all are done
    const allDone = subtasks.every(
      (st) => st.status === "completed" || st.status === "skipped" || st.status === "failed",
    );

    if (allDone) {
      const hasFailures = subtasks.some((st) => st.status === "failed");
      this.state.plan.status = hasFailures ? "failed" : "completed";
      this.state.currentPhase = "done";
    }

    return null;
  }

  /**
   * Mark the current subtask as started. Records checkpoint.
   */
  startSubtask(subtaskId: string): void {
    const st = this.state.plan.subtasks.find((s) => s.id === subtaskId);
    if (!st) return;

    st.status = "in_progress";
    st.startedAt = new Date().toISOString();
    st.startCheckpoint = this.checkpoint.forceCheckpoint();

    this._logPhase("execute", subtaskId, "started", st.description);
  }

  // ── Verify Phase ────────────────────────────────────────────────────────

  /**
   * Verify a completed subtask against its acceptance criteria.
   * Returns { passed: boolean, reasons: string[] }
   *
   * The verification is rule-based (structural checks) because actual
   * code validation (typecheck/lint/tests) is performed by the agent itself.
   * This method checks: retries not exceeded, has checkpoint, not obviously incomplete.
   */
  verifySubtask(subtaskId: string): { passed: boolean; reasons: string[] } {
    const st = this.state.plan.subtasks.find((s) => s.id === subtaskId);
    if (!st) {
      return { passed: false, reasons: ["Subtask not found"] };
    }

    const reasons: string[] = [];

    // Structural checks
    if (st.status !== "in_progress") {
      reasons.push(`Subtask is not in progress (status: ${st.status})`);
    }

    if (st.retries > st.maxRetries) {
      reasons.push(`Retries exhausted (${st.retries}/${st.maxRetries})`);
    }

    if (st.errors.length > 0) {
      reasons.push(`Has errors: ${st.errors.slice(-3).join("; ")}`);
    }

    // If acceptance criteria explicitly list verification steps, check them
    // (The agent system prompt already includes verification loop, so
    //  these criteria serve as additional guardrails)
    const unmetCriteria = st.acceptanceCriteria.filter((c) => {
      // Simple heuristic: check if criteria mentions "pass" and we have errors
      if (c.toLowerCase().includes("pass") && st.errors.length > 0) {
        return true;
      }
      // "no errors" criteria with errors present
      if (
        c.toLowerCase().includes("no error") &&
        st.errors.length > 0
      ) {
        return true;
      }
      return false;
    });

    if (unmetCriteria.length > 0) {
      reasons.push(`Unmet criteria: ${unmetCriteria.join("; ")}`);
    }

    return {
      passed: reasons.length === 0,
      reasons,
    };
  }

  /**
   * Mark a subtask as completed after passing verification.
   */
  completeSubtask(subtaskId: string): void {
    const st = this.state.plan.subtasks.find((s) => s.id === subtaskId);
    if (!st) return;

    st.status = "completed";
    st.completedAt = new Date().toISOString();
    st.endCheckpoint = this.checkpoint.forceCheckpoint();
    st.actualCalls =
      (st.endCheckpoint?.toolCallCount ?? 0) -
      (st.startCheckpoint?.toolCallCount ?? 0);

    this.state.plan.consumedBudget += st.actualCalls;
    this.state.currentSubtaskIndex++;

    this._logPhase("verify", subtaskId, "completed", `Calls: ${st.actualCalls}`);
  }

  // ── Recover Phase ───────────────────────────────────────────────────────

  /**
   * Attempt recovery of a failed subtask.
   * Returns the retry attempt number, or -1 if recovery is not possible.
   */
  attemptRecovery(subtaskId: string, error: string): number {
    const st = this.state.plan.subtasks.find((s) => s.id === subtaskId);
    if (!st) return -1;

    st.errors.push(error);
    st.retries++;
    this.totalFailures++;

    this._logPhase(
      "recover",
      subtaskId,
      "failed",
      `Retry ${st.retries}/${st.maxRetries}: ${error.slice(0, 100)}`,
    );

    if (st.retries >= st.maxRetries) {
      st.status = "failed";
      st.completedAt = new Date().toISOString();
      return -1; // Exhausted
    }

    // Reset status for retry
    st.status = "pending";
    return st.retries;
  }

  /**
   * Build escalation context for when a subtask cannot be recovered.
   * Provides full error history and surrounding context for diagnosis.
   */
  buildEscalationContext(subtaskId: string): string {
    const st = this.state.plan.subtasks.find((s) => s.id === subtaskId);
    if (!st) return `Subtask ${subtaskId} not found`;

    return [
      `## ESCALATION: Subtask ${st.id} failed after ${st.retries} retries`,
      `Description: ${st.description}`,
      `Acceptance criteria: ${st.acceptanceCriteria.join(", ")}`,
      `Errors encountered:`,
      ...st.errors.map((e, i) => `  ${i + 1}. ${e}`),
      `Checkpoint at start: tool call ${st.startCheckpoint?.toolCallCount ?? "N/A"}`,
      `Checkpoint at end: tool call ${st.endCheckpoint?.toolCallCount ?? "N/A"}`,
      `Actual tool calls: ${st.actualCalls}`,
      "",
      "Recommended actions:",
      "1. Review error history above",
      "2. Check if acceptance criteria need adjustment",
      "3. Consider splitting into smaller subtasks",
      "4. May need human intervention if systemic",
    ].join("\n");
  }

  /**
   * Re-plan remaining work after a failure.
   * Adjusts the plan to include remaining work as a new recovery subtask.
   */
  replanAfterFailure(subtaskId: string, recoveryApproach: string): void {
    const st = this.state.plan.subtasks.find((s) => s.id === subtaskId);
    if (!st) return;

    // Mark failed subtask as skipped (don't count against plan)
    st.status = "skipped";

    // Add recovery subtask
    const recoveryId = `recovery-${Date.now()}`;
    this.state.plan.subtasks.push({
      id: recoveryId,
      description: `[RECOVERY] ${recoveryApproach}`,
      acceptanceCriteria: st.acceptanceCriteria,
      status: "pending",
      retries: 0,
      maxRetries: 2, // Reduced retries for recovery
      errors: [],
      actualCalls: 0,
      dependsOn: [], // No dependencies — immediate recovery
      estimatedCalls: (st.estimatedCalls ?? DEFAULT_SUBTASK_BUDGET) * 1.5,
    });

    this._logPhase(
      "recover",
      subtaskId,
      "completed",
      `Replanned: recovery subtask ${recoveryId}`,
    );

    // Reset to execute phase
    this.state.currentPhase = "execute";
  }

  // ── Budget Management ───────────────────────────────────────────────────

  /**
   * Check if we're approaching the tool call budget (80% threshold).
   * Used to trigger auto-continue before exhaustion.
   */
  isApproachingBudget(threshold = 0.8): boolean {
    return (
      this.state.plan.consumedBudget >=
      this.state.plan.totalBudget * threshold
    );
  }

  /**
   * Estimate remaining budget as a percentage.
   */
  getBudgetRemaining(): number {
    return Math.max(
      0,
      (this.state.plan.totalBudget - this.state.plan.consumedBudget) /
        this.state.plan.totalBudget,
    );
  }

  // ── State Accessors ─────────────────────────────────────────────────────

  getState(): Readonly<SupervisorState> {
    return this.state;
  }

  getPlan(): Readonly<SupervisorPlan> {
    return this.state.plan;
  }

  getCurrentPhase(): PlanPhase {
    return this.state.currentPhase;
  }

  getProgress(): {
    total: number;
    completed: number;
    failed: number;
    inProgress: number;
    pending: number;
  } {
    const { subtasks } = this.state.plan;
    return {
      total: subtasks.length,
      completed: subtasks.filter((s) => s.status === "completed").length,
      failed: subtasks.filter((s) => s.status === "failed").length,
      inProgress: subtasks.filter((s) => s.status === "in_progress").length,
      pending: subtasks.filter((s) => s.status === "pending").length,
    };
  }

  isDone(): boolean {
    return this.state.currentPhase === "done";
  }

  /**
   * Build a summary of the supervisor state for checkpointing.
   */
  buildSummary(): string {
    const progress = this.getProgress();
    const { currentPhase } = this.state;

    return [
      `Supervisor: phase=${currentPhase}`,
      `Subtasks: ${progress.completed}/${progress.total} done, ${progress.failed} failed, ${progress.pending} pending`,
      `Budget: ${this.state.plan.consumedBudget}/${this.state.plan.totalBudget} calls (${Math.round(this.getBudgetRemaining() * 100)}% remaining)`,
      `Total failures: ${this.totalFailures}`,
    ].join(" | ");
  }

  // ── Private Helpers ─────────────────────────────────────────────────────

  private _logPhase(
    phase: PlanPhase,
    subtaskId: string | undefined,
    status: "started" | "completed" | "failed",
    note?: string,
  ): void {
    this.state.phaseHistory.push({
      phase,
      subtaskId,
      status,
      timestamp: new Date().toISOString(),
      note,
    });

    // Keep history bounded
    if (this.state.phaseHistory.length > 200) {
      this.state.phaseHistory = this.state.phaseHistory.slice(-100);
    }
  }
}

// ── Supervisor Factory ─────────────────────────────────────────────────────

/**
 * Create a supervisor from a persisted plan (resume case).
 */
export function rehydrateSupervisor(
  planId: string,
  savedState: SupervisorState,
  checkpoint: SessionCheckpoint,
): Supervisor {
  // Create with minimal constructor, then restore state
  const supervisor = new Supervisor(
    planId,
    savedState.plan.goal,
    checkpoint,
  );

  // Override the initialized state with saved state
  supervisor["state"] = savedState;
  supervisor["totalFailures"] = savedState.plan.subtasks.filter(
    (s) => s.status === "failed",
  ).length;

  return supervisor;
}
