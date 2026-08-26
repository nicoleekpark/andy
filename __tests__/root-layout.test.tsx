import { screen, within } from "@testing-library/react-native";
import { ClerkProvider, useAuth } from "@clerk/expo";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { renderRouter } from "expo-router/testing-library";

/**
 * src/app/_layout.tsx wires ClerkProvider and ConvexProviderWithClerk around
 * the route tree. @clerk/expo, @clerk/expo/token-cache, and
 * convex/react-clerk are mocked in jest.setup.ts so nothing here reaches a
 * real Clerk or Convex service.
 *
 * What's worth catching: ClerkProvider must be an ancestor of
 * ConvexProviderWithClerk (Convex needs Clerk's session readable before it
 * asks for a token), and ConvexProviderWithClerk must receive Clerk's own
 * useAuth hook plus a Convex client, not stand-ins.
 */
describe("root layout provider wiring", () => {
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
});
