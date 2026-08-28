import { screen, waitFor } from "@testing-library/react-native";
import { useConvexAuth, useMutation } from "convex/react";
import { renderRouter } from "expo-router/testing-library";

/**
 * src/app/(app)/_layout.tsx and src/app/(auth)/_layout.tsx both key off
 * Convex's own auth state (useConvexAuth), not Clerk's, and (app) also fires
 * `ensureUser` once auth resolves to signed-in. `useConvexAuth` and
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
describe("auth gate", () => {
  test("should not render profile content and should land on /sign-in when signed out", async () => {
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
});
