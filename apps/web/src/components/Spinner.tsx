interface SpinnerProps {
  size?: number;
  className?: string;
}

// A real spinning indicator, not a text placeholder — used wherever an
// async recalculation (risk.preview) is in flight so the UI reads as "live
// and working" instead of silently hard-snapping to new numbers once the
// round-trip resolves.
export function Spinner({ size = 14, className = "" }: SpinnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`animate-spin-premium ${className}`}
      role="status"
      aria-label="Loading"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
