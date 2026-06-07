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
// Direct DeepSeek provider
// ---------------------------------------------------------------
// DeepSeek V4 models (pro, flash) stream ONLY reasoning tokens through
// the Vercel AI Gateway — no content text. The AI SDK receives
// reasoning-delta chunks but the UI waits for text-delta, appearing
// "stuck thinking".  Direct API with deepseek-chat alias resolves
// to the non-reasoning variant that streams normal content.
//
// Route ALL DeepSeek-flagged model IDs through the direct DeepSeek
// API (OpenAI-compatible) instead of the Gateway.
// ---------------------------------------------------------------

/** Map Gateway model IDs (deepseek/…) to DeepSeek API aliases. */
const DEEPSEEK_MODEL_MAP: Record<string, string> = {
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
 * - DeepSeek models are routed through the direct DeepSeek API
 *   (OpenAI-compatible endpoint) to avoid Gateway reasoning-only output.
 * - All other models go through the Vercel AI Gateway.
 */
export function createDirectModel(
	modelId: GatewayModelId,
	options: GatewayOptions = {},
): LanguageModel {
	if (isDeepSeekModel(modelId)) {
		const provider = getDeepSeekProvider();
		const apiModelId = DEEPSEEK_MODEL_MAP[modelId] ?? "deepseek-chat";
		// Use .chat() to target the Chat Completions API (/v1/chat/completions)
		// instead of the default Responses API (/v1/responses), which DeepSeek
		// does not support. Without this, the AI SDK sends requests to
		// /v1/responses which returns 404, causing the UI to appear stuck.
		return provider.chat(apiModelId);
	}

	return gateway(modelId, options);
}
