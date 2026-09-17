"use client";

import { useCallback, useRef, useState } from "react";
import { useToast } from "./toast";

interface AsyncActionOptions<TArgs extends unknown[], TResult> {
  action: (...args: TArgs) => Promise<TResult>;
  successMessage?: string | ((result: TResult, ...args: TArgs) => string);
  // Some results resolve successfully at the transport level but encode a
  // domain failure in their payload rather than throwing (e.g. an
  // OrderAck with ok:false — a rejected order isn't a network/timeout
  // error, so sendOrder() doesn't throw for it). Return the failure
  // message here to have it reported as an error toast instead of a
  // success one; return undefined for a genuine success. The raw result is
  // still returned to the caller either way, so existing control flow that
  // branches on it (e.g. only closing the review panel on ok:true) is
  // unaffected.
  resultError?: (result: TResult) => string | undefined;
  errorFallbackMessage?: string;
}

// The standard shape every user-triggered async action in this app should
// go through: order confirm, position close, journal writes, and anything
// added later. Three things a bespoke `useState(false)` + inline
// try/catch tends to miss, all found live in an audit of the existing
// call sites (see Performance.md / project memory
// project_xau_trader_hyper_perf):
//  1. An intrinsic re-entrancy lock via a ref, not React state — state
//     updates aren't visible until the next render, so a fast double-click
//     can fire twice before a `disabled` prop takes effect; a ref read/set
//     is synchronous within the same event-loop turn.
//  2. `pending` for spinner/disabled wiring, always in sync with the lock.
//  3. Uniform success/error surfacing through the shared toast channel
//     (lib/toast.tsx), so a failure is never silently swallowed by a
//     stray `void someAsyncCall()`.
export function useAsyncAction<TArgs extends unknown[], TResult>({
  action,
  successMessage,
  resultError,
  errorFallbackMessage,
}: AsyncActionOptions<TArgs, TResult>) {
  const [pending, setPending] = useState(false);
  const lockRef = useRef(false);
  const toast = useToast();

  const run = useCallback(
    async (...args: TArgs): Promise<TResult | undefined> => {
      if (lockRef.current) return undefined; // duplicate/double-click while one is already in flight
      lockRef.current = true;
      setPending(true);
      try {
        const result = await action(...args);
        const failure = resultError?.(result);
        if (failure) {
          toast.show("error", failure);
        } else if (successMessage) {
          toast.show("success", typeof successMessage === "function" ? successMessage(result, ...args) : successMessage);
        }
        return result;
      } catch (err) {
        toast.show("error", (err as Error).message || errorFallbackMessage || "Failed");
        return undefined;
      } finally {
        lockRef.current = false;
        setPending(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [action],
  );

  return { run, pending };
}
