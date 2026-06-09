import { NextRequest, NextResponse } from "next/server";

// In-memory task store (replace with DB in production)
// Shared with /api/tasks route via module-level store
export interface HandoffTask {
  id: string;
  source: "neptune-chat";
  goal: string;
  repo_url: string;
  vercel_deploy_status: "pending" | "building" | "deployed" | "failed";
  github_pr_url: string | null;
  vercel_deploy_url: string | null;
  created_at: string;
  updated_at: string;
}

// Use global for cross-route persistence in dev
declare global {
  var __handoffTasks: HandoffTask[];
}
if (!globalThis.__handoffTasks) {
  globalThis.__handoffTasks = [];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { source, goal, repo_url, chat_id } = body;

    if (!goal || !repo_url) {
      return NextResponse.json(
        { error: "goal and repo_url are required" },
        { status: 400 }
      );
    }

    const task: HandoffTask = {
      id: `handoff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      source: source || "neptune-chat",
      goal,
      repo_url,
      vercel_deploy_status: "pending",
      github_pr_url: null,
      vercel_deploy_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    globalThis.__handoffTasks.push(task);

    return NextResponse.json({ success: true, task }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
