import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AppState } from "react-native";
import { lockAvailability, unlock } from "../src/lib/app-lock";
import { useAppLock } from "../src/lib/use-app-lock";

jest.mock("../src/lib/app-lock", () => ({
  lockAvailability: jest.fn(),
  unlock: jest.fn(),
}));

/**
 * The state machine on top of `app-lock.ts`: when the lock screen shows, what
 * a successful/cancelled/failed prompt does to it, and the re-lock-on-every-
 * foreground-return rule decided 2026-09-24 (no grace period).
 *
 * `AppState.addEventListener` is a `jest.fn()` under this project's preset
 * (verified against the actual mock, not assumed) — the listener it was
 * called with is captured and invoked directly to simulate a phase change,
 * the standard way to drive a hook that subscribes to a global emitter.
 */

async function fireAppStateChange(phase: string) {
  const calls = (AppState.addEventListener as jest.Mock).mock.calls;
  const [, listener] = calls[calls.length - 1] as [string, (p: string) => void];
  // `listener` itself returns nothing to await — it's the real AppState
  // callback shape — so a synchronous `act()` closes before the "active"
  // branch's `attempt()` chain (two sequential awaits) resolves, and that
  // state update never flushes into a render `result.current` picks up.
  // An async `act()` plus a macrotask tick drains every microtask queued by
  // it first, same fix as `retry()` needed.
  await act(async () => {
    listener(phase);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

let cleanup: (() => Promise<void>) | undefined;

beforeEach(() => {
  (lockAvailability as jest.Mock).mockResolvedValue({ state: "unavailable" });
  (unlock as jest.Mock).mockResolvedValue({ success: true });
});

afterEach(async () => {
  // Each hook instance's AppState subscription and `mounted` ref have to
  // actually tear down between tests, or a previous test's still-live
  // listener answers this file's shared `lockAvailability`/`unlock` mocks
  // too, on top of the current test's own instance — inflated, racy call
  // counts that only show up running the whole suite, never one test alone.
  await cleanup?.();
  cleanup = undefined;
  jest.clearAllMocks();
});

test("should go straight to unlocked when there is nothing to gate behind", async () => {
  (lockAvailability as jest.Mock).mockResolvedValue({ state: "unavailable" });

  const { result, unmount } = await renderHook(() => useAppLock(true));
  cleanup = unmount;

  await waitFor(() => expect(result.current.state.phase).toBe("unlocked"));
  expect(unlock).not.toHaveBeenCalled();
});

test.each(["no-hardware", "not-enrolled"] as const)(
  "should go straight to unlocked on %s, not get stuck asking for a prompt that can't happen",
  async (state) => {
    (lockAvailability as jest.Mock).mockResolvedValue({ state });

    const { result, unmount } = await renderHook(() => useAppLock(true));
    cleanup = unmount;

    await waitFor(() => expect(result.current.state.phase).toBe("unlocked"));
    expect(unlock).not.toHaveBeenCalled();
  },
);

test("should prompt automatically on mount when a lock is available, without waiting for a tap", async () => {
  (lockAvailability as jest.Mock).mockResolvedValue({ state: "ready", kind: "face" });

  const { unmount } = await renderHook(() => useAppLock(true));
  cleanup = unmount;

  await waitFor(() => expect(unlock).toHaveBeenCalledTimes(1));
});

test("should unlock on a successful prompt", async () => {
  (lockAvailability as jest.Mock).mockResolvedValue({ state: "ready", kind: "face" });
  (unlock as jest.Mock).mockResolvedValue({ success: true });

  const { result, unmount } = await renderHook(() => useAppLock(true));
  cleanup = unmount;

  await waitFor(() => expect(result.current.state.phase).toBe("unlocked"));
});

test("should stay locked, carrying the biometry kind, once a cancelled prompt has settled", async () => {
  (lockAvailability as jest.Mock).mockResolvedValue({ state: "ready", kind: "fingerprint" });
  (unlock as jest.Mock).mockResolvedValue({ success: false, cancelled: true });

  const { result, unmount } = await renderHook(() => useAppLock(true));
  cleanup = unmount;

  await waitFor(() =>
    expect(result.current.state).toEqual({
      phase: "locked",
      kind: "fingerprint",
      authenticating: false,
    }),
  );
});

test("should mark the lock screen as authenticating while the prompt is still showing", async () => {
  (lockAvailability as jest.Mock).mockResolvedValue({ state: "ready", kind: "face" });
  let resolveUnlock: (value: { success: boolean; cancelled?: boolean }) => void = () => {};
  (unlock as jest.Mock).mockReturnValue(
    new Promise((resolve) => {
      resolveUnlock = resolve;
    }),
  );

  const { result, unmount } = await renderHook(() => useAppLock(true));
  cleanup = unmount;

  // Set before the prompt resolves — this is the surface the OS's own Face
  // ID sheet sits on top of, and a tap on its button must do nothing while
  // that sheet is up (`useAppLock`'s reentrancy guard).
  await waitFor(() =>
    expect(result.current.state).toEqual({ phase: "locked", kind: "face", authenticating: true }),
  );

  resolveUnlock({ success: false, cancelled: true });
  await waitFor(() =>
    expect(result.current.state).toEqual({
      phase: "locked",
      kind: "face",
      authenticating: false,
    }),
  );
});

test("should stay locked when the prompt fails (wrong finger/face/passcode)", async () => {
  (lockAvailability as jest.Mock).mockResolvedValue({ state: "ready", kind: "device" });
  (unlock as jest.Mock).mockResolvedValue({ success: false, cancelled: false });

  const { result, unmount } = await renderHook(() => useAppLock(true));
  cleanup = unmount;

  await waitFor(() => expect(result.current.state.phase).toBe("locked"));
});

test("should re-prompt when retry is called after a cancelled attempt", async () => {
  (lockAvailability as jest.Mock).mockResolvedValue({ state: "ready", kind: "face" });
  (unlock as jest.Mock).mockResolvedValue({ success: false, cancelled: true });

  const { result, unmount } = await renderHook(() => useAppLock(true));
  cleanup = unmount;
  await waitFor(() =>
    expect(result.current.state).toMatchObject({ phase: "locked", authenticating: false }),
  );

  (unlock as jest.Mock).mockResolvedValue({ success: true });
  await act(async () => {
    await result.current.retry();
  });

  expect(result.current.state.phase).toBe("unlocked");
  expect(unlock).toHaveBeenCalledTimes(2);
});

// ---------------------------------------------------------------------------
// Re-locking on every foreground return — no grace period, decided 2026-09-24
// ---------------------------------------------------------------------------

test("should re-lock and re-prompt on every return to the foreground, not just once", async () => {
  (lockAvailability as jest.Mock).mockResolvedValue({ state: "ready", kind: "face" });
  (unlock as jest.Mock).mockResolvedValue({ success: true });

  const { result, unmount } = await renderHook(() => useAppLock(true));
  cleanup = unmount;
  await waitFor(() => expect(result.current.state.phase).toBe("unlocked"));
  expect(unlock).toHaveBeenCalledTimes(1);

  // Left the foreground, then came straight back — no time-based grace, so
  // this must gate again immediately rather than trust the earlier unlock.
  await fireAppStateChange("background");
  await fireAppStateChange("active");

  await waitFor(() => expect(unlock).toHaveBeenCalledTimes(2));
});

test("should not leave the gate open while backgrounded — state drops out of unlocked immediately", async () => {
  (lockAvailability as jest.Mock).mockResolvedValue({ state: "ready", kind: "face" });
  (unlock as jest.Mock).mockResolvedValue({ success: true });

  const { result, unmount } = await renderHook(() => useAppLock(true));
  cleanup = unmount;
  await waitFor(() => expect(result.current.state.phase).toBe("unlocked"));

  await fireAppStateChange("background");

  // Before the next `active` event ever fires: the phase must already have
  // left "unlocked", because a consumer (the route gate) renders real
  // content exactly when phase === "unlocked" — leaving it true while
  // backgrounded would be a false "still fine" the instant focus returns.
  expect(result.current.state.phase).not.toBe("unlocked");
});

test("should re-check on a background-then-active cycle, not get wedged", async () => {
  (lockAvailability as jest.Mock).mockResolvedValue({ state: "unavailable" });

  const { unmount } = await renderHook(() => useAppLock(true));
  cleanup = unmount;

  await waitFor(() => expect(lockAvailability).toHaveBeenCalledTimes(1));

  await fireAppStateChange("background");
  await fireAppStateChange("active");
  await waitFor(() => expect(lockAvailability).toHaveBeenCalledTimes(2));
});

/**
 * The bug reported live, 2026-09-25: Face ID succeeded, the user landed on
 * the real app, and a *second* Face ID prompt appeared seconds later,
 * unprompted. Traced via added debug logging to the actual device event
 * sequence: `unlock()`'s own native sheet flips `AppState` through
 * `inactive` while it's open, then back to `active` when it closes — and
 * the old listener treated *any* `"active"` event as "returned from the
 * background," so the prompt's own dismissal re-armed itself. `"inactive"`
 * fires just as often for Control Center or a notification banner — nothing
 * that left the app at all.
 */
test("should not re-trigger on inactive-then-active alone — this is what the prompt's own sheet looks like", async () => {
  (lockAvailability as jest.Mock).mockResolvedValue({ state: "ready", kind: "face" });
  (unlock as jest.Mock).mockResolvedValue({ success: true });

  const { result, unmount } = await renderHook(() => useAppLock(true));
  cleanup = unmount;
  await waitFor(() => expect(result.current.state.phase).toBe("unlocked"));
  expect(unlock).toHaveBeenCalledTimes(1);

  // The exact sequence from the device logs: inactive (sheet opens/closes
  // around the successful unlock, already reflected above) then active,
  // with no "background" in between.
  await fireAppStateChange("inactive");
  await fireAppStateChange("active");

  // Give a wrongly-fired attempt() a chance to run before asserting silence.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  expect(unlock).toHaveBeenCalledTimes(1);
  expect(result.current.state.phase).toBe("unlocked");
});

test("should still re-lock on active when it follows a real background exit, inactive step included", async () => {
  (lockAvailability as jest.Mock).mockResolvedValue({ state: "ready", kind: "face" });
  (unlock as jest.Mock).mockResolvedValue({ success: true });

  const { result, unmount } = await renderHook(() => useAppLock(true));
  cleanup = unmount;
  await waitFor(() => expect(result.current.state.phase).toBe("unlocked"));

  // The real transition sequence leaving the app is usually active ->
  // inactive -> background, not a bare jump to "background".
  await fireAppStateChange("inactive");
  await fireAppStateChange("background");
  await fireAppStateChange("active");

  await waitFor(() => expect(unlock).toHaveBeenCalledTimes(2));
});

// ---------------------------------------------------------------------------
// `enabled` — found by code-reviewer, 2026-09-24
// ---------------------------------------------------------------------------

test("should never call lockAvailability/unlock while disabled — a signed-out visitor gets no prompt", async () => {
  (lockAvailability as jest.Mock).mockResolvedValue({ state: "ready", kind: "face" });

  const { result, unmount } = await renderHook(() => useAppLock(false));
  cleanup = unmount;

  // Give any wrongly-fired effect a chance to run before asserting silence.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  expect(lockAvailability).not.toHaveBeenCalled();
  expect(unlock).not.toHaveBeenCalled();
  expect(result.current.state.phase).toBe("checking");
});

test("should start gating once enabled flips true, having done nothing while false", async () => {
  (lockAvailability as jest.Mock).mockResolvedValue({ state: "ready", kind: "face" });
  (unlock as jest.Mock).mockResolvedValue({ success: true });

  const { result, rerender, unmount } = await renderHook(
    ({ enabled }: { enabled: boolean }) => useAppLock(enabled),
    { initialProps: { enabled: false } },
  );
  cleanup = unmount;

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(lockAvailability).not.toHaveBeenCalled();

  await rerender({ enabled: true });

  await waitFor(() => expect(lockAvailability).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(result.current.state.phase).toBe("unlocked"));
});
