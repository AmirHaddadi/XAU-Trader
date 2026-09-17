//+------------------------------------------------------------------+
//|                                                    JsonUtils.mqh  |
//|   XAU-Trader — hand-rolled JSON encode/extract for the bridge     |
//|   protocol. The wire schema (packages/protocol) is small and      |
//|   fully known upfront, so this is deliberately NOT a general      |
//|   JSON parser — just string building for outgoing messages and    |
//|   flat single-pass field extraction for incoming ones. Avoids     |
//|   vendoring an unverified third-party MQL5 JSON library into a    |
//|   Wine-compiled binary for a problem this small.                  |
//+------------------------------------------------------------------+
#property strict

class CJsonUtils
  {
public:
   //--- Escapes a string for safe embedding inside a JSON string literal.
   static string Escape(const string s)
     {
      string out = s;
      StringReplace(out, "\\", "\\\\");
      StringReplace(out, "\"", "\\\"");
      StringReplace(out, "\n", "\\n");
      StringReplace(out, "\r", "");
      return out;
     }

   //--- Extracts a top-level or nested string value for "key":"value".
   //--- Safe for our fixed schemas because key names never collide between
   //--- the envelope and its payload within one message.
   static string ExtractString(const string json, const string key, const string defVal = "")
     {
      string needle = "\"" + key + "\":\"";
      int start = StringFind(json, needle);
      if(start < 0)
         return defVal;
      start += StringLen(needle);
      int end = start;
      int len = StringLen(json);
      while(end < len)
        {
         ushort ch = StringGetCharacter(json, end);
         if(ch == '\\')
           {
            end += 2;
            continue;
           }
         if(ch == '"')
            break;
         end++;
        }
      if(end >= len)
         return defVal;
      string raw = StringSubstr(json, start, end - start);
      StringReplace(raw, "\\\"", "\"");
      StringReplace(raw, "\\n", "\n");
      StringReplace(raw, "\\\\", "\\");
      return raw;
     }

   //--- Extracts a numeric value for "key":123.45 (not a quoted string).
   static double ExtractNumber(const string json, const string key, const double defVal = 0.0)
     {
      string needle = "\"" + key + "\":";
      int start = StringFind(json, needle);
      if(start < 0)
         return defVal;
      start += StringLen(needle);
      int end = start;
      int len = StringLen(json);
      while(end < len)
        {
         ushort ch = StringGetCharacter(json, end);
         if((ch >= '0' && ch <= '9') || ch == '-' || ch == '+' || ch == '.' || ch == 'e' || ch == 'E')
            end++;
         else
            break;
        }
      if(end == start)
         return defVal;
      return StringToDouble(StringSubstr(json, start, end - start));
     }

   static long ExtractInt(const string json, const string key, const long defVal = 0)
     {
      return (long)ExtractNumber(json, key, (double)defVal);
     }

   static bool ExtractBool(const string json, const string key, const bool defVal = false)
     {
      string needle = "\"" + key + "\":";
      int start = StringFind(json, needle);
      if(start < 0)
         return defVal;
      start += StringLen(needle);
      if(StringSubstr(json, start, 4) == "true")
         return true;
      if(StringSubstr(json, start, 5) == "false")
         return false;
      return defVal;
     }

   //--- Reads the top-level "type" field of an envelope — every message
   //--- carries one, used to dispatch before extracting payload fields.
   static string ExtractType(const string json)
     {
      return ExtractString(json, "type");
     }

   static string ExtractReqId(const string json)
     {
      return ExtractString(json, "reqId");
     }
  };
//+------------------------------------------------------------------+
