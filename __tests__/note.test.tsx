import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { router } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import { answerByName, given, pressAlertButton, quietCall } from "../test-support/convex-mocks";
import { ConvexError } from "convex/values";
import { scrollsAboveKeyboard } from "../test-support/keyboard";

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
  answerByName(
    useMutation,
    given({ "notes:updateNote": handlers.update, "notes:remove": handlers.remove }),
    quietCall,
  );
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
  pressAlertButton(press);
}

/**
 * Routes the shared `useQuery` mock by function name, so the note screen and
 * the profile timeline underneath it can be rendered in the same test. One
 * blanket `mockReturnValue` hands the note's shape to `profiles.withNotes` too,
 * and the profile screen then reads `result.profile.name` off a note.
 */
function mockQueries(note: ReturnType<typeof savedNote> | null) {
  answerByName(useQuery, { "notes:byId": note }, () => ({
          profile: {
            _id: "contact-1",
            name: "Emma",
            entityType: "person",
            tags: [],
            autoCreated: false,
          },
          notes: [],
          mentionedIn: [],
          mentionedInTotal: 0,
        }));
}

function savedNote(overrides: Record<string, unknown> = {}) {
  return {
    note: {
      _id: "note-1",
      _creationTime: 0,
      userId: "user-1",
      profileId: "contact-1",
      text: "His mother has cancer and is having a hard time",
      keyFacts: ["His mother has cancer", "Is having a hard time because of his mother"],
      source: "voice",
      createdAt: new Date("2026-08-31").getTime(),
      ...overrides,
    },
    profileName: "Emma",
  };
}

describe("note screen", () => {
  test("should open to read, with no field to type in, when reached from search", async () => {
    mockQueries(savedNote());
    const updateNote = jest.fn(async () => null);
    mockUpdateNote(updateNote);

    // How a search result arrives: no `edit`. Reaching for a memory should not
    // put a form in front of it.
    const result = renderRouter("src/app", { initialUrl: "/note/note-1" });
    await result;

    expect(screen.getByText("His mother has cancer")).toBeTruthy();
    expect(screen.getByTestId("note-record")).toBeTruthy();
    expect(screen.queryByDisplayValue("His mother has cancer")).toBeNull();
    expect(screen.queryByLabelText("Fact 1")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete this note" })).toBeNull();
    expect(screen.queryByText(/fix any fact/)).toBeNull();

    // Editing is one tap away, and then it is the same screen as before.
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Edit this note" }));
    });
    expect(screen.getByDisplayValue("His mother has cancer")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit this note" })).toBeNull();
  });

  test("should come back to reading the note after saving an edit started there", async () => {
    // Only the note answers; search's own name lookup stays quiet.
    (useQuery as jest.Mock).mockImplementation((reference: unknown) =>
      getFunctionName(reference as never) === "notes:byId" ? savedNote() : undefined,
    );
    const updateNote = jest.fn(async () => null);
    mockUpdateNote(updateNote);

    // Search underneath, as a Came up in result is reached.
    const result = renderRouter("src/app", { initialUrl: "/search" });
    await result;
    await act(async () => {
      router.push("/note/note-1");
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Edit this note" }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    });

    await waitFor(() => expect(updateNote).toHaveBeenCalledTimes(1));
    // Still on the note, reading it — not dropped back on search.
    expect(result.getPathname()).toBe("/note/note-1");
    expect(screen.getByRole("button", { name: "Edit this note" })).toBeTruthy();
    expect(screen.queryByLabelText("Fact 1")).toBeNull();
  });

  test("should open straight into editing from the timeline's Edit", async () => {
    (useQuery as jest.Mock).mockImplementation((reference: unknown) =>
      getFunctionName(reference as never) === "notes:byId"
        ? savedNote()
        : {
            profile: {
              _id: "contact-1",
              name: "Emma",
              entityType: "person",
              tags: [],
              autoCreated: false,
            },
            notes: [{ note: savedNote().note, mentions: [] }],
            mentionedIn: [],
            mentionedInTotal: 0,
          },
    );

    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1" });
    await result;
    await act(async () => {
      fireEvent.press(
        screen.getByLabelText(
          `Edit the note from ${new Date("2026-08-31").toLocaleDateString("en-CA")}`,
        ),
      );
    });

    expect(result.getPathname()).toBe("/note/note-1");
    expect(screen.getByLabelText("Fact 1")).toBeTruthy();
    // The keyboard must not cover the last fields with no way to scroll to them.
    expect(scrollsAboveKeyboard("Fact 1")).toBe(true);
  });

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
      async (_args: { noteId: string; keyFacts: string[] }) => null,
    );
    mockUpdateNote(updateNote);

    // In from the timeline, as a person reaches it — which is also what makes
    // the return trip after saving part of what this test covers.
    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1" });
    await result;
    await act(async () => {
      router.push("/note/note-1?edit=1");
    });

    // The exact failure this screen was built for: extraction moved the
    // hardship from the mother onto the person the note is filed under.
    await act(async () => {
      fireEvent.changeText(
        screen.getByLabelText("Fact 2"),
        "His mother is having a hard time",
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
      "His mother has cancer",
      "His mother is having a hard time",
    ]);
    // And no `text` at all — the record is not something this screen can send.
    expect(args).not.toHaveProperty("text");
    // Back to the timeline, not stacked on top of it.
    await waitFor(() => expect(result.getPathname()).toBe("/profile/contact-1"));
  });

  test("should show the record but give no way to edit it", async () => {
    mockQueries(savedNote());
    const updateNote = jest.fn(
      async (_args: { noteId: string; keyFacts: string[] }) => null,
    );
    mockUpdateNote(updateNote);

    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1" });
    await result;
    await act(async () => {
      router.push("/note/note-1?edit=1");
    });

    // Found by its content, not by a label. A `Text` with an
    // `accessibilityLabel` announces the label *instead of* the content, which
    // would leave the record the one thing on this screen VoiceOver cannot
    // read — so there is deliberately no label to find it by.
    const record = screen.getByTestId("note-record");
    expect(record).toBeTruthy();
    expect(
      screen.getByText("His mother has cancer and is having a hard time"),
    ).toBeTruthy();

    // `queryByDisplayValue` matches a `TextInput`'s `value` and nothing else, so
    // null here means the record is not a field at all.
    //
    // This replaced `expect(props.editable).toBeUndefined()`, which proved
    // nothing: RN leaves `editable` undefined on an *editable* input
    // (`TextInput.js` tests `editable !== false`), and `onChangeText` is
    // undefined on any input that was not handed one. A bare
    // `<TextInput value={...} multiline />` — a live field with a cursor and a
    // keyboard, the exact regression — passed both of those assertions.
    expect(
      screen.queryByDisplayValue(
        "His mother has cancer and is having a hard time",
      ),
    ).toBeNull();

    // No `accessibilityLabel`: on a `Text` a label replaces the spoken content,
    // which would leave the record the one thing here VoiceOver cannot read.
    expect(record.props.accessibilityLabel).toBeUndefined();
    // And still copyable — locking the field would otherwise have taken the
    // app's only select-and-copy path for a voice note with it.
    expect(record.props.selectable).toBe(true);

    // And the copy says why, rather than leaving someone hunting for the cursor.
    expect(
      screen.getByText(/Kept as it was saved/),
    ).toBeTruthy();

    // Saving still works, and still sends only the facts.
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    });
    await waitFor(() => expect(updateNote).toHaveBeenCalledTimes(1));
    expect(updateNote.mock.calls[0]?.[0]).not.toHaveProperty("text");
  });

  test("should keep the user on the screen with the message when saving fails", async () => {
    (useQuery as jest.Mock).mockReturnValue(savedNote());
    mockUpdateNote(
      jest.fn(async () => {
        // Not written for a person: a dropped connection, a server fault.
        throw new Error("[Request ID: 1a2b3c] Server Error");
      }),
    );

    const result = renderRouter("src/app", { initialUrl: "/note/note-1?edit=1" });
    await result;

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    });

    // Navigating away on a failed save would lose the correction the user just
    // typed, which is worse than the error it was reporting.
    // Its own plain sentence, never the transport text (REFACTOR.md → K).
    await waitFor(() =>
      expect(screen.getByText("Andy couldn't save that change. Try again.")).toBeTruthy(),
    );
    expect(screen.queryByText(/Request ID|Server Error/)).toBeNull();
    expect(screen.getByTestId("note-record")).toBeTruthy();
  });

  test("should say so rather than show an empty gap when a note has no facts", async () => {
    (useQuery as jest.Mock).mockReturnValue(
      savedNote({ keyFacts: undefined, source: "manual" }),
    );

    const result = renderRouter("src/app", { initialUrl: "/note/note-1?edit=1" });
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
      router.push("/note/note-1?edit=1");
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

    const result = renderRouter("src/app", { initialUrl: "/note/note-1?edit=1" });
    await result;

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Delete this note" }));
    });

    // A confirmation that deletes on either answer is not a confirmation.
    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByTestId("note-record")).toBeTruthy();
  });

  test("should stay put and say why when deleting fails", async () => {
    mockQueries(savedNote());
    mockNoteMutations({
      remove: jest.fn(async () => {
        throw new ConvexError("Andy couldn't find that note.");
      }),
    });
    mockDeleteAlert("Delete");

    const result = renderRouter("src/app", { initialUrl: "/note/note-1?edit=1" });
    await result;

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Delete this note" }));
    });

    await waitFor(() =>
      expect(screen.getByText("Andy couldn't find that note.")).toBeTruthy(),
    );
  });

  test("should focus an added fact once, not a saved line the next time Edit is opened", async () => {
    // What is stored follows the save, so the second Edit shows three facts.
    let stored = savedNote();
    (useQuery as jest.Mock).mockImplementation((reference: unknown) =>
      getFunctionName(reference as never) === "notes:byId" ? stored : undefined,
    );
    mockUpdateNote(
      jest.fn(async (args: { noteId: string; keyFacts: string[] }) => {
        stored = savedNote({ keyFacts: args.keyFacts });
        return null;
      }),
    );

    const result = renderRouter("src/app", { initialUrl: "/note/note-1" });
    await result;
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Edit this note" }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Add a fact" }));
    });
    expect(screen.getByLabelText("Fact 3").props.autoFocus).toBe(true);
    // On a phone the field takes focus as it mounts; jest has to say so.
    await act(async () => {
      fireEvent(screen.getByLabelText("Fact 3"), "focus");
      fireEvent.changeText(screen.getByLabelText("Fact 3"), "Started a new job");
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Edit this note" })).toBeTruthy(),
    );

    // Editing again, with no Add pressed: the saved third line is just a line.
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Edit this note" }));
    });
    expect(screen.getByLabelText("Fact 3").props.autoFocus).toBe(false);
  });

  test("should let a fact be added to a saved note", async () => {
    mockQueries(savedNote({ keyFacts: undefined }));
    const updateNote = jest.fn(
      async (_args: { noteId: string; keyFacts: string[] }) => null,
    );
    mockNoteMutations({ update: updateNote });

    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1" });
    await result;
    await act(async () => {
      router.push("/note/note-1?edit=1");
    });

    // Editing that can only remove is half an edit. What is usually wrong with
    // a note weeks later is what extraction never wrote down.
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Add a fact" }));
    });
    expect(screen.getByLabelText("Fact 1").props.autoFocus).toBe(true);
    await act(async () => {
      fireEvent.changeText(
        screen.getByLabelText("Fact 1"),
        "His mother is having a hard time",
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    });

    await waitFor(() => expect(updateNote).toHaveBeenCalledTimes(1));
    expect(updateNote.mock.calls[0]?.[0].keyFacts).toEqual([
      "His mother is having a hard time",
    ]);
  });
});
