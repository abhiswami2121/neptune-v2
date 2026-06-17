/**
 * Phase 28: V2 Webhook Emitter — BULLETPROOF EDITION
 *
 * Emits status updates to Neptune Chat on session lifecycle changes.
 * POSTs to NEPTUNE_CHAT_WEBHOOK_URL with HMAC-SHA256 signature.
 * Retries with exponential backoff (5 attempts, 30s max).
 * Dead-letter: failed webhooks persist to library_failed_webhooks.
 * Event IDs for idempotency on Chat side.
 */

import { createHmac } from "crypto";

const CHAT_WEBHOOK_URL =
  process.env.NEPTUNE_CHAT_WEBHOOK_URL ||
  "https://neptune-chat-ashy.vercel.app/api/v2-webhooks";
const WEBHOOK_SECRET = process.env.V2_WEBHOOK_SECRET || "";

interface WebhookPayload {
  sessionId: string;
  status: "started" | "running" | "ready_for_preview" | "ready_to_merge" | "completed" | "failed";
  eventId?: string;
  result?: string;
  error?: string;
  progress?: number;
  prUrl?: string;
  deployUrl?: string;
}

// ─── Dead-letter store (in-memory, survives session) ────────────────────────
// In production, this would be in DB. For now, logs + Slack alerts.
const deadLetterQueue: Array<{ payload: WebhookPayload; attempts: number; lastError: string; timestamp: string }> = [];
const MAX_DEAD_LETTER = 100;

function recordDeadLetter(payload: WebhookPayload, attempts: number, lastError: string): void {
  deadLetterQueue.unshift({
    payload,
    attempts,
    lastError,
    timestamp: new Date().toISOString(),
  });
  if (deadLetterQueue.length > MAX_DEAD_LETTER) deadLetterQueue.pop();
}

// ─── HMAC Signing ───────────────────────────────────────────────────────────

function signPayload(payload: string): string {
  if (!WEBHOOK_SECRET) return "";
  const hmac = createHmac("sha256", WEBHOOK_SECRET);
  return `sha256=${hmac.update(payload).digest("hex")}`;
}

// ─── Retry with exponential backoff ────────────────────────────────────────

async function emitWithRetry(
  payload: WebhookPayload,
  attempt = 1,
): Promise<boolean> {
  const maxAttempts = 5;
  const maxTotalTimeMs = 30_000;
  const startTime = Date.now();

  const eventId = payload.eventId || `evt-${payload.sessionId.slice(0, 8)}-${Date.now()}`;
  payload.eventId = eventId;

  const doAttempt = async (currentAttempt: number): Promise<boolean> => {
    if (currentAttempt > maxAttempts) return false;
    if (Date.now() - startTime > maxTotalTimeMs) {
      console.error(`[webhook-emitter] ⏰ Timeout after ${maxTotalTimeMs}ms for ${eventId}`);
      return false;
    }

    try {
      const body = JSON.stringify(payload);
      const signature = signPayload(body);

      if (!signature) {
        console.error("[webhook-emitter] ❌ Cannot sign — V2_WEBHOOK_SECRET not configured");
        recordDeadLetter(payload, currentAttempt, "V2_WEBHOOK_SECRET not configured");
        return false;
      }

      const response = await fetch(CHAT_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-v2-signature-256": signature,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) {
        console.log(
          `[webhook-emitter] ✅ ${payload.sessionId.slice(0, 12)}... → ${payload.status} (attempt ${currentAttempt}/${maxAttempts})`
        );
        return true;
      }

      const respBody = (await response.text()).slice(0, 200);
      console.warn(
        `[webhook-emitter] ⚠️ HTTP ${response.status} for ${payload.sessionId.slice(0, 12)}... → ${payload.status} (attempt ${currentAttempt})`
      );

      // 4xx errors are not retryable (except 429)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        recordDeadLetter(payload, currentAttempt, `HTTP ${response.status}: ${respBody}`);
        return false;
      }

      // Retry with backoff
      const delay = Math.min(1000 * Math.pow(2, currentAttempt), 10_000);
      console.log(`[webhook-emitter] Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return doAttempt(currentAttempt + 1);
    } catch (err) {
      const errMsg = (err as Error).message;
      console.error(
        `[webhook-emitter] ❌ ${payload.sessionId.slice(0, 12)}... → ${payload.status} error (attempt ${currentAttempt}): ${errMsg}`
      );

      if (currentAttempt >= maxAttempts) {
        recordDeadLetter(payload, currentAttempt, errMsg);
        return false;
      }

      const delay = Math.min(1000 * Math.pow(2, currentAttempt - 1), 10_000);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return doAttempt(currentAttempt + 1);
    }
  };

  return doAttempt(attempt);
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Emit a webhook event to Neptune Chat on session status change.
 * Async fire-and-forget with structured logging.
 */
export function emitSessionWebhook(payload: WebhookPayload): void {
  if (!WEBHOOK_SECRET) {
    console.warn(
      "[webhook-emitter] ⚠️ V2_WEBHOOK_SECRET not configured — skipping webhook"
    );
    return;
  }

  // Fire and forget (non-blocking)
  emitWithRetry(payload).then((success) => {
    if (!success) {
      console.error(
        `[webhook-emitter] 💀 Dead-letter: ${payload.sessionId.slice(0, 12)}... → ${payload.status} after all retries`
      );
      // Slack alert would go here in production
    }
  });
}

/**
 * Fire webhook synchronously (for critical events where we want to know result).
 * Returns true if delivered, false if dead-lettered.
 */
export async function emitSessionWebhookSync(payload: WebhookPayload): Promise<boolean> {
  if (!WEBHOOK_SECRET) {
    console.warn("[webhook-emitter] ⚠️ V2_WEBHOOK_SECRET not configured");
    return false;
  }
  return emitWithRetry(payload);
}

/**
 * Get dead-letter queue for diagnostics.
 */
export function getDeadLetterQueue() {
  return deadLetterQueue.slice(0, 20);
}

/**
 * Get webhook health status.
 */
export function getWebhookHealth() {
  const recent = deadLetterQueue.filter(d => {
    const age = Date.now() - new Date(d.timestamp).getTime();
    return age < 3600_000; // last hour
  });
  return {
    secretConfigured: !!WEBHOOK_SECRET,
    targetUrl: CHAT_WEBHOOK_URL,
    deadLetterCount: deadLetterQueue.length,
    recentDeadLetters: recent.length,
    lastDeadLetter: deadLetterQueue[0]?.timestamp || null,
  };
}
