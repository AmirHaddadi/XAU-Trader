import type { AccountSnapshot, SymbolMeta, Tick } from "@xau-trader/protocol";

interface AccountBarProps {
  account: AccountSnapshot | undefined;
  symbol: SymbolMeta | undefined;
  tick: Tick | undefined;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-text-muted">{label}</span>
      <span className="text-sm font-medium text-text-primary tabular-nums">{value}</span>
    </div>
  );
}

export function AccountBar({ account, symbol, tick }: AccountBarProps) {
  const digits = symbol?.digits ?? 2;
  const fmtPrice = (v: number) => v.toFixed(digits);
  const fmtMoney = (v: number) => `${v.toFixed(2)} ${account?.currency ?? ""}`.trim();
  const spread = tick && symbol ? ((tick.ask - tick.bid) / symbol.point).toFixed(0) : "—";

  return (
    <div className="flex flex-wrap items-center gap-6 rounded-lg border border-border bg-card px-4 py-3">
      <Stat label="Bid" value={tick ? fmtPrice(tick.bid) : "—"} />
      <Stat label="Ask" value={tick ? fmtPrice(tick.ask) : "—"} />
      <Stat label="Spread" value={spread === "—" ? spread : `${spread} pts`} />
      <div className="ml-auto flex flex-wrap items-center gap-6">
        <Stat label="Balance" value={account ? fmtMoney(account.balance) : "—"} />
        <Stat label="Equity" value={account ? fmtMoney(account.equity) : "—"} />
        <Stat label="Free Margin" value={account ? fmtMoney(account.freeMargin) : "—"} />
      </div>
    </div>
  );
}
