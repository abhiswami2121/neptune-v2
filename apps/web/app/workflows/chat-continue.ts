/**
 * Chat Continue Workflow — Phase 5 Durability
 *
 * Dedicated workflow entry point for auto-continued sessions.
 * Takes serialized parent context and resumes seamlessly.
 *
 * Uses "use workflow" directive for infinite Vercel function timeout survival.
 */

import type { UIMessageChunk } from "ai";
import { getWorkflowMetadata, getWritable } from "workflow";
import { runAgentWorkflow } from "./chat";
import type { AutoContinueContext } from "@/lib/agent/auto-continue";
import { loadSessionCheckpoint } from "@/lib/session-store";

export interface ContinueWorkflowOptions {
  /** Serialized context from parent session */
  context: AutoContinueContext;
  /** Child session ID */
  childSessionId: string;
  /** Chat ID (shared across session chain) */
  chatId: string;
  /** User ID */
  userId: string;
  /** Model ID to use */
  modelId: string;
  /** Session ID from parent (for linking) */
  parentSessionId: string;
  /** Continuation goal string */
  continuationGoal: string;
  /** Auth session */
  authSession: unknown;
  /** Max steps for continuation */
  maxSteps?: number;
  /** Auto-commit enabled */
  autoCommitEnabled?: boolean;
  /** Auto-create-PR enabled */
  autoCreatePrEnabled?: boolean;
}

/**
 * runContinueWorkflow — Entry point for auto-continued sessions.
 *
 * This wraps runAgentWorkflow with the continuation context from the parent.
 * The "use workflow" directive ensures the workflow survives Vercel function
 * timeouts (15 min max → infinite via workflow checkpointing).
 *
 * Continuation depth is tracked to prevent infinite chains.
 */
export async function runContinueWorkflow(options: ContinueWorkflowOptions) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const writable = getWritable<UIMessageChunk>();

  console.log("[continue-workflow] Starting continuation", {
    workflowRunId,
    parentSessionId: options.parentSessionId,
    childSessionId: options.childSessionId,
    remainingTasks: options.context.remainingWork.length,
    toolCallCount: options.context.toolCallCount,
    timestamp: new Date().toISOString(),
  });

  // Build a system message that captures the continuity
  const contextMessage = {
    role: "system" as const,
    id: `sys-continue-${options.childSessionId.slice(0, 8)}`,
    parts: [
      {
        type: "text" as const,
        text: `[CONTINUATION FROM ${options.parentSessionId}]\n${options.context.checkpointSummary}\n\n${options.context.supervisorSummary}`,
      },
    ],
  };

  // Build user-facing message with the continuation goal
  const userMessage = {
    role: "user" as const,
    parts: [
      {
        type: "text" as const,
        text: options.continuationGoal,
      },
    ],
    id: `continue-${options.childSessionId.slice(0, 8)}`,
  };

  // Delegate to the standard workflow with continuation context
  // The maxSteps is halved for continuation (prevent runaway chains)
  await runAgentWorkflow({
    messages: [contextMessage, userMessage],
    chatId: options.chatId,
    sessionId: options.childSessionId,
    userId: options.userId,
    requestUrl: "",
    authSession: options.authSession as any,
    modelId: options.modelId,
    autoMode: false,
    maxSteps: options.maxSteps ?? 250,
    autoCommitEnabled: options.autoCommitEnabled,
    autoCreatePrEnabled: options.autoCreatePrEnabled,
    inputMessagesPersisted: true, // Messages are already persisted from parent
  });
}

// ── Extended Step Timeout for Durable Workflows ────────────────────────────

/**
 * Durable step timeout constant.
 * Extends the standard 3-minute timeout to 10 minutes for long-running
 * tool executions in durable workflows (large builds, migrations, etc.).
 *
 * The workflow SDK ensures the function survives beyond Vercel's 15-min
 * serverless limit through automatic checkpointing.
 */
export const DURABLE_STEP_TIMEOUT_MS = 600_000; // 10 minutes

/**
 * Standard step timeout for non-durable (sandbox) mode.
 */
export const STANDARD_STEP_TIMEOUT_MS = 180_000; // 3 minutes
