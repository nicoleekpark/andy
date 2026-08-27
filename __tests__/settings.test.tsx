import { fireEvent, screen } from "@testing-library/react-native";
import { useAuth } from "@clerk/expo";
import { renderRouter } from "expo-router/testing-library";

/**
 * src/app/(app)/settings.tsx reads `signOut` off Clerk's `useAuth` and wires
 * it to the "Sign out" Pressable. `@clerk/expo`'s useAuth is mocked in
 * jest.setup.ts with a stable, resolving `signOut` jest.fn() (matching the
 * real Clerk API) so it's both callable here and assertable — the mock
 * previously had no `signOut` key at all, so this button was never actually
 * exercised by any test.
 */
describe("settings screen", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("should call signOut once when the Sign out button is pressed", async () => {
    const result = renderRouter("src/app", { initialUrl: "/settings" });
    await result;

    const signOutButton = screen.getByRole("button", { name: "Sign out" });
    await fireEvent.press(signOutButton);

    const { signOut } = (useAuth as jest.Mock)();
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
