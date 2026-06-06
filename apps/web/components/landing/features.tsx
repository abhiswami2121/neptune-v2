"use client";

const FEATURES = [
  {
    title: "Connect Any Repo",
    description:
      "Authorize the Neptune GitHub App. Browse all your repos. Pick one, pick a branch, go.",
  },
  {
    title: "Autonomous Coding Loops",
    description:
      "Agents plan, write, test, debug, and commit autonomously. Pause anytime. Branch alternatives. Roll back instantly.",
  },
  {
    title: "Live Sandbox Preview",
    description:
      "Every run gets a Firecracker microVM. Dev servers run on exposed ports. Preview URL updates in real time.",
  },
  {
    title: "Ship to Main",
    description:
      "Auto-commit, auto-PR, optional auto-merge. Reviews and approvals flow through GitHub. Your branch protection rules stay intact.",
  },
  {
    title: "Durable Workflows",
    description:
      "Long runs persist through tab closes, network drops, even deploys. Resume anytime by reconnecting to the stream.",
  },
  {
    title: "Voice Input",
    description:
      "Talk to your agent via natural voice. Brief like you would a teammate.",
  },
];

function NeptuneFeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div
      className="group rounded-xl p-6 sm:p-8 transition-all duration-300"
      style={{
        background: "var(--glass-mid, rgba(15,23,42,0.4))",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        border: "1px solid var(--glass-border, rgba(255,255,255,0.08))",
        borderRadius: "12px",
        boxShadow:
          "0 4px 24px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.04) inset",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "rgba(79,195,247,0.4)";
        e.currentTarget.style.boxShadow =
          "0 4px 32px rgba(0,0,0,0.4), 0 0 20px rgba(0,212,255,0.15), 0 0 0 1px rgba(255,255,255,0.06) inset";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
        e.currentTarget.style.boxShadow =
          "0 4px 24px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.04) inset";
      }}
    >
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
        className="mt-2 text-sm leading-relaxed"
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
        <div className="mb-12 text-center">
          <h2
            className="text-3xl font-light tracking-tight sm:text-4xl"
            style={{
              color: "var(--text-pure, #FFFFFF)",
              letterSpacing: "-0.03em",
            }}
          >
            Everything you need to ship
          </h2>
          <p
            className="mt-3 text-base"
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
