interface ConnectionBadgeProps {
  label: string;
  connected: boolean;
}

export function ConnectionBadge({ label, connected }: ConnectionBadgeProps) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card-alt px-3 py-1 text-xs text-text-muted">
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: connected ? "var(--color-buy)" : "var(--color-sell)" }}
      />
      {label}
    </span>
  );
}
