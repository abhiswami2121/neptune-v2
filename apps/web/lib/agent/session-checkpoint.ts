/**
 * SessionCheckpoint — Neptune V2 Durability Layer (Phase 2)
 *
 * Saves session state to Postgres (primary) + Redis (cache) every 30s,
 * enabling checkpoint+resume for long-running coding missions.
 *
 * Modeled after VPS Hermes SessionState._emit_checkpoint() /
 * _write_status_file() patterns from claude-agent-api/server.py.
 *
 * Checkpoint frequency:
 *   - Full checkpoint: every 30s OR every 50 tool calls
 *   - Light checkpoint: every 5 tool calls (chat_store only)
 *   - Status sidecar: on every event (written to Postgres)
 */

import { appendSessionEvent } from "@/lib/session-store";

// ── Types ──────────────────────────────────────────────────────────────────

export interface CheckpointSnapshot {
  /** Checkpoint sequence number (monotonic) */
  n: number;
  /** Current step iteration number */
  iter: number;
  /** Total tool calls executed so far */
  toolCallCount: number;
  /** Human-readable progress summary */
  summary: string;
  /** Whether this checkpoint was created by auto-continue */
  autoContinued: boolean;
  /** ISO timestamp */
  ts: string;
}

export interface SessionCheckpointState {
  /** Total tool calls executed in this session */
  toolCallCount: number;
  /** Current step iteration */
  iterNumber: number;
  /** Accumulated assistant text (last 5000 chars) */
  accumulatedText: string;
  /** Files touched during this session */
  filesTouched: string[];
  /** Last N tool call summaries (name, target, status) */
  toolHistory: ToolCallSummary[];
  /** Last N tool failures for recovery analysis */
  recentFailures: string[];
  /** Full checkpoint snapshots */
  checkpoints: CheckpointSnapshot[];
  /** Last error encountered */
  lastError: string | null;
  /** Whether the session has been auto-continued */
  autoContinued: boolean;
  /** Original parent session ID (if this is a continuation) */
  parentSessionId: string | null;
}

export interface ToolCallSummary {
  /** Tool call index */
  i: number;
  /** Tool name (e.g. "Bash", "Write", "Read") */
  name: string;
  /** Target file path or command snippet */
  target: string;
  /** Elapsed seconds since session start */
  elapsed: number;
  /** "running" | "success" | "error" */
  status: "running" | "success" | "error";
  /** Error message if failed */
  error: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const FULL_CHECKPOINT_INTERVAL_CALLS = 50;
const LIGHT_CHECKPOINT_INTERVAL_CALLS = 5;
const CHECKPOINT_INTERVAL_MS = 30_000; // 30 seconds
const MAX_FILES_TRACKED = 200;
const MAX_TOOL_HISTORY = 100;
const MAX_RECENT_FAILURES = 10;
const MAX_ACCUMULATED_TEXT_LENGTH = 5000;

// ── SessionCheckpoint Class ────────────────────────────────────────────────

export class SessionCheckpoint {
  readonly sessionId: string;
  readonly createdAt: number;

  /** Public state for rehydration — do NOT mutate directly */
  state: SessionCheckpointState;
  lastFullCheckpointTime: number = 0;
  lastLightCheckpointCallCount: number = 0;
  lastFullCheckpointCallCount: number = 0;

  constructor(
    sessionId: string,
    options?: {
      goal?: string;
      model?: string;
      parentSessionId?: string | null;
    },
  ) {
    this.sessionId = sessionId;
    this.createdAt = Date.now();
    this.state = {
      toolCallCount: 0,
      iterNumber: 0,
      accumulatedText: "",
      filesTouched: [],
      toolHistory: [],
      recentFailures: [],
      checkpoints: [],
      lastError: null,
      autoContinued: false,
      parentSessionId: options?.parentSessionId ?? null,
    };

    // Emit initial "started" checkpoint event
    this._emitSessionEvent("checkpoint_started", {
      goal: options?.goal ?? "",
      model: options?.model ?? "",
      parentSessionId: options?.parentSessionId ?? null,
    });
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Call on every tool_use event to track progress */
  onToolUse(name: string, target?: string, reason?: string): void {
    this.state.toolCallCount++;

    const summary: ToolCallSummary = {
      i: this.state.toolCallCount,
      name,
      target: target ?? "",
      elapsed: Math.floor((Date.now() - this.createdAt) / 1000),
      status: "running",
      error: "",
    };
    this.state.toolHistory.push(summary);
    if (this.state.toolHistory.length > MAX_TOOL_HISTORY) {
      this.state.toolHistory.shift();
    }

    // Track file paths touched
    if (target && !this.state.filesTouched.includes(target)) {
      this.state.filesTouched.push(target);
      if (this.state.filesTouched.length > MAX_FILES_TRACKED) {
        this.state.filesTouched.shift();
      }
    }

    // Checkpoint logic — mirrors VPS Hermes pattern
    const now = Date.now();

    // Light checkpoint: every 5 calls (Redis event only)
    if (
      this.state.toolCallCount - this.lastLightCheckpointCallCount >=
      LIGHT_CHECKPOINT_INTERVAL_CALLS
    ) {
      this.lastLightCheckpointCallCount = this.state.toolCallCount;
      this._emitLightCheckpoint();
    }

    // Full checkpoint: every 50 calls OR every 30s
    const shouldFullCheckpoint =
      this.state.toolCallCount - this.lastFullCheckpointCallCount >=
        FULL_CHECKPOINT_INTERVAL_CALLS ||
      now - this.lastFullCheckpointTime >= CHECKPOINT_INTERVAL_MS;

    if (shouldFullCheckpoint) {
      this.lastFullCheckpointCallCount = this.state.toolCallCount;
      this.lastFullCheckpointTime = now;
      this._emitFullCheckpoint();
    }
  }

  /** Call on every tool_result event */
  onToolResult(isError: boolean, errorMessage?: string): void {
    // Update last tool in history
    const lastTool = this.state.toolHistory.at(-1);
    if (lastTool) {
      lastTool.status = isError ? "error" : "success";
      if (isError && errorMessage) {
        lastTool.error = errorMessage.slice(0, 200);
      }
    }

    // Track failures for recovery analysis
    if (isError) {
      this.state.recentFailures.push(
        errorMessage?.slice(0, 120) ?? "Unknown tool error",
      );
      if (this.state.recentFailures.length > MAX_RECENT_FAILURES) {
        this.state.recentFailures.shift();
      }
    }
  }

  /** Call on every turn_complete event */
  onTurnComplete(): void {
    this.state.iterNumber++;
  }

  /** Call when assistant text is accumulated */
  onTextDelta(text: string): void {
    this.state.accumulatedText += text;
    if (this.state.accumulatedText.length > MAX_ACCUMULATED_TEXT_LENGTH) {
      this.state.accumulatedText = this.state.accumulatedText.slice(
        -MAX_ACCUMULATED_TEXT_LENGTH,
      );
    }
  }

  /** Call on error */
  onError(error: string): void {
    this.state.lastError = error;
    this._emitSessionEvent("checkpoint_error", { error });
  }

  /** Mark this session as auto-continued */
  markAutoContinued(): void {
    this.state.autoContinued = true;
  }

  /** Force an immediate full checkpoint (used before auto-continue handoff) */
  forceCheckpoint(): CheckpointSnapshot {
    return this._emitFullCheckpoint();
  }

  /** Get current state snapshot for serialization */
  getState(): Readonly<SessionCheckpointState> {
    return this.state;
  }

  /** Build a context summary for resumption */
  buildResumeSummary(): string {
    const { toolCallCount, iterNumber, accumulatedText, filesTouched } =
      this.state;

    const filesList =
      filesTouched.length > 0
        ? `\nFiles touched: ${filesTouched.slice(-20).join(", ")}`
        : "";

    const textPreview = accumulatedText.slice(-500).replace(/\n/g, " ");

    return [
      `[RESUME FROM CHECKPOINT — tool call ${toolCallCount}, iter ${iterNumber}]`,
      `Progress summary: ${this._makeSummary()}`,
      `Recent context: ${textPreview || "(no text accumulated)"}`,
      filesList,
      "Continue where we left off.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private _makeSummary(): string {
    const lastTool = this.state.toolHistory.at(-1);
    const lastToolStr = lastTool
      ? `${lastTool.name}(${lastTool.target.slice(0, 40)})`
      : "N/A";

    const textPreview = this.state.accumulatedText.slice(-120).replace(/\n/g, " ");

    return (
      `Checkpoint #${this.state.checkpoints.length} after ` +
      `${this.state.toolCallCount} calls. ` +
      `Last tool: ${lastToolStr}. ` +
      `${textPreview ? textPreview : ""}`
    ).slice(0, 250);
  }

  private _emitFullCheckpoint(): CheckpointSnapshot {
    const cp: CheckpointSnapshot = {
      n: this.state.checkpoints.length + 1,
      iter: this.state.iterNumber,
      toolCallCount: this.state.toolCallCount,
      summary: this._makeSummary(),
      autoContinued: this.state.autoContinued,
      ts: new Date().toISOString(),
    };

    this.state.checkpoints.push(cp);

    // Persist to agent session event stream
    this._emitSessionEvent("checkpoint", {
      checkpoint: cp,
      state: {
        toolCallCount: this.state.toolCallCount,
        iterNumber: this.state.iterNumber,
        filesTouchedCount: this.state.filesTouched.length,
        recentFailures: this.state.recentFailures.slice(-3),
        accumulatedTextPreview: this.state.accumulatedText.slice(-200),
        lastError: this.state.lastError,
      },
    });

    return cp;
  }

  private _emitLightCheckpoint(): void {
    this._emitSessionEvent("checkpoint_light", {
      toolCallCount: this.state.toolCallCount,
      iter: this.state.iterNumber,
      lastTool:
        this.state.toolHistory.at(-1)?.name ?? "N/A",
      ts: Date.now(),
    });
  }

  private _emitSessionEvent(
    type: string,
    data: Record<string, unknown>,
  ): void {
    // Fire-and-forget — checkpoint persistence must never block the agent
    appendSessionEvent(this.sessionId, type, data).catch((err) => {
      console.error(
        `[session-checkpoint] Failed to emit ${type} for ${this.sessionId.slice(0, 12)}:`,
        err instanceof Error ? err.message : String(err),
      );
    });
  }
}

// ── Rehydration ────────────────────────────────────────────────────────────

/**
 * Rehydrate a SessionCheckpoint from saved state (used on resume).
 * Loads events from Redis agent session stream and reconstructs state.
 */
export async function rehydrateCheckpoint(
  sessionId: string,
  options?: {
    goal?: string;
    model?: string;
    parentSessionId?: string | null;
  },
): Promise<SessionCheckpoint> {
  const checkpoint = new SessionCheckpoint(sessionId, options);

  // Events are loaded asynchronously; the checkpoint reconstructs
  // from the event stream. For immediate resume, we load the latest
  // checkpoint snapshot and pre-seed the state.
  try {
    const { getSessionEvents } = await import("@/lib/session-store");
    const events = await getSessionEvents(sessionId);

    // Reconstruct from checkpoint events
    for (const event of events) {
      if (event.type === "checkpoint" && event.data?.checkpoint) {
        const cp = event.data.checkpoint as CheckpointSnapshot;
        checkpoint.state.checkpoints.push(cp);
        checkpoint.state.toolCallCount = Math.max(
          checkpoint.state.toolCallCount,
          cp.toolCallCount,
        );
        checkpoint.state.iterNumber = Math.max(
          checkpoint.state.iterNumber,
          cp.iter,
        );
      }
      if (event.type === "checkpoint" && event.data?.state) {
        const s = event.data.state as Record<string, unknown>;
        if (typeof s.toolCallCount === "number") {
          checkpoint.state.toolCallCount = Math.max(
            checkpoint.state.toolCallCount,
            s.toolCallCount,
          );
        }
        if (typeof s.lastError === "string") {
          checkpoint.state.lastError = s.lastError;
        }
      }
    }

    // Set last checkpoint counters to avoid immediate re-checkpoint
    checkpoint.lastFullCheckpointCallCount = checkpoint.state.toolCallCount;
    checkpoint.lastLightCheckpointCallCount = checkpoint.state.toolCallCount;
    checkpoint.lastFullCheckpointTime = Date.now();
  } catch (err) {
    console.warn(
      `[session-checkpoint] Rehydration from events failed for ${sessionId.slice(0, 12)}:`,
      err instanceof Error ? err.message : String(err),
    );
    // Continue with fresh state — graceful degradation
  }

  return checkpoint;
}
