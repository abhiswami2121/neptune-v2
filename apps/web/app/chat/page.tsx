"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Sparkles, Loader2, AlertCircle, RefreshCw, LogIn } from "lucide-react";

type BootstrapState =
  | { phase: "idle" }
  | { phase: "loading" }
  | {
      phase: "ready";
      sessionId: string;
      chatId: string;
    }
  | { phase: "error"; message: string };

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [bootstrap, setBootstrap] = useState<BootstrapState>({ phase: "idle" });
  const [needsAuth, setNeedsAuth] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Build the body for the chat transport based on bootstrap state
  const chatBody = useCallback(() => {
    const base: Record<string, unknown> = { mode: "chat" };
    if (bootstrap.phase === "ready") {
      base.sessionId = bootstrap.sessionId;
      base.chatId = bootstrap.chatId;
    }
    return base;
  }, [bootstrap]);

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: chatBody(),
    }),
  });

  // Bootstrap session+chat on mount
  useEffect(() => {
    let cancelled = false;

    async function bootstrapSession() {
      setBootstrap({ phase: "loading" });

      try {
        const res = await fetch("/api/sessions/quick-start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Chat" }),
        });

        if (res.status === 401) {
          if (!cancelled) {
            setNeedsAuth(true);
            setBootstrap({ phase: "error", message: "Sign in required to enable chat persistence. You can still chat in ephemeral mode." });
          }
          return;
        }

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Failed to create session (${res.status})`);
        }

        const data = await res.json();
        if (!cancelled) {
          setBootstrap({
            phase: "ready",
            sessionId: data.sessionId,
            chatId: data.chatId,
          });
          setNeedsAuth(false);
        }
      } catch (err) {
        if (!cancelled) {
          setBootstrap({
            phase: "error",
            message: err instanceof Error ? err.message : "Could not start chat session",
          });
        }
      }
    }

    bootstrapSession();
    return () => { cancelled = true; };
  }, []);

  // Retry bootstrap
  const handleRetry = useCallback(() => {
    setNeedsAuth(false);
    setBootstrap({ phase: "idle" });
    // Re-trigger the effect by forcing a re-render
    setTimeout(() => setBootstrap({ phase: "loading" }), 0);
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || status === "streaming") return;
    sendMessage({ text: input.trim() });
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const isLoading = status === "streaming" || status === "submitted";
  const isBootstrapping = bootstrap.phase === "loading" || bootstrap.phase === "idle";

  return (
    <div className="flex flex-col h-dvh bg-background">
      {/* Header */}
      <header className="shrink-0 border-b px-4 py-3 flex items-center gap-3">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles size={16} />
        </div>
        <div>
          <h1 className="text-sm font-semibold">Neptune Chat</h1>
          <p className="text-xs text-muted-foreground">
            {isLoading ? "Thinking…" : isBootstrapping ? "Initializing…" : "Ask me anything"}
          </p>
        </div>
        {/* Bootstrap status indicator */}
        <div className="ml-auto flex items-center gap-2">
          {bootstrap.phase === "loading" && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin" />
              Initializing…
            </span>
          )}
          {bootstrap.phase === "ready" && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Connected
            </span>
          )}
          {bootstrap.phase === "error" && !needsAuth && (
            <button
              onClick={handleRetry}
              className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700"
            >
              <AlertCircle size={12} />
              Retry
            </button>
          )}
        </div>
      </header>

      {/* Auth gate */}
      {needsAuth && (
        <div className="shrink-0 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 px-4 py-2.5">
          <div className="max-w-2xl mx-auto flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
            <LogIn size={14} />
            <span>Sign in to save your chat history.</span>
            <a
              href="/api/auth/signin"
              className="ml-auto inline-flex items-center gap-1 rounded-md bg-amber-600 text-white px-3 py-1 text-xs font-medium hover:bg-amber-700 transition-colors"
            >
              Sign In
            </a>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            {isBootstrapping ? (
              <>
                <div className="flex size-16 items-center justify-center rounded-2xl bg-muted/50 ring-1 ring-border/50 mb-4">
                  <Loader2 size={28} className="text-muted-foreground animate-spin" />
                </div>
                <h2 className="text-lg font-semibold mb-2">Starting Chat</h2>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Setting up your session…
                </p>
              </>
            ) : bootstrap.phase === "error" && !needsAuth ? (
              <>
                <div className="flex size-16 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-950/30 ring-1 ring-red-200 dark:ring-red-800 mb-4">
                  <AlertCircle size={28} className="text-red-500" />
                </div>
                <h2 className="text-lg font-semibold mb-2">Could Not Start Chat</h2>
                <p className="text-sm text-muted-foreground max-w-sm mb-3">
                  {bootstrap.message}
                </p>
                <button
                  onClick={handleRetry}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <RefreshCw size={14} />
                  Try Again
                </button>
              </>
            ) : (
              <>
                <div className="flex size-16 items-center justify-center rounded-2xl bg-muted/50 ring-1 ring-border/50 mb-4">
                  <Sparkles size={28} className="text-muted-foreground" />
                </div>
                <h2 className="text-lg font-semibold mb-2">Neptune Chat</h2>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Simple Q&amp;A mode — no sandbox, no coding tools. Just chat.
                  For coding tasks, create a session with a repo.
                </p>
              </>
            )}
          </div>
        )}

        <div className="max-w-2xl mx-auto space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {message.role === "assistant" && (
                <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary mt-0.5">
                  <Sparkles size={13} />
                </div>
              )}

              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-muted/60 rounded-bl-md"
                }`}
              >
                {message.parts.map((part, i) => {
                  if (part.type === "text") {
                    return (
                      <div key={i} className="whitespace-pre-wrap break-words">
                        {part.text}
                      </div>
                    );
                  }
                  if (part.type === "step-start") {
                    return (
                      <div
                        key={i}
                        className="text-xs text-muted-foreground italic mb-1"
                      >
                        Thinking…
                      </div>
                    );
                  }
                  return null;
                })}
              </div>

              {message.role === "user" && (
                <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-semibold mt-0.5">
                  U
                </div>
              )}
            </div>
          ))}

          {/* Loading indicator */}
          {isLoading && messages.length === 0 && (
            <div className="flex items-start gap-3 max-w-2xl mx-auto">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles size={13} />
              </div>
              <div className="bg-muted/60 rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex gap-1">
                  <span className="size-2 rounded-full bg-muted-foreground/40 animate-bounce" />
                  <span className="size-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0.15s]" />
                  <span className="size-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0.3s]" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 border-t bg-background px-4 py-3">
        <form
          onSubmit={handleSubmit}
          className="max-w-2xl mx-auto flex items-end gap-2"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isBootstrapping
                ? "Initializing chat…"
                : "Type a message…"
            }
            rows={1}
            disabled={isLoading || bootstrap.phase === "error"}
            className="flex-1 resize-none rounded-xl border bg-muted/40 px-4 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading || bootstrap.phase === "error"}
            className="shrink-0 flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
            aria-label="Send message"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
