"use client";

import { ExternalLink, GitBranch, Loader2, Rocket } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface HandoffTask {
  id: string;
  source: string;
  goal: string;
  repo_url: string;
  vercel_deploy_status: "pending" | "building" | "deployed" | "failed";
  github_pr_url: string | null;
  vercel_deploy_url: string | null;
  created_at: string;
  updated_at: string;
}

function StatusBadge({ status }: { status: HandoffTask["vercel_deploy_status"] }) {
  const variants: Record<string, { label: string; className: string }> = {
    pending: { label: "Pending", className: "bg-yellow-100 text-yellow-800" },
    building: { label: "Building", className: "bg-blue-100 text-blue-800" },
    deployed: { label: "Deployed", className: "bg-green-100 text-green-800" },
    failed: { label: "Failed", className: "bg-red-100 text-red-800" },
  };
  const v = variants[status] || variants.pending;
  return <Badge className={v.className}>{v.label}</Badge>;
}

export function TasksPageClient() {
  const [tasks, setTasks] = useState<HandoffTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tasks")
      .then((r) => r.json())
      .then((data) => setTasks(data.tasks || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-500">Failed to load tasks: {error}</p>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Handoff Tasks</h1>
        <p className="text-muted-foreground mt-2">
          Tasks delegated from Neptune Chat to V2 Coding Agent
        </p>
      </div>

      {tasks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Rocket className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg">No handoff tasks yet</p>
            <p className="text-sm mt-1">
              Tasks will appear here when delegated from Neptune Chat
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {tasks.map((task) => (
            <Card key={task.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{task.goal}</CardTitle>
                    <CardDescription>
                      Source: {task.source} · ID: {task.id}
                    </CardDescription>
                  </div>
                  <StatusBadge status={task.vercel_deploy_status} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2 items-center text-sm text-muted-foreground">
                  <GitBranch className="h-4 w-4" />
                  <span className="font-mono text-xs">{task.repo_url}</span>
                </div>
                <div className="flex gap-2 mt-3">
                  {task.vercel_deploy_url && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={task.vercel_deploy_url} target="_blank" rel="noopener">
                        <Rocket className="h-4 w-4 mr-1" />
                        Open Deploy
                      </a>
                    </Button>
                  )}
                  {task.github_pr_url && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={task.github_pr_url} target="_blank" rel="noopener">
                        <ExternalLink className="h-4 w-4 mr-1" />
                        View PR
                      </a>
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Created: {new Date(task.created_at).toLocaleString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
