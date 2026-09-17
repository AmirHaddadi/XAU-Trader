"use client";

import { useEffect, useState } from "react";
import type { ClosedDeal, JournalComment } from "@xau-trader/protocol";
import { useI18n } from "@/lib/i18n";

interface JournalProps {
  deals: ClosedDeal[];
  comments: Record<number, JournalComment[]>;
  currency: string | undefined;
  onSearch: (query: string) => void;
  onSelectDeal: (dealTicket: number) => void;
  onAddComment: (dealTicket: number, body: string) => void;
  onEditComment: (dealTicket: number, id: number, body: string) => void;
  onDeleteComment: (dealTicket: number, id: number) => void;
}

function fmtDate(epochSeconds: number): string {
  if (!epochSeconds) return "—";
  return new Date(epochSeconds * 1000).toLocaleString();
}

export function Journal({ deals, comments, currency, onSearch, onSelectDeal, onAddComment, onEditComment, onDeleteComment }: JournalProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<number | undefined>(undefined);
  const [editDraft, setEditDraft] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => onSearch(query), 250);
    return () => clearTimeout(timer);
  }, [query, onSearch]);

  function selectDeal(ticket: number) {
    setSelected(ticket);
    setDraft("");
    setEditingId(undefined);
    onSelectDeal(ticket);
  }

  const selectedDeal = deals.find((d) => d.dealTicket === selected);
  const selectedComments = selected !== undefined ? (comments[selected] ?? []) : [];

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[1fr_360px] gap-4">
      <div className="flex min-h-0 flex-col gap-2 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-text-primary">{t("journalTitle")}</h2>
          <input
            type="text"
            placeholder={t("journalSearchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-64 rounded border border-border bg-card-alt px-2 py-1.5 text-sm text-text-primary"
          />
        </div>
        {deals.length === 0 ? (
          <p className="text-sm text-text-muted">{t("journalEmpty")}</p>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="text-left text-xs text-text-muted">
                  <th className="pb-1 font-normal">{t("colSymbol")}</th>
                  <th className="pb-1 font-normal">{t("colDirection")}</th>
                  <th className="pb-1 font-normal">{t("colVolume")}</th>
                  <th className="pb-1 font-normal text-right">{t("colProfit")}</th>
                  <th className="pb-1 font-normal text-right">{t("colClosedAt")}</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((d) => (
                  <tr
                    key={d.dealTicket}
                    onClick={() => selectDeal(d.dealTicket)}
                    className="cursor-pointer border-t border-border"
                    style={{ backgroundColor: selected === d.dealTicket ? "var(--color-card-alt)" : undefined }}
                  >
                    <td className="py-1.5 text-text-primary">{d.symbol}</td>
                    <td className="py-1.5" style={{ color: d.direction === "buy" ? "var(--color-buy)" : "var(--color-sell)" }}>
                      {t(d.direction === "buy" ? "buy" : "sell")}
                    </td>
                    <td className="py-1.5 tabular-nums">{d.volume.toFixed(2)}</td>
                    <td
                      className="py-1.5 text-right tabular-nums"
                      style={{ color: d.profit >= 0 ? "var(--color-buy)" : "var(--color-sell)" }}
                    >
                      {d.profit.toFixed(2)} {currency ?? ""}
                    </td>
                    <td className="py-1.5 text-right text-xs text-text-muted">{fmtDate(d.timeClose)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium text-text-primary">{t("comments")}</h2>
        {!selectedDeal ? (
          <p className="text-sm text-text-muted">{t("journalEmpty")}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span className="text-text-muted">{t("ticket")}</span>
              <span className="text-right text-text-primary tabular-nums">{selectedDeal.dealTicket}</span>
              <span className="text-text-muted">{t("colOpen")}</span>
              <span className="text-right text-text-primary tabular-nums">{selectedDeal.priceOpen}</span>
              <span className="text-text-muted">{t("colCloseCol")}</span>
              <span className="text-right text-text-primary tabular-nums">{selectedDeal.priceClose}</span>
            </div>

            <div className="min-h-0 flex-1 overflow-auto border-t border-border pt-2">
              {selectedComments.length === 0 ? (
                <p className="text-sm text-text-muted">{t("noComments")}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {selectedComments.map((c) => (
                    <li key={c.id} className="rounded bg-card-alt p-2 text-sm">
                      {editingId === c.id ? (
                        <div className="flex flex-col gap-1">
                          <textarea
                            className="rounded border border-border bg-card px-2 py-1 text-sm text-text-primary"
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                          />
                          <div className="flex justify-end gap-2">
                            <button type="button" className="text-xs text-text-muted" onClick={() => setEditingId(undefined)}>
                              {t("cancel")}
                            </button>
                            <button
                              type="button"
                              className="text-xs text-accent"
                              onClick={() => {
                                onEditComment(selectedDeal.dealTicket, c.id, editDraft);
                                setEditingId(undefined);
                              }}
                            >
                              {t("save")}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="whitespace-pre-wrap text-text-primary">{c.body}</p>
                          <div className="mt-1 flex items-center justify-between text-xs text-text-muted">
                            <span>{new Date(c.createdAt).toLocaleString()}</span>
                            <span className="flex gap-2">
                              <button
                                type="button"
                                className="hover:text-text-primary"
                                onClick={() => {
                                  setEditingId(c.id);
                                  setEditDraft(c.body);
                                }}
                              >
                                {t("edit")}
                              </button>
                              <button
                                type="button"
                                className="hover:text-text-primary"
                                onClick={() => onDeleteComment(selectedDeal.dealTicket, c.id)}
                              >
                                {t("delete")}
                              </button>
                            </span>
                          </div>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t border-border pt-2">
              <textarea
                className="rounded border border-border bg-card-alt px-2 py-1.5 text-sm text-text-primary"
                placeholder={t("addComment")}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button
                type="button"
                disabled={!draft.trim()}
                onClick={() => {
                  onAddComment(selectedDeal.dealTicket, draft.trim());
                  setDraft("");
                }}
                className="self-end rounded px-3 py-1.5 text-sm font-medium text-white transition-colors duration-150 disabled:opacity-40"
                style={{ backgroundColor: "var(--color-accent)" }}
              >
                {t("save")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
