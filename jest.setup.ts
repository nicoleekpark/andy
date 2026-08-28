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

  // Declared outside the factory so every call to useAuth() across every
  // render returns the *same* signOut mock, not a fresh jest.fn() per call —
  // otherwise a test that renders, then presses a button whose onPress
  // closes over an earlier render's signOut, could assert against a
  // different mock instance than the one actually invoked.
  const signOut = jest.fn(async () => undefined);

  const useAuth = jest.fn(() => ({
    isLoaded: true,
    isSignedIn: false,
    getToken: jest.fn(async () => null),
    signOut,
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
 * @clerk/expo/apple's useSignInWithApple is a hook, and (auth)/sign-in.tsx
 * calls it unconditionally at the top of the component — same shape of
 * problem as `useAuth` above, it throws without a real ClerkProvider
 * ancestor. Mocked as a jest.fn() (not a plain object) so individual tests
 * can `mockReturnValue` their own `startAppleAuthenticationFlow` and drive
 * it to resolve or reject differently per test; the default here only needs
 * to be safe to *render* against, since no test outside sign-in.test.tsx
 * presses the button.
 */
jest.mock("@clerk/expo/apple", () => ({
  useSignInWithApple: jest.fn(() => ({
    startAppleAuthenticationFlow: jest.fn(async () => ({ createdSessionId: null })),
  })),
}));

/**
 * expo-apple-authentication's AppleAuthenticationButton renders a native
 * ASAuthorizationAppleIDButton, which doesn't exist in the Jest/RN test
 * renderer environment. Swapped for a plain Pressable that carries the same
 * onPress contract (the real component takes `onPress` directly, not
 * `onButtonPress` — that indirection lives inside expo-apple-authentication
 * itself) and surfaces a visible label so tests can find and press it via
 * `getByRole("button", { name: ... })`, the same pattern __tests__/settings
 * uses for the sign-out button. The two enums are mocked as plain objects
 * since (auth)/sign-in.tsx only reads members off them, never calls them.
 */
jest.mock("expo-apple-authentication", () => {
  const React = require("react");
  const { Pressable, Text } = require("react-native");

  const AppleAuthenticationButtonType = { SIGN_IN: 0, CONTINUE: 1 };
  const AppleAuthenticationButtonStyle = { WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2 };

  const AppleAuthenticationButton = jest.fn(
    ({
      onPress,
      buttonType,
    }: {
      onPress: () => void;
      buttonType: number;
    }) => {
      const label =
        buttonType === AppleAuthenticationButtonType.SIGN_IN
          ? "Sign in with Apple"
          : "Continue with Apple";

      return React.createElement(
        Pressable,
        { accessibilityRole: "button", accessibilityLabel: label, onPress },
        React.createElement(Text, null, label),
      );
    },
  );

  return {
    AppleAuthenticationButtonType,
    AppleAuthenticationButtonStyle,
    AppleAuthenticationButton,
  };
});

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

/**
 * `useConvexAuth` and `useMutation` are the two `convex/react` hooks
 * (app)/_layout.tsx and (auth)/_layout.tsx read directly, and neither has
 * anything to read from without a real `ConvexProviderWithAuth` ancestor —
 * which the `convex/react-clerk` mock above deliberately doesn't provide
 * (see the comment on that mock: mounting the real provider would open a
 * WebSocket). So both hooks are mocked here, individually, as controllable
 * jest.fn()s, while everything else `convex/react` exports (ConvexProvider,
 * ConvexReactClient, useQuery, ...) stays real via requireActual — the gate
 * tests need to drive `isLoading`/`isAuthenticated` to genuinely different
 * values per test, not read a single static stub, or a test deleting the
 * gate's `<Redirect>` would never go red.
 *
 * Defaults below (`isLoading: false, isAuthenticated: true`) exist only so
 * route tests that don't care about auth — app-routes.test.tsx,
 * root-layout.test.tsx — can reach protected screens without each having to
 * set the mock up themselves. Auth-gate tests override these per test with
 * `(useConvexAuth as jest.Mock).mockReturnValue(...)`.
 *
 * The default is permissive, so treat it as a convenience for tests that are
 * not about auth, never as the state under test. Anything asserting that a
 * screen or route group is protected must set `isAuthenticated` itself — a
 * test that leans on this default renders as signed in and would stay green
 * against an unprotected screen. That matters most for a route added outside
 * (app): the gate lives in (app)/_layout.tsx and has its own tests, but
 * nothing here would notice a new group that forgot one.
 */
jest.mock("convex/react", () => {
  const actual = jest.requireActual("convex/react");

  const useConvexAuth = jest.fn(() => ({ isLoading: false, isAuthenticated: true }));
  const useMutation = jest.fn(() => jest.fn(async () => undefined));
  // `useAction` joins the two above for the same reason: the capture screen
  // calls it at the top of the component, and the real hook throws without a
  // provider that the `convex/react-clerk` mock deliberately doesn't supply.
  //
  // The default resolves to `undefined`, which is NOT a valid draft — a screen
  // that renders the review step must supply its own resolved value with
  // `mockReturnValue`. That is deliberate: a default shaped like a real draft
  // would let a test walk the whole extract → review → save path without ever
  // saying what it expected to come back.
  // Two traps for anything that needs to know *which* Convex function was
  // requested, both hit while writing __tests__/capture.test.tsx:
  //
  // 1. These are single shared mocks. `(app)/_layout.tsx` calls
  //    `useMutation(api.users.ensureUser)` on every authenticated mount, so a
  //    bare `mockReturnValue(...)` intercepts that too and the first captured
  //    call is `ensureUser({})`, not the one under test.
  // 2. `api` is a Proxy (`anyApi`) that manufactures a fresh object on every
  //    property access, so `reference === api.notes.saveCapture` is never true
  //    — not even for the same path. Compare with `getFunctionName(reference)`
  //    from `convex/server`, which resolves to a stable string
  //    ("notes:saveCapture"), and branch on that.
  const useAction = jest.fn(() => jest.fn(async () => undefined));

  return { ...actual, useConvexAuth, useMutation, useAction };
});

/**
 * expo-speech-recognition is a native module, so merely importing
 * (app)/profile/[id]/capture.tsx throws "Cannot find native module
 * 'ExpoSpeechRecognition'" under jest-expo — which broke the route tests the
 * moment that screen stopped being a placeholder.
 *
 * Every member is an individually controllable jest.fn() rather than a static
 * stub, so a test about recognition can drive its own values.
 *
 * Two warnings, both the same shape as the `useConvexAuth` note above:
 *
 * 1. `useSpeechRecognitionEvent` is a no-op here, so **no event ever fires**.
 *    A test that expects a transcript to appear on screen must supply its own
 *    implementation and invoke the listener itself; leaning on this default
 *    gives a screen that can never show anything, which is not a passing test
 *    of transcription, it is a test of nothing.
 *
 * 2. `requestPermissionsAsync` defaults to **denied**, because a default of
 *    granted would let a test walk the whole happy path without ever having
 *    said so. By the same token, a test asserting the *denied* branch must
 *    still set `granted: false` itself rather than inherit it — otherwise
 *    deleting the permission check would leave that test green.
 */
jest.mock("expo-speech-recognition", () => ({
  ExpoSpeechRecognitionModule: {
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
    requestPermissionsAsync: jest.fn(async () => ({ granted: false })),
    getPermissionsAsync: jest.fn(async () => ({ granted: false })),
    supportsOnDeviceRecognition: jest.fn(() => false),
    isRecognitionAvailable: jest.fn(() => true),
    getSupportedLocales: jest.fn(async () => ({
      locales: [],
      installedLocales: [],
    })),
  },
  useSpeechRecognitionEvent: jest.fn(),
}));

/**
 * expo-image-picker is a native module too (ExponentImagePicker, reached via
 * requireNativeModule in src/ExponentImagePicker.ts) — same failure as
 * expo-speech-recognition above: merely importing capture.tsx throws "Cannot
 * find native module 'ExponentImagePicker'" under jest-expo without this.
 *
 * Same conservative-default habit as the expo-speech-recognition mock: both
 * permission checks default to **denied**, and both launch functions default
 * to a cancelled pick (`canceled: true`, no `assets`). A default of granted +
 * an already-picked photo would let a business-card test walk the whole scan
 * → extract → review path without ever asserting the permission or picker
 * behaviour it exercises; a test for the happy path must set its own
 * `mockResolvedValueOnce` for each call it needs, same as the speech-
 * recognition tests do for `requestPermissionsAsync`.
 */
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: false })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: false })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));
