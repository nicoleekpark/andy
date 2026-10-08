import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { useConvex, useConvexConnectionState } from "convex/react";
import { renderRouter } from "expo-router/testing-library";
import { nameOf } from "../test-support/convex-mocks";
import type { OfflineCopy } from "../src/lib/offline-copy";
import type { PhoneStore } from "../src/lib/on-phone";
import {
  applyPending,
  collapse,
  loadPending,
  type PendingChange,
} from "../src/lib/pending-changes";
import { answerDialog } from "../test-support/dialog";

/**
 * Changes made offline, kept on the phone until Sync (`pending-changes.tsx`,
 * decided 2026-10-08). "On disk" is jest.setup.ts's in-memory
 * `expo-file-system`.
 */

const files = () =>
  (jest.requireMock("expo-file-system") as { __files: Map<string, string> }).__files;
const COPY = "file:///documents/offline-copy/copy.json";
const PENDING = "file:///documents/pending/changes.json";

const nina = {
  _id: "p-nina",
  _creationTime: 1,
  userId: "u1",
  name: "Nina",
  entityType: "person",
  tags: [],
  autoCreated: false,
};
const note = {
  _id: "n-1",
  _creationTime: 2,
  userId: "u1",
  profileId: "p-nina",
  text: "Nina fosters two greyhounds.",
  keyFacts: ["Fosters two greyhounds"],
  source: "manual",
  createdAt: 1_700_000_000_000,
};
const copy = {
  ownerId: "user_default",
  takenAt: 1_700_000_000_000,
  profiles: [nina],
  notes: [note],
  links: [],
} as unknown as OfflineCopy;

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

function waiting(changes: PendingChange[]) {
  files().set(PENDING, JSON.stringify({ ownerId: "user_default", changes }));
}

const edit = (keyFacts: string[], base = ["Fosters two greyhounds"]): PendingChange => ({
  id: "c1",
  kind: "updateNote",
  noteId: "n-1",
  keyFacts,
  base: { keyFacts: base },
  madeAt: 1,
});

/** A Convex client answering the note query, recording mutations. */
function server(noteNow: unknown) {
  const mutation = jest.fn(async () => null);
  const query = jest.fn(async () => noteNow);
  (useConvex as jest.Mock).mockReturnValue({ query, mutation, action: jest.fn() });
  return { mutation, query };
}

beforeEach(() => {
  files().set(COPY, JSON.stringify(copy));
});

afterEach(() => {
  jest.restoreAllMocks();
  online(true);
  server(undefined);
});

describe("waiting changes", () => {
  test("should keep one change per note — the newest — but compare against the first base", () => {
    const first = edit(["Fosters three greyhounds"]);
    const second = { ...edit(["Fosters four greyhounds"], ["Fosters three greyhounds"]), id: "c2" };
    const deleted: PendingChange = { id: "c3", kind: "removeNote", noteId: "n-1", base: { keyFacts: ["x"] }, madeAt: 3 };

    const merged = collapse(collapse([first], second), deleted);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual(expect.objectContaining({ kind: "removeNote", base: first.base }));
  });

  test("should show the copy as it will be once synced", () => {
    expect(applyPending(copy, [edit(["Fosters three greyhounds"])]).notes[0].keyFacts).toEqual([
      "Fosters three greyhounds",
    ]);
    expect(
      applyPending(copy, [{ id: "d", kind: "removeNote", noteId: "n-1", base: { keyFacts: [] }, madeAt: 1 }]).notes,
    ).toEqual([]);
  });

  test("should show a person's edit tidied the way the server stores it — not something that changes after Sync", () => {
    const tidy: PendingChange = {
      id: "t",
      kind: "updateProfile",
      profileId: "p-nina",
      fields: {
        name: " Nina ",
        entityType: "person",
        relationshipContext: "",
        firstMetDate: "",
        tags: ["Climbing", "climbing ", ""],
        aliases: ["nina", "Nini"],
      },
      base: { name: "Nina", entityType: "person", relationshipContext: "", firstMetDate: "", tags: [], aliases: [] },
      madeAt: 1,
    };

    const shown = applyPending(copy, [tidy]).profiles[0];

    expect(shown).toEqual(expect.objectContaining({ name: "Nina", tags: ["Climbing"], aliases: ["Nini"] }));
  });

  test("should take a deleted person, and their own notes, out of the copy — not their name in others' notes", () => {
    const rowan = { ...nina, _id: "p-rowan", name: "Rowan" };
    const rowanNote = { ...note, _id: "n-2", profileId: "p-rowan", text: "Rowan says Nina moved." };
    const link = { _id: "m-1", _creationTime: 3, userId: "u1", noteId: "n-2", profileId: "p-nina", name: "Nina", quote: "Nina moved" };
    const withBoth = { ...copy, profiles: [nina, rowan], notes: [note, rowanNote], links: [link] } as unknown as OfflineCopy;
    const gone: PendingChange = {
      id: "g",
      kind: "removeProfile",
      profileId: "p-nina",
      base: { name: "Nina", entityType: "person", relationshipContext: "", firstMetDate: "", tags: [], aliases: [] },
      madeAt: 1,
    };

    const after = applyPending(withBoth, [gone]);

    expect(after.profiles.map((p) => p.name)).toEqual(["Rowan"]);
    expect(after.notes.map((n) => n._id)).toEqual(["n-2"]);
    // Rowan's note still names her — the link stays, it just opens nothing.
    expect(after.links).toEqual([link]);
  });

  test("should set an unreadable file aside rather than lose it, and drop another account's", () => {
    let asideCalls = 0;
    const store = (contents: string | null): PhoneStore => ({
      read: () => contents,
      write: () => {},
      setAside: () => {
        asideCalls += 1;
      },
      remove: () => {},
    });

    expect(loadPending(store("{half"), "me")).toEqual([]);
    expect(asideCalls).toBe(1);
    expect(loadPending(store(JSON.stringify({ ownerId: "else", changes: [edit([])] })), "me")).toEqual([]);
  });
});

describe("editing offline", () => {
  test("should keep an edit to a note on the phone and show it straight away", async () => {
    online(false);
    const result = renderRouter("src/app", { initialUrl: "/note/n-1?edit=1" });
    await result;

    await act(async () => {
      fireEvent.changeText(screen.getByDisplayValue("Fosters two greyhounds"), "Fosters three greyhounds");
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    });

    const kept = JSON.parse(files().get(PENDING)!) as { changes: PendingChange[] };
    expect(kept.changes).toEqual([
      expect.objectContaining({
        kind: "updateNote",
        noteId: "n-1",
        keyFacts: ["Fosters three greyhounds"],
        base: { keyFacts: ["Fosters two greyhounds"] },
      }),
    ]);
    // The person's page already shows the change.
    await waitFor(() => expect(result.getPathname()).toBe("/profile/p-nina"));
    expect(screen.getByText("Fosters three greyhounds")).toBeTruthy();
  });

  test("should keep a delete on the phone and take the note off the page", async () => {
    online(false);
    const result = renderRouter("src/app", { initialUrl: "/note/n-1?edit=1" });
    await result;

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Delete this note" }));
    });
    await answerDialog("Delete");

    expect(JSON.parse(files().get(PENDING)!).changes).toEqual([
      expect.objectContaining({ kind: "removeNote", noteId: "n-1" }),
    ]);
    await waitFor(() => expect(result.getPathname()).toBe("/profile/p-nina"));
    expect(screen.queryByText("Fosters two greyhounds")).toBeNull();
  });
});

describe("Sync", () => {
  async function pressSync() {
    await renderRouter("src/app", { initialUrl: "/" });
    expect(screen.getByText("1 change made offline, not saved yet.")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Sync" }));
    });
  }

  test("should save a waiting change for good and clear it from the phone", async () => {
    waiting([edit(["Fosters three greyhounds"])]);
    const { mutation } = server({ note: { ...note }, profileName: "Nina" });

    await pressSync();

    await waitFor(() => expect(mutation).toHaveBeenCalledTimes(1));
    expect(nameOf((mutation.mock.calls[0] as unknown[])[0])).toBe("notes:updateNote");
    expect((mutation.mock.calls[0] as unknown[])[1]).toEqual({ noteId: "n-1", keyFacts: ["Fosters three greyhounds"] });
    expect(files().has(PENDING)).toBe(false);
  });

  test("should ask, not overwrite, when the note was changed somewhere else since", async () => {
    waiting([edit(["Fosters three greyhounds"])]);
    const { mutation } = server({ note: { ...note, keyFacts: ["Changed on the iPad"] }, profileName: "Nina" });
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});

    await pressSync();

    expect(mutation).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(
      "Changed somewhere else",
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ cancelable: true }),
    );
    // Still waiting until they choose.
    expect(files().has(PENDING)).toBe(true);
  });

  test("should save theirs over mine only when asked: Keep mine", async () => {
    waiting([edit(["Fosters three greyhounds"])]);
    const { mutation } = server({ note: { ...note, keyFacts: ["Changed on the iPad"] }, profileName: "Nina" });
    jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === "Keep mine")?.onPress?.();
    });

    await pressSync();

    await waitFor(() => expect(mutation).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(files().has(PENDING)).toBe(false));
  });

  test("should let a change go when the note was deleted elsewhere", async () => {
    waiting([edit(["Fosters three greyhounds"])]);
    const { mutation } = server(null);

    await pressSync();

    expect(mutation).not.toHaveBeenCalled();
    await waitFor(() => expect(files().has(PENDING)).toBe(false));
  });

  const second: PendingChange = {
    id: "c2",
    kind: "updateNote",
    noteId: "n-2",
    keyFacts: ["Second note, edited"],
    base: { keyFacts: [] },
    madeAt: 2,
  };

  test("should save what it can, keep what failed, and say so", async () => {
    waiting([edit(["Fosters three greyhounds"]), second]);
    const mutation = jest.fn(async (_ref: unknown, args: { noteId: string }) => {
      if (args.noteId === "n-2") throw new Error("network");
      return null;
    });
    const query = jest.fn(async (_ref: unknown, args: { noteId: string }) =>
      args.noteId === "n-1"
        ? { note: { ...note }, profileName: "Nina" }
        : { note: { ...note, _id: "n-2", keyFacts: [] }, profileName: "Nina" },
    );
    (useConvex as jest.Mock).mockReturnValue({ query, mutation, action: jest.fn() });
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});

    await renderRouter("src/app", { initialUrl: "/" });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Sync" }));
    });

    await waitFor(() => expect(alert).toHaveBeenCalledWith("Some changes didn't sync", expect.any(String)));
    const left = JSON.parse(files().get(PENDING)!).changes as PendingChange[];
    expect(left.map((c) => (c as { noteId: string }).noteId)).toEqual(["n-2"]);
  });

  test("should keep an edit made while Sync was working, compared against what Sync just saved", async () => {
    waiting([edit(["Fosters three greyhounds"])]);
    let release: () => void = () => {};
    const mutation = jest.fn(
      () =>
        new Promise<null>((resolve) => {
          release = () => resolve(null);
        }),
    );
    const query = jest.fn(async () => ({ note: { ...note }, profileName: "Nina" }));
    (useConvex as jest.Mock).mockReturnValue({ query, mutation, action: jest.fn() });

    await renderRouter("src/app", { initialUrl: "/" });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Sync" }));
    });
    await waitFor(() => expect(mutation).toHaveBeenCalledTimes(1));

    // While the first save is still on its way, the same note is edited again.
    // (What `add` writes: the new change replaces the first, keeping its base.)
    waiting([{ ...edit(["Fosters four greyhounds"]), id: "c9" }]);
    await act(async () => {
      release();
    });

    await waitFor(() => {
      const left = JSON.parse(files().get(PENDING)!).changes as PendingChange[];
      expect(left).toEqual([
        expect.objectContaining({
          id: "c9",
          keyFacts: ["Fosters four greyhounds"],
          // Compared next time against what was just saved, not the old note.
          base: { keyFacts: ["Fosters three greyhounds"] },
        }),
      ]);
    });
  });

  test("should say so when keeping mine fails to save", async () => {
    waiting([edit(["Fosters three greyhounds"])]);
    const mutation = jest.fn(async () => {
      throw new Error("network");
    });
    const query = jest.fn(async () => ({ note: { ...note, keyFacts: ["Changed on the iPad"] }, profileName: "Nina" }));
    (useConvex as jest.Mock).mockReturnValue({ query, mutation, action: jest.fn() });
    const alert = jest.spyOn(Alert, "alert").mockImplementation((title, _m, buttons) => {
      if (title === "Changed somewhere else") buttons?.find((b) => b.text === "Keep mine")?.onPress?.();
    });

    await renderRouter("src/app", { initialUrl: "/" });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Sync" }));
    });

    await waitFor(() => expect(alert).toHaveBeenCalledWith("Didn't save", expect.any(String)));
    expect(files().has(PENDING)).toBe(true);
  });
});

describe("a person, offline", () => {
  test("should keep an edit to a person on the phone, show it at once, and save it on Sync", async () => {
    online(false);
    const result = renderRouter("src/app", { initialUrl: "/profile/p-nina/edit" });
    await result;

    await act(async () => {
      fireEvent.changeText(screen.getByDisplayValue("Nina"), "Nina Park");
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    });

    const kept = JSON.parse(files().get(PENDING)!).changes as PendingChange[];
    expect(kept).toEqual([
      expect.objectContaining({
        kind: "updateProfile",
        profileId: "p-nina",
        fields: expect.objectContaining({ name: "Nina Park" }),
        base: expect.objectContaining({ name: "Nina" }),
      }),
    ]);
    await waitFor(() => expect(result.getPathname()).toBe("/profile/p-nina"));
    expect(screen.getAllByText("Nina Park").length).toBeGreaterThan(0);
  });

  test("should keep deleting a person on the phone, taking them and their notes off home", async () => {
    online(false);
    const result = renderRouter("src/app", { initialUrl: "/profile/p-nina/edit" });
    await result;

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Delete this person" }));
    });
    await answerDialog("Delete");

    expect(JSON.parse(files().get(PENDING)!).changes).toEqual([
      expect.objectContaining({ kind: "removeProfile", profileId: "p-nina" }),
    ]);
    await waitFor(() => expect(result.getPathname()).toBe("/"));
    expect(screen.queryByText("Nina")).toBeNull();
  });

  const renamed: PendingChange = {
    id: "p1",
    kind: "updateProfile",
    profileId: "p-nina",
    fields: { name: "Nina Park", entityType: "person", relationshipContext: "", firstMetDate: "", tags: [], aliases: [] },
    base: { name: "Nina", entityType: "person", relationshipContext: "", firstMetDate: "", tags: [], aliases: [] },
    madeAt: 1,
  };

  test("should save a waiting edit to a person on Sync", async () => {
    waiting([renamed]);
    const { mutation } = server({ profile: { ...nina, aliases: [] }, notes: [], mentionedIn: [], mentionedInTotal: 0, photoUrl: null });

    await renderRouter("src/app", { initialUrl: "/" });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Sync" }));
    });

    await waitFor(() => expect(mutation).toHaveBeenCalledTimes(1));
    expect(nameOf((mutation.mock.calls[0] as unknown[])[0])).toBe("profiles:updateProfile");
    expect((mutation.mock.calls[0] as unknown[])[1]).toEqual(
      expect.objectContaining({ profileId: "p-nina", name: "Nina Park" }),
    );
    expect(files().has(PENDING)).toBe(false);
  });

  test("should ask before overwriting a person changed elsewhere", async () => {
    waiting([renamed]);
    const { mutation } = server({
      profile: { ...nina, name: "Nina Kim", aliases: [] },
      notes: [],
      mentionedIn: [],
      mentionedInTotal: 0,
      photoUrl: null,
    });
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});

    await renderRouter("src/app", { initialUrl: "/" });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Sync" }));
    });

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith("Changed somewhere else", expect.any(String), expect.any(Array), expect.anything()),
    );
    expect(mutation).not.toHaveBeenCalled();
  });

  test("should say why, in the server's words, when a change can never be saved", async () => {
    waiting([renamed]);
    const { ConvexError } = jest.requireActual("convex/values") as typeof import("convex/values");
    const mutation = jest.fn(async () => {
      throw new ConvexError("That's longer than a name. Try a shorter one.");
    });
    const query = jest.fn(async () => ({ profile: { ...nina, aliases: [] }, notes: [], mentionedIn: [], mentionedInTotal: 0, photoUrl: null }));
    (useConvex as jest.Mock).mockReturnValue({ query, mutation, action: jest.fn() });
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});

    await renderRouter("src/app", { initialUrl: "/" });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Sync" }));
    });

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith("Some changes didn't sync", expect.stringContaining("That's longer than a name")),
    );
  });
});
