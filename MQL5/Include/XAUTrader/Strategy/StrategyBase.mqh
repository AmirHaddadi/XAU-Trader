//+------------------------------------------------------------------+
//|                                                StrategyBase.mqh   |
//|   XAU-Trader — extension point reserved for phase 2 (signal &     |
//|   strategy engine). Not wired into the EA yet; the panel/risk/    |
//|   trading modules do not depend on this file.                     |
//+------------------------------------------------------------------+
#property strict

//--- Every future strategy plugs in behind this interface so the panel
//--- can optionally show/execute its signals without the money-management
//--- core knowing anything about strategy internals.
class CStrategyBase
  {
public:
   virtual bool   Init()   { return true; }
   virtual void   Deinit() {}
   virtual void   OnTick() {}
   virtual string Name()   const { return "None"; }
  };
//+------------------------------------------------------------------+
