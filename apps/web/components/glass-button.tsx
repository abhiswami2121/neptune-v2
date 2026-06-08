"use client";

import { type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type GlassButtonVariant = "primary" | "ghost";

type GlassButtonProps = {
  children: ReactNode;
  variant?: GlassButtonVariant;
  className?: string;
} & Omit<ComponentProps<"button">, "className">;

const base =
  "relative inline-flex items-center justify-center gap-2 rounded-lg font-medium text-sm transition-all duration-200 ease-out select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4FC3F7]/50 disabled:pointer-events-none disabled:opacity-50";

const variants: Record<GlassButtonVariant, string> = {
  primary:
    "bg-gradient-to-br from-[#4FC3F7] to-[#00D4FF] text-[#0A0E1A] shadow-[0_0_40px_rgba(0,212,255,0.4),0_0_0_1px_rgba(255,255,255,0.1)] px-8 py-3.5 overflow-hidden",
  ghost:
    "bg-[rgba(15,23,42,0.4)] text-[#F1F5F9] border border-[rgba(255,255,255,0.08)] px-7 py-3 backdrop-blur-[20px] saturate-[180%] hover:border-[rgba(255,255,255,0.14)] hover:bg-[rgba(255,255,255,0.04)]",
};

export function GlassButton({
  children,
  variant = "primary",
  className,
  ...props
}: GlassButtonProps) {
  return (
    <button
      {...props}
      className={cn(base, variants[variant], "group", className)}
    >
      {variant === "primary" && (
        <span
          className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_3s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/15 to-transparent"
          aria-hidden="true"
        />
      )}
      <span className="relative z-10 flex items-center gap-2">{children}</span>
    </button>
  );
}
