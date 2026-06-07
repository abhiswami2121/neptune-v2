/**
 * Workflow Run API — POST endpoint for spawning durable agent workflows.
 *
 * POST /api/workflow/run
 * Body: {
 *   tasks: [{ id: string, description: string, context?: string }],
 *   maxStepsPerTask?: number,
 *   mode?: "auto" | "parallel" | "sequential"
 * }
 * Response: 200 with SSE stream of step events, or JSON result.
 *
 * Uses the V5 Workflow SDK 'use workflow' pattern with V4-style
 * fallback if parallel execution encounters errors.
 */

import { start } from "workflow/api";
import {
  requireAuthenticatedUser,
} from "@/app/api/chat/_lib/chat-context";
import { runAgentSwarm, type SwarmInput } from "@/app/workflows/agent-swarm";
import type { UIMessageChunk } from "ai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkflowRunRequest {
  tasks?: Array<{
    id?: string;
    description: string;
    context?: string;
  }>;
  maxStepsPerTask?: number;
  mode?: "auto" | "parallel" | "sequential";
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  // Auth
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return authResult.response;
  }

  // Parse body
  let body: WorkflowRunRequest;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!body.tasks || !Array.isArray(body.tasks) || body.tasks.length === 0) {
    return Response.json(
      { error: "tasks (array of {description, context?}) is required" },
      { status: 400 },
    );
  }

  // Normalize tasks
  const tasks = body.tasks.map((t, i) => ({
    id: t.id ?? `task-${i + 1}`,
    description: t.description,
    context: t.context,
  }));

  const swarmInput: SwarmInput = {
    tasks,
    maxStepsPerTask: body.maxStepsPerTask ?? 10,
  };

  console.log("[workflow-run-started]", {
    taskCount: tasks.length,
    mode: body.mode ?? "auto",
    maxStepsPerTask: swarmInput.maxStepsPerTask,
    timestamp: new Date().toISOString(),
  });

  try {
    // Start the durable workflow — returns a run handle with runId
    const run = await start(runAgentSwarm, [swarmInput]);

    // Return the run ID for polling via /api/workflow/status?runId=...
    return Response.json({
      ok: true,
      runId: run.runId,
      taskCount: tasks.length,
      message: "Workflow started. Poll /api/workflow/status?runId=... for results.",
    });
  } catch (err) {
    console.error("[workflow-run-error]", {
      message: err instanceof Error ? err.message : String(err),
      name: err instanceof Error ? err.name : "UnknownError",
      timestamp: new Date().toISOString(),
    });

    return Response.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
