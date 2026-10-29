import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { useAction, useConvexConnectionState, useMutation, useQuery } from "convex/react";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import * as native from "@/lib/native";
import { api } from "@convex/_generated/api";
import type { Draft } from "@convex/extractionPrompt";
import { answerByName, given, nameOf, quietCall } from "../test-support/convex-mocks";
import { ConvexError } from "convex/values";
import { scrollViewAround, scrollsAboveKeyboard } from "../test-support/keyboard";
import { answerDialog, pressConfirmButton, spyOnConfirm } from "../test-support/dialog";

/** The Write body, by the words on screen (its label is its placeholder). */
const WRITE_BODY = /^Write (or paste )?what you want to remember/;

/**
 * src/app/(app)/profile/[id]/capture.tsx's whole reason to exist is the
 * confirm/edit step between transcript and saved fact — see that file's
 * top-of-file comment for the measured case (Korean "branding designer" mangled
 * into "브랜든 집 디자인", with an invented specialisation on top) that makes
 * "what the user edited is what gets saved" the property worth pinning, not
 * merely that the review screen renders.
 *
 * Two things from jest.setup.ts drive how these tests reach the review step:
 *
 * 1. `useAction`'s default resolves to `undefined`, which is not a valid
 *    draft — every test below that needs the review step calls
 *    `mockReturnValue` with its own resolved draft first.
 * 2. `useSpeechRecognitionEvent` is a no-op by default, so no recognizer
 *    event ever fires on its own. `captureListeners()` below replaces it
 *    with an implementation that records the latest handler passed for each
 *    event name (re-recorded every render, since the screen recreates these
 *    closures each time), so a test can invoke `result` then `end` itself —
 *    exactly the sequence the real recognizer produces — without needing a
 *    native module. Recording is never actually started in these tests; only
 *    the events the recognizer would emit *after* a real recording are
 *    driven, which is enough to exercise extraction → review → save honestly
 *    without also re-testing the permission plumbing that has no bearing on
 *    the edit-then-save property these tests exist for. The `start` event is
 *    driven too, because the screen uses it to arm the guard that admits
 *    exactly one `end`.
 */

type Listener = (event?: unknown) => void;

function captureListeners(): Record<string, Listener> {
  const handlers: Record<string, Listener> = {};
  (useSpeechRecognitionEvent as jest.Mock).mockImplementation(
    (eventName: string, handler: Listener) => {
      handlers[eventName] = handler;
    },
  );
  return handlers;
}

/**
 * `useMutation` is one global jest.fn() for every call site (see
 * jest.setup.ts), and (app)/_layout.tsx calls `useMutation(api.users.ensureUser)`
 * on every authenticated mount to self-heal a missing users row — so a bare
 * `mockReturnValue(saveCapture)` hands *that* call the capture screen's
 * `saveCapture` mock too, and `ensureUser({})` shows up as a spurious first
 * call. Branching on which query function was requested keeps the two apart —
 * by name, not by `===`, because Convex's generated `api` is a Proxy
 * (`anyApi` in convex/server) that manufactures a fresh object on every
 * property access; `api.notes.saveCapture` taken twice are never the same
 * reference, only the same resolved name via `getFunctionName`.
 */
function mockSaveCapture(saveCapture: jest.Mock) {
  answerByName(useMutation, { [nameOf(api.notes.saveCapture)]: saveCapture }, quietCall);
}

/**
 * The capture screen calls `useAction` twice at the top of the component —
 * once for `api.extraction.fromTranscript`, once for
 * `api.extraction.fromBusinessCard` — against the same shared `useAction`
 * mock (jest.setup.ts). A bare `mockReturnValue` would hand both call sites
 * the same function, which happens not to matter for a test that only drives
 * one door, but distinguishing by `getFunctionName` (as `mockSaveCapture`
 * above does for `useMutation`) is what actually pins which door a given
 * mock is standing in for, rather than relying on the other door never being
 * called.
 */
function mockActions({
  extract,
  readCard,
  readPhoto,
}: {
  extract?: jest.Mock;
  readCard?: jest.Mock;
  readPhoto?: jest.Mock;
}) {
  answerByName(
    useAction,
    given({
      [nameOf(api.extraction.fromBusinessCard)]: readCard,
      [nameOf(api.extraction.fromPhoto)]: readPhoto,
      [nameOf(api.extraction.fromTranscript)]: extract,
    }),
    quietCall,
  );
}

/**
 * `confirm` (`useConfirm`) backs three things now: the "Scan a business card"
 * camera-vs-library choice, the confirmation before a re-read throws away
 * edits, and the question at save time when the transcript and the facts have
 * come apart. Spied rather than left to whatever jest-expo's RN preset
 * supplies, so a test can invoke the exact button it means to drive instead of
 * hoping one fires. Defaults to "Take a photo" since the card routes share the
 * same `scanCard` function and differ only in which permission/launch pair is
 * called — see capture.tsx's `chooseCardSource`.
 */
function mockAlert(buttonText = "Take a photo") {
  // Returns the spy so a test can assert the alert was *not* raised, which is
  // the whole of "nothing was edited, so nothing was asked".
  return pressConfirmButton(buttonText);
}

function makeCardDraft(): { draft: Draft; cardText: string } {
  return {
    draft: {
      primary: {
        name: "Sarah Chen",
        entityType: "person",
        relationshipContext: null,
        tags: ["Notion", "developer relations"],
        firstMetDate: null,
        keyFacts: [
          "Does developer relations at Notion",
          "email: sarah@notion.so",
        ],
      },
      mentions: [],
    },
    cardText: "Sarah Chen\nDeveloper Relations\nNotion\nsarah@notion.so",
  };
}

function makeDraft(
  overrides: Partial<Draft["primary"]> = {},
  mentions?: Draft["mentions"],
): Draft {
  return {
    primary: {
      name: "Nina",
      entityType: "person",
      relationshipContext: "client",
      tags: ["designer"],
      firstMetDate: null,
      keyFacts: ["brandon house design specialist"],
      ...overrides,
    },
    mentions: mentions ?? [
      {
        name: "Marcus",
        entityType: "person",
        quote: "her business partner Marcus",
      },
    ],
  };
}

/**
 * Drives the screen from idle straight to the review step by firing the
 * recognizer's `result` (final) and `end` events, the same two events
 * `runExtraction` reacts to. Waits for "Remember this" rather than a fixed
 * number of ticks, since extraction is an awaited action call.
 */
/**
 * Who `/profile/[id]/capture` resolves to.
 *
 * The screen reads the subject through `api.profiles.withNotes`, so these
 * tests have to say what that returns. `undefined` is Convex's "still loading"
 * and `null` its "not found or not yours"; both are states the screen has to
 * handle rather than record through, which is why they get their own tests
 * below instead of being left to the shared default.
 */
function scopeTo(name: string, ambiguous: unknown[] = []) {
  // Routed by function name, not blanket: the review step also asks
  // `profiles.resolveNames` which of the user's people answer to each name in
  // the draft, and one `mockReturnValue` hands it a profile where it expects a
  // list of questions.
  // Home's list too: a test that ends back on home must hand it a list.
  answerByName(useQuery, { "profiles:resolveNames": ambiguous, "profiles:people": [] }, () => ({
          profile: {
            _id: "contact-1",
            name,
            entityType: "person",
            tags: [],
            autoCreated: false,
          },
          notes: [],
          mentionedIn: [],
          mentionedInTotal: 0,
        }));
}

async function reachReview(handlers: Record<string, Listener>, spoken: string) {
  // `start` first, exactly as the real recogniser emits it. The screen arms a
  // guard here that lets exactly one `end` begin an extraction, so a test that
  // skipped straight to `result` would be driving a sequence the recogniser
  // never actually produces.
  await act(async () => {
    handlers.start?.();
  });
  await act(async () => {
    handlers.result?.({ results: [{ transcript: spoken }], isFinal: true });
  });
  await act(async () => {
    handlers.end?.();
  });
  // A finished recording waits on the editor first (2026-09-29), so the words
  // can be fixed before anything reads them. Reading them is one more tap.
  await act(async () => {
    fireEvent.press(await screen.findByRole("button", { name: "Let Andy read it" }));
  });
  await waitFor(() => expect(screen.getByRole("button", { name: "Remember this" })).toBeTruthy());
}

describe("capture screen review step", () => {
  // Every test in here renders /profile/contact-1/capture, so the route names
  // a profile and the screen expects to be told who it is. Left at the shared
  // default the query would read as permanently loading, and each test would
  // be exercising a state the real route passes through in milliseconds.
  beforeEach(() => {
    scopeTo("Nina");
  });

  afterEach(() => {
    jest.clearAllMocks();
    // `clearAllMocks` empties call records but leaves a `jest.spyOn`
    // implementation in place, so an `Alert.alert` spy set by one test kept
    // answering dialogs in every test after it. That is how the transcript-edit
    // test below passed for a while: it never mocked an alert, and a spy from
    // four tests earlier was pressing "Keep my facts" on its behalf. Run alone
    // it failed.
    jest.restoreAllMocks();
  });

  test("should open the review with the line every way in shares", async () => {
    (useAction as jest.Mock).mockReturnValue(jest.fn(async () => makeDraft()));
    const handlers = captureListeners();
    await renderRouter("src/app", { initialUrl: "/profile/contact-1/capture" });
    await reachReview(handlers, "Emma is a branding designer.");

    expect(screen.getByText(/This is what Andy will remember\./)).toBeTruthy();
    // The line and the button share a verb, so the line says what the button
    // does. Checked as visible text: the role queries above find buttons by
    // accessibility label, which could drift from what is drawn.
    expect(screen.getByText("Remember this")).toBeTruthy();
    expect(screen.queryByText("Save note")).toBeNull();
  });

  test("should show the extracted name, key facts, and mentions for review", async () => {
    const draft = makeDraft();
    (useAction as jest.Mock).mockReturnValue(jest.fn(async () => draft));
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1/capture" });
    await result;
    await reachReview(handlers, "spoken transcript");

    expect(screen.getByDisplayValue("Nina")).toBeTruthy();
    expect(screen.getByDisplayValue("brandon house design specialist")).toBeTruthy();
    // Mentions are editable inputs, not static text — the name is precisely the
    // field on-device transcription got wrong on 2026-08-27 (Marcus heard as Marco),
    // so it has to be correctable rather than only deletable.
    expect(screen.getByDisplayValue("Marcus")).toBeTruthy();
    // The quote is editable too. It is copied verbatim from the transcript, and
    // the transcript is what recognition gets wrong — locking it left the user
    // watching a mistranscription being written to two people's profiles.
    expect(screen.getByDisplayValue("her business partner Marcus")).toBeTruthy();
    // V1 keeps people only: no Person / Animal choice on the review.
    expect(screen.queryByText("Who or what")).toBeNull();
    expect(screen.queryByRole("button", { name: "Animal" })).toBeNull();
  });

  test("should save the edited fact text, not the original, when Remember this is pressed", async () => {
    const draft = makeDraft();
    (useAction as jest.Mock).mockReturnValue(jest.fn(async () => draft));
    const saveCapture = jest.fn(async (_args: { transcript: string; draft: Draft; source: string }) => ({
      profileId: "profile-1",
      noteId: "note-1",
      createdProfile: true,
      createdMentionCount: 1,
    }));
    mockSaveCapture(saveCapture);
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1/capture" });
    await result;
    await reachReview(handlers, "spoken transcript");

    // The mangled fact, corrected by the user before it's ever saved — this
    // is the property the whole review step exists for.
    await fireEvent.changeText(
      screen.getByLabelText("Fact 1"),
      "branding designer",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Remember this" }));

    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    const [call] = saveCapture.mock.calls[0];
    expect(call.draft.primary.keyFacts).toEqual(["branding designer"]);
    expect(call.draft.primary.keyFacts).not.toContain("brandon house design specialist");
  });

  test("should omit a removed key fact, tag, and mention from what is saved", async () => {
    const draft = makeDraft();
    (useAction as jest.Mock).mockReturnValue(jest.fn(async () => draft));
    const saveCapture = jest.fn(async (_args: { transcript: string; draft: Draft; source: string }) => ({
      profileId: "profile-1",
      noteId: "note-1",
      createdProfile: true,
      createdMentionCount: 1,
    }));
    mockSaveCapture(saveCapture);
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1/capture" });
    await result;
    await reachReview(handlers, "spoken transcript");

    await fireEvent.press(screen.getByRole("button", { name: "Remove fact 1" }));
    await fireEvent.press(screen.getByRole("button", { name: "Remove tag 1" }));
    await fireEvent.press(screen.getByRole("button", { name: "Remove mention 1" }));
    await fireEvent.press(screen.getByRole("button", { name: "Remember this" }));

    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    const [call] = saveCapture.mock.calls[0];
    expect(call.draft.primary.keyFacts).toEqual([]);
    expect(call.draft.primary.tags).toEqual([]);
    expect(call.draft.mentions).toEqual([]);
  });

  test("should let a tag and a mention be added back after removing every one", async () => {
    const draft = makeDraft();
    (useAction as jest.Mock).mockReturnValue(jest.fn(async () => draft));
    const saveCapture = jest.fn(async (_args: { transcript: string; draft: Draft; source: string }) => ({
      profileId: "profile-1",
      noteId: "note-1",
      createdProfile: true,
      createdMentionCount: 1,
    }));
    mockSaveCapture(saveCapture);
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1/capture" });
    await result;
    await reachReview(handlers, "spoken transcript");

    await fireEvent.press(screen.getByRole("button", { name: "Remove tag 1" }));
    await fireEvent.press(screen.getByRole("button", { name: "Remove mention 1" }));
    expect(screen.queryByLabelText("Tag 1")).toBeNull();
    expect(screen.queryByLabelText("Mentioned name 1")).toBeNull();
    // What you said is the last field on the screen; with the keyboard up it
    // could not be scrolled to (QA #28).
    expect(scrollsAboveKeyboard("What you said")).toBe(true);

    await fireEvent.press(screen.getByRole("button", { name: "Add a tag" }));
    expect(screen.getByLabelText("Tag 1").props.autoFocus).toBe(true);
    await fireEvent.changeText(screen.getByLabelText("Tag 1"), "neighbour");
    await fireEvent.press(screen.getByRole("button", { name: "Add someone" }));
    expect(screen.getByLabelText("Mentioned name 1").props.autoFocus).toBe(true);
    await fireEvent.changeText(screen.getByLabelText("Mentioned name 1"), "Cal");
    await fireEvent.changeText(screen.getByLabelText("Mentioned quote 1"), "Cal was there too.");
    await fireEvent.press(screen.getByRole("button", { name: "Remember this" }));

    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    const [call] = saveCapture.mock.calls[0];
    expect(call.draft.primary.tags).toEqual(["neighbour"]);
    expect(call.draft.mentions).toEqual([
      { name: "Cal", entityType: "person", quote: "Cal was there too." },
    ]);
  });

  test("should disable Remember this when the draft has no name", async () => {
    const draft = makeDraft({ name: "" });
    (useAction as jest.Mock).mockReturnValue(jest.fn(async () => draft));
    const saveCapture = jest.fn(async (_args: { transcript: string; draft: Draft; source: string }) => ({
      profileId: "profile-1",
      noteId: "note-1",
      createdProfile: true,
      createdMentionCount: 1,
    }));
    mockSaveCapture(saveCapture);
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1/capture" });
    await result;
    await reachReview(handlers, "garbled transcript");

    const saveButton = screen.getByRole("button", { name: "Remember this" });
    expect(saveButton).toBeDisabled();

    await fireEvent.press(saveButton);
    expect(saveCapture).not.toHaveBeenCalled();
  });

  test("should keep the edited draft on the review screen when saveCapture rejects", async () => {
    const draft = makeDraft();
    (useAction as jest.Mock).mockReturnValue(jest.fn(async () => draft));
    const saveCapture = jest.fn(async () => {
      throw new Error("network down");
    });
    mockSaveCapture(saveCapture);
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1/capture" });
    await result;
    await reachReview(handlers, "spoken transcript");

    await fireEvent.changeText(
      screen.getByLabelText("Fact 1"),
      "branding designer",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Remember this" }));

    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    // Still on review, with the edit intact — not lost, not re-navigated away.
    expect(screen.getByDisplayValue("branding designer")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remember this" })).toBeTruthy();
  });

  test("should ignore a duplicate end event rather than re-running extraction over the user's edits", async () => {
    const draft = makeDraft();
    const extract = jest.fn(async () => draft);
    (useAction as jest.Mock).mockReturnValue(extract);
    const saveCapture = jest.fn(
      async (_args: { transcript: string; draft: Draft; source: string }) => ({
        profileId: "p1",
        noteId: "n1",
        createdProfile: true,
        createdMentionCount: 0,
      }),
    );
    mockSaveCapture(saveCapture);
    const handlers = captureListeners();

    const result = renderRouter("src/app", {
      initialUrl: "/profile/contact-1/capture",
    });
    await result;
    await reachReview(handlers, "Saw Nina today");

    // The user corrects the fact the transcription mangled.
    const fact = screen.getByDisplayValue("brandon house design specialist");
    await act(async () => {
      fireEvent.changeText(fact, "branding designer");
    });

    // A stray second `end` — a real recogniser quirk. If it were honoured it
    // would re-extract the same transcript and replace the edited draft.
    await act(async () => {
      handlers.end?.();
    });

    expect(extract).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue("branding designer")).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Remember this" }));
    });
    const [call] = saveCapture.mock.calls[0];
    expect(call.draft.primary.keyFacts).toContain("branding designer");
  });

  test("should let the words be fixed before anything reads them, and read and save only the fixed words", async () => {
    // Decided 2026-09-29: a misheard name fixed after extraction had to be
    // fixed twice, in the note and in every field built from it, or read a
    // second time. Fixed here, it is fixed once.
    const extract = jest.fn(async () => makeDraft());
    mockActions({ extract });
    const saveCapture = jest.fn(
      async (_args: { transcript: string; draft: Draft; source: string }) => ({
        profileId: "p1",
        noteId: "n1",
        createdProfile: true,
        createdMentionCount: 0,
      }),
    );
    mockSaveCapture(saveCapture);
    const handlers = captureListeners();
    await renderRouter("src/app", { initialUrl: "/profile/contact-1/capture" });

    await act(async () => {
      handlers.start?.();
    });
    await act(async () => {
      handlers.result?.({ results: [{ transcript: "Met Nena for lunch" }], isFinal: true });
    });
    await act(async () => {
      handlers.end?.();
    });

    // Stopped, and nothing has been read yet.
    expect(extract).not.toHaveBeenCalled();
    expect(screen.getByText(/Fix any name or word, then let Andy read it/)).toBeTruthy();
    const said = screen.getByLabelText("What you said");
    // Most of the time there is nothing to fix, so no keyboard in the way.
    expect(said.props.autoFocus).toBe(false);
    // And it looks like a field, not a paragraph: the review screen's label
    // and underline (chosen from mockups, 2026-09-29).
    expect(screen.getByText("What you said")).toBeTruthy();
    expect(StyleSheet.flatten(said.props.style).borderBottomWidth).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.changeText(said, "Met Nina for lunch");
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Let Andy read it" }));
    });
    await waitFor(() => expect(extract).toHaveBeenCalledTimes(1));
    expect(JSON.stringify(extract.mock.calls[0])).toContain("Met Nina for lunch");
    expect(JSON.stringify(extract.mock.calls[0])).not.toContain("Nena");

    // The fix is the note, not an edit made after it: saving asks nothing,
    // and the note is still filed as something said.
    const alert = mockAlert();
    await waitFor(() => expect(screen.getByRole("button", { name: "Remember this" })).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Remember this" }));
    });
    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    expect(alert).not.toHaveBeenCalled();
    const [call] = saveCapture.mock.calls[0];
    expect(call.transcript).toBe("Met Nina for lunch");
    expect(call.source).toBe("voice");
  });

  test("should keep a long note editable above the keyboard, with a way to put the keyboard away", async () => {
    // Found live 2026-09-29: a long note ran on under the keyboard, the lines
    // being edited and Read it were hidden, and nothing put the keyboard
    // away. The keyboard itself only exists on a device (QA 7a.36); this pins
    // the settings that fix it, so none of them quietly goes missing.
    const handlers = captureListeners();
    await renderRouter("src/app", { initialUrl: "/profile/contact-1/capture" });
    await act(async () => {
      handlers.start?.();
    });
    await act(async () => {
      handlers.result?.({ results: [{ transcript: "Met Nina ".repeat(200) }], isFinal: true });
    });
    await act(async () => {
      handlers.end?.();
    });

    const said = screen.getByLabelText("What you said");
    // The field grows; the screen around it is what scrolls.
    expect(said.props.scrollEnabled).toBe(false);
    expect(scrollsAboveKeyboard("What you said")).toBe(true);
    // And Read it is inside what scrolls, so it can always be reached.
    expect(
      within(scrollViewAround("What you said")!).getByRole("button", { name: "Let Andy read it" }),
    ).toBeTruthy();
  });

  test("should record again from the check step without reading what was heard", async () => {
    const { ExpoSpeechRecognitionModule } = jest.requireMock("expo-speech-recognition");
    (ExpoSpeechRecognitionModule.requestPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: true,
    });
    const extract = jest.fn(async () => makeDraft());
    mockActions({ extract });
    const handlers = captureListeners();
    await renderRouter("src/app", { initialUrl: "/profile/contact-1/capture" });

    await act(async () => {
      handlers.start?.();
    });
    await act(async () => {
      handlers.result?.({ results: [{ transcript: "Met Nina umm" }], isFinal: true });
    });
    await act(async () => {
      handlers.end?.();
    });

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Record again" }));
    });
    await waitFor(() => expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledTimes(1));
    expect(extract).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("What you said")).toBeNull();
  });

  test("should show Start over, Pause and Done while recording, and only Record before", async () => {
    // record-flow.md, revision 2026-10-13: the three controls; the card and
    // typing doors are the orbit's now, not links on this screen.
    const { ExpoSpeechRecognitionModule } = jest.requireMock("expo-speech-recognition");
    (ExpoSpeechRecognitionModule.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    const handlers = captureListeners();
    await renderRouter("src/app", { initialUrl: "/profile/contact-1/capture" });

    expect(screen.getByRole("button", { name: "Record" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Scan a business card" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Type it instead" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Record" }));
    });
    await act(async () => {
      handlers.start?.();
    });

    // Start over is there from the first instant, not only once words come.
    expect(screen.getByRole("button", { name: "Start over" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Record" })).toBeNull();
    // No word "Recording": the time carries it.
    expect(screen.getByTestId("record-timer").props.children).toBe("0:00");
    expect(screen.queryByText("Recording")).toBeNull();
  });

  test("should go back to the start on Start over with nothing heard, asking nothing", async () => {
    const { ExpoSpeechRecognitionModule } = jest.requireMock("expo-speech-recognition");
    const handlers = captureListeners();
    await renderRouter("src/app", { initialUrl: "/profile/contact-1/capture" });
    await act(async () => {
      handlers.start?.();
    });

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Start over" }));
    });

    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    expect(ExpoSpeechRecognitionModule.abort).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Record" })).toBeTruthy();
  });

  test("should ask before throwing heard words away on Start over, then clear them and read none", async () => {
    const { ExpoSpeechRecognitionModule } = jest.requireMock("expo-speech-recognition");
    const extract = jest.fn(async () => makeDraft());
    mockActions({ extract });
    const handlers = captureListeners();
    await renderRouter("src/app", { initialUrl: "/profile/contact-1/capture" });
    await act(async () => {
      handlers.start?.();
    });
    await act(async () => {
      handlers.result?.({ results: [{ transcript: "Met Nina umm no wait" }], isFinal: true });
    });

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Start over" }));
    });
    const dialog = screen.getByTestId("confirm-dialog");
    expect(within(dialog).getByText("Start over?")).toBeTruthy();
    expect(within(dialog).getByText("What you said so far will be cleared.")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Keep recording" })).toBeTruthy();
    await act(async () => {
      await answerDialog("Start over");
    });

    expect(ExpoSpeechRecognitionModule.abort).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Met Nina umm no wait")).toBeNull();
    // The abandoned session reports on its way out; none of it is shown or read.
    await act(async () => {
      handlers.error?.({ error: "audio-capture", message: "dying session" });
      handlers.end?.();
    });
    expect(screen.queryByText(/dying session/)).toBeNull();
    expect(extract).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Record" })).toBeTruthy();
  });

  test("should keep the words on Pause and add to them on Resume", async () => {
    const { ExpoSpeechRecognitionModule } = jest.requireMock("expo-speech-recognition");
    (ExpoSpeechRecognitionModule.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    const handlers = captureListeners();
    await renderRouter("src/app", { initialUrl: "/profile/contact-1/capture" });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Record" }));
    });
    await act(async () => {
      handlers.start?.();
    });
    await act(async () => {
      handlers.result?.({ results: [{ transcript: "Met Nina" }], isFinal: true });
    });

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Pause" }));
    });
    expect(ExpoSpeechRecognitionModule.stop).toHaveBeenCalledTimes(1);
    // The paused session's end is a pause, not the end of the note.
    await act(async () => {
      handlers.end?.();
    });
    expect(screen.getByTestId("paused-label")).toBeTruthy();
    expect(screen.queryByLabelText("What you said")).toBeNull();
    expect(screen.getByText("Met Nina")).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Resume" }));
    });
    await waitFor(() => expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledTimes(2));
    await act(async () => {
      handlers.start?.();
    });
    await act(async () => {
      handlers.result?.({ results: [{ transcript: "for lunch" }], isFinal: true });
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Done" }));
    });
    await act(async () => {
      handlers.end?.();
    });

    expect(screen.getByLabelText("What you said").props.value).toBe("Met Nina for lunch");
  });

  test("should hand the words on at once on Done while paused", async () => {
    const { ExpoSpeechRecognitionModule } = jest.requireMock("expo-speech-recognition");
    (ExpoSpeechRecognitionModule.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    const handlers = captureListeners();
    await renderRouter("src/app", { initialUrl: "/profile/contact-1/capture" });
    await act(async () => {
      handlers.start?.();
    });
    await act(async () => {
      handlers.result?.({ results: [{ transcript: "Met Nina" }], isFinal: true });
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Pause" }));
    });
    await act(async () => {
      handlers.end?.();
    });

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Done" }));
    });

    expect(screen.getByLabelText("What you said").props.value).toBe("Met Nina");
  });

  test("should keep each row's own field when an earlier fact, tag or mention is removed", async () => {
    // Keyed by position, removing row 1 shifts row 3 into slot 2 and React
    // tears down the field that was being typed in — the keyboard closes
    // mid-sentence (#82's review). The same field must survive, holding the
    // same text, in each of the three lists.
    (useAction as jest.Mock).mockReturnValue(
      jest.fn(async () =>
        makeDraft(
          { keyFacts: ["Fact A", "Fact B", "Fact C"], tags: ["tag-a", "tag-b", "tag-c"] },
          [
            { name: "Ann", entityType: "person", quote: "Ann was there" },
            { name: "Ben", entityType: "person", quote: "Ben was there" },
            { name: "Cal", entityType: "person", quote: "Cal was there" },
          ],
        ),
      ),
    );
    const handlers = captureListeners();
    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;
    await reachReview(handlers, "Met Nina with Ann, Ben and Cal.");

    for (const [row, remove, kept] of [
      ["Fact", "Remove fact 1", "Fact C"],
      ["Tag", "Remove tag 1", "tag-c"],
      ["Mentioned name", "Remove mention 1", "Cal"],
    ] as const) {
      const before = screen.getByLabelText(`${row} 3`);
      await act(async () => {
        fireEvent.press(screen.getByLabelText(remove));
      });
      const after = screen.getByLabelText(`${row} 2`);
      expect(after.props.value).toBe(kept);
      // The same field, not a new one in its place.
      expect(after).toBe(before);
    }
  });

  test("should save a corrected mention name, the field transcription actually gets wrong", async () => {
    const draft = makeDraft();
    (useAction as jest.Mock).mockReturnValue(jest.fn(async () => draft));
    const saveCapture = jest.fn(
      async (_args: { transcript: string; draft: Draft; source: string }) => ({
        profileId: "profile-1",
        noteId: "note-1",
        createdProfile: true,
        createdMentionCount: 1,
      }),
    );
    mockSaveCapture(saveCapture);
    const handlers = captureListeners();

    const result = renderRouter("src/app", {
      initialUrl: "/profile/contact-1/capture",
    });
    await result;
    await reachReview(handlers, "spoken transcript");

    // The measured failure mode: a name heard as a different, real-sounding
    // name. Deleting the mention loses a real person; only editing recovers it.
    await act(async () => {
      fireEvent.changeText(screen.getByDisplayValue("Marcus"), "Marcus Park");
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Remember this" }));
    });

    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    const [call] = saveCapture.mock.calls[0];
    expect(call.draft.mentions[0].name).toBe("Marcus Park");
  });

  test("should leave home one back press away however many notes are recorded from a profile", async () => {
    (useAction as jest.Mock).mockReturnValue(jest.fn(async () => makeDraft()));
    mockSaveCapture(
      jest.fn(async () => ({
        profileId: "contact-1",
        noteId: "note-1",
        createdProfile: false,
        createdMentionCount: 0,
      })),
    );

    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;
    await act(async () => {
      router.push("/profile/contact-1");
    });

    // Three notes in a row, the way somebody actually uses a profile they are
    // catching up on. Saving used to `replace` the capture with another copy of
    // the profile, so each round left one more of them on the stack and getting
    // back to home took as many presses as notes recorded.
    for (let round = 0; round < 3; round += 1) {
      const handlers = captureListeners();
      await act(async () => {
        router.push("/profile/contact-1/capture");
      });
      await reachReview(handlers, `note number ${round}`);
      await act(async () => {
        fireEvent.press(screen.getByRole("button", { name: "Remember this" }));
      });
      await waitFor(() =>
        expect(result.getPathname()).toBe("/profile/contact-1"),
      );
    }

    await act(async () => {
      router.back();
    });

    expect(result.getPathname()).toBe("/");
  });

  test("should confirm the subject even when exactly one person answers to the name", async () => {
    (useAction as jest.Mock).mockReturnValue(
      jest.fn(async () => makeDraft({ name: "Prisley" }, [])),
    );
    const saveCapture = jest.fn(
      async (_args: {
        transcript: string;
        draft: Draft;
        source: string;
        resolutions: { name: string; profileId: string | null }[];
      }) => ({
        profileId: "profile-1",
        noteId: "note-1",
        createdProfile: false,
        createdMentionCount: 0,
      }),
    );
    mockSaveCapture(saveCapture);
    scopeTo("Prisley", [
      {
        name: "Prisley",
        viaPossessive: false,
        candidates: [
          {
            profileId: "profile-old",
            name: "Prisley",
            relationshipContext: "from the gallery",
            entityType: "person",
            noteCount: 1,
            lastNoteAt: new Date("2026-03-04T12:00:00").getTime(),
          },
        ],
      },
    ]);
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;
    await reachReview(handlers, "Prisley's show at the MET was good.");

    // One person answering to a name is not the same as this being them. A
    // Prisley kept in March is easy to forget, and filing a note about a
    // different Prisley onto her does not create a wrong person — it writes
    // into a real one, and nothing afterwards says so.
    await waitFor(() => expect(screen.getByText("This Prisley?")).toBeTruthy());
    expect(screen.getByLabelText("Remember this")).toBeDisabled();
    // The line and the question are alternatives. "Adding to Prisley" above
    // "This Prisley?" states a thing and then asks whether that thing is true.
    expect(screen.queryByText(/Adding to Prisley/)).toBeNull();
    // The body, not only the heading. It read "or somebody new" — the wording
    // for a question you may ignore — under a heading that blocks saving,
    // because the picker re-derived "is this required" from the candidate
    // count and could not know about the new third reason.
    expect(
      screen.getByText("You already keep somebody by this name. Is this them?"),
    ).toBeTruthy();

    // Both answers are here: it is her, or it is somebody new.
    expect(
      screen.getByLabelText(
        "Prisley, from the gallery · 1 note · last 2026-03-04",
      ),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.press(
        screen.getByLabelText("Someone new: a different person, also called Prisley"),
      );
    });
    expect(screen.getByLabelText("Remember this")).not.toBeDisabled();

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Remember this"));
    });
    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    expect(saveCapture.mock.calls[0]?.[0].resolutions).toEqual([
      { name: "Prisley", profileId: null },
    ]);
  });

  test("should neither show nor send person details for somebody already kept", async () => {
    // Extraction guessed a relationship and a first meeting. Marcus is already
    // kept, so neither may reach his profile unseen — saving fills empty
    // fields, and a hidden field filling one is a claim nobody confirmed.
    (useAction as jest.Mock).mockReturnValue(
      jest.fn(async () =>
        makeDraft({ name: "Nina", relationshipContext: "coworker", firstMetDate: "2026-10-01" }, []),
      ),
    );
    const saveCapture = jest.fn(
      async (_args: { draft: Draft }) => ({
        profileId: "contact-1",
        noteId: "note-1",
        createdProfile: false,
        createdMentionCount: 0,
      }),
    );
    mockSaveCapture(saveCapture);
    scopeTo("Nina", []);
    const handlers = captureListeners();

    const result = renderRouter("src/app", {
      initialUrl: "/profile/contact-1/capture",
    });
    await result;
    await reachReview(handlers, "Nina liked the new brief.");

    expect(screen.queryByLabelText("How you know them")).toBeNull();
    expect(screen.queryByLabelText("This was the first time we met")).toBeNull();
    expect(screen.getByText(/To change how you know Nina or when you first met/)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Remember this"));
    });
    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    const sent = saveCapture.mock.calls[0]?.[0].draft.primary;
    expect(sent?.relationshipContext).toBeNull();
    expect(sent?.firstMetDate).toBeNull();
    // The note's own content still goes.
    expect(sent?.keyFacts).toEqual(["brandon house design specialist"]);
  });

  test("should hide person details once a kept person is picked, and show them again for somebody new", async () => {
    (useAction as jest.Mock).mockReturnValue(
      jest.fn(async () => makeDraft({ name: "Prisley" }, [])),
    );
    const saveCapture = jest.fn(
      async (_args: { draft: Draft }) => ({
        profileId: "profile-1",
        noteId: "note-1",
        createdProfile: true,
        createdMentionCount: 0,
      }),
    );
    mockSaveCapture(saveCapture);
    scopeTo("Prisley", [
      {
        name: "Prisley",
        viaPossessive: false,
        candidates: [
          {
            profileId: "profile-old",
            name: "Prisley",
            relationshipContext: "from the gallery",
            entityType: "person",
            noteCount: 1,
            lastNoteAt: new Date("2026-03-04T12:00:00").getTime(),
          },
        ],
      },
    ]);
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;
    await reachReview(handlers, "Prisley's show was good.");

    // Not settled yet: nothing to hide on behalf of.
    expect(screen.getByLabelText("How you know them")).toBeTruthy();

    await act(async () => {
      fireEvent.press(
        screen.getByLabelText("Prisley, from the gallery · 1 note · last 2026-03-04"),
      );
    });
    expect(screen.queryByLabelText("How you know them")).toBeNull();

    // Somebody new after all: their details are theirs to fill in.
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Someone new: a different person, also called Prisley"));
    });
    expect(screen.getByLabelText("How you know them")).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Remember this"));
    });
    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    expect(saveCapture.mock.calls[0]?.[0].draft.primary.relationshipContext).toBe("client");
  });

  test("should automatically send nameChange when selecting an existing person with nameUpdate", async () => {
    // Device QA B5-8 part 2: a note says "Barbara Apple" about the kept
    // "Barbara". The name update is now automatic when selecting a person
    // with a nameUpdate field (no checkbox needed).
    (useAction as jest.Mock).mockReturnValue(
      jest.fn(async () => makeDraft({ name: "Barbara Apple" }, [])),
    );
    const saveCapture = jest.fn(async (_args: { nameChange?: string }) => ({
      profileId: "profile-barbara",
      noteId: "note-1",
      createdProfile: false,
      createdMentionCount: 0,
    }));
    mockSaveCapture(saveCapture);
    scopeTo("Barbara Apple", [
      {
        name: "Barbara Apple",
        viaPossessive: false,
        candidates: [
          {
            profileId: "profile-barbara",
            name: "Barbara",
            relationshipContext: "book club",
            entityType: "person",
            noteCount: 3,
            lastNoteAt: new Date("2026-09-20T12:00:00").getTime(),
            nameUpdate: "rename",
          },
        ],
      },
    ]);
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;
    await reachReview(handlers, "Barbara Apple brought pie.");

    // Pick Barbara - nameChange should be automatic.
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Barbara, book club · 3 notes · last 2026-09-20"));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Remember this"));
    });
    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    expect(saveCapture.mock.calls[0]?.[0].nameChange).toBe("rename");

    // Verify no checkbox exists.
    expect(screen.queryByTestId("review-name-change")).toBeNull();
  });

  test("should automatically send alias nameChange when selecting a person with nameUpdate alias", async () => {
    (useAction as jest.Mock).mockReturnValue(
      jest.fn(async () => makeDraft({ name: "Barbara Apple" }, [])),
    );
    const saveCapture = jest.fn(async (_args: { nameChange?: string }) => ({
      profileId: "profile-barbara",
      noteId: "note-1",
      createdProfile: false,
      createdMentionCount: 0,
    }));
    mockSaveCapture(saveCapture);
    scopeTo("Barbara Apple", [
      {
        name: "Barbara Apple",
        viaPossessive: false,
        candidates: [
          {
            profileId: "profile-barbara",
            name: "Barbara Apple Smith",
            relationshipContext: "book club",
            entityType: "person",
            noteCount: 3,
            lastNoteAt: new Date("2026-09-20T12:00:00").getTime(),
            nameUpdate: "alias",
          },
        ],
      },
    ]);
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;
    await reachReview(handlers, "Barbara Apple brought pie.");
    await act(async () => {
      fireEvent.press(
        screen.getByLabelText("Barbara Apple Smith, book club · 3 notes · last 2026-09-20"),
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Remember this"));
    });
    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    expect(saveCapture.mock.calls[0]?.[0].nameChange).toBe("alias");
  });

  test("should send no nameChange when selecting Someone new", async () => {
    (useAction as jest.Mock).mockReturnValue(
      jest.fn(async () => makeDraft({ name: "Barbara Apple" }, [])),
    );
    const saveCapture = jest.fn(async (_args: { nameChange?: string }) => ({
      profileId: "profile-new",
      noteId: "note-1",
      createdProfile: true,
      createdMentionCount: 0,
    }));
    mockSaveCapture(saveCapture);
    scopeTo("Barbara Apple", [
      {
        name: "Barbara Apple",
        viaPossessive: false,
        candidates: [
          {
            profileId: "profile-barbara",
            name: "Barbara",
            relationshipContext: "book club",
            entityType: "person",
            noteCount: 3,
            lastNoteAt: new Date("2026-09-20T12:00:00").getTime(),
            nameUpdate: "rename",
          },
        ],
      },
    ]);
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;
    await reachReview(handlers, "Barbara Apple brought pie.");

    // Choose "Someone new" instead of the existing person.
    await act(async () => {
      fireEvent.press(
        screen.getByLabelText("Someone new: a different person, also called Barbara Apple"),
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Remember this"));
    });
    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    expect(saveCapture.mock.calls[0]?.[0].nameChange).toBeUndefined();
  });

  test("should offer no name change when the person already answers to the name", async () => {
    (useAction as jest.Mock).mockReturnValue(
      jest.fn(async () => makeDraft({ name: "Barbara" }, [])),
    );
    scopeTo("Barbara", [
      {
        name: "Barbara",
        viaPossessive: false,
        candidates: [
          {
            profileId: "profile-barbara",
            name: "Barbara Apple",
            relationshipContext: "book club",
            entityType: "person",
            noteCount: 3,
            lastNoteAt: new Date("2026-09-20T12:00:00").getTime(),
            nameUpdate: null,
          },
        ],
      },
    ]);
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;
    await reachReview(handlers, "Barbara brought pie.");
    await act(async () => {
      fireEvent.press(
        screen.getByLabelText("Barbara Apple, book club · 3 notes · last 2026-09-20"),
      );
    });
    expect(screen.getByText(/To change how you know Barbara Apple/)).toBeTruthy();
    expect(screen.queryByTestId("review-name-change")).toBeNull();
  });

  test("should ask nothing about a subject the route already decided", async () => {
    (useAction as jest.Mock).mockReturnValue(
      jest.fn(async () => makeDraft({ name: "Nina" }, [])),
    );
    mockSaveCapture(jest.fn(async () => ({
      profileId: "contact-1",
      noteId: "note-1",
      createdProfile: false,
      createdMentionCount: 0,
    })));
    scopeTo("Nina", [
      {
        name: "Nina",
        viaPossessive: false,
        candidates: [
          {
            profileId: "contact-1",
            name: "Nina",
            relationshipContext: "client",
            entityType: "person",
            noteCount: 3,
            lastNoteAt: new Date("2026-08-30T12:00:00").getTime(),
          },
        ],
      },
    ]);
    const handlers = captureListeners();

    // Recorded on Nina's own page. Choosing where to record *is* the answer,
    // and day 4's rule — a form in front of every save is how people stop
    // reading forms — is kept true by this exemption: the ordinary "add to
    // somebody I know" path asks nothing at all.
    const result = renderRouter("src/app", {
      initialUrl: "/profile/contact-1/capture",
    });
    await result;
    await reachReview(handlers, "Nina liked the new brief.");

    expect(screen.queryByText("This Nina?")).toBeNull();
    expect(screen.getByText(/Adding to Nina/)).toBeTruthy();
    expect(screen.getByLabelText("Remember this")).not.toBeDisabled();
  });

  test("should ask nothing on a person's own page even when somebody shares their name", async () => {
    (useAction as jest.Mock).mockReturnValue(
      jest.fn(async () => makeDraft({ name: "Priya" }, [])),
    );
    mockSaveCapture(jest.fn(async () => ({
      profileId: "contact-1",
      noteId: "note-1",
      createdProfile: false,
      createdMentionCount: 0,
    })));
    scopeTo("Priya", [
      {
        name: "Priya",
        viaPossessive: false,
        candidates: [
          {
            profileId: "contact-1",
            name: "Priya",
            relationshipContext: "client",
            entityType: "person",
            noteCount: 3,
            lastNoteAt: new Date("2026-09-01T12:00:00").getTime(),
          },
          {
            profileId: "profile-other",
            name: "Priya",
            relationshipContext: "from the gym",
            entityType: "person",
            noteCount: 1,
            lastNoteAt: new Date("2026-05-01T12:00:00").getTime(),
          },
        ],
      },
    ]);
    const handlers = captureListeners();

    const result = renderRouter("src/app", {
      initialUrl: "/profile/contact-1/capture",
    });
    await result;
    await reachReview(handlers, "Priya liked the new brief.");

    // Two people answer to Priya, and it still asks nothing: the route named
    // one profile, so walking to her page *was* the answer. Only the
    // subject-specific branch checked this at first, so a declared subject
    // with a shared name was still interrogated — a forced question in front
    // of somebody who already knows the answer, which is how a wrong tap
    // happens.
    expect(screen.queryByText("Which Priya?")).toBeNull();
    expect(screen.getByLabelText("Remember this")).not.toBeDisabled();
  });

  test("should send its own resolution for a declared subject who shares a name, so saving does not throw", async () => {
    (useAction as jest.Mock).mockReturnValue(
      jest.fn(async () => makeDraft({ name: "Priya" }, [])),
    );
    const saveCapture = jest.fn(
      async (_args: {
        transcript: string;
        draft: Draft;
        source: string;
        resolutions: { name: string; profileId: string | null }[];
      }) => ({
        profileId: "contact-1",
        noteId: "note-1",
        createdProfile: false,
        createdMentionCount: 0,
      }),
    );
    mockSaveCapture(saveCapture);
    // Reported live: two Priyas exist, this one recorded from her own page.
    // The screen correctly asked nothing — that is `subjectDeclared` — but
    // `saveCapture` sent no resolution for "Priya" either, because nothing
    // told it the declared subject needed one. The server has no notion of
    // "the route already said" — it only sees a name two profiles answer to
    // and throws. A promise of no question, followed by a thrown error, is
    // worse than the question would have been.
    scopeTo("Priya", [
      {
        name: "Priya",
        viaPossessive: false,
        candidates: [
          {
            profileId: "contact-1",
            name: "Priya",
            relationshipContext: "client",
            entityType: "person",
            noteCount: 3,
            lastNoteAt: new Date("2026-09-01T12:00:00").getTime(),
          },
          {
            profileId: "profile-other",
            name: "Priya",
            relationshipContext: "from the gym",
            entityType: "person",
            noteCount: 1,
            lastNoteAt: new Date("2026-05-01T12:00:00").getTime(),
          },
        ],
      },
    ]);
    const handlers = captureListeners();

    const result = renderRouter("src/app", {
      initialUrl: "/profile/contact-1/capture",
    });
    await result;
    await reachReview(handlers, "Priya seemed happy about the new job.");

    expect(screen.queryByText("Which Priya?")).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Remember this"));
    });

    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    // The route's own profile, sent without being asked — the answer the user
    // gave by walking to this page in the first place.
    expect(saveCapture.mock.calls[0]?.[0].resolutions).toEqual([
      { name: "Priya", profileId: "contact-1" },
    ]);
  });

  test("should open the picker beside the name it is about, not at the bottom of the form", async () => {
    (useAction as jest.Mock).mockReturnValue(
      jest.fn(async () => makeDraft({ name: "Nina" })),
    );
    mockSaveCapture(jest.fn(async () => ({
      profileId: "profile-1",
      noteId: "note-1",
      createdProfile: false,
      createdMentionCount: 1,
    })));
    scopeTo("Nina", [
      {
        name: "Nina",
        viaPossessive: false,
        candidates: [
          {
            profileId: "profile-1",
            name: "Nina",
            relationshipContext: "client",
            entityType: "person",
            noteCount: 3,
            lastNoteAt: new Date("2026-08-30T12:00:00").getTime(),
          },
        ],
      },
    ]);
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;
    await reachReview(handlers, "Met Nina today.");

    // The picker used to render in one block above `Remember this`, several
    // screens down — so opening it was indistinguishable from pressing
    // nothing. Position is the fix, so position is what this asserts: the
    // choices sit inside the same Name field as the input.
    const nameField = within(screen.getByTestId("field-Name"));
    expect(nameField.getByLabelText("Someone new: a different person, also called Nina")).toBeTruthy();
    expect(nameField.getByText("This Nina?")).toBeTruthy();
  });

  test("should name Someone new to VoiceOver with the words it shows (WCAG 2.5.3)", async () => {
    (useAction as jest.Mock).mockReturnValue(jest.fn(async () => makeDraft()));
    scopeTo("Nina", [
      {
        name: "Nina",
        viaPossessive: false,
        candidates: [
          { profileId: "profile-a", name: "Nina", relationshipContext: "client", entityType: "person", noteCount: 1, lastNoteAt: null },
        ],
      },
    ]);
    const handlers = captureListeners();
    await renderRouter("src/app", { initialUrl: "/capture" });
    await reachReview(handlers, "Met Nina today.");

    // Label in Name: someone using Voice Control says what they see. The old
    // label, "New person called Nina", did not contain "Someone new" at all.
    const option = within(screen.getByTestId("field-Name")).getByText("Someone new");
    const button = screen.getByRole("button", { name: /^Someone new:/ });
    expect(button.props.accessibilityLabel.startsWith(option.props.children)).toBe(true);
    expect(screen.getByText("A different person, also called Nina")).toBeTruthy();
  });

  test("should still show a question that has no field to sit beside", async () => {
    (useAction as jest.Mock).mockReturnValue(
      jest.fn(async () => makeDraft({ name: "Nina" })),
    );
    mockSaveCapture(jest.fn(async () => ({
      profileId: "profile-1",
      noteId: "note-1",
      createdProfile: false,
      createdMentionCount: 1,
    })));
    // A question about a name the draft does not contain. It should not
    // happen — every name asked about comes from the draft — and the cost of
    // being wrong is a save button greyed out for no reason the screen gives,
    // because a must-answer question rendered nowhere still blocks saving.
    scopeTo("Nina", [
      {
        name: "Ghost",
        viaPossessive: false,
        candidates: [
          {
            profileId: "profile-2",
            name: "Ghost",
            entityType: "person",
            noteCount: 1,
            lastNoteAt: null,
          },
          {
            profileId: "profile-3",
            name: "Ghost",
            entityType: "person",
            noteCount: 2,
            lastNoteAt: null,
          },
        ],
      },
    ]);
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;
    await reachReview(handlers, "Met Nina today.");

    // Shown where the whole block used to live, above Save.
    await waitFor(() => expect(screen.getByText("Which Ghost?")).toBeTruthy());
    // People are written about, never "kept" (STYLE.md → Terminology).
    expect(
      screen.getByText(/You've written about more than one person by this name/),
    ).toBeTruthy();
  });

  test("should ask before inventing somebody whose name is a possessive of one you keep", async () => {
    (useAction as jest.Mock).mockReturnValue(
      jest.fn(async () =>
        makeDraft({ name: "Tom" }, [
          {
            name: "Parks",
            entityType: "person",
            quote: "at parks housewarming party",
          },
        ]),
      ),
    );
    mockSaveCapture(jest.fn(async () => ({
      profileId: "profile-1",
      noteId: "note-1",
      createdProfile: true,
      createdMentionCount: 1,
    })));
    // "I met at Park's housewarming party". The recogniser does not reliably
    // place apostrophes, extraction reads "Parks" as a name, and `matchKey` is
    // exact — so a second person one letter from a real one used to be created
    // with nothing said. Exactly one candidate, which the old rule used without
    // asking: right about an exact match, wrong about guessed grammar.
    scopeTo("Tom", [
      {
        name: "Parks",
        viaPossessive: true,
        candidates: [
          {
            profileId: "profile-park",
            name: "Park",
            relationshipContext: "physics teacher",
            entityType: "person",
            noteCount: 2,
            lastNoteAt: new Date("2026-09-01T12:00:00").getTime(),
          },
        ],
      },
    ]);
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;
    await reachReview(handlers, "Met Tom at parks housewarming party.");

    // The name itself is what is in doubt, not which of several people it
    // means — so the question says so rather than reusing "Which Parks?".
    await waitFor(() =>
      expect(screen.getByText(/might belong to somebody you already keep/))
        .toBeTruthy(),
    );
  });

  test("should not ask about a name that matched somebody exactly", async () => {
    (useAction as jest.Mock).mockReturnValue(
      jest.fn(async () => makeDraft({ name: "Emma" })),
    );
    mockSaveCapture(jest.fn(async () => ({
      profileId: "profile-1",
      noteId: "note-1",
      createdProfile: false,
      createdMentionCount: 0,
    })));
    scopeTo("Emma", [
      {
        name: "Emma",
        viaPossessive: false,
        candidates: [
          {
            profileId: "profile-1",
            name: "Emma",
            relationshipContext: "friend",
            entityType: "person",
            noteCount: 3,
            lastNoteAt: new Date("2026-08-30T12:00:00").getTime(),
          },
        ],
      },
    ]);
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;
    await reachReview(handlers, "Met Emma today.");

    // An exact match is confirmed, not interrogated about its spelling. The
    // possessive wording says the *name itself* is in doubt, which is a
    // different and much stranger thing to be asked about somebody whose name
    // matched exactly.
    expect(
      screen.queryByText(/might belong to somebody you already keep/),
    ).toBeNull();
    expect(screen.getByText("This Emma?")).toBeTruthy();
  });

  test("should say a name matching nobody is about to invent somebody", async () => {
    (useAction as jest.Mock).mockReturnValue(
      jest.fn(async () => makeDraft({ name: "Jogging" })),
    );
    mockSaveCapture(jest.fn(async () => ({
      profileId: "profile-1",
      noteId: "note-1",
      createdProfile: true,
      createdMentionCount: 0,
    })));
    // Recognition heard "Joe King" as "Jogging". Nobody answers to it, so saving
    // would create a person the user never met — silently, until now.
    scopeTo("Jogging", [{ name: "Jogging", viaPossessive: false, candidates: [] }]);
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;
    await reachReview(handlers, "Met Joe King today.");

    expect(screen.getByText("Someone new — no one by this name yet.")).toBeTruthy();
    // Still saveable: inventing somebody is often exactly right. The screen
    // says which it is, it does not decide.
    expect(screen.getByLabelText("Remember this")).not.toBeDisabled();
  });

  test("should name the person a note is being added to", async () => {
    (useAction as jest.Mock).mockReturnValue(
      jest.fn(async () => makeDraft({ name: "Emma" })),
    );
    mockSaveCapture(jest.fn(async () => ({
      profileId: "profile-1",
      noteId: "note-1",
      createdProfile: false,
      createdMentionCount: 0,
    })));
    scopeTo("Emma", [
      {
        name: "Emma",
        viaPossessive: false,
        candidates: [
          {
            profileId: "profile-1",
            name: "Emma",
            relationshipContext: "friend",
            entityType: "person",
            noteCount: 3,
            lastNoteAt: new Date("2026-08-30T12:00:00").getTime(),
          },
        ],
      },
    ]);
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;
    await reachReview(handlers, "Met Emma today.");

    // Naming them, and what is already recorded, so landing on the wrong
    // person by a near-miss is as visible as inventing one. That used to be a
    // line saying "Adding to Emma · …"; it is now the candidate inside the
    // question, carrying the same detail for the same reason.
    expect(screen.getByText("This Emma?")).toBeTruthy();
    expect(
      screen.getByLabelText("Emma, friend · 3 notes · last 2026-08-30"),
    ).toBeTruthy();
  });

  test("should read the corrected transcript again, and use its result", async () => {
    const heard = makeDraft({ name: "Emma" });
    heard.mentions[0] = {
      name: "Marco",
      entityType: "person",
      quote: "at Marco's housewarming",
    };
    const reheard = makeDraft({ name: "Emma" });
    reheard.mentions[0] = {
      name: "Marcus",
      entityType: "person",
      quote: "at Marcus's housewarming",
    };
    // Counted rather than read off `extract.mock.calls` inside its own
    // initializer, which makes the mock's type refer to itself.
    let reads = 0;
    const extract = jest.fn(
      async (_args: { text: string; today: string; aboutName?: string }) => {
        reads += 1;
        return reads === 1 ? heard : reheard;
      },
    );
    (useAction as jest.Mock).mockReturnValue(extract);
    mockSaveCapture(jest.fn(async () => ({
      profileId: "profile-1",
      noteId: "note-1",
      createdProfile: false,
      createdMentionCount: 0,
    })));
    scopeTo("Emma");
    mockAlert("Read it again");
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;
    await reachReview(handlers, "Met Emma at Marco's housewarming.");
    expect(screen.getByDisplayValue("Marco")).toBeTruthy();

    // The mistake is a word in the note, so fixing it there should be enough —
    // otherwise the same correction has to be typed again into every field
    // extraction built from it.
    await act(async () => {
      fireEvent.changeText(
        screen.getByLabelText("What you said"),
        "Met Emma at Marcus's housewarming.",
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Read it again"));
    });

    await waitFor(() => expect(extract).toHaveBeenCalledTimes(2));
    expect(extract.mock.calls[1]?.[0].text).toBe(
      "Met Emma at Marcus's housewarming.",
    );
    await waitFor(() => expect(screen.getByDisplayValue("Marcus")).toBeTruthy());
  });

  test("should name the confirmation's button exactly as the link that asked, and read again on it", async () => {
    const extract = jest.fn(async () => makeDraft({ name: "Emma" }));
    (useAction as jest.Mock).mockReturnValue(extract);
    scopeTo("Emma");
    // Presses only a button with this exact label. One action, one name
    // (STYLE.md): the link says "Read it again", so the confirmation does too.
    const alert = mockAlert("Read it again");
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;
    await reachReview(handlers, "Met Emma today.");

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Name"), "Emma Kim");
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Read it again"));
    });

    expect(alert).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(extract).toHaveBeenCalledTimes(2));
  });

  test("should ask before throwing away edits, and keep them when the answer is no", async () => {
    const heard = makeDraft({ name: "Emma" });
    const extract = jest.fn(async () => heard);
    (useAction as jest.Mock).mockReturnValue(extract);
    scopeTo("Emma");
    mockAlert("Cancel");
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;
    await reachReview(handlers, "Met Emma today.");

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Name"), "Emma Kim");
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Read it again"));
    });

    // A re-read replaces everything above it, so declining has to leave the
    // edit exactly where it was.
    expect(extract).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue("Emma Kim")).toBeTruthy();
  });

  test("should not ask when nothing has been edited", async () => {
    const extract = jest.fn(async () => makeDraft({ name: "Emma" }));
    (useAction as jest.Mock).mockReturnValue(extract);
    scopeTo("Emma");
    const alert = mockAlert("Read it again");
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;
    await reachReview(handlers, "Met Emma today.");

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Read it again"));
    });

    // Nothing to lose, so nothing to ask about. A confirmation shown every
    // time is one people learn to dismiss without reading.
    expect(alert).not.toHaveBeenCalled();
    await waitFor(() => expect(extract).toHaveBeenCalledTimes(2));
  });

  test("should keep the draft on screen when a re-read fails", async () => {
    let reads = 0;
    const extract = jest.fn(async (): Promise<Draft> => {
      reads += 1;
      if (reads === 1) {
        return makeDraft({ name: "Emma" });
      }
      throw new ConvexError("Andy couldn't make sense of that one.");
    });
    (useAction as jest.Mock).mockReturnValue(extract);
    scopeTo("Emma");
    mockAlert("Read it again");
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;
    await reachReview(handlers, "Met Emma today.");

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Read it again"));
    });

    // Failing back to the recording screen would throw away the note the
    // re-read was asked to improve.
    await waitFor(() =>
      expect(screen.getByText("Andy couldn't make sense of that one.")).toBeTruthy(),
    );
    expect(screen.getByDisplayValue("Emma")).toBeTruthy();
  });

  test("should send typed words through the same pipeline, filed as written", async () => {
    const extract = jest.fn(
      async (_args: { text: string; today: string; aboutName?: string }) =>
        makeDraft({ name: "Emma" }),
    );
    (useAction as jest.Mock).mockReturnValue(extract);
    const saveCapture = jest.fn(
      async (_args: {
        transcript: string;
        draft: Draft;
        source: string;
        resolutions: { name: string; profileId: string }[];
      }) => ({
        profileId: "profile-1",
        noteId: "note-1",
        createdProfile: true,
        createdMentionCount: 0,
      }),
    );
    mockSaveCapture(saveCapture);
    scopeTo("Emma");
    captureListeners();

    // The orbit's Write door.
    const result = renderRouter("src/app", { initialUrl: "/capture?door=write" });
    await result;
    await act(async () => {
      fireEvent.changeText(
        screen.getByLabelText(WRITE_BODY),
        "Emma is a branding designer.",
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Let Andy read it" }));
    });

    // Same extraction, same review step, same save — only the door differs.
    await waitFor(() =>
      expect(extract.mock.calls[0]?.[0].text).toBe("Emma is a branding designer."),
    );
    expect(screen.getByText("What you wrote")).toBeTruthy();
    // Nothing was heard: the note was typed, and the lead must not say it was.
    expect(screen.getByText(/This is what Andy will remember\./)).toBeTruthy();
    expect(screen.queryByText(/heard/i)).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Remember this" }));
    });
    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    // The one difference that reaches the database.
    expect(saveCapture.mock.calls[0]?.[0].source).toBe("manual");
  });

  test("should give typing the whole screen rather than a field under the record button", async () => {
    (useAction as jest.Mock).mockReturnValue(jest.fn(async () => makeDraft()));
    scopeTo("Emma");
    captureListeners();

    // The orbit's Write door.
    const result = renderRouter("src/app", { initialUrl: "/capture?door=write" });
    await result;

    // With the recording controls still on show, nothing said which mode the
    // screen was in or that the line growing under them was the note.
    expect(screen.queryByRole("button", { name: "Start recording" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Scan a business card" }),
    ).toBeNull();
    expect(screen.getByLabelText(WRITE_BODY)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Let Andy read it" })).toBeTruthy();
    // One button: back is the chevron (capture-doors.md, the Write screen).
    expect(screen.queryByRole("button", { name: "Stop typing" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  test("should not read an empty typed note", async () => {
    const extract = jest.fn(async () => makeDraft());
    (useAction as jest.Mock).mockReturnValue(extract);
    scopeTo("Emma");
    captureListeners();

    // The orbit's Write door.
    const result = renderRouter("src/app", { initialUrl: "/capture?door=write" });
    await result;

    expect(screen.getByLabelText("Let Andy read it")).toBeDisabled();
    expect(extract).not.toHaveBeenCalled();
  });

  test("should let a fact be added to a draft that came back with none", async () => {
    const draft = makeDraft({ name: "Emma", keyFacts: [] });
    (useAction as jest.Mock).mockReturnValue(jest.fn(async () => draft));
    const saveCapture = jest.fn(
      async (_args: {
        transcript: string;
        draft: Draft;
        source: string;
        resolutions: { name: string; profileId: string }[];
      }) => ({
        profileId: "profile-1",
        noteId: "note-1",
        createdProfile: true,
        createdMentionCount: 0,
      }),
    );
    mockSaveCapture(saveCapture);
    scopeTo("Emma");
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;
    await reachReview(handlers, "Met Emma today.");

    // "Nothing pulled out of this one" was a dead end, on exactly the notes
    // extraction understood least.
    expect(screen.getByText("Nothing pulled out of this one.")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Add a fact" }));
    });
    expect(screen.getByLabelText("Fact 1").props.autoFocus).toBe(true);
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Fact 1"), "Is a branding designer.");
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Remember this" }));
    });

    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    expect(saveCapture.mock.calls[0]?.[0].draft.primary.keyFacts).toEqual([
      "Is a branding designer.",
    ]);
  });

  test("should say a misheard mention is about to invent somebody too", async () => {
    const draft = makeDraft({ name: "Emma" });
    // Recognition heard "Marcus" as "Marco". The subject is fine; the person the
    // note says they were with is a stranger.
    draft.mentions[0] = {
      name: "Marco",
      entityType: "person",
      quote: "at Marco's housewarming",
    };
    (useAction as jest.Mock).mockReturnValue(jest.fn(async () => draft));
    mockSaveCapture(jest.fn(async () => ({
      profileId: "profile-1",
      noteId: "note-1",
      createdProfile: false,
      createdMentionCount: 1,
    })));
    scopeTo("Emma", [
      {
        name: "Emma",
        viaPossessive: false,
        candidates: [
          {
            profileId: "profile-1",
            name: "Emma",
            relationshipContext: "friend",
            entityType: "person",
            noteCount: 3,
            lastNoteAt: new Date("2026-08-30T12:00:00").getTime(),
          },
        ],
      },
      { name: "Marco", viaPossessive: false, candidates: [] },
    ]);
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;
    await reachReview(handlers, "Met Emma at Marco's housewarming.");

    // Two different things happen to two different names. Emma has one
    // candidate, so saving requires confirming her — a required `NamePicker`,
    // not a silent line, per this slice's rule that a single candidate is
    // never settled on its own. Marco has none, so there is nothing to
    // confirm: a line saying he'll be invented, and saving needs no answer
    // for him.
    expect(
      screen.getByLabelText("Emma, friend · 3 notes · last 2026-08-30"),
    ).toBeTruthy();
    expect(screen.getByText("Someone new — no one by this name yet.")).toBeTruthy();
    expect(screen.getByLabelText("Remember this")).toBeDisabled();
  });

  test("should say nothing about a mention that repeats the subject", async () => {
    const draft = makeDraft({ name: "Emma" });
    // saveCapture drops a mention that is really the subject, so a line
    // promising anything about it would describe a row never written.
    draft.mentions[0] = {
      name: "Emma",
      entityType: "person",
      quote: "with Emma",
    };
    (useAction as jest.Mock).mockReturnValue(jest.fn(async () => draft));
    mockSaveCapture(jest.fn(async () => ({
      profileId: "profile-1",
      noteId: "note-1",
      createdProfile: true,
      createdMentionCount: 0,
    })));
    scopeTo("Emma", [{ name: "Emma", viaPossessive: false, candidates: [] }]);
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;
    await reachReview(handlers, "Met Emma today.");

    // Once, for the subject — not twice.
    expect(
      screen.getAllByText("Someone new — no one by this name yet."),
    ).toHaveLength(1);
  });

  test("should let one match be refused, so a second person by that name can exist", async () => {
    (useAction as jest.Mock).mockReturnValue(
      jest.fn(async () => makeDraft({ name: "Priya" })),
    );
    const saveCapture = jest.fn(
      async (_args: {
        transcript: string;
        draft: Draft;
        source: string;
        resolutions: { name: string; profileId: string | null }[];
      }) => ({
        profileId: "profile-new",
        noteId: "note-1",
        createdProfile: true,
        createdMentionCount: 0,
      }),
    );
    mockSaveCapture(saveCapture);
    scopeTo("Priya", [
      {
        name: "Priya",
        candidates: [
          {
            profileId: "profile-1",
            name: "Priya",
            relationshipContext: "client",
            entityType: "person",
            noteCount: 3,
            lastNoteAt: new Date("2026-09-01T12:00:00").getTime(),
          },
        ],
      },
    ]);
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;
    await reachReview(handlers, "Met Priya at the conference.");

    // One match used to be the end of it — joined silently. Then it became a
    // line with an escape hatch. Now it is a question, because one person
    // answering to a name is not the same as this being them: a Priya kept
    // months ago is easy to forget, and filing this note onto her does not
    // create a wrong person, it corrupts a real one.
    await waitFor(() =>
      expect(screen.getByText("This Priya?")).toBeTruthy(),
    );
    expect(screen.getByLabelText("Remember this")).toBeDisabled();

    await act(async () => {
      fireEvent.press(
        screen.getByRole("button", { name: "Someone new: a different person, also called Priya" }),
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Remember this" }));
    });

    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    expect(saveCapture.mock.calls[0]?.[0].resolutions).toEqual([
      { name: "Priya", profileId: null },
    ]);
  });

  test("should require confirming a mention's single match too, not only the subject's", async () => {
    (useAction as jest.Mock).mockReturnValue(
      jest.fn(async () => makeDraft({ name: "Priya" })),
    );
    const saveCapture = jest.fn(
      async (_args: {
        transcript: string;
        draft: Draft;
        source: string;
        resolutions: { name: string; profileId: string | null }[];
      }) => ({
        profileId: "profile-1",
        noteId: "note-1",
        createdProfile: false,
        createdMentionCount: 0,
      }),
    );
    mockSaveCapture(saveCapture);
    // Priya is the subject; Marcus is a mention. Both have exactly one match,
    // and both are now required — a single overlap match can quietly be the
    // wrong person (Maisie / Maisie H / Maisie Park), and a mention filed
    // against the wrong real profile is not a cheaper mistake than the
    // subject being wrong, it is the same mistake in a different field.
    scopeTo("Priya", [
      {
        name: "Priya",
        viaPossessive: false,
        candidates: [
          {
            profileId: "profile-1",
            name: "Priya",
            relationshipContext: "client",
            entityType: "person",
            noteCount: 3,
            lastNoteAt: new Date("2026-09-01T12:00:00").getTime(),
          },
        ],
      },
      {
        name: "Marcus",
        viaPossessive: false,
        candidates: [
          {
            profileId: "profile-marcus",
            name: "Marcus",
            relationshipContext: "climbing gym",
            entityType: "person",
            noteCount: 2,
            lastNoteAt: new Date("2026-09-02T12:00:00").getTime(),
          },
        ],
      },
    ]);
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;
    await reachReview(handlers, "Met Priya at the conference.");

    await waitFor(() => expect(screen.getByText("This Priya?")).toBeTruthy());
    expect(screen.getByText("This Marcus?")).toBeTruthy();
    expect(screen.getByLabelText("Remember this")).toBeDisabled();

    await act(async () => {
      fireEvent.press(
        screen.getByRole("button", { name: "Priya, client · 3 notes · last 2026-09-01" }),
      );
    });
    // Priya answered, Marcus not yet — still refused.
    expect(screen.getByLabelText("Remember this")).toBeDisabled();

    await act(async () => {
      fireEvent.press(
        screen.getByRole("button", {
          name: "Marcus, climbing gym · 2 notes · last 2026-09-02",
        }),
      );
    });
    expect(screen.getByLabelText("Remember this")).not.toBeDisabled();

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Remember this" }));
    });
    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    expect(saveCapture.mock.calls[0]?.[0].resolutions).toEqual([
      { name: "Priya", profileId: "profile-1" },
      { name: "Marcus", profileId: "profile-marcus" },
    ]);
  });

  test("should offer a new person alongside the candidates when a name is shared", async () => {
    (useAction as jest.Mock).mockReturnValue(
      jest.fn(async () => makeDraft({ name: "Emma" })),
    );
    const saveCapture = jest.fn(
      async (_args: {
        transcript: string;
        draft: Draft;
        source: string;
        resolutions: { name: string; profileId: string | null }[];
      }) => ({
        profileId: "profile-new",
        noteId: "note-1",
        createdProfile: true,
        createdMentionCount: 0,
      }),
    );
    mockSaveCapture(saveCapture);
    scopeTo("Emma", [
      {
        name: "Emma",
        viaPossessive: false,
        candidates: [
          {
            profileId: "profile-a",
            name: "Emma",
            relationshipContext: "client",
            entityType: "person",
            noteCount: 4,
            lastNoteAt: new Date("2026-08-01T12:00:00").getTime(),
          },
          {
            profileId: "profile-b",
            name: "Emma",
            relationshipContext: "neighbour",
            entityType: "person",
            noteCount: 1,
            lastNoteAt: new Date("2026-08-30T12:00:00").getTime(),
          },
        ],
      },
    ]);
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;
    await reachReview(handlers, "Met Emma today.");

    // Two people by a name means a third is possible, and the picker has to
    // say so — otherwise it can only ever file the note on somebody already
    // kept, which is the case it exists to handle.
    await act(async () => {
      fireEvent.press(
        screen.getByRole("button", { name: "Someone new: a different person, also called Emma" }),
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Remember this" }));
    });

    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    expect(saveCapture.mock.calls[0]?.[0].resolutions).toEqual([
      { name: "Emma", profileId: null },
    ]);
  });

  test("should let a mentioned person be refused too, not only the subject", async () => {
    const draft = makeDraft({ name: "Emma" });
    draft.mentions[0] = {
      name: "Marcus",
      entityType: "person",
      quote: "at Marcus's housewarming",
    };
    (useAction as jest.Mock).mockReturnValue(jest.fn(async () => draft));
    const saveCapture = jest.fn(
      async (_args: {
        transcript: string;
        draft: Draft;
        source: string;
        resolutions: { name: string; profileId: string | null }[];
      }) => ({
        profileId: "profile-1",
        noteId: "note-1",
        createdProfile: false,
        createdMentionCount: 1,
      }),
    );
    mockSaveCapture(saveCapture);
    scopeTo("Emma", [
      { name: "Emma", viaPossessive: false, candidates: [] },
      {
        name: "Marcus",
        candidates: [
          {
            profileId: "minho-1",
            name: "Marcus",
            relationshipContext: "friend",
            entityType: "person",
            noteCount: 2,
            lastNoteAt: new Date("2026-08-20T12:00:00").getTime(),
          },
        ],
      },
    ]);
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;
    await reachReview(handlers, "Met Emma at Marcus's housewarming.");

    // The mention gets the same question as the subject, and the same escape
    // out of it. A note can name a different Marcus than the one already
    // kept, and joining them silently is the same mistake wherever it
    // happens — so the picker is already open, not something to go find.
    await waitFor(() => expect(screen.getByText("This Marcus?")).toBeTruthy());
    expect(screen.getByLabelText("Remember this")).toBeDisabled();
    await act(async () => {
      fireEvent.press(
        screen.getByRole("button", { name: "Someone new: a different person, also called Marcus" }),
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Remember this" }));
    });

    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    expect(saveCapture.mock.calls[0]?.[0].resolutions).toEqual([
      { name: "Marcus", profileId: null },
    ]);
  });

  test("should drop an answer once its name is edited, even by capitalisation alone", async () => {
    (useAction as jest.Mock).mockReturnValue(
      jest.fn(async () => makeDraft({ name: "priya" })),
    );
    const saveCapture = jest.fn(
      async (_args: {
        transcript: string;
        draft: Draft;
        source: string;
        resolutions: { name: string; profileId: string | null }[];
      }) => ({
        profileId: "profile-1",
        noteId: "note-1",
        createdProfile: false,
        createdMentionCount: 0,
      }),
    );
    mockSaveCapture(saveCapture);
    scopeTo("priya", [
      {
        name: "priya",
        candidates: [
          {
            profileId: "profile-1",
            name: "Priya",
            relationshipContext: "client",
            entityType: "person",
            noteCount: 3,
            lastNoteAt: new Date("2026-09-01T12:00:00").getTime(),
          },
        ],
      },
    ]);
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;
    await reachReview(handlers, "Met priya at the conference.");

    // Answer "someone new" for the name as first heard.
    await act(async () => {
      fireEvent.press(
        screen.getByRole("button", { name: "Someone new: a different person, also called priya" }),
      );
    });

    // Then fix the capitalisation, which is an ordinary correction and not a
    // change of mind. The question is now about "Priya", and the answer given
    // for "priya" must not carry over.
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Name"), "Priya");
    });
    await act(async () => {
      fireEvent.press(
        screen.getByRole("button", {
          name: "Priya, client · 3 notes · last 2026-09-01",
        }),
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Remember this" }));
    });

    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    // One answer, under the corrected name, and it is the one just given —
    // not the stale `someone new` from before the capitalisation was fixed.
    // "priya" and "Priya" are the same name, so the question is the same
    // question and the latest answer to it is the one that counts.
    expect(saveCapture.mock.calls[0]?.[0].resolutions).toEqual([
      { name: "Priya", profileId: "profile-1" },
    ]);
  });

  test("should let a candidate be opened and come back to the draft untouched", async () => {
    (useAction as jest.Mock).mockReturnValue(
      jest.fn(async () => makeDraft({ name: "Emma" })),
    );
    const saveCapture = jest.fn(
      async (_args: {
        transcript: string;
        draft: Draft;
        source: string;
        resolutions: { name: string; profileId: string }[];
      }) => ({
        profileId: "profile-b",
        noteId: "note-1",
        createdProfile: false,
        createdMentionCount: 0,
      }),
    );
    mockSaveCapture(saveCapture);
    scopeTo("Emma", [
      {
        name: "Emma",
        viaPossessive: false,
        candidates: [
          {
            profileId: "profile-a",
            name: "Emma",
            relationshipContext: "client",
            entityType: "person",
            noteCount: 4,
            lastNoteAt: new Date("2026-08-01T12:00:00").getTime(),
          },
          {
            profileId: "profile-b",
            name: "Emma",
            relationshipContext: "neighbour",
            entityType: "person",
            noteCount: 1,
            lastNoteAt: new Date("2026-08-30T12:00:00").getTime(),
          },
        ],
      },
    ]);
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;
    await reachReview(handlers, "Met Emma today.");

    // A line of summary does not settle which Emma this is; what is written on
    // each of them does. So the choice has to survive going to look.
    await act(async () => {
      fireEvent.changeText(
        screen.getByLabelText("What you said"),
        "Met Emma at the cafe today.",
      );
    });
    await act(async () => {
      fireEvent.press(
        screen.getByLabelText("View Emma, neighbour · 1 note · last 2026-08-30"),
      );
    });
    expect(result.getPathname()).toBe("/profile/profile-b");

    await act(async () => {
      router.back();
    });

    // Every edit still here. Losing a transcript to a trip the screen invited
    // would make looking cost more than guessing.
    expect(
      screen.getByDisplayValue("Met Emma at the cafe today."),
    ).toBeTruthy();

    await act(async () => {
      fireEvent.press(
        screen.getByLabelText("Emma, neighbour · 1 note · last 2026-08-30"),
      );
    });
    // This test edits the transcript, so saving meets the question about it on
    // the way out. Not what this test is about — it keeps its facts and goes.
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Remember this" }));
    });

    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    const [args] = saveCapture.mock.calls[0] ?? [];
    expect(args?.transcript).toBe("Met Emma at the cafe today.");
    expect(args?.resolutions).toEqual([
      { name: "Emma", profileId: "profile-b" },
    ]);
  });

  test("should refuse to save until the user says which of two people by one name it is", async () => {
    (useAction as jest.Mock).mockReturnValue(
      jest.fn(async () => makeDraft({ name: "Priya" })),
    );
    const saveCapture = jest.fn(
      async (_args: {
        transcript: string;
        draft: Draft;
        source: string;
        resolutions: { name: string; profileId: string }[];
      }) => ({
        profileId: "profile-b",
        noteId: "note-1",
        createdProfile: false,
        createdMentionCount: 0,
      }),
    );
    mockSaveCapture(saveCapture);
    scopeTo("Priya", [
      {
        name: "Priya",
        candidates: [
          {
            profileId: "profile-a",
            name: "Priya",
            relationshipContext: "client",
            entityType: "person",
            noteCount: 4,
            lastNoteAt: new Date("2026-08-01T12:00:00").getTime(),
          },
          {
            profileId: "profile-b",
            name: "Priya",
            relationshipContext: "neighbour",
            entityType: "person",
            noteCount: 1,
            lastNoteAt: new Date("2026-08-30T12:00:00").getTime(),
          },
        ],
      },
    ]);
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;
    await reachReview(handlers, "Met Priya today.");

    // Saving on a coin toss is the failure this replaces, so the button is
    // shut until the question is answered rather than showing an error after.
    expect(screen.getByLabelText("Remember this")).toBeDisabled();
    expect(
      screen.getByText("Say which person each name above means, and this can be saved."),
    ).toBeTruthy();
    // Identical names are not a choice: what tells them apart has to be there.
    expect(screen.getByText("client · 4 notes · last 2026-08-01")).toBeTruthy();
    expect(screen.getByText("neighbour · 1 note · last 2026-08-30")).toBeTruthy();

    await act(async () => {
      fireEvent.press(
        screen.getByLabelText("Priya, neighbour · 1 note · last 2026-08-30"),
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Remember this" }));
    });

    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    expect(saveCapture.mock.calls[0]?.[0].resolutions).toEqual([
      { name: "Priya", profileId: "profile-b" },
    ]);
  });

  test("should ask nothing when every name belongs to at most one person", async () => {
    (useAction as jest.Mock).mockReturnValue(jest.fn(async () => makeDraft()));
    const saveCapture = jest.fn(
      async (_args: {
        transcript: string;
        draft: Draft;
        source: string;
        resolutions: { name: string; profileId: string }[];
      }) => ({
        profileId: "profile-1",
        noteId: "note-1",
        createdProfile: true,
        createdMentionCount: 0,
      }),
    );
    mockSaveCapture(saveCapture);
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;
    await reachReview(handlers, "spoken transcript");

    // The common case must not grow a question. An empty answer list, not a
    // missing key: the mutation reads it either way, and sending `[]` says the
    // screen looked.
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Remember this" }));
    });
    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    expect(saveCapture.mock.calls[0]?.[0].resolutions).toEqual([]);
  });

  test("should tell extraction who the note is about when the route names a profile", async () => {
    const extract = jest.fn(async () => makeDraft());
    (useAction as jest.Mock).mockReturnValue(extract);
    scopeTo("Emma");
    const handlers = captureListeners();

    const result = renderRouter("src/app", {
      initialUrl: "/profile/contact-1/capture",
    });
    await result;
    await reachReview(handlers, "His mother is unwell so he visits every weekend.");

    // The whole point of scoping: a note recorded on Emma's page that talks only
    // about her mother is still a note about Emma. Nothing in the words says so,
    // so the subject has to be carried rather than inferred.
    expect(extract).toHaveBeenCalledWith(
      expect.objectContaining({ aboutName: "Emma" }),
    );
  });

  test("should send no subject when capture starts from home", async () => {
    // Typed so `mock.calls[0]` is a real argument object rather than an empty
    // tuple — an untyped jest.fn() makes the assertion below a type error.
    const extract = jest.fn(
      async (_args: { text: string; today: string; aboutName?: string }) =>
        makeDraft(),
    );
    (useAction as jest.Mock).mockReturnValue(extract);
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;
    await reachReview(handlers, "spoken transcript");

    // From home the subject is genuinely unknown, and claiming one would file
    // the note under whoever the screen happened to be holding. Read off the
    // call rather than matched with `objectContaining({ aboutName: undefined })`,
    // which insists the key be present and so would fail a perfectly correct
    // implementation that simply left it off.
    expect(extract.mock.calls[0]?.[0].aboutName).toBeUndefined();
  });

  test("should refuse to record until it knows who the note is about", async () => {
    (useQuery as jest.Mock).mockReturnValue(undefined);
    captureListeners();

    const result = renderRouter("src/app", {
      initialUrl: "/profile/contact-1/capture",
    });
    await result;

    // Recording first and hoping the name lands before the user stops talking
    // fails precisely when the network is slow, and fails silently — the note
    // would be extracted as though it had come from home.
    expect(screen.getByLabelText("Record")).toBeDisabled();
    expect(screen.getByText("Finding out who this is about…")).toBeTruthy();
  });

  test("should say so and stay unrecordable when the route names nobody", async () => {
    (useQuery as jest.Mock).mockReturnValue(null);
    captureListeners();

    const result = renderRouter("src/app", {
      initialUrl: "/profile/does-not-exist/capture",
    });
    await result;

    expect(
      screen.getByText("Andy doesn't have anyone by that link."),
    ).toBeTruthy();
    expect(screen.getByLabelText("Record")).toBeDisabled();
  });

  test("should save a corrected mention quote, so a mistranscription cannot reach two profiles unchallenged", async () => {
    const draft = makeDraft();
    (useAction as jest.Mock).mockReturnValue(jest.fn(async () => draft));
    const saveCapture = jest.fn(
      async (_args: { transcript: string; draft: Draft; source: string }) => ({
        profileId: "profile-1",
        noteId: "note-1",
        createdProfile: true,
        createdMentionCount: 1,
      }),
    );
    mockSaveCapture(saveCapture);
    const handlers = captureListeners();

    const result = renderRouter("src/app", {
      initialUrl: "/profile/contact-1/capture",
    });
    await result;
    await reachReview(handlers, "spoken transcript");

    // The quote is the note's own words about someone who is not its subject,
    // and it is written to `noteMentions` where it shows on both people's
    // pages. Recognition mangles it exactly as often as it mangles a name —
    // "주말마다 his mother를 뵌다" came back as "팬다" on a real recording — so the
    // user has to be able to correct it, and until this test they could not.
    await act(async () => {
      fireEvent.changeText(
        screen.getByLabelText("Mentioned quote 1"),
        "her business partner Marcus Park",
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Remember this" }));
    });

    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    const [call] = saveCapture.mock.calls[0];
    expect(call.draft.mentions[0].quote).toBe("her business partner Marcus Park");
  });

  test("should still offer the quote field when extraction could not copy a span", async () => {
    // Claude returns "" when it cannot copy a span exactly, and the deployment
    // already holds a link saved that way. Rendering nothing for an empty quote
    // left the user no way to supply one.
    const draft = makeDraft();
    draft.mentions[0].quote = "";
    (useAction as jest.Mock).mockReturnValue(jest.fn(async () => draft));
    mockSaveCapture(jest.fn(async () => ({
      profileId: "profile-1",
      noteId: "note-1",
      createdProfile: true,
      createdMentionCount: 1,
    })));
    const handlers = captureListeners();

    const result = renderRouter("src/app", {
      initialUrl: "/profile/contact-1/capture",
    });
    await result;
    await reachReview(handlers, "spoken transcript");

    expect(screen.getByLabelText("Mentioned quote 1")).toBeTruthy();
  });

  /**
   * The last moment the question can be asked.
   *
   * After the save the words can still be corrected (device QA #48), but the
   * facts are never re-read from them — so a note saved with a corrected
   * transcript and facts built from the old wording keeps that disagreement
   * until someone fixes the facts by hand. And since search and Ask Andy read
   * the facts, the note would answer with wording its own record contradicts.
   */
  async function reachReviewAndEditTranscript(
    handlers: ReturnType<typeof captureListeners>,
    heard: string,
    corrected: string,
  ) {
    const result = renderRouter("src/app", {
      initialUrl: "/profile/contact-1/capture",
    });
    await result;
    await reachReview(handlers, heard);
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("What you said"), corrected);
    });
    return result;
  }

  test("should not explain What you said before anything has changed", async () => {
    (useAction as jest.Mock).mockReturnValue(jest.fn(async () => makeDraft()));
    const handlers = captureListeners();
    await renderRouter("src/app", { initialUrl: "/capture" });
    await reachReview(handlers, "Met Nina today.");

    // Removed (owner, 2026-10-11, copy-build-4 #24): the line that says the
    // details no longer match shows up at the moment it becomes true instead.
    expect(screen.queryByText(/Correcting this fixes the note itself/)).toBeNull();
    expect(screen.queryByText("The details above still come from the old wording.")).toBeNull();
  });

  test("should say under the wording, not in a dialog, that the details no longer match it", async () => {
    const asked = spyOnConfirm().mockImplementation(() => {});
    const draft = makeDraft();
    const extract = jest.fn(async () => draft);
    (useAction as jest.Mock).mockReturnValue(extract);
    const saveCapture = jest.fn(
      async (_args: { transcript: string; draft: Draft; source: string }) => ({
        profileId: "profile-1",
        noteId: "note-1",
        createdProfile: true,
        createdMentionCount: 0,
      }),
    );
    mockSaveCapture(saveCapture);
    const handlers = captureListeners();
    await reachReviewAndEditTranscript(handlers, "heard wrongly", "heard correctly");

    // Said where it happened (device QA #18/#19), with Read it again beside it.
    expect(screen.getByText("The details above still come from the old wording.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Read it again" })).toBeTruthy();

    // Saving does not stop to ask any more: the choice was made in place.
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Remember this" }));
    });
    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    expect(saveCapture.mock.calls[0][0].transcript).toBe("heard correctly");
    expect(asked).not.toHaveBeenCalled();
    // Nor are the reviewed details silently rebuilt.
    expect(extract).toHaveBeenCalledTimes(1);
  });

  test("should say nothing about it while the wording is untouched", async () => {
    const draft = makeDraft();
    (useAction as jest.Mock).mockReturnValue(jest.fn(async () => draft));
    const handlers = captureListeners();
    await renderRouter("src/app", { initialUrl: "/profile/contact-1/capture" });
    await reachReview(handlers, "heard correctly");

    expect(screen.queryByText("The details above still come from the old wording.")).toBeNull();
  });

  test("should rebuild the details from the corrected wording with Read it again, and stop saying so", async () => {
    const draft = makeDraft();
    const extract = jest.fn(async (_args: { text: string }) => draft);
    (useAction as jest.Mock).mockReturnValue(extract);
    const handlers = captureListeners();
    await reachReviewAndEditTranscript(handlers, "heard wrongly", "heard correctly");

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Read it again" }));
    });

    await waitFor(() => expect(extract).toHaveBeenCalledTimes(2));
    expect(extract.mock.calls[1]?.[0].text).toBe("heard correctly");
    await waitFor(() =>
      expect(screen.queryByText("The details above still come from the old wording.")).toBeNull(),
    );
  });

  test("should keep saying so after a re-read that failed, since the details are still the old ones", async () => {
    const draft = makeDraft();
    const extract = jest
      .fn(async (_args: { text: string }) => draft)
      .mockResolvedValueOnce(draft)
      .mockRejectedValueOnce(new Error("Andy couldn't reach Claude."));
    (useAction as jest.Mock).mockReturnValue(extract);
    const handlers = captureListeners();
    await reachReviewAndEditTranscript(handlers, "heard wrongly", "heard correctly");

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Read it again" }));
    });
    await waitFor(() => expect(extract).toHaveBeenCalledTimes(2));

    // The draft on screen is still the one built from "heard wrongly".
    expect(screen.getByText("The details above still come from the old wording.")).toBeTruthy();
  });

  test("should save the corrected transcript with the facts as they are", async () => {
    const draft = makeDraft();
    const extract = jest.fn(async () => draft);
    (useAction as jest.Mock).mockReturnValue(extract);
    const saveCapture = jest.fn(
      async (_args: { transcript: string; draft: Draft; source: string }) => ({
        profileId: "profile-1",
        noteId: "note-1",
        createdProfile: true,
        createdMentionCount: 0,
      }),
    );
    mockSaveCapture(saveCapture);
    const handlers = captureListeners();
    await reachReviewAndEditTranscript(handlers, "heard wrongly", "heard correctly");

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Remember this" }));
    });

    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    expect(saveCapture.mock.calls[0][0].transcript).toBe("heard correctly");
    // The facts a person reviewed are not silently re-derived — the same class
    // of failure day 3 refused when it made re-reading explicit.
    expect(extract).toHaveBeenCalledTimes(1);
  });

  test("should not ask when the only change is whitespace the keyboard added", async () => {
    const draft = makeDraft();
    (useAction as jest.Mock).mockReturnValue(jest.fn(async () => draft));
    const saveCapture = jest.fn(
      async (_args: { transcript: string; draft: Draft; source: string }) => ({
        profileId: "profile-1",
        noteId: "note-1",
        createdProfile: true,
        createdMentionCount: 0,
      }),
    );
    mockSaveCapture(saveCapture);
    const handlers = captureListeners();
    await reachReviewAndEditTranscript(
      handlers,
      "heard correctly",
      "  heard correctly  ",
    );

    const alert = spyOnConfirm().mockImplementation(() => {});
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Remember this" }));
    });

    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    // Nobody meant to make this edit, and a question raised about it teaches
    // people to dismiss the dialog without reading — which costs the one time
    // it matters.
    expect(alert).not.toHaveBeenCalled();
  });

  test("should not ask when the transcript was never touched", async () => {
    const draft = makeDraft();
    (useAction as jest.Mock).mockReturnValue(jest.fn(async () => draft));
    const saveCapture = jest.fn(
      async (_args: { transcript: string; draft: Draft; source: string }) => ({
        profileId: "profile-1",
        noteId: "note-1",
        createdProfile: true,
        createdMentionCount: 0,
      }),
    );
    mockSaveCapture(saveCapture);
    const handlers = captureListeners();

    const result = renderRouter("src/app", {
      initialUrl: "/profile/contact-1/capture",
    });
    await result;
    await reachReview(handlers, "heard correctly");

    const alert = spyOnConfirm().mockImplementation(() => {});
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Remember this" }));
    });

    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    // The common path stays one tap. A question on every save would be the
    // day-4 mistake again: making the ordinary route into a form.
    expect(alert).not.toHaveBeenCalled();
  });

  test("should let a wrongly-inferred first-met date be cleared before saving", async () => {
    // Whether "saw Nina today" describes a first meeting is not decidable from
    // the sentence, and extraction fills the date about half the time. That
    // makes it exactly the kind of value a person has to be able to see and
    // clear — it used to be saved without ever appearing on screen.
    const draft = makeDraft({ firstMetDate: "2026-08-27" });
    (useAction as jest.Mock).mockReturnValue(jest.fn(async () => draft));
    const saveCapture = jest.fn(
      async (_args: { transcript: string; draft: Draft; source: string }) => ({
        profileId: "profile-1",
        noteId: "note-1",
        createdProfile: true,
        createdMentionCount: 0,
      }),
    );
    mockSaveCapture(saveCapture);
    const handlers = captureListeners();

    // From home: somebody new, so the first meeting is theirs to confirm. On
    // a kept person's page the field is not shown at all.
    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;
    await reachReview(handlers, "saw Nina today");

    expect(screen.getByDisplayValue("2026-08-27")).toBeTruthy();
    await act(async () => {
      fireEvent.press(
        screen.getByLabelText("This was the first time we met"),
      );
    });
    // Unticking hides the date entirely — there is no date to hold once the
    // answer to "was this the first time" is no.
    expect(screen.queryByDisplayValue("2026-08-27")).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Remember this" }));
    });

    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    const [call] = saveCapture.mock.calls[0];
    expect(call.draft.primary.firstMetDate).toBeNull();
  });
});

describe("capture screen photo door", () => {
  // Every test in here renders /profile/contact-1/capture, so the route names
  // a profile and the screen expects to be told who it is. Left at the shared
  // default the query would read as permanently loading, and each test would
  // be exercising a state the real route passes through in milliseconds.
  beforeEach(() => {
    scopeTo("Nina");
    // These are about the words step, reached through iOS's camera and album
    // (a build without Andy's own camera). jest-expo stands in for every
    // installed native module, so say so; Andy's camera has its own tests
    // (photo-camera.test.tsx).
    const real = native.hasNativeModule;
    jest.spyOn(native, "hasNativeModule").mockImplementation((name) => name !== "ExpoCamera" && real(name));
  });

  afterEach(() => {
    jest.clearAllMocks();
    // `clearAllMocks` empties call records but leaves a `jest.spyOn`
    // implementation in place, so an `Alert.alert` spy set by one test kept
    // answering dialogs in every test after it. That is how the transcript-edit
    // test below passed for a while: it never mocked an alert, and a spy from
    // four tests earlier was pressing "Keep my facts" on its behalf. Run alone
    // it failed.
    jest.restoreAllMocks();
  });

  /** A photo taken with the camera, read into these words. */
  function shoot(words: { about: string | null; text: string }, base64 = "fake-base64-jpeg-data") {
    const readPhoto = jest.fn(async (_args: { imageBase64: string; mediaType: string }) => words);
    mockAlert("Take a photo");
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ base64, uri: "file:///photo.jpg" }],
    });
    return readPhoto;
  }

  test("should show the words read off a photo, with whose page it is, to be checked before anything is read", async () => {
    const extract = jest.fn(async () => makeDraft({ name: "Priya" }, []));
    const readPhoto = shoot({ about: "Priya", text: "coffee at Tartine\nask Marcus?" });
    mockActions({ readPhoto, extract });
    scopeTo("Nina");

    await renderRouter("src/app", { initialUrl: "/capture?door=photo" });
    await waitFor(() => expect(screen.getByTestId("photo-words")).toBeTruthy());

    expect(readPhoto.mock.calls[0]?.[0]).toEqual({ imageBase64: "fake-base64-jpeg-data", mediaType: "image/jpeg" });
    expect(screen.getByText("What the photo says about")).toBeTruthy();
    expect(screen.getByLabelText("What the photo says about").props.value).toBe("Priya");
    // Exactly as written — the question mark included.
    expect(screen.getByLabelText("What the photo says").props.value).toBe("coffee at Tartine\nask Marcus?");
    expect(extract).not.toHaveBeenCalled();
  });

  test("should read the checked words as a photo note, about the name as corrected", async () => {
    const extract = jest.fn(async (_args: { text: string; aboutName?: string }) => makeDraft({ name: "Priya Shah" }, []));
    const readPhoto = shoot({ about: "Pria", text: "coffee at Tartine" });
    mockActions({ readPhoto, extract });
    const saveCapture = jest.fn(async (_args: { transcript: string; source: string }) => ({
      profileId: "profile-1",
      noteId: "note-1",
      createdProfile: true,
      createdMentionCount: 0,
    }));
    mockSaveCapture(saveCapture);
    scopeTo("Nina");
    await renderRouter("src/app", { initialUrl: "/capture?door=photo" });
    await waitFor(() => expect(screen.getByTestId("photo-words")).toBeTruthy());

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("What the photo says about"), "Priya Shah");
      fireEvent.changeText(screen.getByLabelText("What the photo says"), "coffee at Tartine, Tuesday");
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Let Andy read it" }));
    });

    await waitFor(() => expect(extract).toHaveBeenCalledTimes(1));
    expect(extract.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ text: "coffee at Tartine, Tuesday", aboutName: "Priya Shah" }),
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Remember this" })).toBeTruthy());
    expect(screen.getByText("What the photo says")).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Remember this" }));
    });
    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    expect(saveCapture.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ source: "photo", transcript: "coffee at Tartine, Tuesday" }),
    );
  });

  test("should keep the name fixed when the photo was taken from that person's page", async () => {
    const readPhoto = shoot({ about: "Someone Else", text: "coffee" });
    mockActions({ readPhoto });

    await renderRouter("src/app", { initialUrl: "/profile/contact-1/capture?door=photo" });
    await waitFor(() => expect(screen.getByTestId("photo-words")).toBeTruthy());

    expect(screen.getByTestId("photo-words-about").props.children).toBe("Nina");
    expect(screen.queryByLabelText("What the photo says about")).toBeNull();
  });

  test("should say so when a photo has no words, and offer to retake it", async () => {
    const readPhoto = shoot({ about: null, text: "" });
    mockActions({ readPhoto });
    scopeTo("Nina");

    await renderRouter("src/app", { initialUrl: "/capture?door=photo" });
    await waitFor(() => expect(screen.getByTestId("photo-nothing")).toBeTruthy());

    expect(screen.queryByRole("button", { name: "Let Andy read it" })).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Retake" }));
    });
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalledTimes(2);
  });

  test("should show the photo full size from its thumbnail", async () => {
    mockActions({ readPhoto: shoot({ about: null, text: "coffee" }) });
    scopeTo("Nina");
    await renderRouter("src/app", { initialUrl: "/capture?door=photo" });
    await waitFor(() => expect(screen.getByTestId("photo-words")).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "See the photo full size" }));
    });

    expect(screen.getByTestId("photo-viewer")).toBeTruthy();
  });

  test("should not ask for the whole photo library to pick one card", async () => {
    mockAlert("Choose from library");
    const ask = ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock;
    const launch = ImagePicker.launchImageLibraryAsync as jest.Mock;
    launch.mockResolvedValueOnce({ canceled: true, assets: null });

    // The orbit's Photo door, which asks camera or library as it opens.
    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1/capture?door=photo" });
    await result;
    await act(async () => {});

    await waitFor(() => expect(launch).toHaveBeenCalledTimes(1));
    // The iOS picker runs outside the app and returns only the chosen photo.
    // Asking bought read access to the whole library, and a "no" blocked a
    // choice that works regardless — the same mistake the profile photo
    // picker already avoids (profile.test.tsx).
    expect(ask).not.toHaveBeenCalled();
    expect(screen.queryByText(/needs access to your photos/)).toBeNull();
  });

  // Found on the simulator 2026-10-01: while a card was being read, the
  // screen behind it still said "Tap record and say what you want to
  // remember", an instruction to do something else entirely.
  test("should ask before leaving checked words behind", async () => {
    mockActions({ readPhoto: shoot({ about: "Priya", text: "coffee at Tartine" }) });
    scopeTo("Nina");
    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;
    await act(async () => {
      router.push("/capture?door=photo");
    });
    await waitFor(() => expect(screen.getByTestId("photo-words")).toBeTruthy());

    await act(async () => {
      router.back();
    });

    // This block answers dialogs through a spy (the camera question).
    expect(spyOnConfirm()).toHaveBeenCalledWith("Discard this note?", "What you wrote will be cleared.", expect.any(Array));
    expect(result.getPathname()).toBe("/capture");
  });

  test("should keep the photo and the name with the words on the phone, so Continue can bring them back", async () => {
    mockActions({ readPhoto: shoot({ about: "Priya", text: "coffee at Tartine" }) });
    scopeTo("Nina");
    await renderRouter("src/app", { initialUrl: "/capture?door=photo" });
    await waitFor(() => expect(screen.getByTestId("photo-words")).toBeTruthy());

    const keptDraft = () => {
      const raw = (jest.requireMock("expo-file-system") as { __files: Map<string, string> }).__files.get(
        "file:///documents/capture-draft/draft.json",
      );
      return raw === undefined ? [] : (JSON.parse(raw) as { photo?: { uri: string; about: string } }[]);
    };
    await waitFor(() =>
      expect(keptDraft()[0]?.photo).toEqual(expect.objectContaining({ uri: "file:///photo.jpg", about: "Priya" })),
    );
  });

  test("should keep the photo and its words when a retake is backed out of", async () => {
    const readPhoto = shoot({ about: "Priya", text: "coffee at Tartine" });
    mockActions({ readPhoto });
    scopeTo("Nina");
    await renderRouter("src/app", { initialUrl: "/capture?door=photo" });
    await waitFor(() => expect(screen.getByTestId("photo-words")).toBeTruthy());

    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValueOnce({ canceled: true, assets: null });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Retake" }));
    });

    expect(screen.getByLabelText("What the photo says").props.value).toBe("coffee at Tartine");
    expect(screen.getByLabelText("What the photo says about").props.value).toBe("Priya");
    expect(readPhoto).toHaveBeenCalledTimes(1);
  });

  test("should keep checked words on the phone when the connection goes before they are read", async () => {
    mockActions({ readPhoto: shoot({ about: null, text: "coffee at Tartine" }) });
    scopeTo("Nina");
    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;
    await act(async () => {
      router.push("/capture?door=photo");
    });
    await waitFor(() => expect(screen.getByTestId("photo-words")).toBeTruthy());

    (useConvexConnectionState as jest.Mock).mockReturnValue({
      hasInflightRequests: false,
      isWebSocketConnected: false,
      timeOfOldestInflightRequest: null,
      hasEverConnected: true,
      connectionCount: 1,
      connectionRetries: 0,
      inflightMutations: 0,
      inflightActions: 0,
    });
    try {
      await act(async () => {
        fireEvent.changeText(screen.getByLabelText("What the photo says"), "coffee at Tartine!");
      });
      await act(async () => {
        fireEvent.press(screen.getByRole("button", { name: "Keep this note" }));
      });

      const outbox = JSON.parse(
        (jest.requireMock("expo-file-system") as { __files: Map<string, string> }).__files.get(
          "file:///documents/outbox/notes.json",
        )!,
      ) as { text: string }[];
      expect(outbox.map((n) => n.text)).toEqual(["coffee at Tartine!"]);
      expect(result.getPathname()).toBe("/");
    } finally {
      (useConvexConnectionState as jest.Mock).mockReturnValue({
        hasInflightRequests: false,
        isWebSocketConnected: true,
        timeOfOldestInflightRequest: null,
        hasEverConnected: true,
        connectionCount: 1,
        connectionRetries: 0,
        inflightMutations: 0,
        inflightActions: 0,
      });
      (jest.requireMock("expo-file-system") as { __files: Map<string, string> }).__files.delete(
        "file:///documents/outbox/notes.json",
      );
    }
  });

  test("should say it is reading the photo while the photo is being read", async () => {
    let finish: (value: { about: string | null; text: string }) => void = () => {};
    const readPhoto = jest.fn(
      () => new Promise<{ about: string | null; text: string }>((resolve) => { finish = resolve; }),
    );
    shoot({ about: null, text: "" });
    mockActions({ readPhoto });

    await renderRouter("src/app", { initialUrl: "/profile/contact-1/capture?door=photo" });
    await waitFor(() => expect(readPhoto).toHaveBeenCalledTimes(1));

    expect(screen.getByText("Reading the photo…")).toBeTruthy();
    expect(screen.queryByText(/Tap record/)).toBeNull();

    await act(async () => {
      finish({ about: null, text: "coffee" });
    });
    await waitFor(() => expect(screen.getByTestId("photo-words")).toBeTruthy());
  });

  test("should show no error and save nothing when the business card picker is cancelled", async () => {
    const readPhoto = jest.fn(async () => {
      throw new Error("should never be called for a cancelled pick");
    });
    mockActions({ readPhoto });
    const saveCapture = jest.fn(
      async (_args: {
        transcript: string;
        draft: Draft;
        source: string;
        resolutions: { name: string; profileId: string }[];
      }) => ({
        profileId: "profile-1",
        noteId: "note-1",
        createdProfile: true,
        createdMentionCount: 0,
      }),
    );
    mockSaveCapture(saveCapture);
    mockAlert("Take a photo");
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      granted: true,
    });
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValueOnce({
      canceled: true,
      assets: null,
    });

    // The orbit's Photo door, which asks camera or library as it opens.
    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1/capture?door=photo" });
    await result;
    await act(async () => {});

    // Backing out of the picker is a normal thing to do, not an error — no
    // message shown, nothing extracted, nothing saved, still on the idle
    // screen ready to try again.
    expect(readPhoto).not.toHaveBeenCalled();
    expect(saveCapture).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Remember this" })).toBeNull();
    expect(screen.getByRole("button", { name: "Record" })).toBeTruthy();
    expect(screen.queryByText(/didn't come through/)).toBeNull();
    expect(screen.queryByText(/couldn't read that card/)).toBeNull();
    expect(screen.queryByText(/needs the camera/)).toBeNull();
  });
});

/**
 * Offline, a note is kept on this phone instead of read (`src/lib/outbox.tsx`),
 * so nothing someone told you is lost when the hall has no signal (device QA,
 * 2026-10-07). "On disk" is jest.setup.ts's in-memory `expo-file-system`.
 */
describe("capture screen offline", () => {
  const files = () =>
    (jest.requireMock("expo-file-system") as { __files: Map<string, string> }).__files;
  const OUTBOX = "file:///documents/outbox/notes.json";
  const kept = () => {
    // The outbox file itself: the phone also keeps a copy for reading offline.
    const raw = files().get(OUTBOX);
    return raw === undefined ? [] : (JSON.parse(raw) as { text: string; kind: string; today: string; ownerId: string }[]);
  };

  function connected(isWebSocketConnected: boolean) {
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

  async function typeNote(text: string) {
    // The orbit's Write door.
    const result = renderRouter("src/app", { initialUrl: "/capture?door=write" });
    await result;
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText(WRITE_BODY), text);
    });
    // Wrapped: an async function returning the router result directly would
    // await it, and what came back would no longer have `getPathname`.
    return { result };
  }

  beforeEach(() => {
    captureListeners();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    connected(true);
  });

  test("should keep the note on this phone instead of reading it when offline", async () => {
    connected(false);
    const extract = jest.fn();
    (useAction as jest.Mock).mockReturnValue(extract);

    await typeNote("Met Rowan at the booth, fosters two greyhounds.");

    expect(screen.queryByRole("button", { name: "Let Andy read it" })).toBeNull();
    expect(screen.getByText(/You're offline\. Andy will keep this note on this phone/)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Keep this note" }));
    });

    expect(extract).not.toHaveBeenCalled();
    // Left for home, which says the note is waiting.
    await waitFor(() => expect(screen.getByTestId("outbox-line")).toBeTruthy());
    expect(screen.getByText(/1 note kept on this phone, waiting for Andy to read it\./)).toBeTruthy();
    expect(kept()).toEqual([
      expect.objectContaining({
        text: "Met Rowan at the booth, fosters two greyhounds.",
        kind: "typed",
        ownerId: "user_default",
        today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    ]);
  });

  test("should read the note as before when online, keeping nothing on the phone", async () => {
    connected(true);

    await typeNote("Met Rowan at the booth.");

    expect(screen.getByRole("button", { name: "Let Andy read it" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Keep this note" })).toBeNull();
    expect(files().has(OUTBOX)).toBe(false);
  });

  test("should stay, words intact, and say so when the phone cannot keep the note", async () => {
    connected(false);
    const { File } = jest.requireMock("expo-file-system") as { File: { prototype: { write: () => void } } };
    jest.spyOn(File.prototype, "write").mockImplementation(() => {
      throw new Error("No space left on device");
    });

    const { result } = await typeNote("Met Rowan at the booth.");
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Keep this note" }));
    });

    expect(screen.getByText(/Andy couldn't keep this note on the phone/)).toBeTruthy();
    expect(screen.getByLabelText(WRITE_BODY).props.value).toBe("Met Rowan at the booth.");
    expect(result.getPathname()).toBe("/capture");
  });

  function waiting(text: string, extra: Record<string, unknown> = {}) {
    files().set(
      "file:///documents/outbox/notes.json",
      JSON.stringify([
        { id: "w1", ownerId: "user_default", keptAt: 1, today: "2026-10-01", text, kind: "typed", ...extra },
      ]),
    );
  }

  test("should read a waiting note against the day it was said, and drop the phone's copy once saved", async () => {
    connected(true);
    waiting("Met Rowan yesterday at the booth.");
    const extract = jest.fn(async () => makeDraft({ name: "Rowan" }));
    (useAction as jest.Mock).mockReturnValue(extract);
    const saveCapture = jest.fn(async (_args: { source: string; keptAt?: number }) => ({
      profileId: "profile-1",
      noteId: "note-1",
      createdProfile: true,
      createdMentionCount: 0,
    }));
    mockSaveCapture(saveCapture);
    scopeTo("Rowan");

    await renderRouter("src/app", { initialUrl: "/capture?outbox=w1" });

    // Read at once, as if Read it had been pressed — with *its* day, so its
    // "yesterday" is 30 September, not the day before today.
    await waitFor(() => expect(extract).toHaveBeenCalledTimes(1));
    expect(extract.mock.calls[0]).toEqual([
      expect.objectContaining({ text: "Met Rowan yesterday at the booth.", today: "2026-10-01" }),
    ]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Remember this" })).toBeTruthy());
    expect(screen.getByText("What you wrote")).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Remember this" }));
    });

    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    // Filed under the moment it was kept, not now.
    expect(saveCapture.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ source: "manual", keptAt: 1 }));
    expect(kept()).toEqual([]);
  });

  test("should leave a waiting note without asking — it stays kept whatever is pressed", async () => {
    connected(true);
    waiting("Met Rowan at the booth.");
    (useAction as jest.Mock).mockReturnValue(
      jest.fn(async () => {
        throw new Error("network");
      }),
    );
    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;
    await act(async () => {
      router.push("/capture?outbox=w1");
    });
    await waitFor(() => expect(screen.getByText(/couldn't make sense of that one/)).toBeTruthy());

    await act(async () => {
      router.back();
    });

    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    expect(result.getPathname()).toBe("/");
    expect(kept().map((n) => n.text)).toEqual(["Met Rowan at the booth."]);
  });

  test("should keep a waiting note on the phone when it is not saved", async () => {
    connected(true);
    waiting("Met Rowan at the booth.");
    (useAction as jest.Mock).mockReturnValue(
      jest.fn(async () => {
        throw new Error("network");
      }),
    );

    await renderRouter("src/app", { initialUrl: "/capture?outbox=w1" });

    await waitFor(() => expect(screen.getByText(/couldn't make sense of that one/)).toBeTruthy());
    expect(screen.getByLabelText(WRITE_BODY).props.value).toBe("Met Rowan at the booth.");
    expect(kept().map((n) => n.text)).toEqual(["Met Rowan at the booth."]);
  });

  test("should not keep a waiting note a second time when it is opened offline", async () => {
    connected(false);
    waiting("Met Rowan at the booth.");

    const extract = jest.fn(async () => makeDraft({ name: "Rowan" }));
    (useAction as jest.Mock).mockReturnValue(extract);
    scopeTo("Rowan");

    await renderRouter("src/app", { initialUrl: "/capture?outbox=w1" });

    // Its words, marked as still kept — and nothing that would keep it again.
    expect(screen.getByLabelText(WRITE_BODY).props.value).toBe("Met Rowan at the booth.");
    expect(screen.getByText(/This note is still kept on this phone/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Keep this note" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Let Andy read it" })).toBeNull();
    expect(kept()).toHaveLength(1);
    expect(extract).not.toHaveBeenCalled();
  });

  test("should say so, not show a blank new note, when the waiting note is no longer here", async () => {
    connected(true);

    await renderRouter("src/app", { initialUrl: "/capture?outbox=gone" });

    expect(screen.getByText(/That note isn't waiting on this phone any more/)).toBeTruthy();
  });

  test("should keep the waiting note when its words are put away and something else is saved", async () => {
    connected(true);
    waiting("Met Rowan yesterday at the booth.");
    const handlers = captureListeners();
    const extract = jest.fn(async (_args: { text: string; today: string }) => makeDraft({ name: "Rowan" }));
    (useAction as jest.Mock).mockReturnValue(extract);
    const saveCapture = jest.fn(async (_args: { keptAt?: number }) => ({
      profileId: "profile-1",
      noteId: "note-1",
      createdProfile: true,
      createdMentionCount: 0,
    }));
    mockSaveCapture(saveCapture);
    scopeTo("Rowan");

    await renderRouter("src/app", { initialUrl: "/capture?outbox=w1" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Discard and start over" })).toBeTruthy());

    // Back to its words, then away from them: a new recording, saved instead.
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Discard and start over" }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Record again" }));
    });
    await reachReview(handlers, "Lunch with Rowan yesterday.");
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Remember this" }));
    });

    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    // The new note was read against today, not the waiting note's day…
    expect(extract.mock.calls[1]?.[0].today).not.toBe("2026-10-01");
    // …nor filed under its day…
    expect(saveCapture.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ keptAt: undefined }));
    // …and the waiting note is still on the phone, unsaved and not lost.
    expect(kept().map((n) => n.text)).toEqual(["Met Rowan yesterday at the booth."]);
  });

  test("should say speech needs a connection, offline, where this phone has no model for the language", async () => {
    (ExpoSpeechRecognitionModule.start as jest.Mock).mockClear();
    connected(false);
    (ExpoSpeechRecognitionModule.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ExpoSpeechRecognitionModule.supportsOnDeviceRecognition as jest.Mock).mockReturnValue(false);

    await renderRouter("src/app", { initialUrl: "/capture" });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Record" }));
    });

    expect(screen.getByText("Speech needs a connection for this language — write it instead.")).toBeTruthy();
    expect(ExpoSpeechRecognitionModule.start).not.toHaveBeenCalled();
    // Decision B: the way to still leave the note is a button right here.
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Write instead" }));
    });
    expect(screen.getByLabelText(WRITE_BODY)).toBeTruthy();
  });

  test("should say the microphone is off, and offer Write instead, when it was refused", async () => {
    connected(true);
    (ExpoSpeechRecognitionModule.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });

    await renderRouter("src/app", { initialUrl: "/capture" });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Record" }));
    });

    expect(
      screen.getByText(
        "Andy needs the microphone and speech recognition to take a voice note. Turn them on in Settings, or write it instead.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Write instead" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Record" })).toBeNull();
  });

  test("should record offline when the phone can turn speech into words itself", async () => {
    connected(false);
    (ExpoSpeechRecognitionModule.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ExpoSpeechRecognitionModule.supportsOnDeviceRecognition as jest.Mock).mockReturnValue(true);
    try {
      await renderRouter("src/app", { initialUrl: "/capture" });
      await act(async () => {
        fireEvent.press(screen.getByRole("button", { name: "Record" }));
      });

      expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledWith(
        expect.objectContaining({ requiresOnDeviceRecognition: true }),
      );
    } finally {
      (ExpoSpeechRecognitionModule.supportsOnDeviceRecognition as jest.Mock).mockReturnValue(false);
    }
  });
});

test("should leave words just heard without asking — only written words do", async () => {
  scopeTo("Emma");
  const handlers = captureListeners();
  const result = renderRouter("src/app", { initialUrl: "/" });
  await result;
  await act(async () => {
    router.push("/capture");
  });
  await act(async () => {
    handlers.start?.();
  });
  await act(async () => {
    handlers.result?.({ results: [{ transcript: "Met Emma at the booth" }], isFinal: true });
  });
  await act(async () => {
    handlers.end?.();
  });
  expect(screen.getByLabelText("What you said")).toBeTruthy();

  await act(async () => {
    router.back();
  });

  expect(screen.queryByTestId("confirm-dialog")).toBeNull();
  expect(result.getPathname()).toBe("/");
});

test("should not let Start over be pressed while a start is still on its way", async () => {
  scopeTo("Emma");
  const { ExpoSpeechRecognitionModule } = jest.requireMock("expo-speech-recognition");
  // Held open: the screen stays in "starting".
  (ExpoSpeechRecognitionModule.requestPermissionsAsync as jest.Mock).mockReturnValue(new Promise(() => {}));
  captureListeners();
  await renderRouter("src/app", { initialUrl: "/profile/contact-1/capture" });

  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Record" }));
  });

  expect(screen.getByRole("button", { name: "Start over" })).toBeDisabled();
});

test("should draw the newest words darkest and older ones lighter", async () => {
  scopeTo("Emma");
  const handlers = captureListeners();
  await renderRouter("src/app", { initialUrl: "/profile/contact-1/capture" });
  await act(async () => {
    handlers.start?.();
  });
  for (const transcript of ["Met Emma.", "She paints.", "Moving to Lisbon."]) {
    await act(async () => {
      handlers.result?.({ results: [{ transcript }], isFinal: true });
    });
  }

  const opacity = (text: RegExp) => StyleSheet.flatten(screen.getByText(text).props.style)?.opacity;
  expect(opacity(/Moving to Lisbon\./)).toBeUndefined();
  expect(opacity(/She paints\./)).toBe(0.8);
  expect(opacity(/Met Emma\./)).toBe(0.7);
});
