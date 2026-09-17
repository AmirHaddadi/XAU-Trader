"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlacementType, RiskMode, RiskResult, SymbolMeta, Tick, TradeDirection, TradePlan } from "@xau-trader/protocol";
import type { OrderAck } from "./useBridgeSocket";
import { XAUT_DEFAULT_REWARD_RATIO, XAUT_DEFAULT_STOP_PERCENT } from "./tradeDefaults";

const PREVIEW_DEBOUNCE_MS = 120;

function defaultPlan(): TradePlan {
  return {
    riskMode: "percent_balance",
    riskValue: 1.0,
    placement: "market",
    direction: "buy",
    entryPrice: 0,
    slPrice: 0,
    tpPrice: 0,
    rrRatio: XAUT_DEFAULT_REWARD_RATIO,
    slUserSet: false,
    tpUserSet: false,
  };
}

interface SettingsDefaults {
  riskMode: RiskMode;
  riskValue: number;
  placement: PlacementType;
  rrRatio: number;
}

interface UseTradePlanArgs {
  tick: Tick | undefined;
  symbol: SymbolMeta | undefined;
  previewRisk: (plan: TradePlan) => Promise<RiskResult>;
  sendOrder: (plan: TradePlan) => Promise<OrderAck>;
  settingsDefaults?: SettingsDefaults;
}

// The web equivalent of XAU_Trader.mq5's UpdateData()/SendFromPanel(): seeds
// a sensible SL/TP default that live-tracks the market until the user drags
// their own (slUserSet/tpUserSet), infers direction from the SL/Entry
// relationship, and debounces a risk.preview round-trip on every change.
// CRiskEngine::Evaluate on the EA side is always the real validation — this
// is UX responsiveness only, never authoritative.
export function useTradePlan({ tick, symbol, previewRisk, sendOrder, settingsDefaults }: UseTradePlanArgs) {
  const [plan, setPlan] = useState<TradePlan>(defaultPlan());
  const [reviewing, setReviewing] = useState(false);
  const [riskResult, setRiskResult] = useState<RiskResult | undefined>(undefined);
  const [riskError, setRiskError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const previewGenRef = useRef(0);
  const appliedSettingsDefaults = useRef(false);

  // Applied once, the first time the Settings tab's saved defaults arrive
  // from the bridge — never again after, so it can't clobber an in-progress
  // edit just because settings.data happened to re-broadcast (e.g. a second
  // tab changed an unrelated field).
  useEffect(() => {
    if (!settingsDefaults || appliedSettingsDefaults.current || reviewing) return;
    appliedSettingsDefaults.current = true;
    setPlan((prev) => ({ ...prev, ...settingsDefaults }));
  }, [settingsDefaults, reviewing]);

  // Live-seed SL/TP defaults (until dragged) and re-infer direction, mirrors
  // UpdateData() running every tick while a plan is being configured.
  useEffect(() => {
    if (!reviewing || !tick || !symbol?.valid) return;
    setPlan((prev) => {
      const isBuy = prev.direction === "buy";
      const marketRef = isBuy ? tick.ask : tick.bid;
      let entryPrice = prev.entryPrice;
      const refEntry = prev.placement === "market" ? marketRef : prev.entryPrice > 0 ? prev.entryPrice : marketRef;

      if (prev.placement !== "market" && prev.entryPrice <= 0 && refEntry > 0) {
        entryPrice = refEntry;
      }

      let slPrice = prev.slPrice;
      let tpPrice = prev.tpPrice;

      if (refEntry > 0) {
        if (!prev.slUserSet) {
          const defDist = refEntry * (XAUT_DEFAULT_STOP_PERCENT / 100);
          const minDist = symbol.stopsLevelPoints > 0 ? symbol.stopsLevelPoints * symbol.point * 1.5 : 0;
          const dist = Math.max(defDist, minDist);
          slPrice = refEntry - dist; // buy-bias default, mirrors the BUY default direction
        }
        if (!prev.tpUserSet && slPrice > 0) {
          const dist = Math.abs(refEntry - slPrice);
          const buyBias = slPrice < refEntry;
          tpPrice = buyBias ? refEntry + prev.rrRatio * dist : refEntry - prev.rrRatio * dist;
        }
      }

      let direction: TradeDirection = prev.direction;
      if (slPrice > 0 && refEntry > 0) direction = slPrice < refEntry ? "buy" : "sell";

      if (entryPrice === prev.entryPrice && slPrice === prev.slPrice && tpPrice === prev.tpPrice && direction === prev.direction) {
        return prev;
      }
      return { ...prev, entryPrice, slPrice, tpPrice, direction };
    });
  }, [reviewing, tick, symbol]);

  // Debounced risk.preview round-trip — the EA is the real authority; this
  // just keeps the on-screen lots/risk/reward readout live while editing.
  useEffect(() => {
    if (!reviewing) {
      setRiskResult(undefined);
      setRiskError(undefined);
      return;
    }
    const generation = ++previewGenRef.current;
    const timer = setTimeout(() => {
      previewRisk(plan)
        .then((res) => {
          if (previewGenRef.current === generation) {
            setRiskResult(res);
            setRiskError(undefined);
          }
        })
        .catch((err: Error) => {
          if (previewGenRef.current === generation) setRiskError(err.message);
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewing, plan, previewRisk]);

  const startReview = useCallback((direction: TradeDirection) => {
    setPlan((prev) => ({ ...prev, direction, entryPrice: 0, slPrice: 0, tpPrice: 0, slUserSet: false, tpUserSet: false }));
    setReviewing(true);
  }, []);

  const cancelReview = useCallback(() => {
    setPlan((prev) => ({ ...prev, entryPrice: 0, slPrice: 0, tpPrice: 0, slUserSet: false, tpUserSet: false }));
    setReviewing(false);
    setRiskResult(undefined);
    setRiskError(undefined);
  }, []);

  const setEntryPrice = useCallback((price: number) => setPlan((prev) => ({ ...prev, entryPrice: price })), []);
  const setSlPrice = useCallback((price: number) => setPlan((prev) => ({ ...prev, slPrice: price, slUserSet: true })), []);
  const setTpPrice = useCallback((price: number) => setPlan((prev) => ({ ...prev, tpPrice: price, tpUserSet: true })), []);
  const setRiskMode = useCallback((riskMode: RiskMode) => setPlan((prev) => ({ ...prev, riskMode })), []);
  const setRiskValue = useCallback((riskValue: number) => setPlan((prev) => ({ ...prev, riskValue })), []);
  const setPlacement = useCallback((placement: PlacementType) => setPlan((prev) => ({ ...prev, placement })), []);
  const setRrRatio = useCallback((rrRatio: number) => setPlan((prev) => ({ ...prev, rrRatio })), []);

  const confirmOrder = useCallback(async (): Promise<OrderAck> => {
    setBusy(true);
    try {
      const ack = await sendOrder(plan);
      if (ack.ok) cancelReview();
      return ack;
    } finally {
      setBusy(false);
    }
  }, [plan, sendOrder, cancelReview]);

  return {
    plan,
    reviewing,
    riskResult,
    riskError,
    busy,
    startReview,
    cancelReview,
    setEntryPrice,
    setSlPrice,
    setTpPrice,
    setRiskMode,
    setRiskValue,
    setPlacement,
    setRrRatio,
    confirmOrder,
  };
}
