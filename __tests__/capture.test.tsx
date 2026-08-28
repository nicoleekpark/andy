import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { useAction, useMutation } from "convex/react";
import { getFunctionName } from "convex/server";
import { useSpeechRecognitionEvent } from "expo-speech-recognition";
import * as ImagePicker from "expo-image-picker";
import { renderRouter } from "expo-router/testing-library";
import { api } from "@convex/_generated/api";
import type { Draft } from "@convex/extractionPrompt";

/**
 * src/app/(app)/profile/[id]/capture.tsx's whole reason to exist is the
 * confirm/edit step between transcript and saved fact — see that file's
 * top-of-file comment for the measured case (Korean "브랜딩 디자이너" mangled
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
 * `Alert.alert` backs the "Scan a business card" button's camera-vs-library
 * choice. Spied rather than left to whatever jest-expo's RN preset supplies,
 * so a test can invoke the exact button it means to drive instead of hoping
 * one fires. Defaults to "Take a photo" since the two routes share the same
 * `scanCard` function and differ only in which permission/launch pair is
 * called — see capture.tsx's `chooseCardSource`.
 */
function mockCardAlert(buttonText = "Take a photo") {
  jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
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
          "Notion에서 developer relations을 한다",
          "이메일: sarah@notion.so",
        ],
      },
      mentions: [],
    },
    cardText: "Sarah Chen\nDeveloper Relations\nNotion\nsarah@notion.so",
  };
}

function makeDraft(overrides: Partial<Draft["primary"]> = {}): Draft {
  return {
    primary: {
      name: "Jisoo",
      entityType: "person",
      relationshipContext: "client",
      tags: ["designer"],
      firstMetDate: null,
      keyFacts: ["브랜든 집 디자인 전문가"],
      ...overrides,
    },
    mentions: [
      {
        name: "Minho",
        entityType: "person",
        relationshipContext: null,
        quote: "her business partner Minho",
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
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("should show the extracted name, key facts, and mentions for review", async () => {
    const draft = makeDraft();
    (useAction as jest.Mock).mockReturnValue(jest.fn(async () => draft));
    const handlers = captureListeners();

    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1/capture" });
    await result;
    await reachReview(handlers, "spoken transcript");

    expect(screen.getByDisplayValue("Jisoo")).toBeTruthy();
    expect(screen.getByDisplayValue("브랜든 집 디자인 전문가")).toBeTruthy();
    // Mentions are editable inputs, not static text — the name is precisely the
    // field on-device transcription got wrong on 2026-08-27 (민호 heard as 민우),
    // so it has to be correctable rather than only deletable.
    expect(screen.getByDisplayValue("Minho")).toBeTruthy();
    // Shown, not editable: the quote is the span of the transcript where they
    // came up, and its value is being what was actually said. The name above it
    // stays editable, because that is what transcription gets wrong.
    expect(screen.getByText(/her business partner/)).toBeTruthy();
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
      "브랜딩 디자이너",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Save note" }));

    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    const [call] = saveCapture.mock.calls[0];
    expect(call.draft.primary.keyFacts).toEqual(["브랜딩 디자이너"]);
    expect(call.draft.primary.keyFacts).not.toContain("브랜든 집 디자인 전문가");
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
      "브랜딩 디자이너",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Save note" }));

    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    // Still on review, with the edit intact — not lost, not re-navigated away.
    expect(screen.getByDisplayValue("브랜딩 디자이너")).toBeTruthy();
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
    await reachReview(handlers, "오늘 지수 만났어");

    // The user corrects the fact the transcription mangled.
    const fact = screen.getByDisplayValue("브랜든 집 디자인 전문가");
    await act(async () => {
      fireEvent.changeText(fact, "브랜딩 디자이너");
    });

    // A stray second `end` — a real recogniser quirk. If it were honoured it
    // would re-extract the same transcript and replace the edited draft.
    await act(async () => {
      handlers.end?.();
    });

    expect(extract).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue("브랜딩 디자이너")).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save note" }));
    });
    const [call] = saveCapture.mock.calls[0];
    expect(call.draft.primary.keyFacts).toContain("브랜딩 디자이너");
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
      fireEvent.changeText(screen.getByDisplayValue("Minho"), "Minho Park");
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save note" }));
    });

    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    const [call] = saveCapture.mock.calls[0];
    expect(call.draft.mentions[0].name).toBe("Minho Park");
  });

  test("should save the edited transcript without re-running extraction over the draft", async () => {
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

    const result = renderRouter("src/app", {
      initialUrl: "/profile/contact-1/capture",
    });
    await result;
    await reachReview(handlers, "heard wrongly");

    await act(async () => {
      fireEvent.changeText(
        screen.getByLabelText("What you said"),
        "heard correctly",
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save note" }));
    });

    await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
    const [call] = saveCapture.mock.calls[0];
    expect(call.transcript).toBe("heard correctly");
    // Editing the note must not silently re-derive the facts the user just
    // reviewed — that is the same class of failure as a duplicate `end`.
    expect(extract).toHaveBeenCalledTimes(1);
  });

  test("should let a wrongly-inferred first-met date be cleared before saving", async () => {
    // Whether "오늘 지수 만났는데" describes a first meeting is not decidable from
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
    await reachReview(handlers, "오늘 지수 만났는데");

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
  afterEach(() => {
    jest.clearAllMocks();
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
    mockCardAlert("Take a photo");
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

  test("should show no error and save nothing when the business card picker is cancelled", async () => {
    const readCard = jest.fn(async () => {
      throw new Error("should never be called for a cancelled pick");
    });
    mockActions({ readCard });
    const saveCapture = jest.fn(async () => ({
      profileId: "profile-1",
      noteId: "note-1",
      createdProfile: true,
      createdMentionCount: 0,
    }));
    mockSaveCapture(saveCapture);
    mockCardAlert("Take a photo");
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
