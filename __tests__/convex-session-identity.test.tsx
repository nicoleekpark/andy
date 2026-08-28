import { render } from "@testing-library/react-native";
import { useAuth } from "@clerk/expo";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import RootLayout from "../src/app/_layout";

/**
 * Covers ConvexSession/ConvexScopedToIdentity in src/app/_layout.tsx: one
 * Convex client (and the query cache it owns) must never be shared between
 * two identities, or the second person to sign in on the device sees the
 * first person's cached query results before any request leaves the device
 * (see that file's comment for the mechanism — Convex's cache key carries no
 * notion of who asked).
 *
 * `Stack`/`Stack.Screen` are mocked locally, in this file only, as
 * no-op components. The real ones need a full expo-router navigation
 * context (LinkPreviewContextProvider, NavigationContainer, ...) that only
 * `<ExpoRoot>` sets up, and `<ExpoRoot>` turns out to be unusable for this:
 * its `useStore` recomputes `rootComponent` from scratch on *every* render
 * (node_modules/expo-router/build/global-state/useStore.js has no
 * memoization), so a component below it looks like a different component
 * type on every re-render and gets fully unmounted and remounted regardless
 * of any `key` — which silently remounted ConvexSession even for an
 * unchanged userId and made a "same user, stable client" test fail for the
 * wrong reason. Route rendering itself is exercised elsewhere
 * (app-routes.test.tsx, auth-gate.test.tsx); this file is only about the
 * identity-to-client wiring that sits above the route tree, so a no-op
 * Stack is enough context to reach it.
 *
 * Rendering `RootLayout` directly (not through `renderRouter`) is what makes
 * a same-tree *re-render* possible at all: two separate `renderRouter` calls
 * would always produce two independent Convex clients, passing even with
 * `key={userId}` deleted from ConvexScopedToIdentity.
 *
 * Identity is driven by mockReturnValue-ing @clerk/expo's `useAuth` mock
 * (jest.setup.ts) between a render and its rerender; `ConvexProviderWithClerk`
 * is mocked as a jest.fn() there too, so the client it was actually given is
 * readable off its mock.calls.
 */
jest.mock("expo-router", () => {
  const Stack = () => null;
  Stack.Screen = () => null;
  return { Stack };
});

describe("Convex client scoped to identity", () => {
  function authState(userId: string | undefined) {
    return {
      isLoaded: true,
      isSignedIn: userId !== undefined,
      userId,
      getToken: jest.fn(async () => null),
      signOut: jest.fn(async () => undefined),
      orgId: undefined,
      orgRole: undefined,
      sessionId: undefined,
      sessionClaims: undefined,
    };
  }

  function latestClient(): ConvexReactClient {
    const calls = (ConvexProviderWithClerk as jest.Mock).mock.calls;
    return calls[calls.length - 1][0].client;
  }

  afterEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue(authState(undefined));
  });

  test("should build a different Convex client when a different user signs in", async () => {
    (useAuth as jest.Mock).mockReturnValue(authState("user_a"));
    const result = await render(<RootLayout />);
    const clientForUserA = latestClient();

    (useAuth as jest.Mock).mockReturnValue(authState("user_b"));
    await result.rerender(<RootLayout />);
    const clientForUserB = latestClient();

    expect(clientForUserB).not.toBe(clientForUserA);
  });

  test("should replace the client when the same device signs out", async () => {
    (useAuth as jest.Mock).mockReturnValue(authState("user_a"));
    const result = await render(<RootLayout />);
    const signedInClient = latestClient();

    (useAuth as jest.Mock).mockReturnValue(authState(undefined));
    await result.rerender(<RootLayout />);
    const signedOutClient = latestClient();

    expect(signedOutClient).not.toBe(signedInClient);
  });

  test("should keep the same Convex client across a re-render for the same user", async () => {
    (useAuth as jest.Mock).mockReturnValue(authState("user_a"));
    const result = await render(<RootLayout />);
    const firstRenderClient = latestClient();

    await result.rerender(<RootLayout />);
    const secondRenderClient = latestClient();

    expect(secondRenderClient).toBe(firstRenderClient);
  });

  test("should close the replaced client when identity changes", async () => {
    const closeSpy = jest.spyOn(ConvexReactClient.prototype, "close");

    (useAuth as jest.Mock).mockReturnValue(authState("user_a"));
    const result = await render(<RootLayout />);
    const clientForUserA = latestClient();

    (useAuth as jest.Mock).mockReturnValue(authState("user_b"));
    await result.rerender(<RootLayout />);

    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy.mock.instances[0]).toBe(clientForUserA);

    closeSpy.mockRestore();
  });
});
