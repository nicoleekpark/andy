import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { useAuth } from "@clerk/expo";
import { useAction } from "convex/react";
import { ConvexError } from "convex/values";

import { renderRouter } from "expo-router/testing-library";
import { Alert } from "react-native";
import { api } from "@convex/_generated/api";
import { answerByName, nameOf, quietCall } from "../test-support/convex-mocks";

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
    jest.restoreAllMocks();
  });

  test("should call signOut once when the Sign out button is pressed", async () => {
    const result = renderRouter("src/app", { initialUrl: "/settings" });
    await result;

    const signOutButton = screen.getByRole("button", { name: "Sign out" });
    await fireEvent.press(signOutButton);

    const { signOut } = (useAuth as jest.Mock)();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Deleting the account (App Store Guideline 5.1.1(v))
  // -------------------------------------------------------------------------

  /** Pinned to the account action by name, so a rewire can't pass by accident. */
  function mockDelete(impl: () => Promise<null>) {
    const deleteMyAccount = jest.fn(impl);
    answerByName(useAction, { [nameOf(api.account.deleteMyAccount)]: deleteMyAccount }, quietCall);
    return deleteMyAccount;
  }

  /** Presses the dialog's button called `choice`, once it has been raised. */
  function answer(choice: string) {
    return jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === choice)?.onPress?.();
    });
  }

  test("should delete the account and sign out, but only once it is confirmed", async () => {
    const deleteMyAccount = mockDelete(async () => null);
    const alert = answer("Delete account");
    await renderRouter("src/app", { initialUrl: "/settings" });

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Delete account" }));
    });

    // It says what goes before anything goes.
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0]?.[1]).toMatch(/every note and every photo/);
    await waitFor(() => expect(deleteMyAccount).toHaveBeenCalledTimes(1));
    const { signOut } = (useAuth as jest.Mock)();
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
  });

  test("should delete nothing when the question is cancelled", async () => {
    const deleteMyAccount = mockDelete(async () => null);
    answer("Cancel");
    await renderRouter("src/app", { initialUrl: "/settings" });

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Delete account" }));
    });

    expect(deleteMyAccount).not.toHaveBeenCalled();
    const { signOut } = (useAuth as jest.Mock)();
    expect(signOut).not.toHaveBeenCalled();
  });

  test("should stay signed in and say why when deleting fails", async () => {
    mockDelete(async () => {
      throw new ConvexError("Andy can't delete accounts right now. Nothing was deleted. Try again shortly.");
    });
    answer("Delete account");
    await renderRouter("src/app", { initialUrl: "/settings" });

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Delete account" }));
    });

    await waitFor(() => expect(screen.getByText(/Nothing was deleted/)).toBeTruthy());
    const { signOut } = (useAuth as jest.Mock)();
    expect(signOut).not.toHaveBeenCalled();
    // And the button is back, to try again.
    expect(screen.getByRole("button", { name: "Delete account" })).toBeTruthy();
  });

  test("should not promise a contacts feature the app does not have", async () => {
    await renderRouter("src/app", { initialUrl: "/settings" });
    expect(screen.queryByText(/contacts/i)).toBeNull();
  });
});