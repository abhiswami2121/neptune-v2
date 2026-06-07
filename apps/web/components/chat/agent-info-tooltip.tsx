"use client";

import { memo } from "react";
import { Bot, Zap, Braces, Brain, Mountain } from "lucide-react";
import type { WebAgentMessageMetadata } from "@/app/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Tier display configuration
// ---------------------------------------------------------------------------

const TIER_CONFIG: Record<
  string,
  { label: string; emoji: string; color: string; icon: typeof Zap }
> = {
  instant: {
    label: "Instant",
    emoji: "⚡",
    color: "bg-green-500/10 text-green-400 border-green-500/20",
    icon: Zap,
  },
  standard: {
    label: "Standard",
    emoji: "🔧",
    color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    icon: Braces,
  },
  heavy: {
    label: "Heavy",
    emoji: "🧠",
    color: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    icon: Brain,
  },
  frontier: {
    label: "Frontier",
    emoji: "🏔️",
    color: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    icon: Mountain,
  },
  auto: {
    label: "Auto",
    emoji: "🤖",
    color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    icon: Bot,
  },
};

// ---------------------------------------------------------------------------
// Model name formatter
// ---------------------------------------------------------------------------

function shortModelId(modelId: string): string {
  // Strip provider prefix
  const parts = modelId.split("/");
  return parts[parts.length - 1] ?? modelId;
}

function modelDisplayName(modelId: string): string {
  const short = shortModelId(modelId);
  // Humanize common patterns
  return short
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/v(\d+)/i, "V$1")
    .replace(/\bQwen\b/i, "Qwen")
    .replace(/\bDeepseek\b/i, "DeepSeek")
    .replace(/\bClaude\b/i, "Claude")
    .replace(/\bGpt\b/i, "GPT")
    .replace(/\bPro\b/i, "Pro")
    .replace(/\bFlash\b/i, "Flash")
    .replace(/\bOpus\b/i, "Opus")
    .replace(/\bCoder\b/i, "Coder")
    .replace(/\b\s+30 B\b/i, " 30B");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface AgentInfoTooltipProps {
  metadata: WebAgentMessageMetadata;
  className?: string;
}

/**
 * Enhanced model info tooltip displayed below assistant messages.
 *
 * Shows:
 * - Model name with provider badge
 * - Auto mode classification (tier, reason) when applicable
 * - Cumulative cost from gateway
 * - Tool use capability indicators
 *
 * Builds on the AI Elements Agent component pattern — compact
 * pill trigger with expandable tooltip.
 */
export const AgentInfoTooltip = memo(function AgentInfoTooltip({
  metadata,
  className,
}: AgentInfoTooltipProps) {
  const {
    selectedModelId,
    modelId: resolvedModelId,
    totalMessageCost,
    autoClassification,
  } = metadata;

  const displayModelId = selectedModelId ?? resolvedModelId;
  if (!displayModelId) return null;

  const tierInfo = autoClassification?.tier
    ? TIER_CONFIG[autoClassification.tier]
    : null;
  const displayName = modelDisplayName(displayModelId);

  const hasCost =
    typeof totalMessageCost === "number" &&
    Number.isFinite(totalMessageCost) &&
    totalMessageCost >= 0;

  const costDisplay = hasCost
    ? totalMessageCost! < 0.01
      ? "<$0.01"
      : `$${totalMessageCost!.toFixed(2)}`
    : null;

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex max-w-[360px] items-center gap-1.5 rounded px-2 py-0.5",
            "text-[11px] leading-tight text-muted-foreground/50",
            "transition-colors hover:text-muted-foreground/80",
            "cursor-default select-none",
            className,
          )}
        >
          <Bot className="size-3 shrink-0" />
          <span className="truncate font-medium">{displayName}</span>

          {tierInfo && (
            <Badge
              variant="outline"
              className={cn(
                "h-4 px-1 text-[10px] font-normal leading-none",
                tierInfo.color,
              )}
            >
              {tierInfo.emoji} {tierInfo.label}
            </Badge>
          )}

          {costDisplay && (
            <>
              <span aria-hidden className="text-muted-foreground/30">
                ·
              </span>
              <span className="tabular-nums text-muted-foreground/40">
                {costDisplay}
              </span>
            </>
          )}
        </span>
      </TooltipTrigger>

      <TooltipContent side="top" align="start" className="max-w-xs p-3">
        <div className="space-y-2">
          {/* Model details */}
          <div className="flex items-center gap-2">
            <Bot className="size-3.5 text-muted-foreground" />
            <span className="font-medium text-xs">{displayName}</span>
            <span className="font-mono text-[10px] text-muted-foreground/60">
              {displayModelId}
            </span>
          </div>

          {/* Auto classification */}
          {autoClassification && (
            <div className="rounded-md bg-muted/50 p-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-medium text-muted-foreground">
                  Auto Mode
                </span>
                {autoClassification.tier && TIER_CONFIG[autoClassification.tier] && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "h-4 px-1 text-[10px]",
                      TIER_CONFIG[autoClassification.tier]!.color,
                    )}
                  >
                    {TIER_CONFIG[autoClassification.tier]!.emoji}{" "}
                    {TIER_CONFIG[autoClassification.tier]!.label}
                  </Badge>
                )}
              </div>
              {autoClassification.reason && (
                <p className="mt-1 text-[11px] text-muted-foreground/70">
                  {autoClassification.reason}
                </p>
              )}
              {autoClassification.signals &&
                autoClassification.signals.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {autoClassification.signals.map((signal) => (
                      <span
                        key={signal}
                        className="rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground/50"
                      >
                        {signal}
                      </span>
                    ))}
                  </div>
                )}
            </div>
          )}

          {/* Cost info */}
          {hasCost && (
            <div className="text-[11px] text-muted-foreground/60">
              Gateway cost:{" "}
              <span className="tabular-nums">
                ${(totalMessageCost as number).toFixed(6)}
              </span>
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
});

export { TIER_CONFIG };
