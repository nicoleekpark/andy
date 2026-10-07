import { useEffect } from "react";
import { AppState } from "react-native";
import type { ConvexReactClient } from "convex/react";
import { nudgeReconnect } from "./convex-reconnect";

/**
 * How long in the background before a "connected" socket is not trusted.
 * iOS suspends a backgrounded app within seconds and its socket stops hearing
 * the server without closing — so after this long, connected may mean nothing.
 * Shorter trips (a glance at Messages) leave a healthy socket alone.
 */
export const SUSPECT_AFTER_MS = 15_000;

/**
 * Coming back to Andy is the moment a person expects it to work, and on React
 * Native it is also the only moment we reliably hear about: there is no
 * network-came-back event (see `convex-reconnect.ts`). So every return to the
 * foreground nudges the socket — straight away if it is down, and restarted if
 * it sat frozen long enough to be suspect.
 */
export function useReconnectOnForeground(client: ConvexReactClient): void {
  useEffect(() => {
    let backgroundedAt: number | null = null;

    const subscription = AppState.addEventListener("change", (phase) => {
      if (phase === "background") {
        backgroundedAt = Date.now();
        return;
      }
      if (phase === "active" && backgroundedAt !== null) {
        const away = Date.now() - backgroundedAt;
        backgroundedAt = null;
        nudgeReconnect(client, { suspect: away >= SUSPECT_AFTER_MS });
      }
    });

    return () => subscription.remove();
  }, [client]);
}
