/**
 * Aliveness — Provider + Model Health Checks (Phase 6)
 *
 * Lightweight health probes for AI Gateway models. Used by:
 * - Health endpoint (/api/health)
 * - Model fallback pre-flight checks
 * - vercel-watcher monitoring (Phase 9)
 *
 * Modeled after: claude-agent-api/router_status() in model_router.py
 */

import {
  getFallbackModelId,
  getFallbackLog,
  type FallbackEvent,
} from "./model-provider";

// ── Constants ──────────────────────────────────────────────────────────────

const GATEWAY_URL = "https://ai-gateway.vercel.sh";
const GATEWAY_KEY = process.env.AI_GATEWAY_API_KEY || "";
const PROBE_TIMEOUT_MS = 5000;

// ── Types ──────────────────────────────────────────────────────────────────

export interface ProviderHealth {
  /** Model ID */
  modelId: string;
  /** Whether the model responded successfully */
  alive: boolean;
  /** HTTP status code from gateway */
  statusCode: number | null;
  /** Latency in milliseconds */
  latencyMs: number;
  /** Error message if not alive */
  error?: string;
  /** Timestamp of probe */
  checkedAt: string;
}

export interface AlivenessReport {
  /** Overall gateway connectivity */
  gatewayReachable: boolean;
  /** Gateway key configured */
  gatewayKeyConfigured: boolean;
  /** Per-model health probes */
  models: ProviderHealth[];
  /** Recent fallback events count */
  recentFallbacks: number;
  /** Fresh fallback events (last 60s) */
  activeFallbacks: FallbackEvent[];
  /** Report timestamp */
  timestamp: string;
}

// ── Health Probe ───────────────────────────────────────────────────────────

/**
 * Probe whether a specific AI Gateway model is alive.
 * Sends a minimal completion request — checks for non-5xx/non-402 response.
 */
export async function isProviderAlive(
  modelId: string,
): Promise<ProviderHealth> {
  const startTime = Date.now();

  if (!GATEWAY_KEY) {
    return {
      modelId,
      alive: false,
      statusCode: null,
      latencyMs: 0,
      error: "AI_GATEWAY_API_KEY not configured",
      checkedAt: new Date().toISOString(),
    };
  }

  try {
    const res = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GATEWAY_KEY}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    const latencyMs = Date.now() - startTime;

    // 402 = model exists but no balance → alive but unusable for us
    // 429 = rate limited → alive but throttled
    // 2xx = fully alive
    const alive = res.ok || res.status === 402 || res.status === 429;

    return {
      modelId,
      alive,
      statusCode: res.status,
      latencyMs,
      error: alive ? undefined : `HTTP ${res.status}`,
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      modelId,
      alive: false,
      statusCode: null,
      latencyMs: Date.now() - startTime,
      error: err instanceof Error ? err.message : String(err),
      checkedAt: new Date().toISOString(),
    };
  }
}

/**
 * Probe a set of models in parallel.
 */
export async function probeModels(
  modelIds: string[],
): Promise<ProviderHealth[]> {
  return Promise.all(modelIds.map((id) => isProviderAlive(id)));
}

// ── Gateway Connectivity ───────────────────────────────────────────────────

/**
 * Check if the AI Gateway is reachable at all.
 * Lightweight: hits /v1/models endpoint.
 */
export async function isGatewayReachable(): Promise<{
  reachable: boolean;
  latencyMs: number;
  modelCount?: number;
  error?: string;
}> {
  const startTime = Date.now();

  if (!GATEWAY_KEY) {
    return {
      reachable: false,
      latencyMs: 0,
      error: "AI_GATEWAY_API_KEY not configured",
    };
  }

  try {
    const res = await fetch(`${GATEWAY_URL}/v1/models`, {
      headers: { Authorization: `Bearer ${GATEWAY_KEY}` },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    const latencyMs = Date.now() - startTime;

    if (!res.ok) {
      return { reachable: false, latencyMs, error: `HTTP ${res.status}` };
    }

    const data = (await res.json()) as { data?: unknown[] };
    return {
      reachable: true,
      latencyMs,
      modelCount: Array.isArray(data.data) ? data.data.length : undefined,
    };
  } catch (err) {
    return {
      reachable: false,
      latencyMs: Date.now() - startTime,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Full Report ────────────────────────────────────────────────────────────

/**
 * Generate a comprehensive aliveness report.
 * Used by health endpoint and Phase 9 vercel-watcher monitoring.
 */
export async function generateAlivenessReport(
  modelIds?: string[],
): Promise<AlivenessReport> {
  const defaultModels = [
    "deepseek/deepseek-v4-flash",
    "zai/glm-5.2",
    "moonshotai/kimi-k2.6",
    "anthropic/claude-sonnet-4.6",
  ];

  const modelsToProbe = modelIds ?? defaultModels;
  const now = Date.now();

  const [gatewayResult, modelResults, fallbackLog] = await Promise.all([
    isGatewayReachable(),
    probeModels(modelsToProbe),
    Promise.resolve(getFallbackLog()),
  ]);

  // Filter fresh fallback events (last 60 seconds)
  const freshFallbacks = fallbackLog.filter(
    (e) => now - new Date(e.timestamp).getTime() < 60_000,
  );

  return {
    gatewayReachable: gatewayResult.reachable,
    gatewayKeyConfigured: !!GATEWAY_KEY,
    models: modelResults,
    recentFallbacks: fallbackLog.length,
    activeFallbacks: freshFallbacks,
    timestamp: new Date().toISOString(),
  };
}

// ── Quick Check ────────────────────────────────────────────────────────────

/**
 * Fast check: is the primary model alive AND its fallback available?
 * Used as pre-flight before expensive operations.
 */
export async function quickHealthCheck(
  modelId: string,
): Promise<{ primaryAlive: boolean; fallbackAlive: boolean }> {
  const fallbackId = getFallbackModelId(modelId);
  const probes = await probeModels(
    fallbackId ? [modelId, fallbackId] : [modelId],
  );

  return {
    primaryAlive: probes[0]?.alive ?? false,
    fallbackAlive: probes[1]?.alive ?? false,
  };
}
