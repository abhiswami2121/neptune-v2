/**
 * Model Provider — AI Gateway Fallback Architecture (Phase 6)
 *
 * Thin re-export layer over @open-agents/agent shared modelWithFallback().
 * Adds web-specific logging (in-memory fallback event buffer, console.warn).
 *
 * Two-tier model routing: primary gateway model → fallback gateway model.
 * Fallback triggers on: 402 (Insufficient Balance), 429 (Rate Limit),
 * 500/502/503/504 (Provider Errors). Does NOT trigger on 401 (auth) or
 * 400/404 (bad request).
 *
 * Modeled after: /home/hermes/claude-agent-api/model_router.py
 */

import {
  gateway as sharedGateway,
  modelWithFallback as sharedModelWithFallback,
  isFallbackEligible as sharedIsFallbackEligible,
  getFallbackModelId as sharedGetFallbackModelId,
  MODEL_FALLBACK_MAP,
  type GatewayModelId,
  type LanguageModel,
  type GatewayOptions,
} from "@open-agents/agent";

// Re-export from shared package
export {
  MODEL_FALLBACK_MAP,
  type GatewayModelId,
  type LanguageModel,
  type GatewayOptions,
};

// ── Web-Specific Fallback Logging ─────────────────────────────────────────

/** In-memory fallback event buffer (last 100 events) */
const fallbackLog: FallbackEvent[] = [];
const MAX_FALLBACK_LOG = 100;

export interface FallbackEvent {
  primaryModelId: string;
  fallbackModelId: string;
  errorMessage: string;
  mode: "generate" | "stream";
  timestamp: string;
}

/**
 * Record a fallback event for observability.
 * Called by the onFallback callback in modelWithFallback.
 */
export function logFallback(
  primaryModelId: string,
  fallbackModelId: string,
  error: unknown,
  mode: "generate" | "stream" = "stream",
): void {
  const event: FallbackEvent = {
    primaryModelId,
    fallbackModelId,
    errorMessage:
      error instanceof Error ? error.message.slice(0, 200) : String(error),
    mode,
    timestamp: new Date().toISOString(),
  };

  fallbackLog.push(event);
  if (fallbackLog.length > MAX_FALLBACK_LOG) {
    fallbackLog.shift();
  }

  console.warn(
    `[model-fallback] ${primaryModelId} → ${fallbackModelId} (${mode}): ${event.errorMessage}`,
  );
}

/**
 * Get recent fallback events for health reporting.
 */
export function getFallbackLog(): ReadonlyArray<FallbackEvent> {
  return fallbackLog;
}

// ── Re-exported Functions (shared) ────────────────────────────────────────

/**
 * Re-export: re-export gateway from shared package.
 */
export const gateway = sharedGateway;

/**
 * Re-export: Determine if an error is eligible for model fallback.
 */
export const isFallbackEligible = sharedIsFallbackEligible;

/**
 * Re-export: Get the fallback model ID for a primary model.
 */
export const getFallbackModelId = sharedGetFallbackModelId;

/**
 * Check if a model has a configured fallback.
 */
export function hasFallbackModel(modelId: string): boolean {
  return modelId in MODEL_FALLBACK_MAP;
}

// ── Core: modelWithFallback ───────────────────────────────────────────────

/**
 * Wrap a gateway model with automatic fallback on eligible errors.
 *
 * Delegates to @open-agents/agent modelWithFallback() with web-specific
 * logging callback. On fallback-eligible errors (402/429/5xx), switches
 * to the configured fallback model and retries.
 *
 * Falls through to the primary model with no overhead when no fallback
 * is configured.
 */
export function modelWithFallback(
  modelId: string,
  options?: GatewayOptions,
): LanguageModel {
  return sharedModelWithFallback(
    modelId,
    options,
    (primaryId, fallbackId, error) => {
      logFallback(primaryId, fallbackId, error, "stream");
    },
  );
}
