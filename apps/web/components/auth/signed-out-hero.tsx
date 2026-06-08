"use client";

import { useEffect, useRef, useState } from "react";
import { SignInButton } from "@/components/auth/sign-in-button";
import { AppMockup } from "@/components/landing/app-mockup";
import { GitHubLink } from "@/components/landing/github-link";
import { LandingFeatures } from "@/components/landing/features";
import { LandingFooter } from "@/components/landing/footer";
import { LandingNav } from "@/components/landing/nav";
import { Stage } from "@/components/landing/stage";
import { AuroraBackground } from "@/components/aurora-background";
import { TrustSignals } from "@/components/trust-signals";
import { HowItWorks } from "@/components/how-it-works";
import { LiveDemoStrip } from "@/components/live-demo-strip";

export function SignedOutHero() {
  const heroButtonsRef = useRef<HTMLDivElement>(null);
  const [heroButtonsVisible, setHeroButtonsVisible] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
      {/* Dot grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "radial-gradient(rgba(79,195,247,0.3) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
        aria-hidden="true"
      />

      {/* Aurora gradient orbs */}
      <AuroraBackground />

      {/* Center grid lines */}
      <div className="pointer-events-none absolute inset-y-0 left-0 right-0 hidden md:block">
        <div className="mx-auto h-full max-w-[1320px] border-x border-x-(--l-border)" />
      </div>

      <div className="relative z-10">
        <LandingNav showSignIn={!heroButtonsVisible} />

        {/* ── HERO ── */}
        <section className="relative overflow-hidden pb-0 pt-24 md:pb-0 md:pt-44">
          <div className="mx-auto max-w-[1320px] px-6">
            <div className="max-w-[780px]">
              {/* Mega scale headline */}
              <h1
                className="font-display text-[clamp(48px,8vw,104px)] font-light leading-[0.95]"
                style={{
                  fontFamily: "var(--font-inter-tight), var(--font-geist-sans)",
                  letterSpacing: "-0.05em",
                  opacity: mounted ? 1 : 0,
                  transform: mounted ? "translateY(0)" : "translateY(20px)",
                  transition:
                    "opacity 600ms ease-out, transform 600ms ease-out",
                }}
              >
                The coding agent
                <br />
                that ships<span className="text-[#4FC3F7]">.</span>
              </h1>

              {/* Subheadline */}
              <p
                className="mt-6 max-w-[580px] text-pretty text-lg leading-relaxed text-[#94A3B8] sm:text-xl"
                style={{
                  opacity: mounted ? 1 : 0,
                  transform: mounted ? "translateY(0)" : "translateY(12px)",
                  transition:
                    "opacity 600ms ease-out 100ms, transform 600ms ease-out 100ms",
                }}
              >
                Spin up a sandbox. Connect a repo. Describe the task. Watch real
                PRs land on your main branch.
              </p>

              {/* Feature bullets */}
              <ul
                className="mt-8 space-y-3 text-sm text-[#94A3B8] sm:text-base"
                style={{
                  opacity: mounted ? 1 : 0,
                  transform: mounted ? "translateY(0)" : "translateY(12px)",
                  transition:
                    "opacity 600ms ease-out 200ms, transform 600ms ease-out 200ms",
                }}
              >
                <li className="flex items-center gap-3">
                  <span
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#4FC3F7]/10"
                    aria-hidden="true"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M10 3L5 8L2 5"
                        stroke="#4FC3F7"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  Long-running agents (no laptop required)
                </li>
                <li className="flex items-center gap-3">
                  <span
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#4FC3F7]/10"
                    aria-hidden="true"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M10 3L5 8L2 5"
                        stroke="#4FC3F7"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  Auto-commit, auto-PR, ready to merge
                </li>
                <li className="flex items-center gap-3">
                  <span
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#4FC3F7]/10"
                    aria-hidden="true"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M10 3L5 8L2 5"
                        stroke="#4FC3F7"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  Branch isolation per task
                </li>
              </ul>
            </div>

            {/* CTAs */}
            <div
              ref={heroButtonsRef}
              className="mt-10 flex flex-wrap items-center gap-3 sm:mt-12"
              style={{
                opacity: mounted ? 1 : 0,
                transform: mounted ? "translateY(0)" : "translateY(12px)",
                transition:
                  "opacity 600ms ease-out 300ms, transform 600ms ease-out 300ms",
              }}
            >
              <SignInButton size="lg" callbackUrl="/sessions" />
              <GitHubLink>Open Source</GitHubLink>
            </div>

            {/* Trust signals */}
            <div
              className="mt-6"
              style={{
                opacity: mounted ? 1 : 0,
                transform: mounted ? "translateY(0)" : "translateY(12px)",
                transition:
                  "opacity 600ms ease-out 400ms, transform 600ms ease-out 400ms",
              }}
            >
              <TrustSignals />
            </div>
          </div>

          {/* App mockup stage */}
          <div className="mx-auto mt-12 max-w-[1320px] px-4 sm:px-6 md:mt-20 md:px-0 overflow-hidden">
            <Stage tone="slate">
              <div className="mx-auto w-full max-w-[1160px]">
                <AppMockup />
              </div>
            </Stage>
          </div>
        </section>

        <LandingFeatures />
        <HowItWorks />
        <LiveDemoStrip />
        <LandingFooter />
      </div>
    </div>
  );
}
