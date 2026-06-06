export function Logo({ className }: { readonly className?: string }) {
  return (
    <div
      className={className}
      aria-label="Neptune Code"
      style={{ display: "flex", alignItems: "center", gap: "0.45em" }}
    >
      {/* Neptune trident icon */}
      <svg
        width="1.1em"
        height="1.1em"
        viewBox="0 0 18 18"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        <path
          d="M9 0L11.5 5H6.5L9 0Z"
          fill="currentColor"
          opacity="0.9"
        />
        <rect x="8" y="5" width="2" height="10" rx="1" fill="currentColor" />
        <path d="M3 9L8 14V4L3 9Z" fill="currentColor" opacity="0.7" />
        <path d="M15 9L10 4V14L15 9Z" fill="currentColor" opacity="0.7" />
        <path d="M5 17H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      </svg>
      <span
        style={{
          fontFamily: "var(--font-geist-sans), sans-serif",
          fontWeight: 500,
          fontSize: "0.95em",
          lineHeight: 1,
          letterSpacing: "-0.01em",
          whiteSpace: "nowrap",
        }}
      >
        Neptune Code
      </span>
    </div>
  );
}
