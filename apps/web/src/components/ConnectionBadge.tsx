import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

interface ConnectionBadgeProps {
  label: string;
  connected: boolean;
  icon: IconDefinition;
}

export function ConnectionBadge({ label, connected, icon }: ConnectionBadgeProps) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-200"
      style={{
        borderColor: connected ? "color-mix(in srgb, var(--color-buy) 40%, var(--color-border))" : "var(--color-border)",
        backgroundColor: connected ? "color-mix(in srgb, var(--color-buy) 12%, var(--color-card-alt))" : "var(--color-card-alt)",
        color: connected ? "var(--color-buy)" : "var(--color-text-muted)",
      }}
    >
      <FontAwesomeIcon icon={icon} className="h-3 w-3" />
      <span className="relative flex h-1.5 w-1.5">
        {connected && (
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
            style={{ backgroundColor: "var(--color-buy)" }}
          />
        )}
        <span
          className="relative inline-flex h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: connected ? "var(--color-buy)" : "var(--color-sell)" }}
        />
      </span>
      {label}
    </span>
  );
}
