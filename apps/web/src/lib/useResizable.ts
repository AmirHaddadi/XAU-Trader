"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

interface UseResizableOptions {
  // "x" = dragging left/right changes the tracked size (the chart<->
  // MoneyPanel split); "y" = dragging up/down (the chart-area<->
  // PositionsBar split).
  axis: "x" | "y";
  value: number;
  min: number;
  max: number;
  // The handle sits to the *left*/*above* a panel anchored to the
  // trailing edge (MoneyPanel is on the right, PositionsBar's own handle
  // is above it) — dragging toward that panel should shrink it, i.e. the
  // raw pixel delta needs inverting for those. False for a leading-edge
  // panel (none currently, kept for completeness/future reuse).
  invert: boolean;
  onCommit: (value: number) => void;
}

// Drag-to-resize a single dimension. Mirrors the "commit once, on release"
// pattern already used for chart drawing drags and price-line drags: pure
// local state drives the live visual size during the drag itself, and the
// parent (Settings.moneyPanelWidth/positionsBarHeight, round-tripping
// through the bridge) only hears about the final value once on pointerup —
// not per pixel of movement.
export function useResizable({ axis, value, min, max, invert, onCommit }: UseResizableOptions) {
  const [size, setSize] = useState(value);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const dragRef = useRef<{ start: number; startSize: number } | null>(null);

  // An external change (settings resync after reconnect) should still win
  // once no drag of this handle is in progress.
  useEffect(() => {
    if (!dragRef.current) setSize(value);
  }, [value]);

  const clamp = useCallback((v: number) => Math.min(max, Math.max(min, v)), [min, max]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      e.preventDefault();
      dragRef.current = { start: axis === "x" ? e.clientX : e.clientY, startSize: sizeRef.current };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [axis],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!dragRef.current) return;
      const pos = axis === "x" ? e.clientX : e.clientY;
      const delta = pos - dragRef.current.start;
      setSize(clamp(dragRef.current.startSize + (invert ? -delta : delta)));
    },
    [axis, clamp, invert],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      e.currentTarget.releasePointerCapture(e.pointerId);
      onCommit(sizeRef.current);
    },
    [onCommit],
  );

  return { size, dragHandlers: { onPointerDown, onPointerMove, onPointerUp } };
}
