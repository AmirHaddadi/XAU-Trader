//+------------------------------------------------------------------+
//|                                              SettingsStore.mqh    |
//|   XAU-Trader — persists panel appearance across restarts/reattach |
//|   via a small key=value file in MQL5/Files. Never throws; a       |
//|   missing/corrupt file just falls back to defaults.               |
//+------------------------------------------------------------------+
#property strict
#include "../Core/Types.mqh"
#include "../Core/Defines.mqh"

class CSettingsStore
  {
public:
   static void Load(SAppSettings &s)
     {
      s.Defaults();
      if(!FileIsExist(XAUT_CONFIG_FILE))
         return;

      int h = FileOpen(XAUT_CONFIG_FILE, FILE_READ | FILE_TXT | FILE_ANSI);
      if(h == INVALID_HANDLE)
         return;

      while(!FileIsEnding(h))
        {
         string line = FileReadString(h);
         int eq = StringFind(line, "=");
         if(eq <= 0) continue;
         string key = StringSubstr(line, 0, eq);
         string val = StringSubstr(line, eq + 1);

         if(key == "theme")     s.theme     = (ENUM_APP_THEME)StringToInteger(val);
         else if(key == "lang") s.lang      = (ENUM_APP_LANG)StringToInteger(val);
         else if(key == "scale")s.uiScale   = ClampScale(StringToDouble(val));
         else if(key == "panelX") s.panelX  = (int)StringToInteger(val);
         else if(key == "panelY") s.panelY  = (int)StringToInteger(val);
         else if(key == "collapsed") s.collapsed = (StringToInteger(val) != 0);
        }
      FileClose(h);

      if(s.panelX < 0) s.panelX = 16;
      if(s.panelY < 0) s.panelY = 16;
     }

   static void Save(const SAppSettings &s)
     {
      if(!FileIsExist(XAUT_CONFIG_DIR))
         FolderCreate(XAUT_CONFIG_DIR);

      int h = FileOpen(XAUT_CONFIG_FILE, FILE_WRITE | FILE_TXT | FILE_ANSI);
      if(h == INVALID_HANDLE)
         return;

      FileWriteString(h, "theme=" + IntegerToString((int)s.theme) + "\n");
      FileWriteString(h, "lang=" + IntegerToString((int)s.lang) + "\n");
      FileWriteString(h, "scale=" + DoubleToString(s.uiScale, 2) + "\n");
      FileWriteString(h, "panelX=" + IntegerToString(s.panelX) + "\n");
      FileWriteString(h, "panelY=" + IntegerToString(s.panelY) + "\n");
      FileWriteString(h, "collapsed=" + IntegerToString(s.collapsed ? 1 : 0) + "\n");
      FileClose(h);
     }

private:
   static double ClampScale(const double v)
     {
      if(v < XAUT_PANEL_MIN_SCALE || v > XAUT_PANEL_MAX_SCALE || !MathIsValidNumber(v))
         return 1.0;
      return v;
     }
  };
//+------------------------------------------------------------------+
