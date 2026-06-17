/**
 * Phase 28: /api/diagnostic — V2 Full Diagnostic Endpoint
 *
 * Returns comprehensive diagnostics: auth, env vars (sanitized), Gateway,
 * webhook health, DB status. Authenticated via NEPTUNE_INTERNAL_TOKEN.
 *
 * GET /api/diagnostic — summary
 * GET /api/diagnostic?full=true — complete with dead-letter queue
 */

import { NextRequest, NextResponse } from "next/server";
import { validateProgrammaticAuth } from "@/lib/session-store";
import { getWebhookHealth } from "@open-agents/shared/lib/webhook-emitter";

const GATEWAY_KEY = process.env.AI_GATEWAY_API_KEY || "";
const GATEWAY_URL = "https://ai-gateway.vercel.sh";

export async function GET(req: NextRequest) {
  if (!validateProgrammaticAuth(req as unknown as Request)) {
    return NextResponse.json({ error: "Unauthorized — valid NEPTUNE_INTERNAL_TOKEN required" }, { status: 401 });
  }

  const full = new URL(req.url).searchParams.get("full") === "true";
  const startTime = Date.now();

  const diagnostics: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    version: "phase-28",
    uptime: startTime,
  };

  // 1. Auth
  diagnostics.auth = {
    internalTokenConfigured: !!process.env.NEPTUNE_INTERNAL_TOKEN,
    internalTokenLength: process.env.NEPTUNE_INTERNAL_TOKEN?.length || 0,
    testTokenConfigured: !!process.env.NEPTUNE_TEST_TOKEN,
    e2eTokenConfigured: !!process.env.NEPTUNE_E2E_TEST_TOKEN,
  };

  // 2. Env vars (sanitized)
  diagnostics.env = {
    aiGatewayKeyConfigured: !!GATEWAY_KEY,
    aiGatewayKeyPrefix: GATEWAY_KEY ? `${GATEWAY_KEY.slice(0, 10)}...` : "none",
    deepseekKeyConfigured: !!process.env.DEEPSEEK_API_KEY,
    anthropicKeyConfigured: !!process.env.ANTHROPIC_API_KEY,
    webhookSecretConfigured: !!process.env.V2_WEBHOOK_SECRET,
    chatWebhookUrl: process.env.NEPTUNE_CHAT_WEBHOOK_URL || "using default",
    chatApiUrl: process.env.NEPTUNE_CHAT_API_URL || "not set",
    dbConfigured: !!process.env.NEPTUNE_V2_POSTGRES_URL,
    vercelProjectId: process.env.NEPTUNE_V2_VERCEL_PROJECT_ID || "not set",
  };

  // 3. AI Gateway connectivity
  const gwResults: Record<string, unknown> = {};
  try {
    const gwStart = Date.now();
    const modelsRes = await fetch(`${GATEWAY_URL}/v1/models`, {
      headers: { Authorization: `Bearer ${GATEWAY_KEY}` },
      signal: AbortSignal.timeout(5000),
    });
    gwResults.latencyMs = Date.now() - gwStart;
    gwResults.status = modelsRes.status;
    if (modelsRes.ok) {
      const data = await modelsRes.json();
      gwResults.modelsAvailable = data.data?.length || 0;
      // Check for deepseek models
      const dsModels = (data.data as Array<{ id: string }>).filter(m => m.id.startsWith("deepseek/"));
      gwResults.deepseekModels = dsModels.map(m => m.id);
      // Check default model deepseek/deepseek-v4-pro
      const hasDefault = dsModels.some(m => m.id === "deepseek/deepseek-v4-pro");
      gwResults.defaultModelAvailable = hasDefault;
    } else {
      const errText = (await modelsRes.text()).slice(0, 200);
      gwResults.error = errText;
    }
  } catch (err) {
    gwResults.status = "error";
    gwResults.error = (err as Error).message;
  }
  diagnostics.gateway = gwResults;

  // 4. Webhook health
  diagnostics.webhook = getWebhookHealth();

  // 5. Chat connectivity
  const chatUrl = process.env.NEPTUNE_CHAT_API_URL || "https://neptune-chat-ashy.vercel.app";
  try {
    const chatStart = Date.now();
    const chatRes = await fetch(`${chatUrl}/api/v2-webhooks`, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });
    diagnostics.chatConnectivity = {
      url: chatUrl,
      status: chatRes.status,
      latencyMs: Date.now() - chatStart,
    };
  } catch (err) {
    diagnostics.chatConnectivity = {
      url: chatUrl,
      status: "error",
      error: (err as Error).message,
    };
  }

  // 6. Dead-letter queue (full mode only)
  if (full) {
    diagnostics.deadLetterQueue = getWebhookHealth();
  }

  diagnostics.totalDurationMs = Date.now() - startTime;

  return NextResponse.json(diagnostics);
}
