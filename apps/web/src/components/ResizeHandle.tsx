import type { PointerEvent as ReactPointerEvent } from "react";

interface ResizeHandleProps {
  // "vertical" = a vertical bar you drag left/right (splits two side-by-side
  // panels); "horizontal" = a horizontal bar you drag up/down (splits two
  // stacked panels). Named after the handle's own resting orientation, same
  // convention as the native CSS `resize`/ARIA separator usage.
  orientation: "vertical" | "horizontal";
  label: string;
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
}

// A thin drag-to-resize divider between two panels (chart<->MoneyPanel,
// chart-area<->PositionsBar) — an 8px pointer hit-area (comfortable to grab)
// around a 1px visible line that only calls attention to itself on hover/
// drag, so it doesn't read as a heavy permanent border the rest of the time.
export function ResizeHandle({ orientation, label, onPointerDown, onPointerMove, onPointerUp }: ResizeHandleProps) {
  const vertical = orientation === "vertical";
  return (
    <div
      role="separator"
      aria-orientation={vertical ? "vertical" : "horizontal"}
      aria-label={label}
      title={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className={`group relative z-10 shrink-0 touch-none select-none ${vertical ? "w-2.5 cursor-col-resize" : "h-2.5 cursor-row-resize"}`}
    >
      <div
        className={`absolute rounded-full bg-border transition-colors duration-150 group-hover:bg-accent group-active:bg-accent ${
          vertical ? "left-1/2 top-0 h-full w-px -translate-x-1/2" : "left-0 top-1/2 h-px w-full -translate-y-1/2"
        }`}
      />
    </div>
  );
}
