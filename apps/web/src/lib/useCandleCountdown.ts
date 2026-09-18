"use client";

import { useEffect, useState } from "react";
import type { Bar } from "@xau-trader/protocol";
import { timeframeSeconds } from "./timeframes";

export type CountdownUrgency = "normal" | "warning" | "critical";

export interface CandleCountdown {
  remainingSeconds: number;
  label: string;
  urgency: CountdownUrgency;
}

function formatLabel(remaining: number, periodSeconds: number): string {
  const s = Math.max(0, Math.floor(remaining));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (periodSeconds >= 3600) {
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

// Countdown to the current (forming) candle's close, ticking every second.
// Client-clock-based (Date.now()) — fine for a local desktop tool where the
// OS clock is trusted; a display-only affordance, not something any order
// logic depends on.
export function useCandleCountdown(liveBar: Bar | undefined, timeframe: string | undefined): CandleCountdown | undefined {
  const [now, setNow] = useState(() => Date.now());
  // `liveBar` gets a new object identity on every bar.update push (up to a
  // few times a second, see useBridgeSocket) — depending on the object
  // itself here would tear down and restart the 1s interval faster than it
  // ever completes a full tick, so `now` would never actually advance
  // (looked "frozen a moment after activity starts", reported live).
  // Depending on presence only means the interval survives live pushes and
  // only restarts on a genuine mount/unmount or timeframe change.
  const hasLiveBar = liveBar !== undefined;

  useEffect(() => {
    if (!hasLiveBar || !timeframe) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasLiveBar, timeframe]);

  if (!liveBar || !timeframe) return undefined;

  const periodSeconds = timeframeSeconds(timeframe);
  const closeAt = (liveBar.time + periodSeconds) * 1000;
  const remainingSeconds = (closeAt - now) / 1000;
  const fraction = remainingSeconds / periodSeconds;

  const urgency: CountdownUrgency = fraction < 0.1 ? "critical" : fraction < 0.25 ? "warning" : "normal";

  return { remainingSeconds, label: formatLabel(remainingSeconds, periodSeconds), urgency };
}
