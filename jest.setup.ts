/**
 * Runs once per test file, before that file's imports execute (Jest's
 * setupFilesAfterEnv timing). This is the earliest point at which we can
 * both set env vars that src/app/_layout.tsx reads at module scope, and
 * register mocks for the auth/backend provider packages it imports, so that
 * by the time expo-router dynamically requires _layout.tsx, everything it
 * needs is already in place.
 *
 * Jest does not load .env.local the way Metro does, so the two
 * EXPO_PUBLIC_* vars _layout.tsx requires must be supplied here with
 * obviously-fake values. These never contact real Clerk/Convex services.
 */
process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY =
  "pk_test_ZmFrZS1jbGVyay1wdWJsaXNoYWJsZS1rZXktZm9yLXRlc3Rz";
process.env.EXPO_PUBLIC_CONVEX_URL = "https://example.convex.cloud";

/**
 * ClerkProvider and useAuth are mocked so mounting the route tree never
 * talks to Clerk. ClerkProvider is a passthrough that renders its children
 * inside a testID'd wrapper so tests can assert on nesting order.
 */
jest.mock("@clerk/expo", () => {
  const React = require("react");
  const { View } = require("react-native");

  const useAuth = jest.fn(() => ({
    isLoaded: true,
    isSignedIn: false,
    getToken: jest.fn(async () => null),
    orgId: undefined,
    orgRole: undefined,
    sessionId: undefined,
    sessionClaims: undefined,
  }));

  const ClerkProvider = jest.fn(({ children }: { children: React.ReactNode }) =>
    React.createElement(View, { testID: "mock-clerk-provider" }, children),
  );

  return { ClerkProvider, useAuth };
});

jest.mock("@clerk/expo/token-cache", () => ({
  tokenCache: {
    getToken: jest.fn(async () => null),
    saveToken: jest.fn(async () => undefined),
  },
}));

/**
 * ConvexProviderWithClerk is mocked because mounting the real one calls
 * client.setAuth() in a useEffect, which lazily opens a WebSocket via
 * ConvexReactClient's `sync` getter (confirmed in
 * node_modules/convex/dist/esm/react/client.js) — a real network attempt we
 * don't want in tests. ConvexReactClient itself is left unmocked: its
 * constructor only validates/stores the address and never touches the
 * network, so `new ConvexReactClient(convexUrl)` in _layout.tsx is safe to
 * run for real.
 */
jest.mock("convex/react-clerk", () => {
  const React = require("react");
  const { View } = require("react-native");

  const ConvexProviderWithClerk = jest.fn(
    ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, { testID: "mock-convex-provider-with-clerk" }, children),
  );

  return { ConvexProviderWithClerk };
});
