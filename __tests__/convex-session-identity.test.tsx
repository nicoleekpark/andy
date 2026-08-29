import { act, render } from "@testing-library/react-native";
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
/**
 * The mocked Stack doubles as the probe for the retry context. It is the only
 * component this file renders *inside* the provider, and reaching that value is
 * the only way to press "Try again" without mounting the connecting screen and
 * waiting twenty seconds for the button to appear — which is
 * __tests__/connecting.test.tsx's job, not this file's.
 */
const mockRetryProbe: { current?: () => void } = {};

jest.mock("expo-router", () => {
  const React = require("react");
  const {
    RetryConnectionContext,
  } = require("../src/components/connecting");

  const Stack = () => {
    mockRetryProbe.current = React.useContext(RetryConnectionContext);
    return null;
  };
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

  test("should build a new Convex client when a stuck connection is retried", async () => {
    // The button on the connecting screen is only worth having if it does
    // something Convex is not already doing on its own. Its socket retries
    // itself; what does not retry is everything built once per client — the
    // connection and the Clerk token fetch behind it — so "try again" has to
    // mean a new client or it means nothing.
    (useAuth as jest.Mock).mockReturnValue(authState("user_a"));
    const result = await render(<RootLayout />);
    const beforeRetry = latestClient();

    await act(async () => {
      mockRetryProbe.current?.();
    });
    await result.rerender(<RootLayout />);

    expect(latestClient()).not.toBe(beforeRetry);
  });

  test("should keep identity in the key so a retry can never merge two users onto one client", async () => {
    // Guards the shape of the key rather than its value: appending the attempt
    // to the user id keeps both live, where replacing the id with the attempt
    // would still pass every retry test above and quietly reopen the cache leak
    // that this whole component exists to close.
    (useAuth as jest.Mock).mockReturnValue(authState("user_a"));
    const result = await render(<RootLayout />);

    await act(async () => {
      mockRetryProbe.current?.();
    });
    await result.rerender(<RootLayout />);
    const clientForUserA = latestClient();

    (useAuth as jest.Mock).mockReturnValue(authState("user_b"));
    await result.rerender(<RootLayout />);

    expect(latestClient()).not.toBe(clientForUserA);
  });

  test("should close the replaced client when identity changes", async () => {
    const closeSpy = jest.spyOn(ConvexReactClient.prototype, "close");

    (useAuth as jest.Mock).mockReturnValue(authState("user_a"));
    const result = await render(<RootLayout />);
    const clientForUserA = latestClient();

    (useAuth as jest.Mock).mockReturnValue(authState("user_b"));
    await result.rerender(<RootLayout />);

    // The close is deferred a tick in the implementation, so that Convex's own
    // auth provider can finish tearing down first — its cleanup calls
    // `clearAuth()`, which reads the client and throws once it is closed.
    // `rerender` already flushes that tick, so this asserts only *that* the
    // replaced client is closed, not *when*.
    //
    // The ordering itself is not reachable from here: jest.setup.ts replaces
    // `ConvexProviderWithClerk` with a passthrough, so the cleanup that used to
    // throw never runs in tests. It was caught by signing out in the simulator,
    // and that is still the only thing that would catch it again.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Asserted by instance rather than by call count: every test in this file
    // leaves a deferred close pending, and they land here once timers run.
    // What matters is that *this* client was the one closed.
    expect(closeSpy.mock.instances).toContain(clientForUserA);

    closeSpy.mockRestore();
  });
});
