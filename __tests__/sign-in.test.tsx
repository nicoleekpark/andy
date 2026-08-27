import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { useConvexAuth } from "convex/react";
import { useAuth } from "@clerk/expo";
import { useSignInWithApple } from "@clerk/expo/apple";
import { renderRouter } from "expo-router/testing-library";
import { STUCK_AFTER_MS } from "@/app/(auth)/sign-in";

/**
 * src/app/(auth)/sign-in.tsx wires expo-apple-authentication's button to
 * @clerk/expo/apple's useSignInWithApple(). Both are mocked in
 * jest.setup.ts (see that file for why) — every test below overrides
 * startAppleAuthenticationFlow's resolution/rejection to drive the branches
 * the screen actually has: a completed flow, a cancelled sheet, a genuine
 * failure, and a flow that resolves without a session.
 *
 * Rendered via the real (auth)/_layout route rather than the bare component
 * so useConvexAuth must be forced to signed-out first — its jest.setup.ts
 * default is signed-in, which would redirect this route to "/" before any
 * of these assertions ran.
 */
describe("sign-in screen", () => {
  beforeEach(() => {
    (useConvexAuth as jest.Mock).mockReturnValue({ isLoading: false, isAuthenticated: false });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function renderSignIn() {
    const result = renderRouter("src/app", { initialUrl: "/sign-in" });
    await result;
    return result;
  }

  test("should call startAppleAuthenticationFlow once when the button is pressed", async () => {
    const startAppleAuthenticationFlow = jest.fn(async () => ({ createdSessionId: null }));
    (useSignInWithApple as jest.Mock).mockReturnValue({ startAppleAuthenticationFlow });

    await renderSignIn();
    await fireEvent.press(screen.getByRole("button", { name: "Continue with Apple" }));

    await waitFor(() => expect(startAppleAuthenticationFlow).toHaveBeenCalledTimes(1));
  });

  test("should activate the session when the flow resolves with a created session", async () => {
    const setActive = jest.fn(async () => undefined);
    const startAppleAuthenticationFlow = jest.fn(async () => ({
      createdSessionId: "sess_123",
      setActive,
    }));
    (useSignInWithApple as jest.Mock).mockReturnValue({ startAppleAuthenticationFlow });

    await renderSignIn();
    await fireEvent.press(screen.getByRole("button", { name: "Continue with Apple" }));

    await waitFor(() => expect(setActive).toHaveBeenCalledWith({ session: "sess_123" }));
  });

  test("should show no error text when the flow resolves without a created session (the real cancel path)", async () => {
    // This is the contract Clerk's useSignInWithApple actually has: it
    // catches ERR_REQUEST_CANCELED itself and *resolves* with a null
    // session rather than rejecting. Dismissing the Apple sheet lands here.
    const startAppleAuthenticationFlow = jest.fn(async () => ({ createdSessionId: null }));
    (useSignInWithApple as jest.Mock).mockReturnValue({ startAppleAuthenticationFlow });

    await renderSignIn();
    await fireEvent.press(screen.getByRole("button", { name: "Continue with Apple" }));

    await waitFor(() => expect(startAppleAuthenticationFlow).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByText("Couldn't reach Apple. Check your connection and try again."),
    ).toBeNull();
  });

  test("should show an error message when the flow rejects with a genuine failure", async () => {
    const startAppleAuthenticationFlow = jest.fn(async () => {
      throw new Error("network down");
    });
    (useSignInWithApple as jest.Mock).mockReturnValue({ startAppleAuthenticationFlow });

    await renderSignIn();
    await fireEvent.press(screen.getByRole("button", { name: "Continue with Apple" }));

    await waitFor(() =>
      expect(
        screen.getByText("Couldn't reach Apple. Check your connection and try again."),
      ).toBeTruthy(),
    );
  });

  test("should show no error text when the flow rejects with ERR_REQUEST_CANCELED (defensive branch Clerk does not currently exercise)", async () => {
    // Clerk's current source never rejects with this code — it swallows the
    // cancel and resolves instead (see the test above, which is the live
    // path). This covers the screen's defensive catch so a future Clerk
    // version that stops swallowing the code can't regress into an error.
    const startAppleAuthenticationFlow = jest.fn(async () => {
      throw { code: "ERR_REQUEST_CANCELED" };
    });
    (useSignInWithApple as jest.Mock).mockReturnValue({ startAppleAuthenticationFlow });

    await renderSignIn();
    await fireEvent.press(screen.getByRole("button", { name: "Continue with Apple" }));

    await waitFor(() => expect(startAppleAuthenticationFlow).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByText("Couldn't reach Apple. Check your connection and try again."),
    ).toBeNull();
  });

  /**
   * The escape hatch: Clerk has a session but useConvexAuth (forced
   * signed-out in beforeEach above) never confirms it — exactly what a
   * misconfigured "convex" JWT template produces in real use. These use
   * fake timers to control STUCK_AFTER_MS without a real 6s wait; see the
   * final report for how that combination behaved against renderRouter and
   * RTL v14's async APIs.
   */
  describe("stuck-at-gate escape hatch", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test("should show neither the stuck copy nor the waiting copy when signed out", async () => {
      (useAuth as jest.Mock).mockReturnValue({
        isSignedIn: false,
        signOut: jest.fn(async () => undefined),
      });

      await renderSignIn();

      expect(screen.getByRole("button", { name: "Continue with Apple" })).toBeTruthy();
      expect(screen.queryByText("Finishing sign-in…")).toBeNull();
      expect(
        screen.queryByText(
          "You're signed in with Apple, but Andy can't reach your account. Sign out and try again.",
        ),
      ).toBeNull();
    });

    test("should show only the waiting copy when signed in before the stuck timer fires", async () => {
      (useAuth as jest.Mock).mockReturnValue({
        isSignedIn: true,
        signOut: jest.fn(async () => undefined),
      });

      await renderSignIn();

      expect(screen.getByText("Finishing sign-in…")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
      expect(
        screen.queryByText(
          "You're signed in with Apple, but Andy can't reach your account. Sign out and try again.",
        ),
      ).toBeNull();
    });

    test("should show the stuck copy and a Sign out button once the stuck timer fires", async () => {
      (useAuth as jest.Mock).mockReturnValue({
        isSignedIn: true,
        signOut: jest.fn(async () => undefined),
      });

      await renderSignIn();
      await act(async () => {
        jest.advanceTimersByTime(STUCK_AFTER_MS);
      });

      expect(
        screen.getByText(
          "You're signed in with Apple, but Andy can't reach your account. Sign out and try again.",
        ),
      ).toBeTruthy();
      expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
      expect(screen.queryByText("Finishing sign-in…")).toBeNull();
    });

    test("should call signOut once when the Sign out button is pressed after the stuck timer fires", async () => {
      const signOut = jest.fn(async () => undefined);
      (useAuth as jest.Mock).mockReturnValue({ isSignedIn: true, signOut });

      await renderSignIn();
      await act(async () => {
        jest.advanceTimersByTime(STUCK_AFTER_MS);
      });
      await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

      expect(signOut).toHaveBeenCalledTimes(1);
    });

    test("should keep showing the stuck copy and Sign out button when signOut rejects", async () => {
      const signOut = jest.fn(async () => {
        throw new Error("network down");
      });
      (useAuth as jest.Mock).mockReturnValue({ isSignedIn: true, signOut });

      await renderSignIn();
      await act(async () => {
        jest.advanceTimersByTime(STUCK_AFTER_MS);
      });
      // The handler discards the rejection itself (`.catch(() => {})`), so
      // awaiting the press is enough to let that internal catch settle — no
      // unhandled rejection should escape to fail or warn this test.
      await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

      expect(signOut).toHaveBeenCalledTimes(1);
      expect(
        screen.getByText(
          "You're signed in with Apple, but Andy can't reach your account. Sign out and try again.",
        ),
      ).toBeTruthy();
      expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
      expect(screen.queryByText("Finishing sign-in…")).toBeNull();
    });
  });
});
