/**
 * V2 Slack Notification Bridge — U2.5A.1
 *
 * Sends structured lifecycle events to Slack #jarvis-admin (cardinal 6a276f8c).
 * Uses SLACK_BOT_TOKEN for authentication. Simple fetch-based API — no Slack SDK dependency.
 *
 * Events:
 *   - session_started  — new agent session begins
 *   - phase_completed  — a workflow phase finishes
 *   - error            — agent encounters an error
 *   - completion       — session completes successfully
 *   - code_change      — code was modified (commit/PR)
 *   - deploy           — deployment initiated or completed
 *
 * Usage:
 *   import { notifySlack } from "@/lib/slack-notify";
 *   await notifySlack({ event: "session_started", sessionId: "abc", goal: "Fix build" });
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type SlackEventType =
  | "session_started"
  | "phase_completed"
  | "error"
  | "completion"
  | "code_change"
  | "deploy";

export interface SlackNotifyPayload {
  event: SlackEventType;
  sessionId?: string;
  chatId?: string;
  goal?: string;
  repo?: string;
  branch?: string;
  prUrl?: string;
  deployUrl?: string;
  phase?: string;
  error?: string;
  model?: string;
  sandboxId?: string;
  durationMs?: number;
  message?: string;
}

// ── Config ─────────────────────────────────────────────────────────────────

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const JARVIS_ADMIN_CHANNEL_ID = process.env.JARVIS_ADMIN_CHANNEL_ID || "C08JZ5ALJCR";
const SLACK_API = "https://slack.com/api";

function isConfigured(): boolean {
  return !!SLACK_BOT_TOKEN;
}

// ── Event -> Emoji + Color ─────────────────────────────────────────────────

const EVENT_STYLE: Record<SlackEventType, { emoji: string; color: string }> = {
  session_started: { emoji: "🚀", color: "#36a64f" },
  phase_completed: { emoji: "✅", color: "#2eb886" },
  error: { emoji: "❌", color: "#ff0000" },
  completion: { emoji: "🏁", color: "#1d9bd1" },
  code_change: { emoji: "💻", color: "#e8a838" },
  deploy: { emoji: "📦", color: "#7b68ee" },
};

// ── Formatters ─────────────────────────────────────────────────────────────

function formatSection(title: string, value: string): string {
  return `*${title}:* ${value || "—"}`;
}

function buildSlackMessage(payload: SlackNotifyPayload): string {
  const style = EVENT_STYLE[payload.event];
  const lines: string[] = [];

  // Header
  lines.push(`${style.emoji} *V2 Agent — ${payload.event.replace(/_/g, " ").toUpperCase()}*`);

  if (payload.goal) lines.push(formatSection("Goal", payload.goal));
  if (payload.sessionId) lines.push(formatSection("Session", `\`${payload.sessionId.slice(0, 12)}...\``));
  if (payload.model) lines.push(formatSection("Model", payload.model));
  if (payload.phase) lines.push(formatSection("Phase", payload.phase));
  if (payload.repo) lines.push(formatSection("Repo", payload.repo));
  if (payload.branch) lines.push(formatSection("Branch", payload.branch));
  if (payload.sandboxId) lines.push(formatSection("Sandbox", `\`${payload.sandboxId}\``));
  if (payload.durationMs) {
    const seconds = (payload.durationMs / 1000).toFixed(1);
    lines.push(formatSection("Duration", `${seconds}s`));
  }

  // Links
  if (payload.prUrl) lines.push(`🔗 *PR:* <${payload.prUrl}>`);
  if (payload.deployUrl) lines.push(`🚀 *Deploy:* <${payload.deployUrl}>`);

  // Error details
  if (payload.error) {
    lines.push("");
    lines.push("```");
    lines.push(payload.error.slice(0, 500));
    if (payload.error.length > 500) lines.push("... (truncated)");
    lines.push("```");
  }

  // Custom message
  if (payload.message) {
    lines.push("");
    lines.push(payload.message);
  }

  return lines.join("\n");
}

function buildSlackAttachment(payload: SlackNotifyPayload) {
  const style = EVENT_STYLE[payload.event];
  return {
    color: style.color,
    fallback: `V2 Agent ${payload.event}: ${payload.goal || payload.message || ""}`,
    footer: "Neptune V2 · Agent Infrastructure",
    ts: Math.floor(Date.now() / 1000),
  };
}

// ── Main Notify Function ───────────────────────────────────────────────────

export async function notifySlack(payload: SlackNotifyPayload): Promise<boolean> {
  if (!isConfigured()) {
    console.log("[slack-notify] SLACK_BOT_TOKEN not configured — skipping notification");
    return false;
  }

  const text = buildSlackMessage(payload);
  const attachment = buildSlackAttachment(payload);

  try {
    const res = await fetch(`${SLACK_API}/chat.postMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: JARVIS_ADMIN_CHANNEL_ID,
        text,
        attachments: [attachment],
        unfurl_links: false,
      }),
    });

    const data = (await res.json()) as { ok: boolean; error?: string };

    if (!data.ok) {
      console.error(`[slack-notify] Slack API error: ${data.error}`);
      return false;
    }

    console.log(`[slack-notify] Sent ${payload.event} notification for session ${payload.sessionId?.slice(0, 12) || "unknown"}`);
    return true;
  } catch (err) {
    console.error(`[slack-notify] Failed to send notification: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

// ── Convenience Functions ──────────────────────────────────────────────────

export async function notifySessionStarted(params: {
  sessionId: string;
  goal: string;
  model?: string;
}): Promise<boolean> {
  return notifySlack({
    event: "session_started",
    ...params,
  });
}

export async function notifyPhaseCompleted(params: {
  sessionId: string;
  phase: string;
  durationMs?: number;
}): Promise<boolean> {
  return notifySlack({
    event: "phase_completed",
    ...params,
  });
}

export async function notifyError(params: {
  sessionId: string;
  error: string;
  phase?: string;
}): Promise<boolean> {
  return notifySlack({
    event: "error",
    ...params,
  });
}

export async function notifyCompletion(params: {
  sessionId: string;
  goal: string;
  durationMs?: number;
  prUrl?: string;
  deployUrl?: string;
}): Promise<boolean> {
  return notifySlack({
    event: "completion",
    ...params,
  });
}

export async function notifyCodeChange(params: {
  sessionId: string;
  repo: string;
  branch: string;
  prUrl?: string;
}): Promise<boolean> {
  return notifySlack({
    event: "code_change",
    ...params,
  });
}

export async function notifyDeploy(params: {
  sessionId: string;
  deployUrl: string;
  message?: string;
}): Promise<boolean> {
  return notifySlack({
    event: "deploy",
    ...params,
  });
}
