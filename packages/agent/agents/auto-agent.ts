/**
 * Auto Mode Task Classifier & Model Router
 *
 * Analyzes user prompt complexity and selects the optimal model tier.
 * Used by openAgent's prepareCall hook when no explicit model is chosen.
 *
 * Model Tiers (cardinal ladder):
 * - instant:  deepseek/deepseek-v4-flash   ($0.28/M out, 1M ctx, fast)
 * - standard: qwen3-coder-30b-a3b          ($0.60/M out, 262K ctx, coding)
 * - heavy:    deepseek/deepseek-v4-pro     ($0.87/M out, 1M ctx, thinking)
 * - frontier: anthropic/claude-opus-4.7    ($25/M out, 1M ctx, premium)
 */

import type { GatewayModelId } from "ai";

// ---------------------------------------------------------------------------
// Task classification
// ---------------------------------------------------------------------------

export type TaskClass = "chat" | "coding" | "research" | "reasoning";
export type AutoTier = "instant" | "standard" | "heavy" | "frontier";

export interface AutoModeClassification {
  taskClass: TaskClass;
  tier: AutoTier;
  modelId: GatewayModelId;
  reason: string;
  /** How many user messages were analyzed */
  analyzedMessages: number;
  /** Key signals that drove the classification */
  signals: string[];
}

const TIER_MODEL_MAP: Record<AutoTier, GatewayModelId> = {
  instant: "deepseek/deepseek-v4-flash",
  standard: "alibaba/qwen3-coder-30b-a3b",
  heavy: "deepseek/deepseek-v4-pro",
  frontier: "anthropic/claude-opus-4.7",
} as const;

// ---------------------------------------------------------------------------
// Signal detection
// ---------------------------------------------------------------------------

interface ClassificationSignals {
  isSimpleGreeting: boolean;
  isShortQuestion: boolean;
  mentionsCode: boolean;
  mentionsDebug: boolean;
  mentionsArchitecture: boolean;
  mentionsResearch: boolean;
  mentionsReasoning: boolean;
  hasMultipleSteps: boolean;
  hasComplexInstructions: boolean;
  isLongPrompt: boolean;
  totalLength: number;
  messageCount: number;
}

function extractSignals(userMessages: { content: string }[]): ClassificationSignals {
  const combined = userMessages.map((m) => m.content).join("\n");
  const totalLength = combined.length;
  const messageCount = userMessages.length;

  const lower = combined.toLowerCase();

  // Simple greeting patterns
  const greetingPatterns = /^(hi|hello|hey|thanks|thank you|ok|okay|bye|good morning|good evening)[\s!.,]*$/im;
  const isSimpleGreeting = greetingPatterns.test(combined.trim()) && totalLength < 30;

  // Short question (no code, no complex instructions)
  const isShortQuestion = totalLength < 100 && !lower.includes("```") && !lower.includes("function");

  // Code-related signals
  const codePatterns = [
    "```", "function", "const ", "let ", "var ",
    "import ", "export ", "class ", "interface ",
    "type ", "react", "component", "api",
    "route", "endpoint", "database", "query",
    "css", "html", "jsx", "tsx",
  ];
  const mentionsCode = codePatterns.some((p) => lower.includes(p));

  // Debug/fix signals
  const debugPatterns = [
    "bug", "error", "fix", "broken", "failing",
    "crash", "exception", "stack trace", "debug",
    "doesn't work", "not working", "issue",
  ];
  const mentionsDebug = debugPatterns.some((p) => lower.includes(p));

  // Architecture signals
  const archPatterns = [
    "architecture", "design pattern", "refactor",
    "restructure", "migration", "system design",
    "pipeline", "workflow", "infrastructure",
  ];
  const mentionsArchitecture = archPatterns.some((p) => lower.includes(p));

  // Research signals
  const researchPatterns = [
    "research", "analyze", "compare", "evaluate",
    "review", "audit", "investigate", "explore",
    "what are", "how does", "explain", "why",
  ];
  const mentionsResearch = researchPatterns.some((p) => lower.includes(p));

  // Hard reasoning signals
  const reasoningPatterns = [
    "prove", "proof", "logic", "reason",
    "complex", "difficult", "challenging",
    "mathematical", "algorithm", "optimize",
    "multi-step", "plan", "strategy",
  ];
  const mentionsReasoning = reasoningPatterns.some((p) => lower.includes(p));

  // Multi-step task detection
  const stepIndicators = [
    /step \d/i, /phase \d/i, /task \d/i,
    /\d+\.\s+/m, /first.*then.*finally/i,
    /todo/i, /checklist/i,
  ];
  const hasMultipleSteps = stepIndicators.some((p) => p.test(combined));

  // Complex instructions (detailed specs)
  const hasComplexInstructions =
    totalLength > 500 ||
    (lower.includes("requirement") && lower.includes("spec")) ||
    (lower.match(/```/g)?.length ?? 0) >= 2;

  // Long prompt threshold
  const isLongPrompt = totalLength > 1000;

  return {
    isSimpleGreeting,
    isShortQuestion,
    mentionsCode,
    mentionsDebug,
    mentionsArchitecture,
    mentionsResearch,
    mentionsReasoning,
    hasMultipleSteps,
    hasComplexInstructions,
    isLongPrompt,
    totalLength,
    messageCount,
  };
}

// ---------------------------------------------------------------------------
// Classification logic
// ---------------------------------------------------------------------------

export function classifyTask(
  userMessages: { content: string }[],
): AutoModeClassification {
  const signals = extractSignals(userMessages);
  const activeSignals: string[] = [];

  // Decision tree: highest-complexity matching tier wins

  // Frontier: premium tasks — complex architecture + reasoning + multi-step
  if (
    signals.mentionsArchitecture &&
    signals.mentionsReasoning &&
    signals.hasMultipleSteps &&
    signals.totalLength > 800
  ) {
    return {
      taskClass: "reasoning",
      tier: "frontier",
      modelId: TIER_MODEL_MAP.frontier,
      reason: "Complex architecture + reasoning + multi-step task — frontier model warranted",
      analyzedMessages: signals.messageCount,
      signals: ["architecture", "reasoning", "multi-step", `length:${signals.totalLength}`],
    };
  }

  // Heavy: reasoning-heavy or complex multi-step
  if (
    (signals.mentionsReasoning && signals.hasMultipleSteps) ||
    (signals.mentionsReasoning && signals.isLongPrompt) ||
    (signals.hasComplexInstructions && signals.mentionsCode) ||
    (signals.mentionsArchitecture && signals.totalLength > 400)
  ) {
    const reasonParts: string[] = [];
    if (signals.mentionsReasoning) reasonParts.push("reasoning");
    if (signals.hasMultipleSteps) reasonParts.push("multi-step");
    if (signals.hasComplexInstructions) reasonParts.push("complex instructions");
    if (signals.mentionsArchitecture) reasonParts.push("architecture");

    return {
      taskClass: "reasoning",
      tier: "heavy",
      modelId: TIER_MODEL_MAP.heavy,
      reason: `${reasonParts.join(" + ")} — deep thinking model`,
      analyzedMessages: signals.messageCount,
      signals: reasonParts,
    };
  }

  // Standard: coding tasks
  if (signals.mentionsCode || signals.mentionsDebug) {
    const reasonParts: string[] = [];
    if (signals.mentionsCode) reasonParts.push("coding");
    if (signals.mentionsDebug) reasonParts.push("debug/fix");

    // But if it's also long + has complex instructions, bump to heavy
    if (signals.isLongPrompt && signals.hasMultipleSteps) {
      return {
        taskClass: "coding",
        tier: "heavy",
        modelId: TIER_MODEL_MAP.heavy,
        reason: `Complex coding task (${reasonParts.join(", ")} + multi-step) — thinking model`,
        analyzedMessages: signals.messageCount,
        signals: [...reasonParts, "multi-step", `length:${signals.totalLength}`],
      };
    }

    return {
      taskClass: "coding",
      tier: "standard",
      modelId: TIER_MODEL_MAP.standard,
      reason: `${reasonParts.join(", ")} task — coding specialist`,
      analyzedMessages: signals.messageCount,
      signals: reasonParts,
    };
  }

  // Standard: research questions
  if (signals.mentionsResearch && signals.totalLength > 100) {
    return {
      taskClass: "research",
      tier: "standard",
      modelId: "deepseek/deepseek-v3.2", // V3.2 is great for research at $0.42/M
      reason: "Research/analysis question — capable model with large context",
      analyzedMessages: signals.messageCount,
      signals: ["research", `length:${signals.totalLength}`],
    };
  }

  // Instant: simple greetings, short questions
  if (signals.isSimpleGreeting || signals.isShortQuestion) {
    return {
      taskClass: "chat",
      tier: "instant",
      modelId: TIER_MODEL_MAP.instant,
      reason: signals.isSimpleGreeting
        ? "Simple greeting — instant tier"
        : "Short question — instant tier",
      analyzedMessages: signals.messageCount,
      signals: signals.isSimpleGreeting ? ["greeting"] : ["short-question"],
    };
  }

  // Default: instant for everything else
  return {
    taskClass: "chat",
    tier: "instant",
    modelId: TIER_MODEL_MAP.instant,
    reason: `General chat (${signals.totalLength} chars) — instant tier`,
    analyzedMessages: signals.messageCount,
    signals: [`length:${signals.totalLength}`],
  };
}

// ---------------------------------------------------------------------------
// Auto mode — full pipeline for prepareCall integration
// ---------------------------------------------------------------------------

export interface AutoModeOptions {
  /** Whether to enable auto mode (respects user's explicit model choice if set) */
  enabled: boolean;
  /** User-explicit model selection — if set, skip auto classification */
  explicitModelId?: GatewayModelId;
  /** Force a specific tier (overrides auto classification) */
  forceTier?: AutoTier;
}

export function resolveAutoModel(
  userMessages: { content: string }[],
  options: AutoModeOptions = { enabled: true },
): AutoModeClassification | null {
  // If user explicitly chose a model, don't override
  if (options.explicitModelId) {
    return null;
  }

  // If auto mode disabled, skip
  if (!options.enabled) {
    return null;
  }

  // Force tier if specified
  if (options.forceTier) {
    return {
      taskClass: "chat",
      tier: options.forceTier,
      modelId: TIER_MODEL_MAP[options.forceTier],
      reason: `Forced ${options.forceTier} tier`,
      analyzedMessages: userMessages.length,
      signals: ["forced"],
    };
  }

  // Run classifier
  return classifyTask(userMessages);
}

/**
 * Extract user message content for auto classification.
 * Handles both AI SDK UIMessage format and plain content strings.
 */
export function extractUserMessages(
  messages: unknown[],
): { content: string }[] {
  if (messages.length === 0) return [];

  return messages
    .filter((m: any) => {
      // Filter user messages
      if (m?.role === "user") return true;
      // Also handle parts-based messages
      if (m?.parts && Array.isArray(m.parts) && m.role === "user") return true;
      return false;
    })
    .map((m: any) => {
      // Extract text content from parts or content
      if (m.parts && Array.isArray(m.parts)) {
        const textParts = m.parts
          .filter((p: any) => p.type === "text")
          .map((p: any) => p.text)
          .join("\n");
        return { content: textParts || "" };
      }
      if (typeof m.content === "string") {
        return { content: m.content };
      }
      // Try to stringify
      return { content: typeof m.content === "object" ? JSON.stringify(m.content) : String(m.content || "") };
    });
}

/**
 * Get the tier ladder info for UI display.
 */
export function getTierInfo(tier: AutoTier): {
  label: string;
  color: string;
  emoji: string;
  modelId: GatewayModelId;
  cost: string;
} {
  const map: Record<AutoTier, ReturnType<typeof getTierInfo>> = {
    instant: {
      label: "Instant",
      color: "text-green-400",
      emoji: "⚡",
      modelId: TIER_MODEL_MAP.instant,
      cost: "$0.28/M",
    },
    standard: {
      label: "Standard",
      color: "text-blue-400",
      emoji: "🔧",
      modelId: TIER_MODEL_MAP.standard,
      cost: "$0.60/M",
    },
    heavy: {
      label: "Heavy",
      color: "text-purple-400",
      emoji: "🧠",
      modelId: TIER_MODEL_MAP.heavy,
      cost: "$0.87/M",
    },
    frontier: {
      label: "Frontier",
      color: "text-amber-400",
      emoji: "🏔️",
      modelId: TIER_MODEL_MAP.frontier,
      cost: "$25.00/M",
    },
  };
  return map[tier];
}
