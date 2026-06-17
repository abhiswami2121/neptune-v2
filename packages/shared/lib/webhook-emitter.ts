/**
 * Phase 24: V2 Webhook Emitter
 *
 * Emits status updates to Neptune Chat on session lifecycle changes.
 * POSTs to NEPTUNE_CHAT_WEBHOOK_URL with HMAC-SHA256 signature.
 * Retries with exponential backoff (3 attempts).
 */

import { createHmac } from "crypto";

const CHAT_WEBHOOK_URL =
  process.env.NEPTUNE_CHAT_WEBHOOK_URL ||
  "https://neptune-chat-ashy.vercel.app/api/v2-webhooks";
const WEBHOOK_SECRET = process.env.V2_WEBHOOK_SECRET || "";

interface WebhookPayload {
  sessionId: string;
  status: "started" | "running" | "completed" | "failed";
  result?: string;
  error?: string;
  progress?: number;
  prUrl?: string;
  deployUrl?: string;
}

function signPayload(payload: string): string {
  const hmac = createHmac("sha256", WEBHOOK_SECRET);
  return `sha256=${hmac.update(payload).digest("hex")}`;
}

async function emitWithRetry(
  payload: WebhookPayload,
  attempt = 1
): Promise<boolean> {
  const maxAttempts = 3;

  try {
    const body = JSON.stringify(payload);
    const signature = signPayload(body);

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
        `[webhook-emitter] ✅ ${payload.sessionId} → ${payload.status} (attempt ${attempt})`
      );
      return true;
    }

    console.warn(
      `[webhook-emitter] ⚠️ ${payload.sessionId} → ${payload.status} HTTP ${response.status} (attempt ${attempt})`
    );

    if (attempt < maxAttempts) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return emitWithRetry(payload, attempt + 1);
    }

    return false;
  } catch (err) {
    console.error(
      `[webhook-emitter] ❌ ${payload.sessionId} → ${payload.status} failed (attempt ${attempt}):`,
      (err as Error).message
    );

    if (attempt < maxAttempts) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return emitWithRetry(payload, attempt + 1);
    }

    return false;
  }
}

/**
 * Emit a webhook event to Neptune Chat on session status change.
 * Non-blocking — fires and forgets after logging.
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
        `[webhook-emitter] ❌ Failed to deliver webhook for ${payload.sessionId} after 3 attempts`
      );
    }
  });
}
