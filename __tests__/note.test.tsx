import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { router } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import { api } from "@convex/_generated/api";

/**
 * src/app/(app)/note/[id].tsx — correcting a note that is already saved.
 *
 * It exists because the capture screen's confirm step happens exactly once,
 * before the write, and two measured failures get past it: extraction moving a
 * fact onto the wrong person, and recognition mishearing a syllable. Catching
 * either was worth nothing while neither could be fixed afterwards, so what
 * these tests pin is that an edit reaches the mutation — not that the screen
 * renders.
 *
 * `useMutation` is one shared mock for every call site (jest.setup.ts), and
 * (app)/_layout.tsx calls it for `ensureUser` on every authenticated mount, so
 * the branch below routes by function name. Comparing with `===` cannot work:
 * `api` is a Proxy that manufactures a fresh object per property access.
 */
function mockNoteMutations(handlers: {
  update?: jest.Mock;
  remove?: jest.Mock;
}) {
  (useMutation as jest.Mock).mockImplementation((reference: unknown) => {
    const name = getFunctionName(reference as never);
    if (name === "notes:updateNote" && handlers.update !== undefined) {
      return handlers.update;
    }
    if (name === "notes:remove" && handlers.remove !== undefined) {
      return handlers.remove;
    }
    return jest.fn(async () => undefined);
  });
}

function mockUpdateNote(updateNote: jest.Mock) {
  mockNoteMutations({ update: updateNote });
}

/**
 * `Alert.alert` guards the delete. Spied rather than left to the RN preset, so
 * a test drives the exact button it means to — and so "Cancel does nothing"
 * can be asserted at all, which is the half of a confirmation that matters.
 */
function mockDeleteAlert(press: "Delete" | "Cancel") {
  jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
    buttons?.find((b) => b.text === press)?.onPress?.();
  });
}

/**
 * Routes the shared `useQuery` mock by function name, so the note screen and
 * the profile timeline underneath it can be rendered in the same test. One
 * blanket `mockReturnValue` hands the note's shape to `profiles.withNotes` too,
 * and the profile screen then reads `result.profile.name` off a note.
 */
function mockQueries(note: ReturnType<typeof savedNote> | null) {
  (useQuery as jest.Mock).mockImplementation((reference: unknown) =>
    getFunctionName(reference as never) === "notes:byId"
      ? note
      : {
          profile: {
            _id: "contact-1",
            name: "지선",
            entityType: "person",
            tags: [],
            isStub: false,
          },
          notes: [],
          mentionedIn: [],
          mentionedInTotal: 0,
        },
  );
}

function savedNote(overrides: Record<string, unknown> = {}) {
  return {
    note: {
      _id: "note-1",
      _creationTime: 0,
      userId: "user-1",
      profileId: "contact-1",
      text: "어머니가 암에 걸리셔서 요즘 많이 힘들어 하신데",
      keyFacts: ["어머니가 암에 걸렸다", "어머니 때문에 요즘 힘들어하고 있다"],
      source: "voice",
      createdAt: new Date("2026-08-31").getTime(),
      ...overrides,
    },
    profileName: "지선",
  };
}

describe("note screen", () => {
  test("should show a not-found line when the id names nothing of the caller's", async () => {
    (useQuery as jest.Mock).mockReturnValue(null);

    const result = renderRouter("src/app", { initialUrl: "/note/nope" });
    await result;

    expect(
      screen.getByText("Andy doesn't have a note by that link."),
    ).toBeTruthy();
  });

  test("should send the corrected fact and leave the others as they were", async () => {
    mockQueries(savedNote());
    const updateNote = jest.fn(
      async (_args: { noteId: string; text: string; keyFacts: string[] }) =>
        null,
    );
    mockUpdateNote(updateNote);

    // In from the timeline, as a person reaches it — which is also what makes
    // the return trip after saving part of what this test covers.
    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1" });
    await result;
    await act(async () => {
      router.push("/note/note-1");
    });

    // The exact failure this screen was built for: extraction moved the
    // hardship from the mother onto the person the note is filed under.
    await act(async () => {
      fireEvent.changeText(
        screen.getByLabelText("Fact 2"),
        "어머니가 요즘 많이 힘들어하신다",
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    });

    await waitFor(() => expect(updateNote).toHaveBeenCalledTimes(1));
    const [args] = updateNote.mock.calls[0] ?? [];
    // Every field goes, not just the edited one: a patch carrying only what
    // changed would blank the rest, and the first keystroke is exactly where
    // that kind of bug hides.
    expect(args?.keyFacts).toEqual([
      "어머니가 암에 걸렸다",
      "어머니가 요즘 많이 힘들어하신다",
    ]);
    expect(args?.text).toBe("어머니가 암에 걸리셔서 요즘 많이 힘들어 하신데");
    // Back to the timeline, not stacked on top of it.
    await waitFor(() => expect(result.getPathname()).toBe("/profile/contact-1"));
  });

  test("should send the corrected transcript without disturbing the facts", async () => {
    mockQueries(savedNote());
    const updateNote = jest.fn(
      async (_args: { noteId: string; text: string; keyFacts: string[] }) =>
        null,
    );
    mockUpdateNote(updateNote);

    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1" });
    await result;
    await act(async () => {
      router.push("/note/note-1");
    });

    // 하신데 → 하신대. One syllable, and it is the one that turns the sentence
    // back into something 지선 reported rather than something she did.
    await act(async () => {
      fireEvent.changeText(
        screen.getByLabelText("Note text"),
        "어머니가 암에 걸리셔서 요즘 많이 힘들어 하신대",
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    });

    await waitFor(() => expect(updateNote).toHaveBeenCalledTimes(1));
    const [args] = updateNote.mock.calls[0] ?? [];
    expect(args?.text).toBe("어머니가 암에 걸리셔서 요즘 많이 힘들어 하신대");
    expect(args?.keyFacts).toEqual([
      "어머니가 암에 걸렸다",
      "어머니 때문에 요즘 힘들어하고 있다",
    ]);
  });

  test("should keep the user on the screen with the message when saving fails", async () => {
    (useQuery as jest.Mock).mockReturnValue(savedNote());
    mockUpdateNote(
      jest.fn(async () => {
        throw new Error("A note needs something in it.");
      }),
    );

    const result = renderRouter("src/app", { initialUrl: "/note/note-1" });
    await result;

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    });

    // Navigating away on a failed save would lose the correction the user just
    // typed, which is worse than the error it was reporting.
    await waitFor(() =>
      expect(screen.getByText("A note needs something in it.")).toBeTruthy(),
    );
    expect(screen.getByLabelText("Note text")).toBeTruthy();
  });

  test("should say so rather than show an empty gap when a note has no facts", async () => {
    (useQuery as jest.Mock).mockReturnValue(
      savedNote({ keyFacts: undefined, source: "manual" }),
    );

    const result = renderRouter("src/app", { initialUrl: "/note/note-1" });
    await result;

    expect(
      screen.getByText("Nothing was pulled out of this one — the note itself is below."),
    ).toBeTruthy();
    // A typed note names its own door, the way the timeline does.
    expect(screen.getByText("What you wrote")).toBeTruthy();
  });

  test("should delete the note and leave for the profile once the confirmation is accepted", async () => {
    mockQueries(savedNote());
    const remove = jest.fn(async () => ({
      profileId: "contact-1",
      removedStubCount: 1,
    }));
    mockNoteMutations({ remove });
    mockDeleteAlert("Delete");

    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1" });
    await result;
    await act(async () => {
      router.push("/note/note-1");
    });

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Delete this note" }));
    });

    await waitFor(() => expect(remove).toHaveBeenCalledWith({ noteId: "note-1" }));
    // Forwards to the profile rather than back to the timeline entry that no
    // longer exists.
    await waitFor(() => expect(result.getPathname()).toBe("/profile/contact-1"));
  });

  test("should delete nothing when the confirmation is dismissed", async () => {
    mockQueries(savedNote());
    const remove = jest.fn(async () => ({
      profileId: "contact-1",
      removedStubCount: 0,
    }));
    mockNoteMutations({ remove });
    mockDeleteAlert("Cancel");

    const result = renderRouter("src/app", { initialUrl: "/note/note-1" });
    await result;

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Delete this note" }));
    });

    // A confirmation that deletes on either answer is not a confirmation.
    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Note text")).toBeTruthy();
  });

  test("should stay put and say why when deleting fails", async () => {
    mockQueries(savedNote());
    mockNoteMutations({
      remove: jest.fn(async () => {
        throw new Error("Andy couldn't find that note.");
      }),
    });
    mockDeleteAlert("Delete");

    const result = renderRouter("src/app", { initialUrl: "/note/note-1" });
    await result;

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Delete this note" }));
    });

    await waitFor(() =>
      expect(screen.getByText("Andy couldn't find that note.")).toBeTruthy(),
    );
  });
});
