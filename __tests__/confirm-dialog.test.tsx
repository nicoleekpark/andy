import React from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { useAuth } from "@clerk/expo";
import { useAction, useConvexAuth, useMutation } from "convex/react";
import { router } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import { type LockState, useAppLock } from "../src/lib/use-app-lock";
import { answerDialog } from "../test-support/dialog";

/**
 * `confirm-dialog.tsx`: Andy's own confirmation, drawn inside what the app lock
 * covers. The native `Alert.alert` it replaces sat above "Andy is locked." with
 * its question and its buttons showing (device QA build 4 #51) — so the point
 * of these tests is where the dialog lives relative to the lock.
 */
jest.mock("../src/lib/use-app-lock", () => ({ useAppLock: jest.fn() }));

let phase: LockState = { phase: "unlocked" };
const listeners = new Set<() => void>();
function setPhase(next: LockState) {
  phase = next;
  listeners.forEach((listener) => listener());
}

beforeEach(() => {
  phase = { phase: "unlocked" };
  (useAuth as jest.Mock).mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    userId: "user_a",
    getToken: jest.fn(async () => null),
    signOut: jest.fn(async () => undefined),
  });
  (useConvexAuth as jest.Mock).mockReturnValue({ isLoading: false, isAuthenticated: true });
  (useMutation as jest.Mock).mockReturnValue(jest.fn(async () => undefined));
  (useAction as jest.Mock).mockReturnValue(jest.fn(async () => null));
  // The phase this test changes after the first render, as the real hook does
  // when the app goes to the background and comes back.
  (useAppLock as jest.Mock).mockImplementation(() => {
    const state = React.useSyncExternalStore(
      (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      () => phase,
    );
    return { state, retry: jest.fn() };
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

async function askToDeleteTheAccount() {
  await renderRouter("src/app", { initialUrl: "/settings" });
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Delete account" }));
  });
  expect(screen.getByText("Delete your account?")).toBeTruthy();
}

test("should hide an open confirmation under the lock, and show it again after unlocking", async () => {
  await askToDeleteTheAccount();

  await act(async () => setPhase({ phase: "locked", kind: "face", authenticating: false }));
  await waitFor(() => expect(screen.getByText("Andy is locked.")).toBeTruthy());
  // Covered: neither the question nor its buttons can be read or pressed.
  expect(screen.queryByText("Delete your account?")).toBeNull();
  expect(screen.queryByTestId("confirm-dialog")).toBeNull();

  await act(async () => setPhase({ phase: "unlocked" }));
  await waitFor(() => expect(screen.queryByText("Andy is locked.")).toBeNull());
  // Still there, as it was left.
  expect(screen.getByText("Delete your account?")).toBeTruthy();
  await answerDialog("Cancel");
  expect(screen.queryByTestId("confirm-dialog")).toBeNull();
});

test("should hide it while the lock is still checking, too", async () => {
  await askToDeleteTheAccount();

  await act(async () => setPhase({ phase: "checking" }));
  expect(screen.queryByText("Delete your account?")).toBeNull();
});

test("should close a confirmation when the screen that asked it goes", async () => {
  await askToDeleteTheAccount();

  // Answering it afterwards would act for a screen that is no longer there.
  await act(async () => {
    router.replace("/");
  });
  await waitFor(() => expect(screen.queryByTestId("confirm-dialog")).toBeNull());
});
