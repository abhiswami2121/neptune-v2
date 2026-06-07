import {
  createGateway,
  defaultSettingsMiddleware,
  wrapLanguageModel,
  type GatewayModelId,
  type JSONValue,
  type LanguageModel,
} from "ai";
import type { AnthropicLanguageModelOptions } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { OpenAIResponsesProviderOptions } from "@ai-sdk/openai";

function supportsAdaptiveAnthropicThinking(modelId: string): boolean {
  return modelId.includes("4.6") || modelId.includes("4.7");
}

// Models with adaptive thinking support use effort control.
// Older models use the legacy extended thinking API with a budget.
function getAnthropicSettings(modelId: string): AnthropicLanguageModelOptions {
  if (supportsAdaptiveAnthropicThinking(modelId)) {
    return {
      effort: "medium",
      thinking: { type: "adaptive" },
    } satisfies AnthropicLanguageModelOptions;
  }

  return {
    thinking: { type: "enabled", budgetTokens: 8000 },
  };
}

function isJsonObject(value: unknown): value is Record<string, JSONValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toProviderOptionsRecord(
  options: Record<string, unknown>,
): Record<string, JSONValue> {
  return options as Record<string, JSONValue>;
}

function mergeRecords(
  base: Record<string, JSONValue>,
  override: Record<string, JSONValue>,
): Record<string, JSONValue> {
  const merged: Record<string, JSONValue> = { ...base };

  for (const [key, value] of Object.entries(override)) {
    const existingValue = merged[key];

    if (isJsonObject(existingValue) && isJsonObject(value)) {
      merged[key] = mergeRecords(existingValue, value);
      continue;
    }

    merged[key] = value;
  }

  return merged;
}

export type ProviderOptionsByProvider = Record<
  string,
  Record<string, JSONValue>
>;

export function mergeProviderOptions(
  defaults: ProviderOptionsByProvider,
  overrides?: ProviderOptionsByProvider,
): ProviderOptionsByProvider {
  if (!overrides || Object.keys(overrides).length === 0) {
    return defaults;
  }

  const merged: ProviderOptionsByProvider = { ...defaults };

  for (const [provider, providerOverrides] of Object.entries(overrides)) {
    const providerDefaults = merged[provider];

    if (!providerDefaults) {
      merged[provider] = providerOverrides;
      continue;
    }

    merged[provider] = mergeRecords(providerDefaults, providerOverrides);
  }

  return merged;
}

export interface GatewayConfig {
  baseURL: string;
  apiKey: string;
}

export interface GatewayOptions {
  config?: GatewayConfig;
  providerOptionsOverrides?: ProviderOptionsByProvider;
  appName?: string;
  appUrl?: string;
}

export type { GatewayModelId, LanguageModel, JSONValue };

export function shouldApplyOpenAIReasoningDefaults(modelId: string): boolean {
  return modelId.startsWith("openai/gpt-5");
}

function shouldApplyOpenAITextVerbosityDefaults(modelId: string): boolean {
  return modelId.startsWith("openai/gpt-5.4");
}

export function getProviderOptionsForModel(
  modelId: string,
  providerOptionsOverrides?: ProviderOptionsByProvider,
): ProviderOptionsByProvider {
  const defaultProviderOptions: ProviderOptionsByProvider = {};

  // Apply anthropic defaults
  if (modelId.startsWith("anthropic/")) {
    defaultProviderOptions.anthropic = toProviderOptionsRecord(
      getAnthropicSettings(modelId),
    );
  }

  // OpenAI model responses should never be persisted.
  if (modelId.startsWith("openai/")) {
    defaultProviderOptions.openai = toProviderOptionsRecord({
      store: false,
    } satisfies OpenAIResponsesProviderOptions);
  }

  // Apply OpenAI defaults for all GPT-5 variants to expose encrypted reasoning content.
  // This avoids Responses API failures when `store: false`, e.g.:
  // "Item with id 'rs_...' not found. Items are not persisted when `store` is set to false."
  if (shouldApplyOpenAIReasoningDefaults(modelId)) {
    defaultProviderOptions.openai = mergeRecords(
      defaultProviderOptions.openai ?? {},
      toProviderOptionsRecord({
        reasoningSummary: "detailed",
        include: ["reasoning.encrypted_content"],
      } satisfies OpenAIResponsesProviderOptions),
    );
  }

  if (shouldApplyOpenAITextVerbosityDefaults(modelId)) {
    defaultProviderOptions.openai = mergeRecords(
      defaultProviderOptions.openai ?? {},
      toProviderOptionsRecord({
        textVerbosity: "low",
      } satisfies OpenAIResponsesProviderOptions),
    );
  }

  const providerOptions = mergeProviderOptions(
    defaultProviderOptions,
    providerOptionsOverrides,
  );

  // Enforce OpenAI non-persistence even when custom provider overrides are present.
  if (modelId.startsWith("openai/")) {
    providerOptions.openai = mergeRecords(
      providerOptions.openai ?? {},
      toProviderOptionsRecord({
        store: false,
      } satisfies OpenAIResponsesProviderOptions),
    );
  }

  return providerOptions;
}

export function gateway(
  modelId: GatewayModelId,
  options: GatewayOptions = {},
): LanguageModel {
  const { config, providerOptionsOverrides, appName, appUrl } = options;

  const attributionHeaders = {
    "http-referer": appUrl ?? "https://open-agents.dev",
    "x-title": appName ?? "Open Agents",
  };

  const baseGateway = config
    ? createGateway({
        baseURL: config.baseURL,
        apiKey: config.apiKey,
        headers: attributionHeaders,
      })
    : createGateway({ headers: attributionHeaders });

  let model: LanguageModel = baseGateway(modelId);

  const providerOptions = getProviderOptionsForModel(
    modelId,
    providerOptionsOverrides,
  );

  if (Object.keys(providerOptions).length > 0) {
    model = wrapLanguageModel({
      model,
      middleware: defaultSettingsMiddleware({
        settings: { providerOptions },
      }),
    });
  }

  return model;
}

// ---------------------------------------------------------------
// AI Gateway-PRIMARY + DeepSeek-FALLBACK model resolution
// ---------------------------------------------------------------
// Mission 9 (2026-06-07) — methodical fix after 8 prior missions.
//
// EMPIRICAL FINDINGS (Phase 3 curl tests against ai-gateway.vercel.sh):
//
//   MODEL                         GATEWAY STREAMING        VERDICT
//   deepseek/deepseek-v3          text-delta ✓             GATEWAY PRIMARY
//   deepseek/deepseek-v3.1        text-delta ✓             GATEWAY PRIMARY
//   deepseek/deepseek-v3.1-terminus text-delta ✓          GATEWAY PRIMARY
//   deepseek/deepseek-v3.2        text-delta ✓             GATEWAY PRIMARY
//   deepseek/deepseek-v3.2-thinking text-delta ✓          GATEWAY PRIMARY
//   deepseek/deepseek-v4-pro      reasoning-only ✗         DIRECT FALLBACK
//   deepseek/deepseek-v4-flash    reasoning-only ✗         DIRECT FALLBACK
//   deepseek/deepseek-r1          reasoning-only ✗         DIRECT FALLBACK
//
// Root cause: V4 models are reasoning models. Through Gateway they
// stream ONLY reasoning-delta chunks, no text-delta. The AI SDK's
// UI displays text-delta — so the UI appears "stuck thinking"
// forever. V3 models stream text-delta beautifully through Gateway.
//
// Strategy per USER DIRECTIVE:
//   "use gateway default and then fallback to deepseek if gateway
//    is not working"
//
//   - V3.x DeepSeek: GATEWAY PRIMARY (streams beautifully, proven)
//   - V4.x + R1:     DIRECT FALLBACK (reasoning models, Gateway
//                     returns empty content — treated as "not working")
//   - Non-DeepSeek:  GATEWAY ONLY (Anthropic, OpenAI, etc.)
//
// Structured logging: [chat-provider-resolved] on every model
// resolution showing { modelId, provider, fallbackUsed }.
// ---------------------------------------------------------------

/**
 * DeepSeek models that stream text-delta through Gateway.
 * Verified empirically 2026-06-07 via curl against ai-gateway.vercel.sh.
 */
const GATEWAY_DEEPSEEK_MODELS = new Set<string>([
  "deepseek/deepseek-v3",
  "deepseek/deepseek-v3.1",
  "deepseek/deepseek-v3.1-terminus",
  "deepseek/deepseek-v3.2",
  "deepseek/deepseek-v3.2-thinking",
]);

/**
 * DeepSeek reasoning models — Gateway streams reasoning-delta only
 * (no text-delta). Route through direct DeepSeek API which maps
 * to non-reasoning aliases (deepseek-chat / deepseek-reasoner).
 */
const REASONING_DEEPSEEK_MODELS = new Set<string>([
  "deepseek/deepseek-v4-pro",
  "deepseek/deepseek-v4-flash",
  "deepseek/deepseek-r1",
]);

/** Map Gateway model IDs → DeepSeek API aliases (direct fallback path). */
const DEEPSEEK_FALLBACK_MAP: Record<string, string> = {
  "deepseek/deepseek-v4-pro": "deepseek-chat",
  "deepseek/deepseek-v4-flash": "deepseek-chat",
  "deepseek/deepseek-v3.2": "deepseek-chat",
  "deepseek/deepseek-v3.2-thinking": "deepseek-reasoner",
  "deepseek/deepseek-v3.1": "deepseek-chat",
  "deepseek/deepseek-v3.1-terminus": "deepseek-chat",
  "deepseek/deepseek-v3": "deepseek-chat",
  "deepseek/deepseek-r1": "deepseek-reasoner",
};

let _deepseekProvider: ReturnType<typeof createOpenAI> | undefined;

function getDeepSeekProvider(): ReturnType<typeof createOpenAI> {
  if (!_deepseekProvider) {
    _deepseekProvider = createOpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: "https://api.deepseek.com/v1",
    });
  }
  return _deepseekProvider;
}

export function isDeepSeekModel(modelId: string): boolean {
  return modelId.startsWith("deepseek/");
}

/**
 * Create a language model for the given model ID.
 *
 * Resolution logic (per Mission 9 / user directive):
 *
 *   1. Non-DeepSeek models → Gateway (Anthropic, OpenAI, etc.)
 *   2. DeepSeek V3.x models → Gateway PRIMARY (streams text-delta ✓)
 *   3. DeepSeek V4.x + R1 models → Direct DeepSeek API (FALLBACK)
 *      because Gateway streams reasoning-only (no text-delta) for
 *      these reasoning models.
 *
 * Every resolution logs [chat-provider-resolved] with the provider
 * path taken so operators can audit per-request routing.
 */
export function createDirectModel(
  modelId: GatewayModelId,
  options: GatewayOptions = {},
): LanguageModel {
  if (!isDeepSeekModel(modelId)) {
    // Non-DeepSeek: Gateway only (Anthropic, OpenAI, Google, etc.)
    console.log("[chat-provider-resolved]", {
      modelId,
      provider: "gateway",
      fallbackUsed: false,
    });
    return gateway(modelId, options);
  }

  const apiModelId = DEEPSEEK_FALLBACK_MAP[modelId] ?? "deepseek-chat";

  // V3.x models: Gateway streams text-delta beautifully — use it.
  if (GATEWAY_DEEPSEEK_MODELS.has(modelId)) {
    console.log("[chat-provider-resolved]", {
      modelId,
      provider: "gateway",
      fallbackUsed: false,
      modelClass: "v3-content-streaming",
    });
    return gateway(modelId, options);
  }

  // V4.x / R1 reasoning models: Gateway streams reasoning-only.
  // Fall back to direct DeepSeek API for content streaming.
  const provider = getDeepSeekProvider();
  const reason = REASONING_DEEPSEEK_MODELS.has(modelId)
    ? "reasoning-model-gateway-empty-content"
    : "unknown-deepseek-model";

  console.log("[chat-provider-resolved]", {
    modelId,
    provider: "deepseek-direct",
    fallbackUsed: true,
    reason,
    apiModelId,
  });

  // Use .chat() to target the Chat Completions API (/v1/chat/completions)
  // instead of the default Responses API (/v1/responses), which DeepSeek
  // does not support. Without this, the AI SDK sends requests to
  // /v1/responses which returns 404, causing the UI to appear stuck.
  return provider.chat(apiModelId);
}
