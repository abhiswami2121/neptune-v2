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
import { generateText, type UIMessageChunk } from "ai";
import { gateway, defaultModelLabel } from "@open-agents/agent";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
// Specialist model routing
// ---------------------------------------------------------------------------

type SpecialistRole = "planner" | "coder" | "reviewer";

const SPECIALIST_PROMPTS: Record<SpecialistRole, string> = {
  planner:
    "You are an architecture planner. Analyze the task and produce a detailed, actionable implementation plan. Break it into concrete steps. Do NOT write code — only plan.",
  coder:
    "You are a senior software engineer. Implement the task following best practices. Write production-quality code. Be concise and direct.",
  reviewer:
    "You are a code reviewer. Validate the implementation for correctness, security, performance, and style. Report bugs, suggest improvements, and confirm what looks good.",
};

const SPECIALIST_MODELS: Record<SpecialistRole, string> = {
  planner: "anthropic/claude-sonnet-4.6",
  coder: "deepseek/deepseek-v4-pro",
  reviewer: "openai/gpt-5-codex",
};

function getModelForTask(taskId: string): { modelId: string; role: SpecialistRole } {
  // Map task ID to specialist role and model
  if (taskId === "planner") return { modelId: SPECIALIST_MODELS.planner, role: "planner" };
  if (taskId === "reviewer") return { modelId: SPECIALIST_MODELS.reviewer, role: "reviewer" };
  return { modelId: SPECIALIST_MODELS.coder, role: "coder" };
}

// ---------------------------------------------------------------------------
// Sub-agent step — real model call
// ---------------------------------------------------------------------------

const SWARM_TIMEOUT_MS = 180_000; // 3 minutes per task

async function executeSingleTask(
  task: SwarmTask,
  maxSteps: number,
): Promise<SwarmStepResult> {
  "use step";

  const startedAt = Date.now();
  const { modelId, role } = getModelForTask(task.id);
  const systemPrompt = `${SPECIALIST_PROMPTS[role]}\n\nTask context: ${task.context ?? task.description}`;
  let retries = 0;
  const maxRetries = 2;

  // Emit specialist start event
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
        event: "specialist-start",
        taskId: task.id,
        role,
        modelId,
        timestamp: new Date().toISOString(),
      }),
    } satisfies UIMessageChunk);
  } finally {
    writer.releaseLock();
  }

  while (retries <= maxRetries) {
    try {
      const model = gateway(modelId);

      const result = await generateText({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: task.description },
        ],
        maxOutputTokens: 4096,
        abortSignal: AbortSignal.timeout(SWARM_TIMEOUT_MS),
      });

      // Emit specialist output
      const outWriter = writable.getWriter();
      try {
        await outWriter.write({
          type: "text-delta",
          id: `swarm-${task.id}`,
          delta: JSON.stringify({
            event: "specialist-output",
            taskId: task.id,
            role,
            modelId,
            output: result.text.slice(0, 2000), // Truncate for streaming
            timestamp: new Date().toISOString(),
          }),
        } satisfies UIMessageChunk);
        await outWriter.write({
          type: "text-end",
          id: `swarm-${task.id}`,
        } satisfies UIMessageChunk);
      } finally {
        outWriter.releaseLock();
      }

      return {
        taskId: task.id,
        status: "completed",
        output: result.text,
        retries,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      retries++;
      const message = error instanceof Error ? error.message : String(error);

      if (retries > maxRetries) {
        // Emit error
        const errWriter = writable.getWriter();
        try {
          await errWriter.write({
            type: "text-delta",
            id: `swarm-${task.id}`,
            delta: JSON.stringify({
              event: "specialist-error",
              taskId: task.id,
              error: message,
              timestamp: new Date().toISOString(),
            }),
          } satisfies UIMessageChunk);
          await errWriter.write({
            type: "text-end",
            id: `swarm-${task.id}`,
          } satisfies UIMessageChunk);
        } finally {
          errWriter.releaseLock();
        }

        return {
          taskId: task.id,
          status: "failed",
          error: message,
          retries: retries - 1,
          durationMs: Date.now() - startedAt,
        };
      }

      await sleep(`${Math.min(1000 * Math.pow(2, retries - 1), 8000)}ms`);
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
