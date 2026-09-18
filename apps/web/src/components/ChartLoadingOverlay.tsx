"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

const EXIT_ANIMATION_MS = 220;
const BAR_COUNT = 7;

interface ChartLoadingOverlayProps {
  // Whether the chart genuinely has no data yet — deliberately NOT shown
  // for a timeframe switch or a reconnect resync (both already have real
  // bars on screen; the domino reveal / silent resync apply already read
  // as "loading" there). This is only the true cold-start case: first-ever
  // load, or a symbol/history fetch that hasn't landed at all yet.
  visible: boolean;
  // Distinguishes "waiting on the bridge/EA" from "waiting on history data
  // that's already in flight" — a stalled connection shouldn't just spin
  // forever with no explanation (the "handle the interruption" part of the
  // ask), it should say so.
  connected: boolean;
}

// A premium stand-in for a generic spinner while the chart has no data yet
// — a small candlestick-shaped equalizer/visualizer (globals.css's
// chart-visualizer-bar keyframe) rather than a plain circular spin, so the
// waiting state still reads as "this is a trading chart", not a generic
// web-app loader. Stays mounted briefly after `visible` flips false so the
// exit materialize animation can actually play instead of the overlay just
// vanishing — that handoff (overlay dematerializing exactly as the first
// candles start dominoing in) is the whole point.
export function ChartLoadingOverlay({ visible, connected }: ChartLoadingOverlayProps) {
  const { t } = useI18n();
  const [rendered, setRendered] = useState(visible);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      return;
    }
    const timer = setTimeout(() => setRendered(false), EXIT_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!rendered) return null;

  return (
    <div
      className={`absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-lg ${
        visible ? "animate-chart-overlay-in" : "animate-chart-overlay-out"
      }`}
      style={{ backgroundColor: "color-mix(in srgb, var(--color-card) 55%, transparent)" }}
      role="status"
      aria-live="polite"
    >
      <div className="flex h-8 items-end gap-1">
        {Array.from({ length: BAR_COUNT }, (_, i) => (
          <span
            key={i}
            className="animate-chart-visualizer h-full w-1.5 rounded-full"
            style={{
              backgroundColor: i % 2 === 0 ? "var(--color-buy)" : "var(--color-sell)",
              animationDelay: `${i * 90}ms`,
            }}
          />
        ))}
      </div>
      <p className="text-xs font-medium text-text-muted">{connected ? t("chartLoadingData") : t("chartWaitingForConnection")}</p>
    </div>
  );
}
