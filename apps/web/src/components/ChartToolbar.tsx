import type { DrawingTool } from "@xau-trader/protocol";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faArrowPointer,
  faClockRotateLeft,
  faCrosshairs,
  faFillDrip,
  faGripLines,
  faGripLinesVertical,
  faMagnet,
  faSlash,
  faSquare,
  faTableCells,
  faTrash,
  faWaveSquare,
} from "@fortawesome/free-solid-svg-icons";
import { TIMEFRAMES, type Timeframe } from "@/lib/timeframes";
import { useI18n, type TranslationKey } from "@/lib/i18n";

interface ChartToolbarProps {
  timeframe: string;
  onTimeframeChange: (tf: Timeframe) => void;
  gridVisible: boolean;
  onGridToggle: () => void;
  magnetEnabled: boolean;
  onMagnetToggle: () => void;
  crosshairEnabled: boolean;
  onCrosshairToggle: () => void;
  activeTool: DrawingTool | null;
  onToolChange: (tool: DrawingTool | null) => void;
  // Explicit multi-select ("Selector") mode — box/marquee-select over the
  // chart, mutually exclusive with a drawing tool being active.
  selectMode: boolean;
  onSelectModeToggle: () => void;
  selectionCount: number;
  onDeleteSelected: () => void;
  selectionColor: string;
  onSelectionColorChange: (color: string) => void;
}

const TOOL_KEY: Record<DrawingTool, TranslationKey> = {
  trendline: "toolTrend",
  ray: "toolRay",
  vline: "toolVline",
  box: "toolBox",
  fib: "toolFib",
};
const TOOL_ICON: Record<DrawingTool, IconDefinition> = {
  trendline: faSlash,
  ray: faGripLines,
  vline: faGripLinesVertical,
  box: faSquare,
  fib: faWaveSquare,
};
const TOOL_ORDER: DrawingTool[] = ["trendline", "ray", "vline", "box", "fib"];

export function ChartToolbar({
  timeframe,
  onTimeframeChange,
  gridVisible,
  onGridToggle,
  magnetEnabled,
  onMagnetToggle,
  crosshairEnabled,
  onCrosshairToggle,
  activeTool,
  onToolChange,
  selectMode,
  onSelectModeToggle,
  selectionCount,
  onDeleteSelected,
  selectionColor,
  onSelectionColorChange,
}: ChartToolbarProps) {
  const { t } = useI18n();
  const hasSelection = selectionCount > 0;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
      <FontAwesomeIcon icon={faClockRotateLeft} className="h-3.5 w-3.5 text-text-muted" aria-hidden />
      <div className="flex items-center gap-1" role="group" aria-label="Timeframe">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            type="button"
            onClick={() => onTimeframeChange(tf)}
            aria-pressed={tf === timeframe}
            className="rounded px-2 py-1 text-xs font-medium transition-colors duration-150"
            style={{
              color: tf === timeframe ? "var(--color-text-primary)" : "var(--color-text-muted)",
              backgroundColor: tf === timeframe ? "var(--color-card-alt)" : "transparent",
            }}
          >
            {tf}
          </button>
        ))}
      </div>

      <div className="mx-1 h-4 w-px bg-border" aria-hidden />

      <div className="flex items-center gap-1" role="group" aria-label="Drawing tools">
        <button
          type="button"
          onClick={onSelectModeToggle}
          aria-pressed={selectMode}
          title={t("toolSelectorHint")}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors duration-150"
          style={{
            color: selectMode ? "var(--color-accent)" : "var(--color-text-muted)",
            backgroundColor: selectMode ? "var(--color-card-alt)" : "transparent",
          }}
        >
          <FontAwesomeIcon icon={faArrowPointer} className="h-3 w-3" />
          {t("toolSelector")}
        </button>
        {TOOL_ORDER.map((tool) => (
          <button
            key={tool}
            type="button"
            onClick={() => onToolChange(activeTool === tool ? null : tool)}
            aria-pressed={activeTool === tool}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors duration-150"
            style={{
              color: activeTool === tool ? "var(--color-accent)" : "var(--color-text-muted)",
              backgroundColor: activeTool === tool ? "var(--color-card-alt)" : "transparent",
            }}
          >
            <FontAwesomeIcon icon={TOOL_ICON[tool]} className="h-3 w-3" />
            {t(TOOL_KEY[tool])}
          </button>
        ))}
        {hasSelection && (
          <>
            <div className="mx-0.5 h-4 w-px bg-border" aria-hidden />
            <label
              title={t("drawingColorHint")}
              className="relative flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-text-muted transition-colors duration-150 hover:bg-card-alt"
            >
              <FontAwesomeIcon icon={faFillDrip} className="h-3 w-3" style={{ color: selectionColor }} />
              {t("color")}
              <input
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(selectionColor) ? selectionColor : "#d97757"}
                onChange={(e) => onSelectionColorChange(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
            <button
              type="button"
              onClick={onDeleteSelected}
              className="flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors duration-150"
              style={{ color: "var(--color-sell)" }}
            >
              <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
              {t("delete")} ({selectionCount})
            </button>
          </>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onCrosshairToggle}
          aria-pressed={crosshairEnabled}
          title={t("crosshairHint")}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors duration-150"
          style={{
            color: crosshairEnabled ? "var(--color-accent)" : "var(--color-text-muted)",
            backgroundColor: crosshairEnabled ? "var(--color-card-alt)" : "transparent",
          }}
        >
          <FontAwesomeIcon icon={faCrosshairs} className="h-3 w-3" />
          {t("crosshair")}
        </button>
        <button
          type="button"
          onClick={onMagnetToggle}
          aria-pressed={magnetEnabled}
          title={t("magnetHint")}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors duration-150"
          style={{
            color: magnetEnabled ? "var(--color-accent)" : "var(--color-text-muted)",
            backgroundColor: magnetEnabled ? "var(--color-card-alt)" : "transparent",
          }}
        >
          <FontAwesomeIcon icon={faMagnet} className="h-3 w-3" />
          {t("magnet")}
        </button>
        <label className="flex items-center gap-1.5 text-xs text-text-muted">
          <input type="checkbox" checked={gridVisible} onChange={onGridToggle} className="accent-[var(--color-accent)]" />
          <FontAwesomeIcon icon={faTableCells} className="h-3 w-3" />
          {t("grid")}
        </label>
      </div>
    </div>
  );
}
