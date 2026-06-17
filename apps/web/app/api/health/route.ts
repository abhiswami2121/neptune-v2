/**
 * Phase 28: /api/health — V2 Health Check
 *
 * Returns service health including DB and AI Gateway connectivity.
 * Unauthenticated (public health check).
 */

import { NextResponse } from "next/server";

// Constants
const GATEWAY_URL = "https://ai-gateway.vercel.sh";
const GATEWAY_KEY = process.env.AI_GATEWAY_API_KEY || "";

interface HealthStatus {
  status: "ok" | "degraded" | "down";
  timestamp: string;
  version: string;
  checks: Record<string, { status: string; detail?: string; latencyMs?: number }>;
}

export async function GET() {
  const startTime = Date.now();
  const health: HealthStatus = {
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "phase-28",
    checks: {},
  };

  // Check 1: API is alive
  health.checks.api = { status: "ok", latencyMs: 0 };

  // Check 2: AI Gateway connectivity
  if (GATEWAY_KEY) {
    const gwStart = Date.now();
    try {
      const res = await fetch(`${GATEWAY_URL}/v1/models`, {
        headers: { Authorization: `Bearer ${GATEWAY_KEY}` },
        signal: AbortSignal.timeout(5000),
      });
      health.checks.gateway = {
        status: res.ok ? "ok" : "degraded",
        detail: `HTTP ${res.status}`,
        latencyMs: Date.now() - gwStart,
      };
      if (!res.ok) health.status = "degraded";
    } catch (err) {
      health.checks.gateway = {
        status: "degraded",
        detail: (err as Error).message,
        latencyMs: Date.now() - gwStart,
      };
      health.status = "degraded";
    }
  } else {
    health.checks.gateway = { status: "degraded", detail: "AI_GATEWAY_API_KEY not configured" };
    health.status = "degraded";
  }

  // Check 3: DB status (check env config only — no query to avoid cold start latency)
  const dbUrl = process.env.NEPTUNE_V2_POSTGRES_URL || process.env.POSTGRES_URL || "";
  health.checks.database = {
    status: dbUrl ? "ok" : "degraded",
    detail: dbUrl ? "configured" : "no POSTGRES_URL set",
  };
  if (!dbUrl) health.status = "degraded";

  // Check 4: Webhook config
  health.checks.webhook = {
    status: process.env.V2_WEBHOOK_SECRET ? "ok" : "degraded",
    detail: process.env.V2_WEBHOOK_SECRET ? "configured" : "V2_WEBHOOK_SECRET not set",
  };
  if (!process.env.V2_WEBHOOK_SECRET) health.status = "degraded";

  // Check 5: Internal token
  health.checks.auth = {
    status: process.env.NEPTUNE_INTERNAL_TOKEN ? "ok" : "degraded",
    detail: process.env.NEPTUNE_INTERNAL_TOKEN ? "configured" : "NEPTUNE_INTERNAL_TOKEN not set",
  };

  health.checks.total = {
    status: "ok",
    latencyMs: Date.now() - startTime,
  };

  return NextResponse.json(health, {
    status: health.status === "ok" ? 200 : health.status === "degraded" ? 200 : 503,
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
