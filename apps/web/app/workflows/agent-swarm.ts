/**
 * Agent Swarm — Parallel sub-agent execution via Workflow SDK V5.
 *
 * Uses 'use workflow' + Promise.all for parallel multi-agent coordination.
 * Each sub-agent runs as a workflow step with individual observability.
 *
 * V5 beta check: The @workflow/ai@5.0.0-beta.4 package exports
 * WorkflowChatTransport but not a class-based DurableAgent. The V5
 * durable pattern is function-based: 'use workflow' + 'use step'.
 *
 * Fallback: If parallel execution fails, retry sequentially via
 * runAgentWorkflow (the existing V5-compatible durable workflow).
 */

import { FatalError, getWorkflowMetadata, getWritable, sleep } from "workflow";
import type { UIMessageChunk } from "ai";

export interface SwarmTask {
  id: string;
  description: string;
  context?: string;
}

export interface SwarmInput {
  tasks: SwarmTask[];
  /** Parent workflow run ID for observability */
  parentRunId?: string;
  /** Maximum steps per sub-task */
  maxStepsPerTask?: number;
}

export interface SwarmStepResult {
  taskId: string;
  status: "completed" | "failed" | "skipped";
  output?: string;
  error?: string;
  retries: number;
  durationMs: number;
}

export interface SwarmResult {
  runId: string;
  steps: SwarmStepResult[];
  totalDurationMs: number;
  parallelExecution: boolean;
}

// ---------------------------------------------------------------------------
// Sub-agent step
// ---------------------------------------------------------------------------

async function executeSingleTask(
  task: SwarmTask,
  maxSteps: number,
): Promise<SwarmStepResult> {
  "use step";

  const startedAt = Date.now();
  let retries = 0;
  const maxRetries = 3;

  while (retries <= maxRetries) {
    try {
      // Simulate agent work — in production, this would call openAgent.stream()
      // with task-specific instructions. For now, we emit observability events.
      const stepMeta = {
        taskId: task.id,
        step: retries + 1,
        maxSteps,
        context: task.context?.slice(0, 100),
      };

      // Emit progress to the writable stream
      const writable = getWritable<UIMessageChunk>();
      const writer = writable.getWriter();
      try {
        await writer.write({
          type: "text-start",
          id: `swarm-${task.id}`,
        } satisfies UIMessageChunk);
        await writer.write({
          type: "text-delta",
          id: `swarm-${task.id}`,
          delta: JSON.stringify({
            event: "swarm-step",
            ...stepMeta,
            timestamp: new Date().toISOString(),
          }),
        } satisfies UIMessageChunk);
        await writer.write({
          type: "text-end",
          id: `swarm-${task.id}`,
        } satisfies UIMessageChunk);
      } finally {
        writer.releaseLock();
      }

      // Success path
      return {
        taskId: task.id,
        status: "completed",
        output: `Task "${task.description}" processed`,
        retries,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      retries++;
      const message = error instanceof Error ? error.message : String(error);

      if (retries > maxRetries) {
        return {
          taskId: task.id,
          status: "failed",
          error: message,
          retries: retries - 1,
          durationMs: Date.now() - startedAt,
        };
      }

      // Exponential backoff before retry
      const backoffMs = Math.min(1000 * Math.pow(2, retries - 1), 8000);
      await sleep(`${backoffMs}ms`);
    }
  }

  return {
    taskId: task.id,
    status: "failed",
    error: "Max retries exceeded",
    retries,
    durationMs: Date.now() - startedAt,
  };
}

// ---------------------------------------------------------------------------
// Main swarm orchestration
// ---------------------------------------------------------------------------

export async function runAgentSwarm(input: SwarmInput): Promise<SwarmResult> {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const startedAt = Date.now();
  const maxSteps = input.maxStepsPerTask ?? 10;

  const writable = getWritable<UIMessageChunk>();
  const writer = writable.getWriter();

  // Emit swarm start event
  try {
    await writer.write({
      type: "text-start",
      id: "swarm-start",
    } satisfies UIMessageChunk);
    await writer.write({
      type: "text-delta",
      id: "swarm-start",
      delta: JSON.stringify({
        event: "swarm-start",
        runId: workflowRunId,
        taskCount: input.tasks.length,
        mode: "parallel",
        timestamp: new Date().toISOString(),
      }),
    } satisfies UIMessageChunk);
    await writer.write({
      type: "text-end",
      id: "swarm-start",
    } satisfies UIMessageChunk);
  } finally {
    writer.releaseLock();
  }

  let steps: SwarmStepResult[];
  let parallelExecution = true;

  try {
    // ---- V5 BETA: Parallel sub-agent execution ----
    // Try running all tasks in parallel using Promise.all.
    // Each task is a durable workflow step with individual retries.
    const taskPromises = input.tasks.map((task) =>
      executeSingleTask(task, maxSteps),
    );

    steps = await Promise.all(taskPromises);
  } catch (error) {
    // ---- FALLBACK: Sequential execution ----
    // If parallel execution fails (e.g., resource contention, timeout),
    // fall back to sequential processing.
    console.warn("[swarm-fallback]", {
      runId: workflowRunId,
      error: error instanceof Error ? error.message : String(error),
      taskCount: input.tasks.length,
      timestamp: new Date().toISOString(),
    });

    parallelExecution = false;
    steps = [];

    for (const task of input.tasks) {
      try {
        const result = await executeSingleTask(task, maxSteps);
        steps.push(result);
      } catch (taskError) {
        steps.push({
          taskId: task.id,
          status: "failed",
          error:
            taskError instanceof Error
              ? taskError.message
              : String(taskError),
          retries: 3,
          durationMs: 0,
        });
      }
    }
  }

  const totalDurationMs = Date.now() - startedAt;

  // Emit swarm complete event
  const finalWriter = writable.getWriter();
  try {
    const summary = {
      event: "swarm-complete",
      runId: workflowRunId,
      completed: steps.filter((s) => s.status === "completed").length,
      failed: steps.filter((s) => s.status === "failed").length,
      totalRetries: steps.reduce((sum, s) => sum + s.retries, 0),
      totalDurationMs,
      parallelExecution,
      timestamp: new Date().toISOString(),
    };

    await finalWriter.write({
      type: "text-start",
      id: "swarm-complete",
    } satisfies UIMessageChunk);
    await finalWriter.write({
      type: "text-delta",
      id: "swarm-complete",
      delta: JSON.stringify(summary),
    } satisfies UIMessageChunk);
    await finalWriter.write({
      type: "text-end",
      id: "swarm-complete",
    } satisfies UIMessageChunk);
  } finally {
    finalWriter.releaseLock();
  }

  const failedTasks = steps.filter((s) => s.status === "failed");
  if (failedTasks.length > 0 && steps.every((s) => s.status === "failed")) {
    throw new FatalError(
      `All ${failedTasks.length} swarm tasks failed: ${failedTasks.map((s) => s.error).join("; ")}`,
    );
  }

  return {
    runId: workflowRunId,
    steps,
    totalDurationMs,
    parallelExecution,
  };
}
