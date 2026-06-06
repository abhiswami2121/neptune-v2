"use client";

import { type ReactNode } from "react";

type Feature = {
  title: string;
  description: string;
  icon: ReactNode;
};

const IconConnect = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <circle cx="14" cy="14" r="10" stroke="#4FC3F7" strokeWidth="1.5" opacity="0.3" />
    <circle cx="14" cy="14" r="3" fill="#4FC3F7" opacity="0.6" />
    <line x1="14" y1="4" x2="14" y2="11" stroke="#4FC3F7" strokeWidth="1.5" opacity="0.4" />
    <line x1="14" y1="17" x2="14" y2="24" stroke="#4FC3F7" strokeWidth="1.5" opacity="0.4" />
    <line x1="4" y1="14" x2="11" y2="14" stroke="#4FC3F7" strokeWidth="1.5" opacity="0.4" />
    <line x1="17" y1="14" x2="24" y2="14" stroke="#4FC3F7" strokeWidth="1.5" opacity="0.4" />
  </svg>
);

const IconAgent = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <rect x="4" y="8" width="20" height="13" rx="2" stroke="#4FC3F7" strokeWidth="1.5" opacity="0.3" />
    <line x1="8" y1="24" x2="20" y2="24" stroke="#4FC3F7" strokeWidth="1.5" opacity="0.2" />
    <line x1="14" y1="21" x2="14" y2="24" stroke="#4FC3F7" strokeWidth="1.5" opacity="0.2" />
    <line x1="8" y1="12" x2="19" y2="12" stroke="#4FC3F7" strokeWidth="1.5" opacity="0.5" />
    <line x1="8" y1="15" x2="16" y2="15" stroke="#4FC3F7" strokeWidth="1.5" opacity="0.4" />
    <line x1="8" y1="18" x2="14" y2="18" stroke="#4FC3F7" strokeWidth="1.5" opacity="0.3" />
  </svg>
);

const IconSandbox = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <rect x="3" y="5" width="22" height="18" rx="3" stroke="#4FC3F7" strokeWidth="1.5" opacity="0.3" />
    <line x1="8" y1="10" x2="20" y2="10" stroke="#4FC3F7" strokeWidth="1.5" opacity="0.5" />
    <line x1="8" y1="13" x2="20" y2="13" stroke="#4FC3F7" strokeWidth="1.5" opacity="0.4" />
    <line x1="8" y1="16" x2="16" y2="16" stroke="#4FC3F7" strokeWidth="1.5" opacity="0.3" />
    <rect x="4" y="19" width="8" height="3" rx="1" fill="#4FC3F7" opacity="0.15" />
  </svg>
);

const IconShip = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <path d="M6 14l6-6 2 2 8-8" stroke="#4FC3F7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
    <circle cx="14" cy="14" r="12" stroke="#4FC3F7" strokeWidth="1.5" opacity="0.3" />
    <path d="M12 16l-3 3 1.5 1.5L14 17" stroke="#4FC3F7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
  </svg>
);

const IconDurable = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <circle cx="14" cy="14" r="10" stroke="#4FC3F7" strokeWidth="1.5" opacity="0.3" />
    <path d="M14 8v6l4 4" stroke="#4FC3F7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
    <path d="M14 4v2" stroke="#4FC3F7" strokeWidth="1.5" strokeLinecap="round" opacity="0.2" />
    <path d="M14 22v2" stroke="#4FC3F7" strokeWidth="1.5" strokeLinecap="round" opacity="0.2" />
    <path d="M4 14h2" stroke="#4FC3F7" strokeWidth="1.5" strokeLinecap="round" opacity="0.2" />
    <path d="M22 14h2" stroke="#4FC3F7" strokeWidth="1.5" strokeLinecap="round" opacity="0.2" />
  </svg>
);

const IconVoice = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <rect x="10" y="4" width="8" height="13" rx="4" stroke="#4FC3F7" strokeWidth="1.5" opacity="0.3" />
    <path d="M6 12v2a8 8 0 0016 0v-2" stroke="#4FC3F7" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
    <line x1="14" y1="21" x2="14" y2="26" stroke="#4FC3F7" strokeWidth="1.5" strokeLinecap="round" opacity="0.2" />
    <line x1="9" y1="26" x2="19" y2="26" stroke="#4FC3F7" strokeWidth="1.5" strokeLinecap="round" opacity="0.2" />
  </svg>
);

const FEATURES: Feature[] = [
  {
    title: "Connect Any Repo",
    description:
      "Authorize the Neptune GitHub App. Browse all your repos. Pick one, pick a branch, go.",
    icon: <IconConnect />,
  },
  {
    title: "Autonomous Coding Loops",
    description:
      "Agents plan, write, test, debug, and commit autonomously. Pause anytime. Branch alternatives. Roll back instantly.",
    icon: <IconAgent />,
  },
  {
    title: "Live Sandbox Preview",
    description:
      "Every run gets a Firecracker microVM. Dev servers run on exposed ports. Preview URL updates in real time.",
    icon: <IconSandbox />,
  },
  {
    title: "Ship to Main",
    description:
      "Auto-commit, auto-PR, optional auto-merge. Reviews and approvals flow through GitHub. Branch protection stays intact.",
    icon: <IconShip />,
  },
  {
    title: "Durable Workflows",
    description:
      "Long runs persist through tab closes, network drops, even deploys. Resume anytime by reconnecting to the stream.",
    icon: <IconDurable />,
  },
  {
    title: "Voice Input",
    description: "Talk to your agent via natural voice. Brief like you would a teammate.",
    icon: <IconVoice />,
  },
];

function NeptuneFeatureCard({ title, description, icon }: Feature) {
  return (
    <div
      className="glass-card-hover group rounded-xl p-6 sm:p-8"
      style={{
        background: "var(--glass-mid, rgba(15,23,42,0.4))",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        border: "1px solid var(--glass-border, rgba(255,255,255,0.08))",
        boxShadow:
          "0 4px 24px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.04) inset",
      }}
    >
      <div className="mb-4 text-[#4FC3F7]/60 transition-colors duration-200 group-hover:text-[#4FC3F7]/90">
        {icon}
      </div>
      <h3
        className="text-lg font-medium"
        style={{
          color: "var(--text-primary, #F1F5F9)",
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </h3>
      <p
        className="mt-2 text-pretty text-sm leading-relaxed"
        style={{ color: "var(--text-muted, #94A3B8)" }}
      >
        {description}
      </p>
    </div>
  );
}

export function LandingFeatures() {
  return (
    <section>
      <div className="mx-auto max-w-[1320px] px-6 py-20 sm:py-28">
        <div className="mb-14 text-center">
          <h2
            className="text-balance font-display text-3xl font-light tracking-tight sm:text-4xl"
            style={{
              fontFamily: "var(--font-inter-tight), var(--font-geist-sans)",
              color: "var(--text-pure, #FFFFFF)",
              letterSpacing: "-0.03em",
            }}
          >
            Everything you need to ship
          </h2>
          <p
            className="mt-3 text-pretty text-base"
            style={{ color: "var(--text-muted, #94A3B8)" }}
          >
            Long-running agents, cloud sandboxes, and one-click deploy.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <NeptuneFeatureCard key={f.title} {...f} />
          ))}
        </div>
      </div>
    </section>
  );
}
