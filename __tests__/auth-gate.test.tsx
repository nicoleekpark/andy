import React from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { useAuth } from "@clerk/expo";
import { useConvexAuth, useConvexConnectionState, useMutation } from "convex/react";
import { renderRouter } from "expo-router/testing-library";

/**
 * src/app/(app)/_layout.tsx and src/app/(auth)/_layout.tsx ask Clerk who is
 * signed in and Convex whether the server has accepted it; (app) also fires
 * `ensureUser` once the server has. Only Clerk's "signed out" sends anyone to
 * sign-in — a session the server has not accepted waits on the connecting
 * screen (offline at launch), and one it already accepted keeps its screens
 * through a later drop (offline mid-use). Device QA, 2026-10-06. `useConvexAuth` and
 * `useMutation` are mocked in jest.setup.ts as controllable jest.fn()s (see
 * that file for why a passthrough provider mock can't do this job) — every
 * test below sets its own return value, so a mock can't be quietly stubbed
 * to a single always-true/always-false state and still pass.
 *
 * These assert on the *absence* of protected/sign-in content, not just on
 * pathname, per the reviewer note this slice is responding to: a redirect
 * that resolves to the right pathname but still leaves the previous
 * screen's content mounted underneath would pass a pathname-only check.
 */
function signedOut() {
  (useAuth as jest.Mock).mockReturnValue({
    isLoaded: true,
    isSignedIn: false,
    userId: undefined,
    signOut: jest.fn(async () => undefined),
  });
}

function signedIn(signOut = jest.fn(async () => undefined)) {
  (useAuth as jest.Mock).mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    userId: "user_a",
    getToken: jest.fn(async () => null),
    signOut,
  });
  return signOut;
}

describe("auth gate", () => {
  beforeEach(() => {
    signedIn();
  });

  test("should not render profile content and should land on /sign-in when signed out", async () => {
    signedOut();
    (useConvexAuth as jest.Mock).mockReturnValue({ isLoading: false, isAuthenticated: false });
    (useMutation as jest.Mock).mockReturnValue(jest.fn(async () => undefined));

    const result = renderRouter("src/app", { initialUrl: "/profile/should-never-render" });
    await result;

    expect(result.getPathname()).toBe("/sign-in");
    expect(
      screen.queryByText("Everything you've noted about this person, newest first."),
    ).toBeNull();
    expect(screen.queryByText(/should-never-render/)).toBeNull();
  });

  test("should not show the sign-in screen while auth is still loading", async () => {
    (useConvexAuth as jest.Mock).mockReturnValue({ isLoading: true, isAuthenticated: false });
    (useMutation as jest.Mock).mockReturnValue(jest.fn(async () => undefined));

    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;

    expect(screen.queryByText("Sign in with Apple arrives in the next slice.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Record" })).toBeNull();
  });

  test("should render app content and not end up on /sign-in when signed in", async () => {
    (useConvexAuth as jest.Mock).mockReturnValue({ isLoading: false, isAuthenticated: true });
    // useMutation must resolve like the real thing: it always returns a
    // function returning a Promise, and (app)/_layout.tsx chains .catch()
    // off the call. A bare jest.fn() returns undefined and throws here.
    (useMutation as jest.Mock).mockReturnValue(jest.fn(async () => undefined));

    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;

    // The home screen's record button, not its copy: this test is about the
    // gate letting a signed-in caller through, and pinning wording would make
    // it fail every time home is rewritten — as it just was.
    expect(screen.getByRole("button", { name: "Record" })).toBeTruthy();
    expect(result.getPathname()).not.toBe("/sign-in");
  });

  test("should redirect back to / when a signed-in user navigates to /sign-in", async () => {
    (useConvexAuth as jest.Mock).mockReturnValue({ isLoading: false, isAuthenticated: true });
    (useMutation as jest.Mock).mockReturnValue(jest.fn(async () => undefined));

    const result = renderRouter("src/app", { initialUrl: "/sign-in" });
    await result;

    expect(result.getPathname()).toBe("/");
    expect(screen.queryByText("Sign in with Apple arrives in the next slice.")).toBeNull();
  });

  test("should call ensureUser exactly once when authenticated", async () => {
    const ensureUserSpy = jest.fn(async () => "user-id");
    (useConvexAuth as jest.Mock).mockReturnValue({ isLoading: false, isAuthenticated: true });
    (useMutation as jest.Mock).mockReturnValue(ensureUserSpy);

    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;

    await waitFor(() => expect(ensureUserSpy).toHaveBeenCalledTimes(1));
    expect(ensureUserSpy).toHaveBeenCalledWith({});
  });

  test("should not call ensureUser when signed out", async () => {
    const ensureUserSpy = jest.fn(async () => "user-id");
    signedOut();
    (useConvexAuth as jest.Mock).mockReturnValue({ isLoading: false, isAuthenticated: false });
    (useMutation as jest.Mock).mockReturnValue(ensureUserSpy);

    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;

    expect(ensureUserSpy).not.toHaveBeenCalled();
  });

  test("should not call ensureUser while auth is still loading", async () => {
    const ensureUserSpy = jest.fn(async () => "user-id");
    (useConvexAuth as jest.Mock).mockReturnValue({ isLoading: true, isAuthenticated: false });
    (useMutation as jest.Mock).mockReturnValue(ensureUserSpy);

    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;

    expect(ensureUserSpy).not.toHaveBeenCalled();
  });

  test("should still render app content when ensureUser rejects", async () => {
    // This is the behaviour the .catch(() => {}) in (app)/_layout.tsx exists
    // for: ensureUser failing (e.g. a transient network error) must not
    // surface as an unhandled rejection or stop the rest of the screen from
    // rendering.
    const ensureUserSpy = jest.fn(async () => {
      throw new Error("network error");
    });
    (useConvexAuth as jest.Mock).mockReturnValue({ isLoading: false, isAuthenticated: true });
    (useMutation as jest.Mock).mockReturnValue(ensureUserSpy);

    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;

    await waitFor(() => expect(ensureUserSpy).toHaveBeenCalledTimes(1));
    // The home screen's record button, not its copy: this test is about the
    // gate letting a signed-in caller through, and pinning wording would make
    // it fail every time home is rewritten — as it just was.
    expect(screen.getByRole("button", { name: "Record" })).toBeTruthy();
  });

  test("should wait on the connecting screen, not send to sign-in, when signed in but the server has not accepted the session — offline at launch", async () => {
    (useConvexAuth as jest.Mock).mockReturnValue({ isLoading: false, isAuthenticated: false });
    (useMutation as jest.Mock).mockReturnValue(jest.fn(async () => undefined));

    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;

    expect(result.getPathname()).not.toBe("/sign-in");
    expect(screen.queryByRole("button", { name: "Continue with Apple" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Record" })).toBeNull();
  });

  test("should wait, not render sign-in, while Clerk itself is still loading", async () => {
    (useAuth as jest.Mock).mockReturnValue({ isLoaded: false, isSignedIn: undefined, userId: undefined });
    (useConvexAuth as jest.Mock).mockReturnValue({ isLoading: true, isAuthenticated: false });

    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;

    expect(result.getPathname()).not.toBe("/sign-in");
    expect(screen.queryByRole("button", { name: "Record" })).toBeNull();
  });

  test("should offer sign-out once the connecting screen gives up, so a session the server never accepts is not a dead end", async () => {
    jest.useFakeTimers();
    try {
      const signOut = signedIn();
      (useConvexAuth as jest.Mock).mockReturnValue({ isLoading: false, isAuthenticated: false });

      const result = renderRouter("src/app", { initialUrl: "/" });
      await result;
      await act(async () => {
        jest.advanceTimersByTime(20_000);
      });
      await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

      expect(signOut).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test("should keep the screens up when the server drops a session it already accepted — offline mid-use", async () => {
    (useMutation as jest.Mock).mockReturnValue(jest.fn(async () => undefined));
    // A shared store, so the layout re-renders when the test changes what
    // Convex reports — the way the real hook does when a token refresh fails.
    let convex = { isLoading: false, isAuthenticated: true };
    const listeners = new Set<() => void>();
    (useConvexAuth as jest.Mock).mockImplementation(() =>
      React.useSyncExternalStore(
        (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        () => convex,
      ),
    );

    const result = renderRouter("src/app", { initialUrl: "/search" });
    await result;
    await fireEvent.changeText(screen.getByPlaceholderText("Who are you thinking of?"), "who knows clint");

    // Convex's token refresh failing offline reports exactly this.
    await act(async () => {
      convex = { isLoading: false, isAuthenticated: false };
      listeners.forEach((listener) => listener());
    });

    await waitFor(() => expect(result.getPathname()).toBe("/search"));
    expect(screen.getByPlaceholderText("Who are you thinking of?").props.value).toBe("who knows clint");
  });

  test("should land on sign-in, not bounce between the gates, in the moment Clerk has signed out and Convex has not caught up", async () => {
    signedOut();
    (useConvexAuth as jest.Mock).mockReturnValue({ isLoading: false, isAuthenticated: true });
    (useMutation as jest.Mock).mockReturnValue(jest.fn(async () => undefined));

    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;

    expect(result.getPathname()).toBe("/sign-in");
    expect(screen.getByRole("button", { name: "Continue with Apple" })).toBeTruthy();
  });

  function connection(state: { isWebSocketConnected: boolean; hasEverConnected: boolean; connectionRetries: number }) {
    (useConvexConnectionState as jest.Mock).mockReturnValue({
      hasInflightRequests: false,
      timeOfOldestInflightRequest: null,
      connectionCount: 0,
      inflightMutations: 0,
      inflightActions: 0,
      ...state,
    });
  }

  test("should let a signed-in person in when Andy is opened with no connection at all", async () => {
    // Clerk's saved session, no server to ask: the first attempt to connect failed.
    (useConvexAuth as jest.Mock).mockReturnValue({ isLoading: true, isAuthenticated: false });
    (useMutation as jest.Mock).mockReturnValue(jest.fn(async () => undefined));
    connection({ isWebSocketConnected: false, hasEverConnected: false, connectionRetries: 1 });
    try {
      await renderRouter("src/app", { initialUrl: "/" });

      expect(screen.getByRole("button", { name: "Record" })).toBeTruthy();
    } finally {
      connection({ isWebSocketConnected: true, hasEverConnected: true, connectionRetries: 0 });
    }
  });

  test("should still wait, not let anyone in, in the first moment of an ordinary launch", async () => {
    // Not connected *yet*, and nothing has failed: that is starting, not offline.
    (useConvexAuth as jest.Mock).mockReturnValue({ isLoading: true, isAuthenticated: false });
    connection({ isWebSocketConnected: false, hasEverConnected: false, connectionRetries: 0 });
    try {
      await renderRouter("src/app", { initialUrl: "/" });

      expect(screen.queryByRole("button", { name: "Record" })).toBeNull();
    } finally {
      connection({ isWebSocketConnected: true, hasEverConnected: true, connectionRetries: 0 });
    }
  });

  test("should keep a session let in offline on screen while the server confirms it after the connection returns — and not forever", async () => {
    jest.useFakeTimers();
    (useConvexAuth as jest.Mock).mockReturnValue({ isLoading: false, isAuthenticated: false });
    (useMutation as jest.Mock).mockReturnValue(jest.fn(async () => undefined));
    // A shared store, so the gate re-renders when the connection changes.
    let state = { isWebSocketConnected: false, hasEverConnected: false, connectionRetries: 1 };
    const listeners = new Set<() => void>();
    (useConvexConnectionState as jest.Mock).mockImplementation(() =>
      React.useSyncExternalStore(
        (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        () => state,
      ),
    );
    try {
      await renderRouter("src/app", { initialUrl: "/" });
      expect(screen.getByRole("button", { name: "Record" })).toBeTruthy();

      // The socket opens a moment before the server has said yes.
      await act(async () => {
        state = { isWebSocketConnected: true, hasEverConnected: true, connectionRetries: 1 };
        listeners.forEach((listener) => listener());
      });
      expect(screen.getByRole("button", { name: "Record" })).toBeTruthy();

      // It never does: after the grace period, back to waiting (with Sign out).
      await act(async () => {
        jest.advanceTimersByTime(20_000);
      });
      expect(screen.queryByRole("button", { name: "Record" })).toBeNull();
    } finally {
      jest.useRealTimers();
      connection({ isWebSocketConnected: true, hasEverConnected: true, connectionRetries: 0 });
    }
  });
});
