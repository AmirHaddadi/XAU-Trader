import { useState, type ReactNode } from "react";
import type { OrderAck } from "@/lib/useBridgeSocket";
import type { PendingOrderInfo, PendingOrderType, PositionInfo, SymbolMeta } from "@xau-trader/protocol";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faBan,
  faHourglassHalf,
  faInbox,
  faListCheck,
  faPercent,
  faShieldHalved,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { useAsyncAction } from "@/lib/useAsyncAction";
import { Spinner } from "./Spinner";
import { ConfirmDialog } from "./ConfirmDialog";

type SubTab = "open" | "pending";

interface PositionsBarProps {
  positions: PositionInfo[];
  pendingOrders: PendingOrderInfo[];
  symbol: SymbolMeta | undefined;
  onClose: (ticket: number) => Promise<OrderAck>;
  onClosePartial: (ticket: number, volume: number) => Promise<OrderAck>;
  onRiskFree: (position: PositionInfo) => void;
  onCancelPending: (ticket: number) => Promise<OrderAck>;
}

// Open Positions and Pending Orders are two genuinely different concepts
// (a position is already filled and has floating P&L; a pending order is
// just a standing instruction with no P&L yet) — split into their own tabs
// rather than one merged table, each with its own always-rendered column
// header (so the shape of the data is visible even with zero rows) and a
// centered icon+message empty state instead of the header collapsing away.
// Drag-to-modify SL/TP for open positions happens on the chart (see the
// position lines fed into LiveChart in page.tsx) — this table is the
// read-only summary plus the actions a price-line drag can't express.
export function PositionsBar({ positions, pendingOrders, symbol, onClose, onClosePartial, onRiskFree, onCancelPending }: PositionsBarProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<SubTab>("open");
  const digits = symbol?.digits ?? 2;

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-1" role="tablist">
        <SubTabButton active={tab === "open"} onClick={() => setTab("open")} icon={faListCheck} labelKey="openPositions" count={positions.length} />
        <SubTabButton active={tab === "pending"} onClick={() => setTab("pending")} icon={faHourglassHalf} labelKey="pendingOrders" count={pendingOrders.length} />
      </div>

      {tab === "open" ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-text-muted">
              <th className="pb-1 font-normal">{t("ticket")}</th>
              <th className="pb-1 font-normal">{t("type")}</th>
              <th className="pb-1 font-normal">{t("volume")}</th>
              <th className="pb-1 font-normal">{t("entry")}</th>
              <th className="pb-1 font-normal">{t("sl")}</th>
              <th className="pb-1 font-normal">{t("tp")}</th>
              <th className="pb-1 font-normal text-right">{t("profit")}</th>
              <th className="pb-1 font-normal text-right"></th>
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 ? (
              <EmptyRow colSpan={8} icon={faInbox} messageKey="noPositions" />
            ) : (
              positions.map((p) => (
                <PositionRow key={p.ticket} position={p} digits={digits} onClose={onClose} onClosePartial={onClosePartial} onRiskFree={onRiskFree} />
              ))
            )}
          </tbody>
        </table>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-text-muted">
              <th className="pb-1 font-normal">{t("ticket")}</th>
              <th className="pb-1 font-normal">{t("type")}</th>
              <th className="pb-1 font-normal">{t("volume")}</th>
              <th className="pb-1 font-normal">{t("price")}</th>
              <th className="pb-1 font-normal">{t("sl")}</th>
              <th className="pb-1 font-normal">{t("tp")}</th>
              <th className="pb-1 font-normal text-right"></th>
            </tr>
          </thead>
          <tbody>
            {pendingOrders.length === 0 ? (
              <EmptyRow colSpan={7} icon={faHourglassHalf} messageKey="noPendingOrders" />
            ) : (
              pendingOrders.map((o) => <PendingOrderRow key={o.ticket} order={o} digits={digits} onCancel={onCancelPending} />)
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SubTabButton({
  active,
  onClick,
  icon,
  labelKey,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: IconDefinition;
  labelKey: TranslationKey;
  count: number;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm font-medium transition-colors duration-150 ${
        active ? "bg-card-alt" : "bg-transparent hover:bg-card-alt/60"
      }`}
      style={{ color: active ? "var(--color-text-primary)" : "var(--color-text-muted)" }}
    >
      <FontAwesomeIcon icon={icon} className="h-3.5 w-3.5" />
      {t(labelKey)}
      <span className="rounded-full bg-card px-1.5 text-xs tabular-nums text-text-muted">{count}</span>
    </button>
  );
}

// Centered icon + message spanning every column — keeps the header (and
// therefore the shape of the data) always visible instead of the table
// disappearing entirely when there's nothing to show (Amir: "ستون‌ها باید
// رندر همیشگی باشه حتی اگر پوزیشنی وجود نداره").
function EmptyRow({ colSpan, icon, messageKey }: { colSpan: number; icon: IconDefinition; messageKey: TranslationKey }) {
  const { t } = useI18n();
  return (
    <tr>
      <td colSpan={colSpan} className="py-10">
        <div className="flex flex-col items-center justify-center gap-2 text-text-muted">
          <FontAwesomeIcon icon={icon} className="h-6 w-6 opacity-50" />
          <p className="text-sm">{t(messageKey)}</p>
        </div>
      </td>
    </tr>
  );
}

interface PositionRowProps {
  position: PositionInfo;
  digits: number;
  onClose: (ticket: number) => Promise<OrderAck>;
  onClosePartial: (ticket: number, volume: number) => Promise<OrderAck>;
  onRiskFree: (position: PositionInfo) => void;
}

// Split out from the table body so each row owns its own close-in-flight
// state via useAsyncAction — hooks can't be called inside a .map()
// callback directly, and per-row pending (rather than one flag for the
// whole table) means closing one position doesn't disable every other
// row's button too.
function PositionRow({ position: p, digits, onClose, onClosePartial, onRiskFree }: PositionRowProps) {
  const { t } = useI18n();
  const [confirmingHalfClose, setConfirmingHalfClose] = useState(false);

  const { run, pending } = useAsyncAction({
    action: onClose,
    successMessage: t("positionClosed"),
    resultError: (ack) => (ack.ok ? undefined : ack.message || t("positionCloseFailed")),
    errorFallbackMessage: t("positionCloseFailed"),
  });

  const halfVolume = p.volume / 2;
  const { run: runHalfClose, pending: halfClosePending } = useAsyncAction({
    action: () => onClosePartial(p.ticket, halfVolume),
    successMessage: t("positionHalfClosed"),
    resultError: (ack) => (ack.ok ? undefined : ack.message || t("positionCloseFailed")),
    errorFallbackMessage: t("positionCloseFailed"),
  });

  return (
    <tr className="border-t border-border transition-colors duration-150 hover:bg-card-alt/60">
      <td className="py-1.5 text-text-muted">{p.ticket}</td>
      <td className="py-1.5" style={{ color: p.type === "buy" ? "var(--color-buy)" : "var(--color-sell)" }}>
        {p.type.toUpperCase()}
      </td>
      <td className="py-1.5 tabular-nums">{p.volume.toFixed(2)}</td>
      <td className="py-1.5 tabular-nums">{p.priceOpen.toFixed(digits)}</td>
      <td className="py-1.5 tabular-nums">{p.sl > 0 ? p.sl.toFixed(digits) : "—"}</td>
      <td className="py-1.5 tabular-nums">{p.tp > 0 ? p.tp.toFixed(digits) : "—"}</td>
      <td className="py-1.5 text-right tabular-nums" style={{ color: p.profit >= 0 ? "var(--color-buy)" : "var(--color-sell)" }}>
        {p.profit.toFixed(2)}
      </td>
      <td className="py-1.5 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => onRiskFree(p)}
            title={t("riskFree")}
            className="inline-flex items-center gap-1.5 rounded border border-border px-2 py-0.5 text-xs text-text-muted transition-colors duration-150 hover:border-accent hover:text-accent"
          >
            <FontAwesomeIcon icon={faShieldHalved} className="h-3 w-3" />
            {t("riskFree")}
          </button>
          <button
            type="button"
            disabled={halfClosePending}
            onClick={() => setConfirmingHalfClose(true)}
            title={t("close50")}
            className="inline-flex items-center gap-1.5 rounded border border-border px-2 py-0.5 text-xs text-text-muted transition-colors duration-150 hover:enabled:border-warning hover:enabled:text-warning disabled:opacity-50"
          >
            {halfClosePending ? <Spinner size={11} /> : <FontAwesomeIcon icon={faPercent} className="h-3 w-3" />}
            50%
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => void run(p.ticket)}
            className="inline-flex items-center gap-1.5 rounded border border-border px-2 py-0.5 text-xs text-text-muted transition-colors duration-150 hover:enabled:border-sell hover:enabled:text-sell disabled:opacity-50"
          >
            {pending ? <Spinner size={11} /> : <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />}
            {t("close")}
          </button>
        </div>
        <ConfirmDialog
          open={confirmingHalfClose}
          title={t("close50")}
          message={t("confirm50Body").replace("{ticket}", String(p.ticket)).replace("{volume}", halfVolume.toFixed(2))}
          busy={halfClosePending}
          onConfirm={() => {
            void runHalfClose().then(() => setConfirmingHalfClose(false));
          }}
          onCancel={() => setConfirmingHalfClose(false)}
        />
      </td>
    </tr>
  );
}

const PENDING_TYPE_LABEL: Record<PendingOrderType, ReactNode> = {
  buy_limit: "BUY LIMIT",
  sell_limit: "SELL LIMIT",
  buy_stop: "BUY STOP",
  sell_stop: "SELL STOP",
};

interface PendingOrderRowProps {
  order: PendingOrderInfo;
  digits: number;
  onCancel: (ticket: number) => Promise<OrderAck>;
}

function PendingOrderRow({ order: o, digits, onCancel }: PendingOrderRowProps) {
  const { t } = useI18n();
  const isBuy = o.type === "buy_limit" || o.type === "buy_stop";

  const { run, pending } = useAsyncAction({
    action: onCancel,
    successMessage: t("orderCancelled"),
    resultError: (ack) => (ack.ok ? undefined : ack.message || t("orderCancelFailed")),
    errorFallbackMessage: t("orderCancelFailed"),
  });

  return (
    <tr className="border-t border-border transition-colors duration-150 hover:bg-card-alt/60">
      <td className="py-1.5 text-text-muted">{o.ticket}</td>
      <td className="py-1.5" style={{ color: isBuy ? "var(--color-buy)" : "var(--color-sell)" }}>
        {PENDING_TYPE_LABEL[o.type]}
      </td>
      <td className="py-1.5 tabular-nums">{o.volume.toFixed(2)}</td>
      <td className="py-1.5 tabular-nums">{o.priceOpen.toFixed(digits)}</td>
      <td className="py-1.5 tabular-nums">{o.sl > 0 ? o.sl.toFixed(digits) : "—"}</td>
      <td className="py-1.5 tabular-nums">{o.tp > 0 ? o.tp.toFixed(digits) : "—"}</td>
      <td className="py-1.5 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            disabled={pending}
            onClick={() => void run(o.ticket)}
            title={t("cancelOrder")}
            className="inline-flex items-center gap-1.5 rounded border border-border px-2 py-0.5 text-xs text-text-muted transition-colors duration-150 hover:enabled:border-sell hover:enabled:text-sell disabled:opacity-50"
          >
            {pending ? <Spinner size={11} /> : <FontAwesomeIcon icon={faBan} className="h-3 w-3" />}
            {t("cancelOrder")}
          </button>
        </div>
      </td>
    </tr>
  );
}
