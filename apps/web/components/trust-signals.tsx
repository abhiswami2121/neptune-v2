const SIGNALS = [
  { label: "SOC 2", href: "#" },
  { label: "Open Source", href: "https://github.com/abhiswami2121/neptune-v2" },
  { label: "Self-hostable", href: "#" },
];

export function TrustSignals() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-[#94A3B8]">
      {SIGNALS.map((signal, i) => (
        <span key={signal.label} className="flex items-center gap-1.5">
          <span
            className="inline-flex items-center justify-center"
            aria-hidden="true"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M11.5 4L5.5 10L2.5 7"
                stroke="#4FC3F7"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span>{signal.label}</span>
          {i < SIGNALS.length - 1 && (
            <span className="mx-1 select-none text-[#475569]">&middot;</span>
          )}
        </span>
      ))}
    </div>
  );
}
