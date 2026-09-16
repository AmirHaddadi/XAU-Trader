//+------------------------------------------------------------------+
//|                                                   RiskEngine.mqh  |
//|   XAU-Trader — turns a trade plan (risk mode/value + entry/SL/TP) |
//|   into a broker-valid lot size, or a precise validation error.    |
//+------------------------------------------------------------------+
#property strict
#include "../Core/Types.mqh"
#include "../Core/Utils.mqh"
#include "SymbolInfoCache.mqh"

class CRiskEngine
  {
public:
   //--- Pure function: no side effects, safe to call every OnTick/OnChartEvent
   //--- for a live preview while the user edits panel fields.
   static SRiskResult Evaluate(const STradePlan &plan, const SSymbolSnapshot &sym)
     {
      SRiskResult r;
      r.Reset();

      if(!sym.valid)
        {
         r.code = VALID_ERR_NO_SYMBOL;
         return r;
        }

      if(sym.tradeMode == SYMBOL_TRADE_MODE_DISABLED)
        {
         r.code = VALID_ERR_TRADE_DISABLED;
         return r;
        }
      if(sym.tradeMode == SYMBOL_TRADE_MODE_CLOSEONLY)
        {
         r.code = VALID_ERR_MARKET_CLOSED;
         return r;
        }
      if(sym.tradeMode == SYMBOL_TRADE_MODE_LONGONLY && plan.direction == TRADE_DIR_SELL)
        {
         r.code = VALID_ERR_TRADE_DISABLED;
         return r;
        }
      if(sym.tradeMode == SYMBOL_TRADE_MODE_SHORTONLY && plan.direction == TRADE_DIR_BUY)
        {
         r.code = VALID_ERR_TRADE_DISABLED;
         return r;
        }

      const bool isBuy = (plan.direction == TRADE_DIR_BUY);
      const double marketRef = isBuy ? sym.ask : sym.bid; // price a market order would fill at

      double entry = (plan.placement == PLACEMENT_MARKET) ? marketRef : plan.entryPrice;
      if(entry <= 0.0)
        {
         r.code = VALID_ERR_ENTRY_WRONG_SIDE;
         return r;
        }

      //--- Pending order price must sit on the correct side of the current market
      if(plan.placement == PLACEMENT_LIMIT)
        {
         if(isBuy && entry >= sym.ask)  { r.code = VALID_ERR_ENTRY_WRONG_SIDE; return r; }
         if(!isBuy && entry <= sym.bid) { r.code = VALID_ERR_ENTRY_WRONG_SIDE; return r; }
        }
      else if(plan.placement == PLACEMENT_STOP)
        {
         if(isBuy && entry <= sym.ask)  { r.code = VALID_ERR_ENTRY_WRONG_SIDE; return r; }
         if(!isBuy && entry >= sym.bid) { r.code = VALID_ERR_ENTRY_WRONG_SIDE; return r; }
        }

      //--- Stops-level: minimum broker-mandated distance between the pending
      //--- entry and the current market price.
      if(plan.placement != PLACEMENT_MARKET && sym.stopsLevelPoints > 0)
        {
         double distPts = MathAbs(entry - marketRef) / sym.point;
         if(distPts < sym.stopsLevelPoints)
           {
            r.code = VALID_ERR_STOPS_LEVEL;
            return r;
           }
        }

      if(plan.slPrice <= 0.0)
        {
         r.code = VALID_ERR_SL_MISSING;
         return r;
        }

      if(isBuy && plan.slPrice >= entry)  { r.code = VALID_ERR_SL_WRONG_SIDE; return r; }
      if(!isBuy && plan.slPrice <= entry) { r.code = VALID_ERR_SL_WRONG_SIDE; return r; }

      const bool hasTp = (plan.tpPrice > 0.0);
      if(hasTp)
        {
         if(isBuy && plan.tpPrice <= entry)  { r.code = VALID_ERR_TP_WRONG_SIDE; return r; }
         if(!isBuy && plan.tpPrice >= entry) { r.code = VALID_ERR_TP_WRONG_SIDE; return r; }
        }

      if(sym.stopsLevelPoints > 0)
        {
         double slDistPts = MathAbs(entry - plan.slPrice) / sym.point;
         if(slDistPts < sym.stopsLevelPoints) { r.code = VALID_ERR_STOPS_LEVEL; return r; }
         if(hasTp)
           {
            double tpDistPts = MathAbs(entry - plan.tpPrice) / sym.point;
            if(tpDistPts < sym.stopsLevelPoints) { r.code = VALID_ERR_STOPS_LEVEL; return r; }
           }
        }

      //--- Risk budget in account currency
      double riskMoney = 0.0;
      const double balance = AccountInfoDouble(ACCOUNT_BALANCE);
      const double equity  = AccountInfoDouble(ACCOUNT_EQUITY);
      switch(plan.riskMode)
        {
         case RISK_MODE_PERCENT_BALANCE:
            if(!CXautUtils::IsFinitePositive(plan.riskValue) || plan.riskValue > 100.0) { r.code = VALID_ERR_RISK_VALUE; return r; }
            riskMoney = balance * (plan.riskValue / 100.0);
            break;
         case RISK_MODE_PERCENT_EQUITY:
            if(!CXautUtils::IsFinitePositive(plan.riskValue) || plan.riskValue > 100.0) { r.code = VALID_ERR_RISK_VALUE; return r; }
            riskMoney = equity * (plan.riskValue / 100.0);
            break;
         default: // RISK_MODE_FIXED_MONEY
            if(!CXautUtils::IsFinitePositive(plan.riskValue)) { r.code = VALID_ERR_RISK_VALUE; return r; }
            riskMoney = plan.riskValue;
            break;
        }
      if(riskMoney <= 0.0) { r.code = VALID_ERR_RISK_VALUE; return r; }

      //--- Money per 1.0 price unit, per 1.0 lot (loss side, for the SL leg)
      const double slDistPrice = MathAbs(entry - plan.slPrice);
      if(sym.tickSize <= 0.0 || sym.tickValueLoss <= 0.0 || slDistPrice <= 0.0)
        {
         r.code = VALID_ERR_RISK_VALUE;
         r.message = "";
         return r;
        }
      const double moneyPerUnitLoss = sym.tickValueLoss / sym.tickSize;
      const double rawLots = riskMoney / (moneyPerUnitLoss * slDistPrice);

      r.rawLots   = rawLots;
      r.riskMoney = riskMoney;

      if(rawLots < sym.volumeMin - 1e-9)
        {
         r.code = VALID_ERR_VOLUME_TOO_SMALL;
         return r;
        }

      double lots = CXautUtils::FloorVolumeToStep(rawLots, sym.volumeStep, sym.volumeMin);
      if(lots < sym.volumeMin)
         lots = sym.volumeMin;

      bool cappedToMax = false;
      if(lots > sym.volumeMax + 1e-9)
        {
         lots = CXautUtils::NormalizeVolume(sym.volumeMax, sym.volumeStep);
         cappedToMax = true;
        }

      r.lots = lots;
      // Re-derive the *actual* risk implied by the broker-rounded lot size —
      // this is what the user will really lose, not the theoretical target.
      r.riskMoney = moneyPerUnitLoss * slDistPrice * lots;

      if(hasTp)
        {
         const double moneyPerUnitProfit = (sym.tickValueProfit > 0.0 ? sym.tickValueProfit : sym.tickValueLoss) / sym.tickSize;
         const double tpDistPrice = MathAbs(entry - plan.tpPrice);
         r.rewardMoney = moneyPerUnitProfit * tpDistPrice * lots;
         r.rr = (r.riskMoney > 0.0) ? (r.rewardMoney / r.riskMoney) : 0.0;
        }

      //--- Margin check against the *current* free margin snapshot
      ENUM_ORDER_TYPE ot = CXautUtils::MapOrderType(plan.placement, plan.direction);
      double marginRequired = 0.0;
      if(OrderCalcMargin(ot, sym.symbol, lots, entry, marginRequired))
        {
         r.marginRequired = marginRequired;
         double freeMargin = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
         if(marginRequired > freeMargin)
           {
            r.code = VALID_ERR_MARGIN;
            return r;
           }
        }

      r.code = cappedToMax ? VALID_OK : VALID_OK; // capped is informational, not blocking
      if(cappedToMax)
         r.message = "capped"; // panel layer maps this to a localized hint
      return r;
     }
  };
//+------------------------------------------------------------------+
