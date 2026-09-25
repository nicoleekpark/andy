import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { lockAvailability, unlock } from "./app-lock";

/**
 * Gates the authenticated app behind the device's own Face ID / Touch ID /
 * passcode. Re-locks on **every** return to the foreground, no grace period
 * — decided 2026-09-24, to match this app's own established lock-screen
 * privacy posture (day 8's briefing notification: nothing sensitive shows
 * without a deliberate look).
 *
 * Fails open when there is nothing to gate behind — no hardware, nothing
 * enrolled, or the native module isn't in this binary (jest, or a build
 * predating this package). A security layer that bricks the app on a device
 * with no passcode set is worse than no layer at all; `lockAvailability`
 * distinguishes "nothing to check" from "check failed" for exactly this call
 * to make that decision, once, here.
 */

export type LockState =
  | { phase: "checking" }
  | { phase: "unlocked" }
  /**
   * `authenticating: true` while the OS prompt is actually showing —
   * `retry` is a deliberate no-op then (see `attempt`'s guard; a second
   * `authenticateAsync` call while one is in flight has nothing to do).
   * `false` once a prompt has concluded without success, which is the only
   * time a tap on the lock screen's button does anything.
   */
  | { phase: "locked"; kind: "face" | "fingerprint" | "device"; authenticating: boolean };

const PROMPT_MESSAGE = "Unlock Andy";

/**
 * `enabled` — pass the caller's own auth state, `false` until it is
 * genuinely signed in. Found by `code-reviewer` (2026-09-24): this hook's
 * effect fires unconditionally on mount, and React runs a component's own
 * effects regardless of *which* branch it rendered — so calling this at the
 * top of `(app)/_layout.tsx`, above the `isAuthenticated` check, fired a
 * real `authenticateAsync()` prompt for a signed-out visitor on every cold
 * launch, before a session even existed. The rendered `<LockScreen>` never
 * appeared (render order does gate on auth first), but the native OS sheet
 * doesn't care what got rendered.
 */
export function useAppLock(enabled: boolean): {
  state: LockState;
  retry: () => Promise<void>;
} {
  const [state, setState] = useState<LockState>({ phase: "checking" });
  const mounted = useRef(true);
  const authenticating = useRef(false);

  const attempt = useCallback(async () => {
    // Guards re-entrancy, not just double-taps: presenting the native
    // biometric sheet itself can flip `AppState` through "inactive" and back,
    // and without this a second `attempt()` would fire mid-prompt and try to
    // show a second one.
    if (authenticating.current) return;
    authenticating.current = true;
    try {
      const availability = await lockAvailability();
      if (availability.state !== "ready") {
        if (mounted.current) setState({ phase: "unlocked" });
        return;
      }
      const kind = availability.kind;
      if (mounted.current) {
        setState({ phase: "locked", kind, authenticating: true });
      }
      const result = await unlock(PROMPT_MESSAGE);
      if (!mounted.current) return;
      if (result.success) {
        setState({ phase: "unlocked" });
      } else {
        // A failure or cancel leaves the lock screen up — `retry` (the
        // button on it) is the only other way back in. Not auto-retried: a
        // wrong fingerprint or a deliberate cancel re-firing the same
        // prompt in a loop is worse than a screen that waits for a tap.
        setState({ phase: "locked", kind, authenticating: false });
      }
    } finally {
      authenticating.current = false;
    }
  }, []);

  // The phase *before* the current AppState event, so "active" can tell a
  // genuine return from the background apart from the far more common case
  // of merely dismissing a foreground system sheet.
  const previousPhase = useRef(AppState.currentState);

  useEffect(() => {
    if (!enabled) return;

    mounted.current = true;
    void attempt();

    const subscription = AppState.addEventListener("change", (phase) => {
      const previous = previousPhase.current;
      previousPhase.current = phase;

      // "background" is the only phase that means the app was genuinely
      // left. "inactive" fires just as often for reasons that never left
      // the app at all — Control Center, a notification banner, and (found
      // live, 2026-09-25) **this very lock's own Face ID sheet opening and
      // closing**. Reacting to "inactive" here made the prompt's own
      // dismissal look like a fresh foreground return: unlock() succeeds →
      // the sheet closes → AppState fires inactive → active → this listener
      // saw "active" and re-armed the gate on the spot, showing a second
      // Face ID prompt seconds after the first one succeeded.
      if (phase === "background") {
        setState((prev) => (prev.phase === "unlocked" ? { phase: "checking" } : prev));
        return;
      }
      if (phase === "active" && previous === "background") {
        void attempt();
      }
    });

    return () => {
      mounted.current = false;
      subscription.remove();
    };
  }, [attempt, enabled]);

  // Returns `attempt`'s promise rather than firing it and discarding it —
  // a bare `void attempt()` here left its eventual `setState` unattached to
  // any recognizable `act()` scope in tests, which React's test renderer
  // silently never flushed into a visible re-render. A `Pressable`'s
  // `onPress` in the real app ignores the return value either way, so this
  // costs nothing there and buys the promise `renderHook` tests need.
  const retry = useCallback(() => attempt(), [attempt]);

  return { state, retry };
}
