"use client";

import { useEffect, useRef } from "react";

function useAnimationFrame(callback: (delta: number) => void) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    let raf: number;
    let last = performance.now();

    function frame(now: number) {
      const delta = now - last;
      last = now;
      callbackRef.current(delta);
      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
}

type OrbDef = {
  color: string;
  size: [number, number];
  initialX: number;
  initialY: number;
  speedX: number;
  speedY: number;
  blur: number;
  opacity: number;
};

const ORBS: OrbDef[] = [
  {
    color: "rgba(0,212,255,0.18)",
    size: [600, 400],
    initialX: 26,
    initialY: 18,
    speedX: 0.004,
    speedY: 0.007,
    blur: 120,
    opacity: 0.55,
  },
  {
    color: "rgba(139,92,246,0.14)",
    size: [720, 520],
    initialX: 72,
    initialY: 62,
    speedX: -0.005,
    speedY: -0.006,
    blur: 140,
    opacity: 0.45,
  },
  {
    color: "rgba(236,72,153,0.10)",
    size: [480, 360],
    initialX: 50,
    initialY: 40,
    speedX: 0.003,
    speedY: -0.008,
    blur: 100,
    opacity: 0.38,
  },
];

export function AuroraBackground() {
  const containerRef = useRef<HTMLDivElement>(null);

  useAnimationFrame((delta) => {
    if (!containerRef.current) return;
    const seconds = delta / 1000;
    const els = containerRef.current.querySelectorAll<HTMLDivElement>(
      "[data-aurora-orb]",
    );

    els.forEach((el, i) => {
      const orb = ORBS[i];
      if (!orb) return;

      const phase = el.dataset.phase
        ? parseFloat(el.dataset.phase) + seconds * orb.speedX * 60
        : 0;
      const phaseY = el.dataset.phaseY
        ? parseFloat(el.dataset.phaseY) + seconds * orb.speedY * 60
        : 0;

      el.dataset.phase = String(phase);
      el.dataset.phaseY = String(phaseY);

      const xOffset = Math.sin(phase) * 8;
      const yOffset = Math.cos(phaseY) * 10;
      const opacityPulse =
        orb.opacity + Math.sin(phase * 1.3) * 0.08;

      el.style.transform = `translate(${xOffset}px, ${yOffset}px)`;
      el.style.opacity = String(Math.max(0.1, opacityPulse));
    });
  });

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    >
      {ORBS.map((orb, i) => (
        <div
          key={i}
          data-aurora-orb
          className="absolute rounded-full"
          style={{
            width: orb.size[0],
            height: orb.size[1],
            left: `${orb.initialX}%`,
            top: `${orb.initialY}%`,
            background: orb.color,
            filter: `blur(${orb.blur}px)`,
            opacity: orb.opacity,
            willChange: "transform, opacity",
          }}
        />
      ))}
    </div>
  );
}
