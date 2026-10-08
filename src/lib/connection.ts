import { useConvexConnectionState } from "convex/react";

/**
 * Whether Andy is offline — the one definition every screen uses.
 *
 * Not simply "the socket is down": it is down for the first moment of every
 * launch too, and treating that as offline would flash "Offline — showing…"
 * and let a session in before the server has seen it on every ordinary start.
 * Offline means the socket is down *and* either it was up before (a drop
 * mid-session) or an attempt to connect has already failed (opened with no
 * connection at all) — the two cases a person would call offline.
 */
export function isOffline(state: {
  isWebSocketConnected: boolean;
  hasEverConnected: boolean;
  connectionRetries: number;
}): boolean {
  return (
    !state.isWebSocketConnected && (state.hasEverConnected || state.connectionRetries > 0)
  );
}

export function useOffline(): boolean {
  return isOffline(useConvexConnectionState());
}
