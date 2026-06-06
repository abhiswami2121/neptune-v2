const STEPS = [
  {
    step: "01",
    title: "Connect",
    description:
      "Authorize the Neptune GitHub App. Browse your repos. Pick one, pick a branch. Your sandbox spins up in seconds.",
    visual: (
      <div
        className="flex h-48 items-center justify-center rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(15,23,42,0.3)] backdrop-blur-sm"
        aria-hidden="true"
      >
        <div className="flex items-center gap-3 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0A0E1A] px-5 py-3">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="text-[#4FC3F7]"
          >
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
          </svg>
          <span className="font-mono text-xs text-[#94A3B8]">
            abhiswami2121/neptune-v2
          </span>
        </div>
      </div>
    ),
  },
  {
    step: "02",
    title: "Describe",
    description:
      "Tell your agent what to build. It plans, writes, tests, and debugs autonomously. Preview changes live in your sandbox as it works.",
    visual: (
      <div
        className="flex h-48 items-center justify-center rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(15,23,42,0.3)] backdrop-blur-sm"
        aria-hidden="true"
      >
        <div className="w-full max-w-xs space-y-2 px-4 font-mono text-xs leading-relaxed text-[#94A3B8]">
          <div>
            <span className="text-[#64748B]">&gt; </span>
            <span>build the auth flow with OAuth</span>
          </div>
          <div className="text-[#4FC3F7]">searching files matching auth*</div>
          <div className="text-[#4FC3F7]">reading lib/session.ts</div>
          <div className="text-[#4FC3F7]">creating app/api/auth/route.ts</div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#4FC3F7]" />
            <span className="text-[#64748B]">running typecheck...</span>
          </div>
        </div>
      </div>
    ),
  },
  {
    step: "03",
    title: "Ship",
    description:
      "Your agent commits, pushes, and opens a PR. Review the diff, approve, and merge. Code lands on your main branch — ready for production.",
    visual: (
      <div
        className="flex h-48 items-center justify-center rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(15,23,42,0.3)] backdrop-blur-sm"
        aria-hidden="true"
      >
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0A0E1A] px-4 py-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#EC4899]" />
            <span className="font-mono text-xs text-[#94A3B8]">
              feat/auth-flow
            </span>
            <span className="ml-2 rounded-full bg-[#4FC3F7]/15 px-2 py-0.5 font-mono text-[10px] text-[#4FC3F7]">
              merged
            </span>
          </div>
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="text-[#475569]"
          >
            <path
              d="M8 3v10M8 13l3-3M8 13l-3-3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0A0E1A] px-4 py-2">
            <span className="font-mono text-xs text-[#94A3B8]">main</span>
          </div>
        </div>
      </div>
    ),
  },
];

export function HowItWorks() {
  return (
    <section>
      <div className="mx-auto max-w-[1320px] px-6 py-20 sm:py-28">
        <div className="mb-16 text-center">
          <h2
            className="text-balance text-3xl font-light tracking-tight sm:text-4xl"
            style={{
              color: "var(--text-pure, #FFFFFF)",
              letterSpacing: "-0.03em",
            }}
          >
            How it works
          </h2>
          <p className="mt-3 text-pretty text-base text-[#94A3B8]">
            Three steps from idea to merged PR.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <div key={step.step} className="relative flex flex-col">
              {/* Step number */}
              <div className="flex items-center gap-3">
                <span
                  className="font-mono text-5xl font-light tracking-tighter text-[rgba(79,195,247,0.15)]"
                  aria-hidden="true"
                >
                  {step.step}
                </span>
                <h3
                  className="text-xl font-medium text-[#F1F5F9]"
                  style={{ letterSpacing: "-0.02em" }}
                >
                  {step.title}
                </h3>
              </div>

              <p className="mt-3 text-pretty text-sm leading-relaxed text-[#94A3B8]">
                {step.description}
              </p>

              <div className="mt-6">{step.visual}</div>

              {/* Connector line between steps (desktop only) */}
              {i < STEPS.length - 1 && (
                <div className="absolute -right-4 top-7 hidden h-px w-8 bg-gradient-to-r from-[rgba(255,255,255,0.06)] to-transparent md:block" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
