import type { DrawingTool } from "@xau-trader/protocol";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faArrowRightLong, faClockRotateLeft, faSlash, faTableCells, faTrash, faWaveSquare } from "@fortawesome/free-solid-svg-icons";
import { TIMEFRAMES, type Timeframe } from "@/lib/timeframes";
import { useI18n, type TranslationKey } from "@/lib/i18n";

interface ChartToolbarProps {
  timeframe: string;
  onTimeframeChange: (tf: Timeframe) => void;
  gridVisible: boolean;
  onGridToggle: () => void;
  activeTool: DrawingTool | null;
  onToolChange: (tool: DrawingTool | null) => void;
  hasSelection: boolean;
  onDeleteSelected: () => void;
}

const TOOL_KEY: Record<DrawingTool, TranslationKey> = { trendline: "toolTrend", ray: "toolRay", fib: "toolFib" };
const TOOL_ICON: Record<DrawingTool, IconDefinition> = { trendline: faSlash, ray: faArrowRightLong, fib: faWaveSquare };

export function ChartToolbar({
  timeframe,
  onTimeframeChange,
  gridVisible,
  onGridToggle,
  activeTool,
  onToolChange,
  hasSelection,
  onDeleteSelected,
}: ChartToolbarProps) {
  const { t } = useI18n();

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
        {(Object.keys(TOOL_KEY) as DrawingTool[]).map((tool) => (
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
          <button
            type="button"
            onClick={onDeleteSelected}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors duration-150"
            style={{ color: "var(--color-sell)" }}
          >
            <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
            {t("delete")}
          </button>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-text-muted">
          <input type="checkbox" checked={gridVisible} onChange={onGridToggle} className="accent-[var(--color-accent)]" />
          <FontAwesomeIcon icon={faTableCells} className="h-3 w-3" />
          {t("grid")}
        </label>
      </div>
    </div>
  );
}
