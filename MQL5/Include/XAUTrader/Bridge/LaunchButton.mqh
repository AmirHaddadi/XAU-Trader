//+------------------------------------------------------------------+
//|                                                  LaunchButton.mqh |
//|   XAU-Trader — the one remaining on-chart control. Spawns the     |
//|   packaged bridge executable if it isn't already running, waits   |
//|   (non-blocking) for it to accept the EA's socket connection,     |
//|   then opens the web dashboard in the default browser. The EA     |
//|   only ever spawns this one process — the bridge itself spawns    |
//|   the web server as its own child (see webServerLauncher.ts) —    |
//|   so there is exactly one spawn target and one liveness probe,    |
//|   matching the plan's "one process, one launch button" design.    |
//|                                                                    |
//|   Requires, once, on the terminal this EA runs on (Tools/Options/  |
//|   Expert Advisors): "Allow DLL imports" (for ShellExecuteW) and    |
//|   127.0.0.1 added to "Allow WebRequest for listed URL" (for the    |
//|   bridge socket — see SocketClient.mqh). Both are one-time         |
//|   terminal settings, not something this code can enable itself.   |
//+------------------------------------------------------------------+
#property strict
#include "SocketClient.mqh"
#include "../Core/Defines.mqh"

#import "shell32.dll"
int ShellExecuteW(int hwnd, string lpOperation, string lpFile, string lpParameters, string lpDirectory, int nShowCmd);
#import

#define XAUT_SW_SHOWNORMAL     1
#define XAUT_SW_SHOWMINIMIZED  2

#define XAUT_LAUNCH_BTN_NAME    (XAUT_OBJ_PREFIX + "LaunchBtn")
#define XAUT_LAUNCH_WAIT_MS     15000  // give up waiting for the spawned bridge after this long
#define XAUT_LAUNCH_BTN_W       160
#define XAUT_LAUNCH_BTN_H       28

enum ENUM_LAUNCH_STATE
  {
   LAUNCH_IDLE,       // not yet clicked this session (or the bridge was already up on attach)
   LAUNCH_WAITING,    // spawned, polling for the socket to accept
   LAUNCH_READY       // connected at least once — a click now just reopens the browser
  };

class CLaunchButton
  {
private:
   string            m_exePath;   // path to the packaged bridge executable (InpBridgeExePath)
   string            m_webUrl;    // e.g. "http://127.0.0.1:8788"
   ENUM_LAUNCH_STATE m_state;
   ulong             m_waitStartMs;

public:
   CLaunchButton() { m_state = LAUNCH_IDLE; m_waitStartMs = 0; }

   void Create(const long chartId, const string exePath, const string webUrl)
     {
      m_exePath = exePath;
      m_webUrl  = webUrl;

      ObjectCreate(chartId, XAUT_LAUNCH_BTN_NAME, OBJ_BUTTON, 0, 0, 0);
      ObjectSetInteger(chartId, XAUT_LAUNCH_BTN_NAME, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(chartId, XAUT_LAUNCH_BTN_NAME, OBJPROP_XDISTANCE, 16);
      ObjectSetInteger(chartId, XAUT_LAUNCH_BTN_NAME, OBJPROP_YDISTANCE, 16);
      ObjectSetInteger(chartId, XAUT_LAUNCH_BTN_NAME, OBJPROP_XSIZE, XAUT_LAUNCH_BTN_W);
      ObjectSetInteger(chartId, XAUT_LAUNCH_BTN_NAME, OBJPROP_YSIZE, XAUT_LAUNCH_BTN_H);
      ObjectSetInteger(chartId, XAUT_LAUNCH_BTN_NAME, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(chartId, XAUT_LAUNCH_BTN_NAME, OBJPROP_BGCOLOR, (color)C'212,175,55');
      ObjectSetInteger(chartId, XAUT_LAUNCH_BTN_NAME, OBJPROP_COLOR, (color)C'2,6,23');
      ObjectSetInteger(chartId, XAUT_LAUNCH_BTN_NAME, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(chartId, XAUT_LAUNCH_BTN_NAME, OBJPROP_HIDDEN, true);
      SetLabel(chartId, "Launch Platform");
     }

   void Destroy(const long chartId)
     {
      ObjectDelete(chartId, XAUT_LAUNCH_BTN_NAME);
     }

   //--- Call from OnChartEvent on CHARTEVENT_OBJECT_CLICK, passing sparam.
   //--- Returns true if it was this button (and handled the click).
   bool HandleClick(const long chartId, const string sparam, CSocketClient &bridge)
     {
      if(sparam != XAUT_LAUNCH_BTN_NAME)
         return false;

      // Buttons stay pressed until explicitly released.
      ObjectSetInteger(chartId, XAUT_LAUNCH_BTN_NAME, OBJPROP_STATE, false);

      if(bridge.IsConnected())
        {
         OpenBrowser();
         m_state = LAUNCH_READY;
         SetLabel(chartId, "Open Dashboard");
         return true;
        }

      SpawnBridge();
      m_state = LAUNCH_WAITING;
      m_waitStartMs = GetTickCount64();
      SetLabel(chartId, "Starting...");
      return true;
     }

   //--- Call every OnTimer — non-blocking; checks whether a pending spawn
   //--- has come up yet and opens the browser the moment it does.
   void Poll(const long chartId, CSocketClient &bridge)
     {
      if(m_state != LAUNCH_WAITING)
         return;

      if(bridge.IsConnected())
        {
         OpenBrowser();
         m_state = LAUNCH_READY;
         SetLabel(chartId, "Open Dashboard");
         return;
        }

      if(GetTickCount64() - m_waitStartMs > XAUT_LAUNCH_WAIT_MS)
        {
         Print("XAU Trader: timed out waiting for the bridge at ", m_exePath,
               " — check it exists, and that 127.0.0.1 is allowed under Tools/Options/Expert Advisors.");
         m_state = LAUNCH_IDLE;
         SetLabel(chartId, "Launch Platform");
        }
     }

private:
   void SpawnBridge()
     {
      if(!FileIsExist(m_exePath, FILE_COMMON) && !FileIsExist(m_exePath))
        {
         // Not fatal by itself — ShellExecuteW below will just fail loudly
         // via GetLastError, which is more informative than guessing here.
         Print("XAU Trader: bridge executable not found at ", m_exePath);
        }
      string dir = PathDir(m_exePath);
      int result = ShellExecuteW(0, "open", m_exePath, "", dir, XAUT_SW_SHOWMINIMIZED);
      // Per the Windows API, a return value > 32 means success; anything
      // else is an error code. Left minimized (not hidden) deliberately —
      // Amir can see it actually launched while this is still new.
      if(result <= 32)
         Print("XAU Trader: ShellExecuteW failed to spawn the bridge (code ", result, ")");
     }

   void OpenBrowser()
     {
      int result = ShellExecuteW(0, "open", m_webUrl, "", "", XAUT_SW_SHOWNORMAL);
      if(result <= 32)
         Print("XAU Trader: ShellExecuteW failed to open the browser (code ", result, ")");
     }

   void SetLabel(const long chartId, const string text)
     {
      ObjectSetString(chartId, XAUT_LAUNCH_BTN_NAME, OBJPROP_TEXT, text);
     }

   static string PathDir(const string path)
     {
      int pos = StringLen(path) - 1;
      while(pos >= 0 && StringGetCharacter(path, pos) != '\\' && StringGetCharacter(path, pos) != '/')
         pos--;
      return (pos > 0) ? StringSubstr(path, 0, pos) : "";
     }
  };
//+------------------------------------------------------------------+
