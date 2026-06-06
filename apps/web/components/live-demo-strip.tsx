"use client";

import { useEffect, useRef, useState } from "react";

const LINES = [
  { text: "$ neptune build the auth flow", delay: 0, tone: "dim" as const },
  { text: "", delay: 400, tone: "plain" as const },
  { text: "> analyzing repository structure...", delay: 800, tone: "ok" as const },
  { text: "> reading existing auth patterns", delay: 1200, tone: "ok" as const },
  { text: "> creating app/api/auth/route.ts", delay: 1600, tone: "ok" as const },
  { text: "> creating middleware.ts", delay: 2000, tone: "ok" as const },
  { text: "> running pnpm typecheck", delay: 2400, tone: "ok" as const },
  { text: "", delay: 2800, tone: "plain" as const },
  { text: "auth flow is live. typecheck passes clean.", delay: 3200, tone: "plain" as const },
  { text: "committed & pushed to feat/auth-flow.", delay: 3600, tone: "plain" as const },
  { text: "", delay: 4000, tone: "plain" as const },
  { text: "$ ", delay: 4400, tone: "dim" as const },
];

const TONES: Record<string, string> = {
  dim: "text-[#64748B]",
  ok: "text-[#4FC3F7]",
  plain: "text-[#94A3B8]",
};

const TOTAL_CYCLE = 4800; // ms

export function LiveDemoStrip() {
  const [cycle, setCycle] = useState(0);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);

  useEffect(() => {
    startRef.current = performance.now();

    function tick(now: number) {
      const elapsed = now - (startRef.current ?? now);
      // Reset cycle
      const newCycle = Math.floor(elapsed / TOTAL_CYCLE);
      setCycle(newCycle);
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Animation driven by CSS keyframes — cycle is used to reset on loop
  return (
    <section>
      <div className="mx-auto max-w-[1320px] px-6 py-20 sm:py-28">
        <div className="mb-12 text-center">
          <h2
            className="text-balance text-3xl font-light tracking-tight sm:text-4xl"
            style={{
              color: "var(--text-pure, #FFFFFF)",
              letterSpacing: "-0.03em",
            }}
          >
            See it in action
          </h2>
          <p className="mt-3 text-pretty text-base text-[#94A3B8]">
            Describe your task. Watch the agent work. Merge the PR.
          </p>
        </div>

        <div
          className="mx-auto max-w-2xl overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)]"
          style={{
            background: "rgba(15,23,42,0.6)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            boxShadow:
              "0 40px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) inset",
          }}
        >
          {/* Terminal header */}
          <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] px-4 py-2.5">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#EC4899]/60" />
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#EAB308]/60" />
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#4FC3F7]/60" />
            </div>
            <span className="font-mono text-[11px] text-[#475569]">
              neptune sandbox — feat/auth-flow
            </span>
            <div className="w-14" />
          </div>

          {/* Terminal body */}
          <div
            className="terminal-scroll h-[340px] overflow-y-auto bg-[#050510] px-4 py-3 font-mono text-[13px] leading-[1.7] tabular-nums"
            aria-label="Live demo terminal output"
          >
            {LINES.map((line, i) => (
              <div
                key={`${cycle}-${i}`}
                className={`${TONES[line.tone] || ""} animate-[typeIn_300ms_ease-out]`}
                style={{
                  animationDelay: `${line.delay}ms`,
                  animationFillMode: "backwards",
                  opacity: 0,
                }}
              >
                {line.text || " "}
              </div>
            ))}
          </div>

          {/* Terminal footer */}
          <div className="flex items-center gap-2 border-t border-[rgba(255,255,255,0.06)] px-4 py-2">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#4FC3F7]/70" />
            <span className="font-mono text-[11px] text-[#475569]">
              running
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
