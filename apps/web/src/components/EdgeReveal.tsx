"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface EdgeRevealProps {
  // Inert passthrough (plain normal-flow children, no positioning at all)
  // when false — this component only does anything in fullscreen mode.
  active: boolean;
  edge: "top" | "bottom" | "right";
  // Panel size along its reveal axis (height for top/bottom, width for
  // right) — kept in sync with the same size the resizable split uses
  // outside fullscreen, so the panel doesn't jump to a different size the
  // moment fullscreen is entered.
  size: number;
  children: ReactNode;
}

const HIDE_DELAY_MS = 260;

// Fullscreen mode (Amir: "فضا همه‌اش به چارت داده بشه ... و وقتی موس به
// سمتشون میره باید امکان هندل داشته باشه و رندر و نمایان بشه خیلی نرم و
// انیمیشنی") hides the header/positions-bar/money-panel entirely and gives
// their space to the chart, bringing each back as a translucent overlay the
// moment the pointer reaches its edge — the same "hidden until you reach
// for it" convention every fullscreen video player already uses for its own
// controls. A thin, always-present hot zone sits right at the screen edge
// (the panel itself starts fully translated off-canvas, so without it
// there'd be nothing left to hover to bring it back); a short hide delay
// keeps the panel up while the pointer crosses from the hot zone onto the
// panel itself instead of flickering shut mid-move.
export function EdgeReveal({ active, edge, size, children }: EdgeRevealProps) {
  const [revealed, setRevealed] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active) setRevealed(false);
  }, [active]);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  if (!active) return <>{children}</>;

  function show() {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    setRevealed(true);
  }

  function scheduleHide() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setRevealed(false), HIDE_DELAY_MS);
  }

  const hiddenTransform = edge === "top" ? "-translate-y-full" : edge === "bottom" ? "translate-y-full" : "translate-x-full";
  const positionClass = edge === "top" ? "top-0 inset-x-0" : edge === "bottom" ? "bottom-0 inset-x-0" : "top-0 bottom-0 right-0";
  const hotZoneClass = edge === "top" ? "top-0 inset-x-0 h-2" : edge === "bottom" ? "bottom-0 inset-x-0 h-2" : "top-0 bottom-0 right-0 w-2";
  const sizeStyle = edge === "right" ? { width: size } : { height: size };

  return (
    <>
      <div className={`fixed z-40 ${hotZoneClass}`} onPointerEnter={show} />
      <div
        className={`fixed z-40 ${positionClass} shadow-2xl transition-transform duration-300 ease-out ${revealed ? "translate-x-0 translate-y-0" : hiddenTransform}`}
        style={sizeStyle}
        onPointerEnter={show}
        onPointerLeave={scheduleHide}
      >
        <div className="h-full w-full">{children}</div>
      </div>
    </>
  );
}
