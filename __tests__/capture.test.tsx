import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react-native";
import { Alert } from "react-native";
import { useAction, useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { useSpeechRecognitionEvent } from "expo-speech-recognition";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import { api } from "@convex/_generated/api";
import type { Draft } from "@convex/extractionPrompt";

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
  (useMutation as jest.Mock).mockImplementation((fn: unknown) =>
    getFunctionName(fn as never) === getFunctionName(api.notes.saveCapture)
      ? saveCapture
      : jest.fn(async () => undefined),
  );
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
}: {
  extract?: jest.Mock;
  readCard?: jest.Mock;
}) {
  (useAction as jest.Mock).mockImplementation((fn: unknown) => {
    if (readCard && getFunctionName(fn as never) === getFunctionName(api.extraction.fromBusinessCard)) {
      return readCard;
    }
    if (extract && getFunctionName(fn as never) === getFunctionName(api.extraction.fromTranscript)) {
      return extract;
    }
    return jest.fn(async () => undefined);
  });
}

/**
 * `Alert.alert` backs three things now: the "Scan a business card"
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
  return jest
    .spyOn(Alert, "alert")
    .mockImplementation((_title, _message, buttons) => {
      buttons?.find((b) => b.text === buttonText)?.onPress?.();
    });
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
 * `runExtraction` reacts to. Waits for "Save note" rather than a fixed
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
  (useQuery as jest.Mock).mockImplementation((reference: unknown) =>
    getFunctionName(reference as never) === "profiles:resolveNames"
      ? ambiguous
      : {
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
        },
  );
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
  await waitFor(() => expect(screen.getByRole("button", { name: "Save note" })).toBeTruthy());
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
  });

  test("should save the edited fact text, not the original, when Save note is pressed", async () => {
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
    await fireEvent.press(screen.getByRole("button", { name: "Save note" }));

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
    await fireEvent.press(screen.getByRole("button", { name: "Save note" }));

    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    const [call] = saveCapture.mock.calls[0];
    expect(call.draft.primary.keyFacts).toEqual([]);
    expect(call.draft.primary.tags).toEqual([]);
    expect(call.draft.mentions).toEqual([]);
  });

  test("should disable Save note when the draft has no name", async () => {
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

    const saveButton = screen.getByRole("button", { name: "Save note" });
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
    await fireEvent.press(screen.getByRole("button", { name: "Save note" }));

    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    // Still on review, with the edit intact — not lost, not re-navigated away.
    expect(screen.getByDisplayValue("branding designer")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save note" })).toBeTruthy();
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
      fireEvent.press(screen.getByRole("button", { name: "Save note" }));
    });
    const [call] = saveCapture.mock.calls[0];
    expect(call.draft.primary.keyFacts).toContain("branding designer");
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
      fireEvent.press(screen.getByRole("button", { name: "Save note" }));
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
        fireEvent.press(screen.getByRole("button", { name: "Save note" }));
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
    expect(screen.getByLabelText("Save note")).toBeDisabled();
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
        screen.getByLabelText("New person called Prisley"),
      );
    });
    expect(screen.getByLabelText("Save note")).not.toBeDisabled();

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Save note"));
    });
    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    expect(saveCapture.mock.calls[0]?.[0].resolutions).toEqual([
      { name: "Prisley", profileId: null },
    ]);
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
    expect(screen.getByLabelText("Save note")).not.toBeDisabled();
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
    expect(screen.getByLabelText("Save note")).not.toBeDisabled();
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
      fireEvent.press(screen.getByLabelText("Save note"));
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

    // The picker used to render in one block above `Save note`, several
    // screens down — so opening it was indistinguishable from pressing
    // nothing. Position is the fix, so position is what this asserts: the
    // choices sit inside the same Name field as the input.
    const nameField = within(screen.getByTestId("field-Name"));
    expect(nameField.getByLabelText("New person called Nina")).toBeTruthy();
    expect(nameField.getByText("This Nina?")).toBeTruthy();
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

    expect(screen.getByText("New person — nobody by this name yet.")).toBeTruthy();
    // Still saveable: inventing somebody is often exactly right. The screen
    // says which it is, it does not decide.
    expect(screen.getByLabelText("Save note")).not.toBeDisabled();
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
    mockAlert("Read again");
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
    const alert = mockAlert("Read again");
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
      throw new Error("Andy couldn't make sense of that one.");
    });
    (useAction as jest.Mock).mockReturnValue(extract);
    scopeTo("Emma");
    mockAlert("Read again");
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

    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Type it instead" }));
    });
    await act(async () => {
      fireEvent.changeText(
        screen.getByLabelText("Type a note"),
        "Emma is a branding designer.",
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Read it back" }));
    });

    // Same extraction, same review step, same save — only the door differs.
    await waitFor(() =>
      expect(extract.mock.calls[0]?.[0].text).toBe("Emma is a branding designer."),
    );
    expect(screen.getByText("What you wrote")).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save note" }));
    });
    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    // The one difference that reaches the database.
    expect(saveCapture.mock.calls[0]?.[0].source).toBe("manual");
  });

  test("should give typing the whole screen rather than a field under the record button", async () => {
    (useAction as jest.Mock).mockReturnValue(jest.fn(async () => makeDraft()));
    scopeTo("Emma");
    captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Type it instead" }));
    });

    // With the recording controls still on show, nothing said which mode the
    // screen was in or that the line growing under them was the note.
    expect(screen.queryByRole("button", { name: "Start recording" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Scan a business card" }),
    ).toBeNull();
    expect(screen.getByLabelText("Type a note")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Read it back" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stop typing" })).toBeTruthy();
  });

  test("should put the recording screen back when typing is cancelled", async () => {
    (useAction as jest.Mock).mockReturnValue(jest.fn(async () => makeDraft()));
    scopeTo("Emma");
    captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Type it instead" }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Stop typing" }));
    });

    expect(screen.getByRole("button", { name: "Start recording" })).toBeTruthy();
    expect(screen.queryByLabelText("Type a note")).toBeNull();
  });

  test("should not read an empty typed note", async () => {
    const extract = jest.fn(async () => makeDraft());
    (useAction as jest.Mock).mockReturnValue(extract);
    scopeTo("Emma");
    captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/capture" });
    await result;

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Type it instead" }));
    });

    expect(screen.getByLabelText("Read it back")).toBeDisabled();
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
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Fact 1"), "Is a branding designer.");
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save note" }));
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
    expect(screen.getByText("New person — nobody by this name yet.")).toBeTruthy();
    expect(screen.getByLabelText("Save note")).toBeDisabled();
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
      screen.getAllByText("New person — nobody by this name yet."),
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
    expect(screen.getByLabelText("Save note")).toBeDisabled();

    await act(async () => {
      fireEvent.press(
        screen.getByRole("button", { name: "New person called Priya" }),
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save note" }));
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
    expect(screen.getByLabelText("Save note")).toBeDisabled();

    await act(async () => {
      fireEvent.press(
        screen.getByRole("button", { name: "Priya, client · 3 notes · last 2026-09-01" }),
      );
    });
    // Priya answered, Marcus not yet — still refused.
    expect(screen.getByLabelText("Save note")).toBeDisabled();

    await act(async () => {
      fireEvent.press(
        screen.getByRole("button", {
          name: "Marcus, climbing gym · 2 notes · last 2026-09-02",
        }),
      );
    });
    expect(screen.getByLabelText("Save note")).not.toBeDisabled();

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save note" }));
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
        screen.getByRole("button", { name: "New person called Emma" }),
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save note" }));
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
    expect(screen.getByLabelText("Save note")).toBeDisabled();
    await act(async () => {
      fireEvent.press(
        screen.getByRole("button", { name: "New person called Marcus" }),
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save note" }));
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
        screen.getByRole("button", { name: "New person called priya" }),
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
      fireEvent.press(screen.getByRole("button", { name: "Save note" }));
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
    mockAlert("Keep my facts");
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save note" }));
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
    expect(screen.getByLabelText("Save note")).toBeDisabled();
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
      fireEvent.press(screen.getByRole("button", { name: "Save note" }));
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
      fireEvent.press(screen.getByRole("button", { name: "Save note" }));
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
    expect(screen.getByLabelText("Start recording")).toBeDisabled();
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
    expect(screen.getByLabelText("Start recording")).toBeDisabled();
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
      fireEvent.press(screen.getByRole("button", { name: "Save note" }));
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
   * After the save the record is read-only — `notes.updateNote` does not take
   * it — so a note saved with a corrected transcript and facts built from the
   * old wording keeps that disagreement for ever. And since search and Ask Andy
   * read the facts, the note would answer with wording its own record
   * contradicts.
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

  test("should ask which version it should keep when the transcript no longer matches the facts", async () => {
    const draft = makeDraft();
    const extract = jest.fn(async () => draft);
    (useAction as jest.Mock).mockReturnValue(extract);
    const saveCapture = jest.fn();
    mockSaveCapture(saveCapture);
    const handlers = captureListeners();
    await reachReviewAndEditTranscript(handlers, "heard wrongly", "heard correctly");

    // Nothing pressed: the alert is raised and no button answered.
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save note" }));
    });

    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][0]).toMatch(/changed what you said/i);
    // Both costs named, not one. Describing only what re-reading costs made the
    // message quietly argue for the other button — and "Keep my facts" is the
    // choice that cannot be undone, since after saving only the facts change.
    const message = String(alert.mock.calls[0][1]);
    expect(message).toMatch(/out of step/i);
    expect(message).toMatch(/rewrites/i);
    // And nothing was written while the question stood open.
    expect(saveCapture).not.toHaveBeenCalled();
    expect(extract).toHaveBeenCalledTimes(1);
  });

  test("should keep the facts as they are and save the corrected transcript when asked to", async () => {
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

    mockAlert("Keep my facts");
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save note" }));
    });

    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    expect(saveCapture.mock.calls[0][0].transcript).toBe("heard correctly");
    // The facts a person reviewed are not silently re-derived — the same class
    // of failure day 3 refused when it made re-reading explicit.
    expect(extract).toHaveBeenCalledTimes(1);
  });

  test("should read the corrected transcript again when asked to, without a second dialog on top", async () => {
    const draft = makeDraft();
    const extract = jest.fn(async (_args: { text: string }) => draft);
    (useAction as jest.Mock).mockReturnValue(extract);
    const saveCapture = jest.fn();
    mockSaveCapture(saveCapture);
    const handlers = captureListeners();
    await reachReviewAndEditTranscript(handlers, "heard wrongly", "heard correctly");

    // A fact is edited too, and that is the whole point of this test rather
    // than a detail of it. `reread` only raises its own "you will lose your
    // edits" confirmation when the draft has been touched — so with an
    // untouched draft, routing this button through `reread` instead of
    // `rereadNow` would stack no second dialog and the test could not tell the
    // two apart. It stayed green against exactly that mutation until this edit
    // was added.
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Fact 1"), "an edited fact");
    });

    const alert = mockAlert("Read it again");
    alert.mockClear();
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save note" }));
    });

    await waitFor(() => expect(extract).toHaveBeenCalledTimes(2));
    expect(extract.mock.calls[1]?.[0].text).toBe("heard correctly");
    // Saving is not what was asked for — the draft is being rebuilt.
    expect(saveCapture).not.toHaveBeenCalled();
    // One dialog, not two. Both would say the same thing, and the second would
    // arrive after the question it repeats has already been answered.
    expect(alert).toHaveBeenCalledTimes(1);
  });

  test("should keep asking after a re-read that failed, since the facts on screen are still the old ones", async () => {
    const draft = makeDraft();
    const extract = jest
      .fn(async (_args: { text: string }) => draft)
      .mockResolvedValueOnce(draft)
      .mockRejectedValueOnce(new Error("Andy couldn't reach Claude."));
    (useAction as jest.Mock).mockReturnValue(extract);
    const saveCapture = jest.fn();
    mockSaveCapture(saveCapture);
    const handlers = captureListeners();
    await reachReviewAndEditTranscript(handlers, "heard wrongly", "heard correctly");

    mockAlert("Read it again");
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save note" }));
    });
    await waitFor(() => expect(extract).toHaveBeenCalledTimes(2));

    // The re-read failed, so the draft on screen is still the one built from
    // "heard wrongly" — the two are as far apart as they were. Moving the
    // baseline before the call succeeded made this go quiet instead, and the
    // error banner sits directly above Save, so pressing Save again is the
    // natural next move. It would have written the mismatch permanently.
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    alert.mockClear();
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save note" }));
    });

    expect(alert).toHaveBeenCalledTimes(1);
    expect(saveCapture).not.toHaveBeenCalled();
  });

  test("should stop asking once the transcript and the facts agree again", async () => {
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

    // Read it again, which rebuilds the facts from the corrected words.
    mockAlert("Read it again");
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save note" }));
    });
    await waitFor(() => expect(extract).toHaveBeenCalledTimes(2));

    // Now they agree, so saving must go straight through. A baseline that never
    // reset would ask again here, and a question that keeps appearing after it
    // has been answered is one people learn to dismiss without reading.
    //
    // `mockClear` first: `jest.spyOn` hands back the *same* mock when the method
    // is already spied, so without it this counts the re-read's own dialog and
    // fails against working code.
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    alert.mockClear();
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save note" }));
    });

    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    expect(alert).not.toHaveBeenCalled();
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

    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save note" }));
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

    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save note" }));
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

    const result = renderRouter("src/app", {
      initialUrl: "/profile/contact-1/capture",
    });
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
      fireEvent.press(screen.getByRole("button", { name: "Save note" }));
    });

    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    const [call] = saveCapture.mock.calls[0];
    expect(call.draft.primary.firstMetDate).toBeNull();
  });
});

describe("capture screen business card door", () => {
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

  test("should reach the same review screen with the card's name and text, and save with source business_card", async () => {
    const { draft, cardText } = makeCardDraft();
    const readCard = jest.fn(async () => ({ draft, cardText }));
    mockActions({ readCard });
    const saveCapture = jest.fn(
      async (_args: { transcript: string; draft: Draft; source: string }) => ({
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
      canceled: false,
      assets: [{ base64: "fake-base64-jpeg-data" }],
    });

    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1/capture" });
    await result;

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Scan a business card" }));
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save note" })).toBeTruthy());

    // Lands on the identical review screen a voice note reaches — same
    // fields, only the transcript field's label and content differ.
    expect(screen.getByDisplayValue("Sarah Chen")).toBeTruthy();
    expect(screen.getByText("What the card says")).toBeTruthy();
    expect(screen.getByDisplayValue(cardText)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save note" }));
    });

    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    const [call] = saveCapture.mock.calls[0];
    expect(call.source).toBe("business_card");
    expect(call.transcript).toBe(cardText);
    expect(call.draft.primary.name).toBe("Sarah Chen");
  });

  test("should name the door it came through when asking about a changed card", async () => {
    const { draft, cardText } = makeCardDraft();
    mockActions({ readCard: jest.fn(async () => ({ draft, cardText })) });
    mockSaveCapture(jest.fn());
    mockAlert("Take a photo");
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      granted: true,
    });
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ base64: "fake-base64-jpeg-data" }],
    });

    const result = renderRouter("src/app", {
      initialUrl: "/profile/contact-1/capture",
    });
    await result;
    await act(async () => {
      fireEvent.press(
        screen.getByRole("button", { name: "Scan a business card" }),
      );
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save note" })).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.changeText(
        screen.getByLabelText("What the card says"),
        "corrected card text",
      );
    });

    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    alert.mockClear();
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save note" }));
    });

    // The review screen already branches this label three ways. Telling
    // somebody who scanned a card that they changed what they *said* is the
    // kind of wrongness that reads as the app not knowing what you just did.
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0]?.[0]).toBe("You changed what the card says");
  });

  test("should show no error and save nothing when the business card picker is cancelled", async () => {
    const readCard = jest.fn(async () => {
      throw new Error("should never be called for a cancelled pick");
    });
    mockActions({ readCard });
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

    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1/capture" });
    await result;

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Scan a business card" }));
    });

    // Backing out of the picker is a normal thing to do, not an error — no
    // message shown, nothing extracted, nothing saved, still on the idle
    // screen ready to try again.
    expect(readCard).not.toHaveBeenCalled();
    expect(saveCapture).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Save note" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Start recording" }),
    ).toBeTruthy();
    expect(screen.queryByText(/didn't come through/)).toBeNull();
    expect(screen.queryByText(/couldn't read that card/)).toBeNull();
    expect(screen.queryByText(/needs the camera/)).toBeNull();
  });
});
