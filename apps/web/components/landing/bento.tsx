import { SignInButton } from "@/components/auth/sign-in-button";

type BentoItem = {
  readonly id: string;
  readonly title: string;
  readonly body: string;
};

const items: readonly BentoItem[] = [
  {
    id: "001",
    title: "Connect Any Repo",
    body: "Authorize the Neptune GitHub App. Browse all your repos. Pick one, pick a branch, go.",
  },
  {
    id: "002",
    title: "Autonomous Coding Loops",
    body: "Agents plan, write, test, debug, and commit autonomously. Pause anytime. Branch alternatives. Roll back instantly.",
  },
  {
    id: "003",
    title: "Live Sandbox Preview",
    body: "Every run gets a Firecracker microVM. Dev servers run on exposed ports. Preview URL updates in real time.",
  },
  {
    id: "004",
    title: "Ship to Main",
    body: "Auto-commit, auto-PR, optional auto-merge. Reviews and approvals flow through GitHub. Your branch protection rules stay intact.",
  },
  {
    id: "005",
    title: "Durable Workflows",
    body: "Long runs persist through tab closes, network drops, even deploys. Resume anytime by reconnecting to the stream.",
  },
  {
    id: "006",
    title: "Voice Input",
    body: "Talk to your agent via natural voice. Brief it like you would a teammate.",
  },
];

function mark(index: number) {
  if (index === 0) {
    return (
      <div className="grid grid-cols-2 gap-1" aria-hidden="true">
        <span className="size-2 border border-(--neptune-cyan-glow)" />
        <span className="size-2 border border-(--neptune-cyan-glow)" />
        <span className="size-2 border border-(--neptune-cyan-glow)" />
        <span className="size-2 border border-(--neptune-cyan-glow)" />
      </div>
    );
  }
  if (index === 1) {
    return (
      <div className="flex items-center gap-1.5" aria-hidden="true">
        <span className="h-px w-4 bg-(--neptune-cyan-glow)" />
        <span className="h-px w-6 bg-(--neptune-cyan-glow)" />
        <span className="h-px w-3 bg-(--neptune-cyan-glow)" />
      </div>
    );
  }
  if (index === 2) {
    return (
      <div className="flex flex-col gap-1" aria-hidden="true">
        <span className="h-1 w-8 border border-(--neptune-cyan-glow)" />
        <span className="h-1 w-6 border border-(--neptune-cyan-glow)" />
        <span className="h-1 w-4 border border-(--neptune-cyan-glow)" />
      </div>
    );
  }
  if (index === 3) {
    return (
      <div className="relative h-6 w-8" aria-hidden="true">
        <span className="absolute left-0 top-0 size-2 border border-(--neptune-cyan-glow)" />
        <span className="absolute right-0 top-0 size-2 border border-(--neptune-cyan-glow)" />
        <span className="absolute bottom-0 left-1/2 size-2 -translate-x-1/2 border border-(--neptune-cyan-glow)" />
      </div>
    );
  }
  if (index === 4) {
    return (
      <div className="flex gap-0.5" aria-hidden="true">
        <span className="h-4 w-1.5 bg-(--neptune-cyan-glow)" />
        <span className="h-3 w-1.5 bg-(--neptune-cyan-glow)" />
        <span className="h-5 w-1.5 bg-(--neptune-cyan-glow)" />
        <span className="h-3 w-1.5 bg-(--neptune-cyan-glow)" />
        <span className="h-4 w-1.5 bg-(--neptune-cyan-glow)" />
      </div>
    );
  }
  return (
    <div className="relative h-6 w-6" aria-hidden="true">
      <span className="absolute left-0 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border border-(--neptune-cyan-glow)" />
      <span className="absolute right-0 top-0 h-2 w-2 rounded-full border border-(--neptune-cyan-glow)" />
      <span className="absolute right-0 bottom-0 h-2 w-2 rounded-full border border-(--neptune-cyan-glow)" />
    </div>
  );
}

export function LandingBento() {
  return (
    <section>
      <div className="mx-auto max-w-[1320px] border-t border-(--l-border-subtle)">
        <div className="grid gap-6 border-b border-(--l-border) px-6 py-14 pb-10 sm:gap-10 sm:px-10 md:grid-cols-2 md:gap-0 md:pb-14 md:py-28">
          <div>
            <h2 className="text-balance text-3xl font-semibold leading-[1.05] tracking-tighter sm:text-4xl md:text-6xl">
              Features that
              <br />
              ship.
            </h2>
          </div>
          <div className="md:pl-10">
            <p className="max-w-md text-balance text-base leading-relaxed text-(--l-fg-2)">
              Long-running coding agents with live sandbox preview, auto-PRs,
              and durable workflows. No laptop required.
            </p>
            <div className="mt-6">
              <SignInButton />
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => (
            <article
              key={item.id}
              className={`flex h-full flex-col border-b border-(--l-border) px-6 py-8 md:px-10 md:py-9 ${
                index % 3 === 0 ? "" : "lg:border-l lg:border-l-(--l-border)"
              } ${
                index >= 3 ? "md:border-b-0" : ""
              } ${
                index % 2 === 1 ? "md:border-l md:border-l-(--l-border)" : ""
              }`}
            >
              <div className="font-mono text-[11px] text-(--l-fg-4)">
                {item.id}
              </div>
              <div className="mt-7 flex h-10 items-center">{mark(index)}</div>
              <h3 className="mt-7 text-balance text-2xl font-semibold tracking-tighter">
                {item.title}
              </h3>
              <p className="mt-4 flex-1 text-pretty text-sm leading-relaxed text-(--l-fg-2)">
                {item.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
