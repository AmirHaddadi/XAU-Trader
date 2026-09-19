import { useEffect, useRef, useState } from "react";
import type { AccountSnapshot, AppTheme, SymbolMeta, Tick } from "@xau-trader/protocol";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faBars,
  faBookOpen,
  faCoins,
  faCompress,
  faExpand,
  faGaugeHigh,
  faGear,
  faMoon,
  faPlug,
  faSatelliteDish,
  faSun,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { SYMBOL_WATCHLIST } from "@/lib/symbols";
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
  theme: AppTheme;
  onThemeToggle: () => void;
  onSymbolSelect: (symbol: string) => void;
  isFullscreen: boolean;
  onFullscreenToggle: () => void;
}

// Single-line stat chip (label + value inline, no stacked second row) —
// the whole point of collapsing the header to one row is to give the extra
// vertical space back to the chart, so no chip here should cost more than
// one line of height.
function StatChip({ label, value, tone }: { label: string; value: string; tone?: "buy" | "sell" }) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap text-xs">
      <span className="text-text-muted">{label}</span>
      <span
        className="font-semibold tabular-nums"
        style={{ color: tone === "buy" ? "var(--color-buy)" : tone === "sell" ? "var(--color-sell)" : "var(--color-text-primary)" }}
      >
        {value}
      </span>
    </span>
  );
}

// Nav (Dashboard/Journal/Settings) collapses into this hamburger dropdown
// instead of a permanent tab row, freeing the horizontal space that used to
// cost the header its own dedicated row — the account/market stats now fold
// into that same single row instead (see below). Owns its own open/close
// state entirely internally; the rest of the app only ever sees tab/
// onTabChange, same contract as before.
function NavMenu({ tab, onTabChange }: { tab: Tab; onTabChange: (tab: Tab) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const activeTab = TABS.find((x) => x.id === tab) ?? TABS[0];

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t("navMenuHint")}
        className="flex h-8 items-center gap-2 rounded px-2 text-sm font-medium text-text-primary transition-colors duration-150 hover:bg-card-alt"
      >
        <FontAwesomeIcon icon={faBars} className="h-3.5 w-3.5" />
        <FontAwesomeIcon icon={activeTab.icon} className="h-3 w-3 text-text-muted" />
        <span className="hidden sm:inline">{t(activeTab.key)}</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-20 mt-1 w-44 animate-fade-in-up overflow-hidden rounded-lg border border-border bg-card shadow-lg"
        >
          {TABS.map(({ id, key, icon }) => (
            <button
              key={id}
              type="button"
              role="menuitemradio"
              aria-checked={tab === id}
              onClick={() => {
                onTabChange(id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-150 ${
                tab === id ? "bg-card-alt" : "hover:bg-card-alt/60"
              }`}
              style={{ color: tab === id ? "var(--color-text-primary)" : "var(--color-text-muted)" }}
            >
              <FontAwesomeIcon icon={icon} className="h-3.5 w-3.5" />
              {t(key)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Consolidated into a single dense row (was: a title/nav row plus a whole
// second row of stat chips) — nav folds into NavMenu's hamburger dropdown
// above, and every stat (balance/equity/margin/bid/ask/spread/symbol) now
// sits inline in this one row instead, so the header's total height drops
// and that space goes straight to the chart (Amir: "فضای پایینی اضافی حذف
// بشه تا به چارت اختصاص داده بشه").
export function TopBar({
  tab,
  onTabChange,
  symbol,
  wsConnected,
  eaConnected,
  lastError,
  account,
  tick,
  theme,
  onThemeToggle,
  onSymbolSelect,
  isFullscreen,
  onFullscreenToggle,
}: TopBarProps) {
  const { t } = useI18n();
  const digits = symbol?.digits ?? 2;
  const fmtPrice = (v: number) => v.toFixed(digits);
  const fmtMoney = (v: number) => `${v.toFixed(2)}${account ? ` ${account.currency}` : ""}`;
  const spread = tick && symbol ? Math.round((tick.ask - tick.bid) / symbol.point) : undefined;

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-border bg-card px-3 py-2">
      <NavMenu tab={tab} onTabChange={onTabChange} />

      <h1 className="flex items-center gap-1.5 text-sm font-semibold text-accent">
        {/* Plain <img>, not next/image — this is a small fixed local
            asset with no responsive/srcset need, and avoids depending on
            the server-side image optimizer (sharp) inside the packaged,
            portable-Node build (see build/package-windows). */}
        <img src="/logo.png" alt="" width={18} height={18} className="h-[18px] w-[18px] object-contain" />
        <span className="hidden md:inline">{t("appTitle")}</span>
      </h1>

      {tab === "dashboard" && (
        <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1">
          <div className="flex flex-wrap items-center gap-x-3">
            <StatChip label={t("balance")} value={account ? fmtMoney(account.balance) : "—"} />
            <StatChip label={t("equity")} value={account ? fmtMoney(account.equity) : "—"} />
            <StatChip label={t("freeMargin")} value={account ? fmtMoney(account.freeMargin) : "—"} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3">
            <StatChip label={t("bid")} value={tick ? fmtPrice(tick.bid) : "—"} tone="sell" />
            <StatChip label={t("ask")} value={tick ? fmtPrice(tick.ask) : "—"} tone="buy" />
            <StatChip label={t("spread")} value={spread !== undefined ? `${spread} pts` : "—"} />
          </div>
          <div className="flex items-center gap-1" role="group" aria-label={t("symbolSwitchHint")} title={t("symbolSwitchHint")}>
            <FontAwesomeIcon icon={faCoins} className="h-3 w-3 text-text-muted" aria-hidden />
            {SYMBOL_WATCHLIST.map((s) => {
              const active = symbol?.symbol === s || (!symbol && s === SYMBOL_WATCHLIST[0]);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSymbolSelect(s)}
                  aria-pressed={active}
                  className="rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide transition-colors duration-150"
                  style={
                    active
                      ? {
                          borderColor: "color-mix(in srgb, var(--color-accent) 45%, var(--color-border))",
                          backgroundColor: "color-mix(in srgb, var(--color-accent) 14%, var(--color-card-alt))",
                          color: "var(--color-accent)",
                        }
                      : { borderColor: "transparent", color: "var(--color-text-muted)" }
                  }
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="ms-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onFullscreenToggle}
          title={t(isFullscreen ? "fullscreenExit" : "fullscreenEnter")}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-text-muted transition-colors duration-150 hover:bg-card-alt hover:text-text-primary"
        >
          <FontAwesomeIcon icon={isFullscreen ? faCompress : faExpand} className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onThemeToggle}
          title={t(theme === "dark" ? "themeSwitchToLight" : "themeSwitchToDark")}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-text-muted transition-colors duration-150 hover:bg-card-alt hover:text-text-primary"
        >
          <FontAwesomeIcon icon={theme === "dark" ? faSun : faMoon} className="h-3.5 w-3.5" />
        </button>
        {lastError && (
          <span
            className="flex max-w-48 items-center gap-1.5 truncate text-xs"
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
    </header>
  );
}
