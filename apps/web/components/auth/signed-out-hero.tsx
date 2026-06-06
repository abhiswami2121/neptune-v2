"use client";

import { useEffect, useRef, useState } from "react";
import { SignInButton } from "@/components/auth/sign-in-button";
import { AppMockup } from "@/components/landing/app-mockup";
import { GitHubLink } from "@/components/landing/github-link";
import { LandingBento } from "@/components/landing/bento";
import { LandingFeatures } from "@/components/landing/features";
import { LandingFooter } from "@/components/landing/footer";
import { LandingNav } from "@/components/landing/nav";
import { Stage } from "@/components/landing/stage";

export function SignedOutHero() {
  const heroButtonsRef = useRef<HTMLDivElement>(null);
  const [heroButtonsVisible, setHeroButtonsVisible] = useState(true);

  useEffect(() => {
    const el = heroButtonsRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setHeroButtonsVisible(entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="landing relative isolate min-h-screen bg-(--l-bg) text-(--l-fg) selection:bg-(--l-fg)/20">
      <div className="pointer-events-none absolute inset-y-0 left-0 right-0 hidden md:block">
        <div className="mx-auto h-full max-w-[1320px] border-x border-x-(--l-border)" />
      </div>

      <div className="relative z-10">
        <LandingNav showSignIn={!heroButtonsVisible} />

        <section className="relative overflow-hidden pb-0 pt-24 md:pb-0 md:pt-44">
          <div className="mx-auto max-w-[1320px] px-6">
            <div className="max-w-[740px]">
              <h1
                className="text-4xl font-light leading-[1.03] tracking-tight sm:text-5xl md:text-7xl"
                style={{ letterSpacing: "-0.03em" }}
              >
                Neptune Code
              </h1>
              <p className="mt-4 text-balance text-base leading-relaxed text-(--l-fg-2) sm:mt-6 sm:text-xl">
                The coding agent that ships.
              </p>
              <p className="mt-3 max-w-[520px] text-balance text-sm leading-relaxed text-(--l-fg-3) sm:text-base">
                Spin up a sandbox. Connect a repo. Describe the task. Watch real
                PRs land on your main branch.
              </p>

              <ul className="mt-6 space-y-2.5 text-sm text-(--l-fg-2) sm:text-base">
                <li className="flex items-center gap-2.5">
                  <span className="text-(--neptune-cyan) select-none">&#x2713;</span>
                  Long-running agents (no laptop required)
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-(--neptune-cyan) select-none">&#x2713;</span>
                  Live sandbox preview at any port
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-(--neptune-cyan) select-none">&#x2713;</span>
                  Auto-commit, auto-PR, ready to merge
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-(--neptune-cyan) select-none">&#x2713;</span>
                  Branch isolation per task
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-(--neptune-cyan) select-none">&#x2713;</span>
                  Pause, resume, share sessions
                </li>
              </ul>
            </div>

            <div
              ref={heroButtonsRef}
              className="mt-6 flex items-center gap-2 sm:mt-8"
            >
              <SignInButton size="lg" callbackUrl="/sessions" />
              <GitHubLink>Open Source</GitHubLink>
            </div>
          </div>

          <div className="mx-auto mt-12 max-w-[1320px] px-4 sm:px-6 md:mt-20 md:px-0 overflow-hidden">
            <div>
              <Stage tone="slate">
                <div className="mx-auto w-full max-w-[1160px]">
                  <AppMockup />
                </div>
              </Stage>
            </div>
          </div>
        </section>

        <LandingFeatures />
        <LandingBento />
        <LandingFooter />
      </div>
    </div>
  );
}
