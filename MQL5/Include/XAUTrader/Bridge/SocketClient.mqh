//+------------------------------------------------------------------+
//|                                                 SocketClient.mqh  |
//|   XAU-Trader — thin wrapper around MQL5's native client sockets   |
//|   (SocketCreate/Connect/Send/Read), talking newline-delimited     |
//|   JSON to the local Node bridge. MQL5 sockets are client-only —   |
//|   the bridge is always the listener; this side only ever connects|
//|   out. Requires 127.0.0.1 added to Tools/Options/Expert Advisors/ |
//|   "Allow WebRequest for listed URL" on the terminal, or           |
//|   SocketConnect fails with error 4014.                            |
//+------------------------------------------------------------------+
#property strict

class CSocketClient
  {
private:
   int    m_socket;
   string m_host;
   int    m_port;
   bool   m_connected;
   string m_recvBuffer;      // partial line kept across PollLines() calls
   ulong  m_lastConnectMs;
   uint   m_reconnectIntervalMs;

public:
   CSocketClient()
     {
      m_socket = INVALID_HANDLE;
      m_connected = false;
      m_lastConnectMs = 0;
      m_reconnectIntervalMs = 2000;
      m_port = 0;
     }

   void Init(const string host, const int port, const uint reconnectIntervalMs = 2000)
     {
      m_host = host;
      m_port = port;
      m_reconnectIntervalMs = reconnectIntervalMs;
     }

   bool IsConnected()
     {
      if(!m_connected || m_socket == INVALID_HANDLE)
         return false;
      if(!SocketIsConnected(m_socket))
        {
         Disconnect();
         return false;
        }
      return true;
     }

   //--- Non-blocking, throttled connect attempt — safe to call every OnTimer
   //--- tick even while the bridge isn't running yet.
   void TryConnect()
     {
      if(IsConnected())
         return;
      ulong now = GetTickCount64();
      if(now - m_lastConnectMs < m_reconnectIntervalMs)
         return;
      m_lastConnectMs = now;

      if(m_socket != INVALID_HANDLE)
        {
         SocketClose(m_socket);
         m_socket = INVALID_HANDLE;
        }

      m_socket = SocketCreate();
      if(m_socket == INVALID_HANDLE)
        {
         Print("XAU Trader Bridge: SocketCreate failed (", GetLastError(), ")");
         return;
        }

      if(!SocketConnect(m_socket, m_host, (uint)m_port, 250))
        {
         // Not fatal — the bridge simply isn't up yet; retried next timer tick.
         SocketClose(m_socket);
         m_socket = INVALID_HANDLE;
         return;
        }

      m_connected = true;
      m_recvBuffer = "";
      Print("XAU Trader Bridge: connected to ", m_host, ":", m_port);
     }

   //--- Sends one already-JSON-encoded message; the trailing newline (the
   //--- NDJSON frame boundary) is added here, not by callers.
   bool SendLine(const string json)
     {
      if(!IsConnected())
         return false;

      string withNewline = json + "\n";
      uchar buf[];
      int total = StringToCharArray(withNewline, buf, 0, -1, CP_UTF8) - 1; // drop the implicit trailing \0
      if(total <= 0)
         return true;

      int sent = SocketSend(m_socket, buf, total);
      if(sent != total)
        {
         Print("XAU Trader Bridge: send failed/partial (", GetLastError(), ")");
         Disconnect();
         return false;
        }
      return true;
     }

   //--- Drains whatever bytes are currently available and returns any
   //--- complete lines; an in-flight partial line stays buffered across
   //--- calls, same reasoning as the bridge's own LineFramer.
   int PollLines(string &outLines[])
     {
      ArrayResize(outLines, 0);
      if(!IsConnected())
         return 0;

      uint available = SocketIsReadable(m_socket);
      if(available == 0)
         return 0;

      uchar buf[];
      ArrayResize(buf, (int)available);
      int got = SocketRead(m_socket, buf, available, 0);
      if(got <= 0)
        {
         if(!SocketIsConnected(m_socket))
            Disconnect();
         return 0;
        }

      m_recvBuffer += CharArrayToString(buf, 0, got, CP_UTF8);

      int count = 0;
      int nl;
      while((nl = StringFind(m_recvBuffer, "\n")) >= 0)
        {
         string line = StringSubstr(m_recvBuffer, 0, nl);
         m_recvBuffer = StringSubstr(m_recvBuffer, nl + 1);
         StringTrimLeft(line);
         StringTrimRight(line);
         if(StringLen(line) > 0)
           {
            ArrayResize(outLines, count + 1);
            outLines[count] = line;
            count++;
           }
        }
      return count;
     }

   void Disconnect()
     {
      if(m_socket != INVALID_HANDLE)
        {
         SocketClose(m_socket);
         m_socket = INVALID_HANDLE;
        }
      m_connected = false;
     }
  };
//+------------------------------------------------------------------+
