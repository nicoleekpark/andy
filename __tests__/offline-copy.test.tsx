import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { useAuth } from "@clerk/expo";
import { useConvexConnectionState, useQuery } from "convex/react";
import { renderRouter } from "expo-router/testing-library";
import { answerByName } from "../test-support/convex-mocks";
import { loadOfflineCopy, type OfflineCopy } from "../src/lib/offline-copy";
import type { PhoneStore } from "../src/lib/on-phone";

/**
 * The copy of everyone and every note kept on the phone, and the screens that
 * read it with no connection (`src/lib/offline-copy.tsx`; decided 2026-10-07).
 * "On disk" is jest.setup.ts's in-memory `expo-file-system`.
 */

const files = () =>
  (jest.requireMock("expo-file-system") as { __files: Map<string, string> }).__files;
const COPY = "file:///documents/offline-copy/copy.json";
const TAKEN_AT = new Date(2026, 9, 7, 15, 40).getTime();

const nina = {
  _id: "p-nina",
  _creationTime: 1,
  userId: "u1",
  name: "Nina",
  entityType: "person",
  tags: ["climbing"],
  autoCreated: false,
};
const rowan = { ...nina, _id: "p-rowan", name: "Rowan", tags: [] };
const ninaNote = {
  _id: "n-1",
  _creationTime: 2,
  userId: "u1",
  profileId: "p-nina",
  text: "Nina fosters two greyhounds; Rowan helps on weekends.",
  keyFacts: ["Fosters two greyhounds"],
  source: "manual",
  createdAt: TAKEN_AT - 86_400_000,
};
const rowanLink = {
  _id: "m-1",
  _creationTime: 3,
  userId: "u1",
  noteId: "n-1",
  profileId: "p-rowan",
  name: "Rowan",
  quote: "Rowan helps on weekends",
};

function copyFor(ownerId: string): OfflineCopy {
  return {
    ownerId,
    takenAt: TAKEN_AT,
    profiles: [nina, rowan],
    notes: [ninaNote],
    links: [rowanLink],
  } as unknown as OfflineCopy;
}

function onDisk(copy: OfflineCopy) {
  files().set(COPY, JSON.stringify(copy));
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
  online(true);
  (useQuery as jest.Mock).mockImplementation(() => undefined);
});

describe("offline copy store", () => {
  function memory(contents: string | null): PhoneStore & { contents: string | null } {
    const store = {
      contents,
      read: () => store.contents,
      write: (next: string) => {
        store.contents = next;
      },
      setAside: () => {},
      remove: () => {
        store.contents = null;
      },
    };
    return store;
  }

  test("should give an account only its own copy, and remove anyone else's", () => {
    const store = memory(JSON.stringify(copyFor("someone-else")));

    expect(loadOfflineCopy(store, "me")).toBeNull();
    expect(store.contents).toBeNull();
    expect(loadOfflineCopy(memory(JSON.stringify(copyFor("me"))), "me")?.profiles).toHaveLength(2);
  });

  test("should read a damaged copy as none, never throwing", () => {
    expect(loadOfflineCopy(memory("{half"), "me")).toBeNull();
    expect(loadOfflineCopy(memory(JSON.stringify({ ownerId: "me" })), "me")).toBeNull();
  });
});

describe("reading offline", () => {
  test("should keep the server's latest copy on the phone while online", async () => {
    const { ownerId: _o, ...fresh } = copyFor("user_default");
    answerByName(useQuery, { "offline:snapshot": fresh });

    await renderRouter("src/app", { initialUrl: "/" });

    await waitFor(() => expect(files().has(COPY)).toBe(true));
    expect(JSON.parse(files().get(COPY)!)).toEqual(copyFor("user_default"));
  });

  test("should show everyone on home from the phone's copy when offline, and say how fresh it is", async () => {
    onDisk(copyFor("user_default"));
    online(false);

    await renderRouter("src/app", { initialUrl: "/" });

    expect(screen.getByText("Nina")).toBeTruthy();
    expect(screen.getByText(/Offline — showing what Andy had at/)).toBeTruthy();
  });

  test("should not say anything about a copy while the screen is live", async () => {
    onDisk(copyFor("user_default"));
    answerByName(useQuery, { "profiles:people": [] });

    await renderRouter("src/app", { initialUrl: "/" });

    expect(screen.queryByTestId("offline-copy-line")).toBeNull();
  });

  test("should open someone's page offline, with what they told you and who came up", async () => {
    onDisk(copyFor("user_default"));
    online(false);

    await renderRouter("src/app", { initialUrl: "/profile/p-nina" });

    expect(screen.getAllByText("Nina").length).toBeGreaterThan(0);
    expect(screen.getByText("Fosters two greyhounds")).toBeTruthy();
    expect(screen.getByTestId("offline-copy-line")).toBeTruthy();
    // Drafting is a Claude call: a line, not a button that would wait forever.
    expect(screen.getByText("Drafting a follow-up needs a connection.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Draft a follow-up" })).toBeNull();
  });

  test("should open a note offline", async () => {
    onDisk(copyFor("user_default"));
    online(false);

    await renderRouter("src/app", { initialUrl: "/note/n-1" });

    expect(screen.getByText(/Nina fosters two greyhounds/)).toBeTruthy();
    expect(screen.getByTestId("offline-copy-line")).toBeTruthy();
  });

  test("should find someone by name offline, but say asking in your own words needs a connection", async () => {
    jest.useFakeTimers();
    try {
      onDisk(copyFor("user_default"));
      online(false);

      await renderRouter("src/app", { initialUrl: "/search" });
      await act(async () => {
        fireEvent.changeText(screen.getByLabelText("Ask Andy"), "row");
      });
      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });

      expect(screen.getByRole("button", { name: "Open Rowan" })).toBeTruthy();
      expect(screen.getByTestId("ask-offline-hint")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Ask" }).props.accessibilityState).toEqual(
        expect.objectContaining({ disabled: true }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  test("should forget the copy with everything else on a sign-out the person chose", async () => {
    onDisk(copyFor("user_default"));
    const signOut = jest.fn(async () => undefined);
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: "user_default",
      getToken: jest.fn(async () => null),
      signOut,
    });

    await renderRouter("src/app", { initialUrl: "/settings" });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
    });

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(files().has(COPY)).toBe(false);
  });

  test("should know who a note is for when recording from someone's page offline", async () => {
    onDisk(copyFor("user_default"));
    online(false);

    await renderRouter("src/app", { initialUrl: "/profile/p-nina/capture" });

    expect(screen.getByText("Tap record. This note goes to Nina, whoever else comes up.")).toBeTruthy();
  });
});
