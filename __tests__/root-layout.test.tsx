import { screen, within } from "@testing-library/react-native";
import { ClerkProvider, useAuth } from "@clerk/expo";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useFonts } from "expo-font";
import { renderRouter } from "expo-router/testing-library";

/**
 * src/app/_layout.tsx wires ClerkProvider and ConvexProviderWithClerk around
 * the route tree. @clerk/expo, @clerk/expo/token-cache, and
 * convex/react-clerk are mocked in jest.setup.ts so nothing here reaches a
 * real Clerk or Convex service.
 *
 * `useFonts` is mocked in this file rather than in jest.setup.ts: only these
 * tests care what it returns, and a global mock would hide the branch where a
 * typeface fails to load. It cannot be spied on in place — expo-font's exports
 * are not configurable — so the module is replaced.
 *
 * What's worth catching: ClerkProvider must be an ancestor of
 * ConvexProviderWithClerk (Convex needs Clerk's session readable before it
 * asks for a token), and ConvexProviderWithClerk must receive Clerk's own
 * useAuth hook plus a Convex client, not stand-ins.
 */
jest.mock("expo-font", () => ({ useFonts: jest.fn() }));

describe("root layout provider wiring", () => {
  beforeEach(() => {
    // Loaded, which is what every test but the two at the bottom assumes.
    (useFonts as jest.Mock).mockReturnValue([true, null]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("should render ClerkProvider as an ancestor of ConvexProviderWithClerk", async () => {
    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;

    const clerkProvider = screen.getByTestId("mock-clerk-provider");

    expect(within(clerkProvider).getByTestId("mock-convex-provider-with-clerk")).toBeTruthy();
  });

  test("should pass Clerk's useAuth hook and a Convex client to ConvexProviderWithClerk", async () => {
    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;

    expect(ConvexProviderWithClerk).toHaveBeenCalledTimes(1);
    const props = (ConvexProviderWithClerk as jest.Mock).mock.calls[0][0];

    expect(props.useAuth).toBe(useAuth);
    expect(props.client.url).toBe(process.env.EXPO_PUBLIC_CONVEX_URL);
  });

  test("should pass the publishable key and token cache from env to ClerkProvider", async () => {
    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;

    expect(ClerkProvider).toHaveBeenCalledTimes(1);
    const props = (ClerkProvider as jest.Mock).mock.calls[0][0];

    expect(props.publishableKey).toBe(process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY);
    expect(props.tokenCache).toBeDefined();
  });

  test("should render the app anyway when a typeface fails to load", async () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: "user_a",
      getToken: jest.fn(async () => null),
      signOut: jest.fn(async () => undefined),
    });
    (useFonts as jest.Mock).mockReturnValue([false, new Error("no such font")]);

    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;

    // Gating on `loaded` alone would hold the splash forever over a working
    // app — a whole screen lost to a typeface. The platform face is worse
    // looking and entirely usable.
    expect(screen.getByTestId("mock-convex-provider-with-clerk")).toBeTruthy();
  });

  test("should hold the app back until the typefaces are in", async () => {
    (useFonts as jest.Mock).mockReturnValue([false, null]);

    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;

    // Rendering first and swapping the font in a moment later reflows every
    // name and date on every cold start.
    expect(screen.queryByTestId("mock-convex-provider-with-clerk")).toBeNull();
  });
});
