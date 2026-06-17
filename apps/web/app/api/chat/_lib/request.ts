import type { WebAgentUIMessage } from "@/app/types";

export interface ChatRequestBody {
  messages: WebAgentUIMessage[];
  sessionId?: string;
  chatId?: string;
  /** When 'sandbox', skips GitHub/PR features and runs in ephemeral sandbox mode.
   *  When 'chat', runs lightweight Q&A without sandbox provisioning.
   *  When 'swarm', runs parallel multi-specialist (Planner + Coder + Reviewer) execution. */
  mode?: "sandbox" | "chat" | "swarm";
  /** Alternative to mode: 'sandbox' — triggers sandbox-only ephemeral execution */
  sandboxOnly?: boolean;
  /** Optional model ID override for sandbox mode */
  modelId?: string;
}

type ParseChatRequestResult =
  | {
      ok: true;
      body: ChatRequestBody;
    }
  | {
      ok: false;
      response: Response;
    };

type RequireChatIdentifiersResult =
  | {
      ok: true;
      sessionId: string;
      chatId: string;
    }
  | {
      ok: false;
      response: Response;
    };

export async function parseChatRequestBody(
  req: Request,
): Promise<ParseChatRequestResult> {
  try {
    const body = (await req.json()) as ChatRequestBody;
    return { ok: true, body };
  } catch {
    return {
      ok: false,
      response: Response.json({ error: "Invalid JSON body" }, { status: 400 }),
    };
  }
}

export function requireChatIdentifiers(
  body: ChatRequestBody,
): RequireChatIdentifiersResult {
  if (!body.sessionId || !body.chatId) {
    return {
      ok: false,
      response: Response.json(
        { error: "sessionId and chatId are required" },
        { status: 400 },
      ),
    };
  }

  return {
    ok: true,
    sessionId: body.sessionId,
    chatId: body.chatId,
  };
}
