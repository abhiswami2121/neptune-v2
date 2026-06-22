/**
 * Auto-Continue — Neptune V2 Durability Layer (Phase 4)
 *
 * When the agent approaches its tool call budget (~80%), this module:
 * 1. Serializes remaining work + current context
 * 2. Spawns a fresh sub-session to continue
 * 3. Links child session to parent via parent_session_id
 * 4. Notifies via AdminNotification (already wired in Neptune Chat)
 *
 * Modeled after VPS Hermes resume_session pattern (server.py:2147-2227)
 * and the auto-continue design from memory 6a3660db.
 */

import type { SessionCheckpoint } from "./session-checkpoint";
import type { Supervisor } from "./supervisor";

// ── Types ──────────────────────────────────────────────────────────────────

export interface AutoContinueContext {
  /** Parent session ID */
  parentSessionId: string;
  /** Original goal */
  goal: string;
  /** Current checkpoint summary */
  checkpointSummary: string;
  /** Supervisor state (subtasks completed, pending, failed) */
  supervisorSummary: string;
  /** Remaining work description (pending subtasks) */
  remainingWork: string[];
  /** Tool call count at handoff */
  toolCallCount: number;
  /** Files touched so far */
  filesTouched: string[];
  /** Recent errors for context */
  recentErrors: string[];
  /** Timestamp of handoff */
  handoffAt: string;
}

export interface AutoContinueResult {
  /** Whether auto-continue was triggered */
  triggered: boolean;
  /** New child session ID (if spawned) */
  childSessionId?: string;
  /** Serialized context for the child session */
  context?: AutoContinueContext;
  /** Reason for NOT triggering (if applicable) */
  skipReason?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

/** Budget threshold for auto-continue trigger (80% of maxSteps) */
const AUTO_CONTINUE_THRESHOLD = 0.8;

/** Minimum budget remaining before auto-continue is considered safe */
const MIN_SAFE_BUDGET_REMAINING = 20; // tool calls

/** Maximum depth of session chains to prevent infinite loops */
const MAX_CONTINUE_DEPTH = 5;

// ── Auto-Continue Engine ───────────────────────────────────────────────────

export class AutoContinueEngine {
  readonly parentSessionId: string;
  private continueDepth: number;

  constructor(parentSessionId: string, continueDepth = 0) {
    this.parentSessionId = parentSessionId;
    this.continueDepth = continueDepth;
  }

  /**
   * Check if auto-continue should be triggered.
   *
   * Returns true when:
   * - Current call count >= 80% of max budget
   * - There are remaining pending subtasks
   * - We haven't exceeded max chain depth
   * - At least MIN_SAFE_BUDGET_REMAINING calls left to serialize state
   */
  shouldAutoContinue(
    checkpoint: SessionCheckpoint,
    supervisor: Supervisor,
    maxSteps: number,
  ): boolean {
    // Guard: don't exceed chain depth
    if (this.continueDepth >= MAX_CONTINUE_DEPTH) {
      return false;
    }

    const toolCallCount = checkpoint.state.toolCallCount;

    // Check budget threshold
    if (toolCallCount < maxSteps * AUTO_CONTINUE_THRESHOLD) {
      return false;
    }

    // Check we have enough budget to safely serialize
    const budgetRemaining = maxSteps - toolCallCount;
    if (budgetRemaining < MIN_SAFE_BUDGET_REMAINING) {
      // Too close to limit — auto-continue NOW
      return true;
    }

    // Check there's actual remaining work
    const progress = supervisor.getProgress();
    if (progress.pending === 0 && progress.failed === 0) {
      return false; // Nothing left to do
    }

    return true;
  }

  /**
   * Serialize the current session state into a context package
   * that the child session can consume for seamless continuation.
   */
  serializeContext(
    checkpoint: SessionCheckpoint,
    supervisor: Supervisor,
  ): AutoContinueContext {
    const progress = supervisor.getProgress();
    const plan = supervisor.getPlan();

    // Collect remaining work from pending and failed subtasks
    const remainingWork: string[] = [];
    for (const st of plan.subtasks) {
      if (st.status === "pending" || st.status === "failed") {
        remainingWork.push(
          `[${st.id}] ${st.description} (retries: ${st.retries}/${st.maxRetries})`,
        );
      }
    }

    return {
      parentSessionId: this.parentSessionId,
      goal: plan.goal,
      checkpointSummary: checkpoint
        .getState()
        .checkpoints.at(-1)
        ?.summary ?? "No checkpoint",
      supervisorSummary: supervisor.buildSummary(),
      remainingWork,
      toolCallCount: checkpoint.state.toolCallCount,
      filesTouched: checkpoint.state.filesTouched.slice(-50),
      recentErrors: checkpoint.state.recentFailures.slice(-5),
      handoffAt: new Date().toISOString(),
    };
  }

  /**
   * Build the continuation goal string for the child session.
   * This is injected as the goal in the new session.
   */
  buildContinuationGoal(ctx: AutoContinueContext): string {
    const remainingStr =
      ctx.remainingWork.length > 0
        ? ctx.remainingWork.map((w) => `  - ${w}`).join("\n")
        : "  (continue from where we left off)";

    const filesStr =
      ctx.filesTouched.length > 0
        ? `\nFiles already touched:\n  ${ctx.filesTouched.slice(-15).join("\n  ")}`
        : "";

    const errorsStr =
      ctx.recentErrors.length > 0
        ? `\nRecent errors to avoid:\n  ${ctx.recentErrors.map((e) => `  - ${e}`).join("\n")}`
        : "";

    return [
      `[AUTO-CONTINUE from session ${ctx.parentSessionId}]`,
      `Parent progress: ${ctx.supervisorSummary}`,
      `Parent checkpoint: ${ctx.checkpointSummary}`,
      `Tool calls so far: ${ctx.toolCallCount}`,
      ``,
      `REMAINING WORK:`,
      remainingStr,
      filesStr,
      errorsStr,
      ``,
      `Continue the mission from where the parent session left off.`,
      `You have full context of what was already done. Focus on completing`,
      `the remaining work listed above.`,
    ].join("\n");
  }

  /**
   * Build a notification payload for the AdminNotification system.
   * This lets the Neptune Chat UI show that a session has auto-continued.
   */
  buildNotification(ctx: AutoContinueContext, childSessionId: string) {
    return {
      type: "auto_continue" as const,
      parentSessionId: ctx.parentSessionId,
      childSessionId,
      message: `Session auto-continued after ${ctx.toolCallCount} tool calls`,
      remainingTasks: ctx.remainingWork.length,
      handoffAt: ctx.handoffAt,
      depth: this.continueDepth + 1,
    };
  }
}

// ── Spawn Child Session ────────────────────────────────────────────────────

const AGENT_SESSIONS_API =
  `${process.env.VERCEL_PROJECT_PRODUCTION_URL || "https://neptune-v2.vercel.app"}/api/agent-sessions`;
const INTERNAL_AUTH = `Bearer ${process.env.NEPTUNE_INTERNAL_TOKEN || ""}`;

/**
 * Spawn a child session for auto-continue.
 * Creates a new agent session record linked to the parent,
 * then triggers a new chat workflow with the continuation goal.
 */
export async function spawnAutoContinueSession(
  ctx: AutoContinueContext,
  continuationGoal: string,
  options: {
    chatId: string;
    userId: string;
    modelId: string;
    autoCommitEnabled?: boolean;
    autoCreatePrEnabled?: boolean;
  },
): Promise<{ childSessionId: string } | null> {
  try {
    // 1. Create child agent session linked to parent
    const createRes = await fetch(AGENT_SESSIONS_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: INTERNAL_AUTH,
      },
      body: JSON.stringify({
        goal: continuationGoal.slice(0, 500),
        model: options.modelId,
        mode: "auto-continue",
        chatId: options.chatId,
        sessionId: ctx.parentSessionId + "-continue",
      }),
    });

    if (!createRes.ok) {
      console.error(
        "[auto-continue] Failed to create child session:",
        await createRes.text().catch(() => "unknown"),
      );
      return null;
    }

    const childSession = (await createRes.json()) as { id: string };
    const childSessionId = childSession.id;

    // 2. Link child to parent via parent_session_id
    const linkRes = await fetch(
      `${AGENT_SESSIONS_API}/${childSessionId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: INTERNAL_AUTH,
        },
        body: JSON.stringify({
          parentSessionId: ctx.parentSessionId,
          status: "started",
          goal: ctx.goal,
          model: options.modelId,
        }),
      },
    );

    if (!linkRes.ok) {
      console.warn(
        "[auto-continue] Failed to link child to parent:",
        await linkRes.text().catch(() => "unknown"),
      );
    }

    // 3. Save the serialized context as the child's initial checkpoint
    const checkpointRes = await fetch(
      `${AGENT_SESSIONS_API}/${childSessionId}/checkpoint`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: INTERNAL_AUTH,
        },
        body: JSON.stringify({
          checkpointJson: {
            parentContext: ctx,
            continuationGoal,
            startedAt: new Date().toISOString(),
          },
          checkpointCount: 0,
          status: "started",
        }),
      },
    );

    if (!checkpointRes.ok) {
      console.warn(
        "[auto-continue] Failed to save child checkpoint:",
        await checkpointRes.text().catch(() => "unknown"),
      );
    }

    return { childSessionId };
  } catch (err) {
    console.error(
      "[auto-continue] spawn failed:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/**
 * Check if this session is a continuation of a parent.
 * Detects auto-continue by inspecting the goal for the [AUTO-CONTINUE] marker.
 */
export function detectAutoContinueSession(goal: string): {
  isAutoContinue: boolean;
  parentSessionId?: string;
} {
  const match = goal.match(
    /\[AUTO-CONTINUE from session ([a-zA-Z0-9-]+)\]/,
  );
  if (match) {
    return {
      isAutoContinue: true,
      parentSessionId: match[1],
    };
  }
  return { isAutoContinue: false };
}
