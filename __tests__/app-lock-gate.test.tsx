import React from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { useAuth } from "@clerk/expo";
import { useConvexAuth, useMutation } from "convex/react";
import { renderRouter } from "expo-router/testing-library";
import { type LockState, useAppLock } from "../src/lib/use-app-lock";

/**
 * `src/app/(app)/_layout.tsx`'s lock gate, the piece inserted between the
 * existing auth gate and the real `<Stack>`. `useAppLock` itself has its own
 * suite (`use-app-lock.test.tsx`) — this is about the *layout* reading its
 * result correctly, which is where the actual leak lived: falling through to
 * `<Stack>` on anything other than `phase === "unlocked"` would render one
 * frame of real content before a lock or a check finished. `"checking"` is
 * the state that bug hid in, since it looks like neither of the two cases
 * (locked / unlocked) an author reaches for first.
 */
jest.mock("../src/lib/use-app-lock", () => ({ useAppLock: jest.fn() }));

function authed() {
  (useAuth as jest.Mock).mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    userId: "user_a",
    getToken: jest.fn(async () => null),
    signOut: jest.fn(async () => undefined),
  });
  (useConvexAuth as jest.Mock).mockReturnValue({ isLoading: false, isAuthenticated: true });
  (useMutation as jest.Mock).mockReturnValue(jest.fn(async () => undefined));
}

afterEach(() => {
  jest.clearAllMocks();
});

test("should render the real app when unlocked", async () => {
  authed();
  (useAppLock as jest.Mock).mockReturnValue({ state: { phase: "unlocked" }, retry: jest.fn() });

  const result = renderRouter("src/app", { initialUrl: "/" });
  await result;

  expect(screen.getByRole("button", { name: "Record" })).toBeTruthy();
});

test("should show the lock screen, not the app, while locked", async () => {
  authed();
  (useAppLock as jest.Mock).mockReturnValue({
    state: { phase: "locked", kind: "face", authenticating: false },
    retry: jest.fn(),
  });

  const result = renderRouter("src/app", { initialUrl: "/" });
  await result;

  expect(screen.getByText("Andy is locked.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Record" })).toBeNull();
});

test("should show neither the app nor the lock screen while checking — the leak this gate exists to close", async () => {
  authed();
  (useAppLock as jest.Mock).mockReturnValue({ state: { phase: "checking" }, retry: jest.fn() });

  const result = renderRouter("src/app", { initialUrl: "/" });
  await result;

  // Falling through to <Stack> here would be one frame of real content
  // rendered before the check resolves — the whole point of gating on
  // anything other than "unlocked" rather than only on "locked".
  expect(screen.queryByRole("button", { name: "Record" })).toBeNull();
  expect(screen.queryByText("Andy is locked.")).toBeNull();
});

test("should call retry when the lock screen's Unlock button is pressed", async () => {
  authed();
  const retry = jest.fn();
  (useAppLock as jest.Mock).mockReturnValue({
    state: { phase: "locked", kind: "device", authenticating: false },
    retry,
  });

  const result = renderRouter("src/app", { initialUrl: "/" });
  await result;

  fireEvent.press(screen.getByRole("button", { name: "Unlock" }));

  expect(retry).toHaveBeenCalledTimes(1);
});

test("should say which unlock method it wants, by kind", async () => {
  authed();
  (useAppLock as jest.Mock).mockReturnValue({
    state: { phase: "locked", kind: "fingerprint", authenticating: false },
    retry: jest.fn(),
  });

  const result = renderRouter("src/app", { initialUrl: "/" });
  await result;

  expect(screen.getByText("Unlock with Touch ID to see your notes.")).toBeTruthy();
});

test("should not gate on the sign-in screen — a signed-out visitor has nothing to lock yet", async () => {
  (useAuth as jest.Mock).mockReturnValue({ isLoaded: true, isSignedIn: false, userId: undefined });
  (useConvexAuth as jest.Mock).mockReturnValue({ isLoading: false, isAuthenticated: false });
  (useMutation as jest.Mock).mockReturnValue(jest.fn(async () => undefined));
  // Not called at all when signed out — (app)/_layout.tsx redirects before
  // useAppLock's result would ever matter, but a stray "locked" return must
  // not somehow leak past the redirect either.
  (useAppLock as jest.Mock).mockReturnValue({
    state: { phase: "locked", kind: "face", authenticating: false },
    retry: jest.fn(),
  });

  const result = renderRouter("src/app", { initialUrl: "/" });
  await result;

  expect(result.getPathname()).toBe("/sign-in");
  expect(screen.queryByText("Andy is locked.")).toBeNull();
});

test("should keep the screen and what was typed underneath a lock — the lock covers, it does not reset", async () => {
  authed();
  // A hook whose phase this test can change after the first render, the way
  // the real one does when the app goes to the background and comes back.
  // An external store rather than `useState` inside the mock: every
  // instance of the layout reads the same phase, as with the real AppState.
  let phase: LockState = { phase: "unlocked" };
  const listeners = new Set<() => void>();
  const setPhase = (next: LockState) => {
    phase = next;
    listeners.forEach((listener) => listener());
  };
  (useAppLock as jest.Mock).mockImplementation(() => {
    const state = React.useSyncExternalStore(
      (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      () => phase,
    );
    return { state, retry: jest.fn() };
  });

  const result = renderRouter("src/app", { initialUrl: "/search" });
  await result;
  await fireEvent.changeText(screen.getByPlaceholderText("Who are you thinking of?"), "who knows clint");

  await act(async () => setPhase({ phase: "locked", kind: "face", authenticating: false }));
  await waitFor(() => expect(screen.getByText("Andy is locked.")).toBeTruthy());
  // Covered: nothing underneath is reachable while locked.
  expect(screen.queryByPlaceholderText("Who are you thinking of?")).toBeNull();

  await act(async () => setPhase({ phase: "unlocked" }));
  await waitFor(() => expect(screen.queryByText("Andy is locked.")).toBeNull());
  expect(result.getPathname()).toBe("/search");
  expect(screen.getByPlaceholderText("Who are you thinking of?").props.value).toBe("who knows clint");
});
