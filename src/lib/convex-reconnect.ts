import type { ConvexReactClient } from "convex/react";

/**
 * Tell Convex's socket to reconnect now, instead of when it gets round to it.
 *
 * On React Native, Convex has no signal that the network came back: its
 * reconnect listens for the browser's `online` event, which React Native never
 * fires, so a dropped socket waits out its backoff (up to 16 s) — and a socket
 * iOS froze while Andy was in the background is not noticed as dead at all
 * until a hardcoded 60 s inactivity timeout (convex 1.46.0,
 * `web_socket_manager.js`; upstream get-convex/convex-backend#562). Device QA
 * 2026-10-06: Ask and saves hung after coming back online.
 *
 * There is no public way to ask for a reconnect, so this reaches the client's
 * own manager — the two methods its `online` handler and its inactivity timer
 * already call. Reaching in is fragile by nature, so it checks before every
 * call and does nothing if the shape has changed; Convex's own slower recovery
 * still runs underneath. `__tests__/convex-reconnect.test.ts` builds a real
 * client from the installed package and fails the day an upgrade moves these.
 *
 * Remounting the client (what `connecting`'s Try again does) would also work,
 * but it throws away every screen mounted under it — the opposite of what
 * coming back to the app should do.
 */

type SocketManager = {
  socket?: { state?: string };
  tryReconnectImmediately?: () => void;
  closeAndReconnect?: (reason: string) => void;
};

export type ReconnectNudge = "reconnecting" | "restarting" | "nothing-to-do" | "unsupported";

function managerOf(client: ConvexReactClient): SocketManager | null | "closed" {
  let sync: { webSocketManager?: SocketManager } | undefined;
  try {
    sync = (client as unknown as { sync?: { webSocketManager?: SocketManager } }).sync;
  } catch {
    // `sync` throws "ConvexReactClient has already been closed." once the
    // client is closed — which a listener can briefly outlive (seen under
    // Fast Refresh, 2026-10-07). A closed client has nothing to reconnect.
    return "closed";
  }
  const manager = sync?.webSocketManager;
  if (
    !manager ||
    typeof manager.tryReconnectImmediately !== "function" ||
    typeof manager.closeAndReconnect !== "function"
  ) {
    return null;
  }
  return manager;
}

/**
 * `suspect` — true when the socket may be connected in name only (the app sat
 * in the background long enough for iOS to freeze it). A healthy socket is not
 * restarted otherwise, nor while an action is in flight: a restart drops any
 * action already on its way, so doing it on every return from a glance at
 * another app would fail Ask questions that would have finished on their own.
 */
export function nudgeReconnect(
  client: ConvexReactClient,
  { suspect }: { suspect: boolean },
): ReconnectNudge {
  const manager = managerOf(client);
  if (manager === "closed") return "nothing-to-do";
  if (manager === null) {
    // Said out loud in development: otherwise a Convex upgrade that moves these
    // internals looks exactly like the original bug coming back.
    if (__DEV__) {
      console.warn("[convex-reconnect] Convex's socket manager changed shape; the foreground reconnect is off");
    }
    return "unsupported";
  }

  try {
    return nudge(client, manager, suspect);
  } catch {
    // A future internal state these private methods don't expect must not
    // throw out of an AppState listener; Convex's own recovery still runs.
    return "unsupported";
  }
}

function nudge(client: ConvexReactClient, manager: SocketManager, suspect: boolean): ReconnectNudge {
  const state = manager.socket?.state;
  if (state === "disconnected") {
    manager.tryReconnectImmediately!();
    return "reconnecting";
  }
  // Never while an action is on its way (an Ask answer, a draft, a reading):
  // a restart cancels it ("Connection lost while action was in flight"), and
  // the socket may well be healthy. If it really was frozen, Convex's own
  // 60 s timeout still clears it — the worst case is the old behaviour, not a
  // lost answer. `connectionState()` is public API.
  if (
    suspect &&
    (state === "ready" || state === "connecting") &&
    client.connectionState().inflightActions === 0
  ) {
    manager.closeAndReconnect!("AndyReturnedToForeground");
    return "restarting";
  }
  return "nothing-to-do";
}
