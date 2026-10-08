import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { useAuth } from "@clerk/expo";
import { useAction, useConvexAuth, useConvexConnectionState } from "convex/react";
import { renderRouter } from "expo-router/testing-library";
import { fileStore, loadOutbox, type OutboxNote, type OutboxStore } from "../src/lib/outbox";
import { answerDialog } from "../test-support/dialog";

/**
 * Notes kept on this phone while offline (`src/lib/outbox.tsx`): what is kept,
 * who sees it, and that it goes when its owner signs out. "On disk" is
 * jest.setup.ts's in-memory `expo-file-system`, emptied before every test.
 */

const files = () =>
  (jest.requireMock("expo-file-system") as { __files: Map<string, string> }).__files;
const OUTBOX = "file:///documents/outbox/notes.json";

function note(ownerId: string, text: string): OutboxNote {
  return { id: `${ownerId}-${text}`, ownerId, keptAt: 1, today: "2026-10-07", text, kind: "typed" };
}

function memory(initial: string | null): OutboxStore & { contents: string | null; aside: string[] } {
  const store = {
    contents: initial,
    aside: [] as string[],
    read: () => store.contents,
    write: (next: string) => {
      store.contents = next;
    },
    setAside: () => {
      if (store.contents !== null) store.aside.push(store.contents);
      store.contents = null;
    },
    remove: () => {
      store.contents = null;
      store.aside = [];
    },
  };
  return store;
}

function signedInAs(userId: string | undefined, signOut = jest.fn(async () => undefined)) {
  (useAuth as jest.Mock).mockReturnValue({
    isLoaded: true,
    isSignedIn: userId !== undefined,
    userId,
    getToken: jest.fn(async () => null),
    signOut,
  });
  return signOut;
}

function online(isWebSocketConnected: boolean) {
  (useConvexConnectionState as jest.Mock).mockReturnValue({
    hasInflightRequests: false,
    isWebSocketConnected,
    timeOfOldestInflightRequest: null,
    hasEverConnected: true,
    connectionCount: 1,
    connectionRetries: 0,
    inflightMutations: 0,
    inflightActions: 0,
  });
}

afterEach(() => {
  jest.restoreAllMocks();
  signedInAs("user_default");
  online(true);
  (useAction as jest.Mock).mockReturnValue(jest.fn(async () => undefined));
});

describe("outbox store", () => {
  test("should give each account only its own notes, and remove anyone else's from the phone", () => {
    const store = memory(JSON.stringify([note("me", "mine"), note("someone-else", "theirs")]));

    expect(loadOutbox(store, "me").map((n) => n.text)).toEqual(["mine"]);
    expect(JSON.parse(store.contents!)).toEqual([note("me", "mine")]);
  });

  test("should remove the file outright when nothing in it is this account's", () => {
    const store = memory(JSON.stringify([note("someone-else", "theirs")]));

    expect(loadOutbox(store, "me")).toEqual([]);
    expect(store.contents).toBeNull();
  });

  test("should set a damaged file aside, never overwrite it", () => {
    const store = memory("{not json");

    expect(loadOutbox(store, "me")).toEqual([]);
    // Kept, out of the way: the next note must not land on top of it.
    expect(store.aside).toEqual(["{not json"]);
    expect(store.contents).toBeNull();
  });

  test("should not take the app down when cleaning up the file fails", () => {
    const store = memory(JSON.stringify([note("me", "mine"), note("someone-else", "theirs")]));
    store.write = () => {
      throw new Error("disk full");
    };

    expect(loadOutbox(store, "me").map((n) => n.text)).toEqual(["mine"]);
  });
});

describe("outbox file", () => {
  const fs = () => files();

  test("should write whole or not at all — a write cut off between its two steps still reads back", () => {
    const store = fileStore();
    store.write(JSON.stringify([note("me", "first")]));
    // Killed after the new contents were written aside but before the swap.
    fs().set("file:///documents/outbox/notes.next.json", JSON.stringify([note("me", "first"), note("me", "second")]));
    fs().delete(OUTBOX);

    expect(loadOutbox(store, "me").map((n) => n.text)).toEqual(["first", "second"]);
  });

  test("should keep a damaged file's bytes when the next note is kept", () => {
    const store = fileStore();
    fs().set(OUTBOX, "{half a fi");

    expect(loadOutbox(store, "me")).toEqual([]);
    store.write(JSON.stringify([note("me", "new")]));

    expect(JSON.parse(fs().get(OUTBOX)!)).toEqual([note("me", "new")]);
    expect([...fs().values()]).toContain("{half a fi");
  });

  test("should remove everything, set-aside files included, when forgotten", () => {
    const store = fileStore();
    fs().set(OUTBOX, "{half a fi");
    loadOutbox(store, "me");
    store.write(JSON.stringify([note("me", "new")]));

    store.remove();

    expect(fs().size).toBe(0);
  });
});

describe("outbox in the app", () => {
  test("should say on home how many notes are waiting, offline", async () => {
    files().set(OUTBOX, JSON.stringify([note("user_default", "one"), note("user_default", "two")]));
    online(false);

    await renderRouter("src/app", { initialUrl: "/" });

    expect(screen.getByText("2 notes kept on this phone, waiting for Andy to read them.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Read the first now/ })).toBeNull();
  });

  test("should open the oldest waiting note to be read, once online", async () => {
    // Only where the tap leads is under test; the reading it starts never ends.
    (useAction as jest.Mock).mockReturnValue(jest.fn(() => new Promise(() => {})));
    files().set(OUTBOX, JSON.stringify([note("user_default", "one"), note("user_default", "two")]));

    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: /2 notes kept on this phone\. Read the first now/ }));
    });

    expect(result.getPathname()).toBe("/capture");
    expect(result.getSearchParams()).toEqual({ outbox: "user_default-one" });
  });

  test("should open a waiting note recorded on someone's page from that page", async () => {
    // Only where the tap leads is under test; the reading it starts never ends.
    (useAction as jest.Mock).mockReturnValue(jest.fn(() => new Promise(() => {})));
    files().set(OUTBOX, JSON.stringify([{ ...note("user_default", "one"), aboutProfileId: "contact-1" }]));

    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: /Read it now/ }));
    });

    expect(result.getPathname()).toBe("/profile/contact-1/capture");
  });

  test("should not show another account's waiting notes, and should remove them", async () => {
    files().set(OUTBOX, JSON.stringify([note("someone-else", "theirs")]));

    await renderRouter("src/app", { initialUrl: "/" });

    expect(screen.queryByTestId("outbox-line")).toBeNull();
    expect(files().has(OUTBOX)).toBe(false);
  });

  test("should keep the notes when the session merely ends (expired, revoked) — only a chosen sign-out forgets them", async () => {
    files().set(OUTBOX, JSON.stringify([note("user_default", "one")]));
    signedInAs(undefined);

    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;

    await waitFor(() => expect(result.getPathname()).toBe("/sign-in"));
    expect(files().has(OUTBOX)).toBe(true);
  });

  test("should forget the notes kept on this phone when its owner chooses to sign out", async () => {
    files().set(OUTBOX, JSON.stringify([note("user_default", "one")]));
    const signOut = signedInAs("user_default");
    jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
      buttons?.find((b) => b.text === "Sign out")?.onPress?.();
    });

    await renderRouter("src/app", { initialUrl: "/settings" });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
    });

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(files().has(OUTBOX)).toBe(false);
  });

  test("should ask before signing out while notes are still waiting", async () => {
    files().set(OUTBOX, JSON.stringify([note("user_default", "one")]));
    const signOut = signedInAs("user_default");
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});

    await renderRouter("src/app", { initialUrl: "/settings" });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
    });

    expect(signOut).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(
      "Sign out?",
      "This phone has 1 note Andy hasn't read yet. Signing out deletes it.",
      expect.any(Array),
    );
  });

  test("should sign straight out when nothing is waiting", async () => {
    const signOut = signedInAs("user_default");
    const alert = jest.spyOn(Alert, "alert");

    await renderRouter("src/app", { initialUrl: "/settings" });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
    });

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();
  });

  test("should forget the notes when signing out from the connecting screen", async () => {
    jest.useFakeTimers();
    try {
      files().set(OUTBOX, JSON.stringify([note("user_default", "one")]));
      const signOut = signedInAs("user_default");
      (useConvexAuth as jest.Mock).mockReturnValue({ isLoading: false, isAuthenticated: false });

      await renderRouter("src/app", { initialUrl: "/" });
      await act(async () => {
        jest.advanceTimersByTime(20_000);
      });
      await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

      expect(signOut).toHaveBeenCalledTimes(1);
      expect(files().has(OUTBOX)).toBe(false);
    } finally {
      (useConvexAuth as jest.Mock).mockReturnValue({ isLoading: false, isAuthenticated: true });
      jest.useRealTimers();
    }
  });

  test("should forget the notes when the account is deleted", async () => {
    files().set(OUTBOX, JSON.stringify([note("user_default", "one")]));
    const signOut = signedInAs("user_default");
    (useAction as jest.Mock).mockReturnValue(jest.fn(async () => undefined));

    await renderRouter("src/app", { initialUrl: "/settings" });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Delete account" }));
    });
    await answerDialog("Delete account");

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(files().has(OUTBOX)).toBe(false);
  });
});
