import type { AccountSnapshot, SymbolMeta, Tick } from "@xau-trader/protocol";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faBookOpen, faChartLine, faGaugeHigh, faGear, faPlug, faSatelliteDish, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { ConnectionBadge } from "./ConnectionBadge";

type Tab = "dashboard" | "journal" | "settings";
const TABS: { id: Tab; key: TranslationKey; icon: IconDefinition }[] = [
  { id: "dashboard", key: "navDashboard", icon: faGaugeHigh },
  { id: "journal", key: "navJournal", icon: faBookOpen },
  { id: "settings", key: "navSettings", icon: faGear },
];

interface TopBarProps {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  symbol: SymbolMeta | undefined;
  wsConnected: boolean;
  eaConnected: boolean;
  lastError: string | undefined;
  account: AccountSnapshot | undefined;
  tick: Tick | undefined;
}

function StatChip({ label, value, tone }: { label: string; value: string; tone?: "buy" | "sell" }) {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">{label}</span>
      <span
        className="text-sm font-semibold tabular-nums"
        style={{ color: tone === "buy" ? "var(--color-buy)" : tone === "sell" ? "var(--color-sell)" : "var(--color-text-primary)" }}
      >
        {value}
      </span>
    </div>
  );
}

// Consolidates what used to be a bare <header> + a separate full-width
// AccountBar into one organized, badged status block — connection state,
// account stats and market stats are visually grouped as distinct
// categories rather than one flat row (Fix-Bugs.md item 6).
export function TopBar({ tab, onTabChange, symbol, wsConnected, eaConnected, lastError, account, tick }: TopBarProps) {
  const { t } = useI18n();
  const digits = symbol?.digits ?? 2;
  const fmtPrice = (v: number) => v.toFixed(digits);
  const fmtMoney = (v: number) => `${v.toFixed(2)}${account ? ` ${account.currency}` : ""}`;
  const spread = tick && symbol ? Math.round((tick.ask - tick.bid) / symbol.point) : undefined;

  return (
    <header className="flex flex-col gap-3 rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-4 px-4 pt-3">
        <div className="flex items-baseline gap-2">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-accent">
            <FontAwesomeIcon icon={faChartLine} className="h-4 w-4" />
            {t("appTitle")}
          </h1>
          <span className="rounded bg-card-alt px-1.5 py-0.5 text-xs font-medium text-text-muted">{symbol?.symbol ?? "—"}</span>
        </div>

        <nav className="flex gap-1" role="tablist">
          {TABS.map(({ id, key, icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => onTabChange(id)}
              className="flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors duration-150"
              style={{
                color: tab === id ? "var(--color-text-primary)" : "var(--color-text-muted)",
                backgroundColor: tab === id ? "var(--color-card-alt)" : "transparent",
              }}
            >
              <FontAwesomeIcon icon={icon} className="h-3.5 w-3.5" />
              {t(key)}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {lastError && (
            <span
              className="flex max-w-64 items-center gap-1.5 truncate text-xs"
              style={{ color: "var(--color-sell)" }}
              title={lastError}
            >
              <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3 shrink-0" />
              {lastError}
            </span>
          )}
          <ConnectionBadge label={t("connBridge")} connected={wsConnected} icon={faPlug} />
          <ConnectionBadge label={wsConnected ? t("connEA") : t("connecting")} connected={wsConnected && eaConnected} icon={faSatelliteDish} />
        </div>
      </div>

      {tab === "dashboard" && (
        <div className="flex flex-wrap items-center divide-x divide-border border-t border-border">
          <div className="flex divide-x divide-border">
            <StatChip label={t("balance")} value={account ? fmtMoney(account.balance) : "—"} />
            <StatChip label={t("equity")} value={account ? fmtMoney(account.equity) : "—"} />
            <StatChip label={t("freeMargin")} value={account ? fmtMoney(account.freeMargin) : "—"} />
          </div>
          <div className="flex divide-x divide-border">
            <StatChip label={t("bid")} value={tick ? fmtPrice(tick.bid) : "—"} tone="sell" />
            <StatChip label={t("ask")} value={tick ? fmtPrice(tick.ask) : "—"} tone="buy" />
            <StatChip label={t("spread")} value={spread !== undefined ? `${spread} pts` : "—"} />
          </div>
        </div>
      )}
    </header>
  );
}
