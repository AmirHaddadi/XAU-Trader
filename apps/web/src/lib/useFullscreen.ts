"use client";

import { useCallback, useEffect, useState } from "react";

// Real browser Fullscreen API (Amir: "صفحه هم فول اسکرین بشه روی مرورگر" —
// the page itself should go fullscreen in the browser, not just an in-app
// "compact mode" CSS class) — hides the OS/browser chrome too. Synced both
// ways: toggle() drives it, and the fullscreenchange listener keeps state
// correct when the user exits via Esc/F11 directly instead of the in-app
// button, which would otherwise leave the compact layout stuck on.
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    function onChange() {
      setIsFullscreen(document.fullscreenElement != null);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen().catch(() => {
        // Fullscreen can be denied (no user gesture in the call stack,
        // browser policy, etc.) — nothing meaningful to recover here beyond
        // just staying in the normal layout; fullscreenchange never fires
        // so isFullscreen correctly stays false.
      });
    }
  }, []);

  return { isFullscreen, toggle };
}
