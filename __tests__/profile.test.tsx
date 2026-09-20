import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo, Alert, Linking } from "react-native";
import { useAction, useMutation, useQuery } from "convex/react";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { ConvexError } from "convex/values";
import { getFunctionName } from "convex/server";
import { renderRouter } from "expo-router/testing-library";
import { api } from "@convex/_generated/api";

/**
 * src/app/(app)/profile/[id]/index.tsx's three branches — loading, not-found,
 * populated — are driven entirely by what `api.profiles.withNotes` returns,
 * so these tests only need to control the shared `useQuery` mock
 * (jest.setup.ts) rather than exercise routing or Convex itself. No other
 * screen reached from this route tree calls `useQuery` (capture.tsx uses
 * only useMutation/useAction), so a bare `mockReturnValue` here is safe
 * without branching by function name the way capture.test.tsx has to for
 * useMutation/useAction.
 */

function buildProfile(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: "profile-1",
    name: "Nina",
    entityType: "person",
    tags: [],
    autoCreated: false,
    ...overrides,
  };
}

/**
 * The query returns each note paired with who came up in it, plus the notes
 * elsewhere that mention this person. These helpers keep the fixtures readable
 * — a test that cares about facts should not have to spell out empty mention
 * lists to say so.
 */
function withNotes(
  notes: Record<string, unknown>[],
  mentionedIn: Record<string, unknown>[] = [],
  /** Defaults to "nothing was cut", which is what most tests mean. */
  mentionedInTotal = mentionedIn.length,
) {
  return {
    profile: buildProfile(),
    // Defaulted, because the real query always returns it. Left absent, the
    // screen compares `undefined === null`, takes the has-a-photo branch, and
    // renders an `<Image>` whose `uri` is undefined — with every test green,
    // since nothing asserted which branch it took.
    photoUrl: null,
    // A note entry may carry its own `mentions` (who came up inside it); split
    // it off so tests that don't care can keep passing bare note fields, the
    // way every existing call site here already does.
    notes: notes.map(({ mentions, ...note }) => ({
      // `source` is required on every real row, so it is defaulted rather than
      // left absent — a fixture missing it would let a screen that reads it
      // pass here and behave differently against the database.
      note: { source: "voice", ...note },
      // `exists` defaults to true, the ordinary case. A mention whose person
      // has been deleted keeps its place in the note but stops being a link,
      // and a test about that says so.
      mentions: ((mentions as Record<string, unknown>[] | undefined) ?? []).map(
        (mention) => ({ exists: true, ...mention }),
      ),
    })),
    mentionedIn,
    mentionedInTotal,
  };
}

describe("profile screen", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("should show a loading state when the query has not resolved yet", async () => {
    // jest.setup.ts's useQuery already defaults to undefined, but set it
    // explicitly so this test still describes the state it's asserting.
    (useQuery as jest.Mock).mockReturnValue(undefined);

    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1" });
    await result;

    expect(screen.getByText("Loading…")).toBeTruthy();
  });

  test("should show a not-found message when the query resolves to null", async () => {
    (useQuery as jest.Mock).mockReturnValue(null);

    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1" });
    await result;

    expect(
      screen.getByText("Andy doesn't have anyone by that link."),
    ).toBeTruthy();
  });

  test("should render the profile name and notes newest first when the query resolves", async () => {
    (useQuery as jest.Mock).mockReturnValue({
      ...withNotes([
        {
          _id: "note-2",
          createdAt: new Date("2026-02-01").getTime(),
          text: "Second note text.",
        },
        {
          _id: "note-1",
          createdAt: new Date("2026-01-01").getTime(),
          text: "First note text.",
        },
      ]),
      profile: buildProfile({ name: "Nina" }),
    });

    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1" });
    await result;

    expect(screen.getByText("Nina")).toBeTruthy();

    const noteTexts = screen.getAllByText(/note text\./);
    expect(noteTexts.map((node) => node.props.children)).toEqual([
      "Second note text.",
      "First note text.",
    ]);
  });

  test("should show keyFacts when present and fall back to the raw text when a note has none", async () => {
    (useQuery as jest.Mock).mockReturnValue(
      withNotes([
        {
          _id: "note-extracted",
          createdAt: Date.now(),
          text: "raw transcript, should not show",
          keyFacts: ["Extracted fact one.", "Extracted fact two."],
        },
        {
          _id: "note-manual",
          createdAt: Date.now(),
          text: "Typed by hand, never extracted.",
        },
      ]),
    );

    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1" });
    await result;

    expect(screen.getByText("Extracted fact one.")).toBeTruthy();
    expect(screen.getByText("Extracted fact two.")).toBeTruthy();
    expect(screen.queryByText("raw transcript, should not show")).toBeNull();
    expect(screen.getByText("Typed by hand, never extracted.")).toBeTruthy();
  });

  test("should keep the original transcript reachable behind a toggle when a note has facts", async () => {
    // The facts are what a person confirmed; the transcript is what the
    // recogniser heard, and they drift on purpose. Measured on device,
    // transcription is unreliable on exactly the details worth checking — so
    // the original has to stay reachable, or a fact that looks wrong can never
    // be checked against what was actually said.
    (useQuery as jest.Mock).mockReturnValue(
      withNotes([
        {
          _id: "note-1",
          createdAt: 1787933613833,
          text: "Saw Emma today at Marcus's housewarming",
          keyFacts: ["Is a branding designer."],
        },
      ]),
    );

    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1" });
    await result;

    expect(screen.getByText("Is a branding designer.")).toBeTruthy();
    expect(screen.queryByText(/Marcus's housewarming/)).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: /show what you said/i }));
    });
    expect(screen.getByText(/Marcus's housewarming/)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: /hide what you said/i }));
    });
    expect(screen.queryByText(/Marcus's housewarming/)).toBeNull();
  });

  test("should name the note's body after the door it came through, not always \"what you said\"", async () => {
    // Nobody said a business card out loud. The body stays reachable so a fact
    // that looks wrong can be checked against its source, and a label naming
    // the wrong source defeats the control it opens.
    (useQuery as jest.Mock).mockReturnValue(
      withNotes([
        {
          _id: "note-card",
          createdAt: Date.now(),
          source: "business_card",
          text: "JOE KING\nSENIOR ENGINEER\nACME",
          keyFacts: ["Works as a senior engineer at ACME."],
        },
        {
          _id: "note-voice",
          createdAt: Date.now(),
          source: "voice",
          text: "saw Nina today",
          keyFacts: ["Is a branding designer."],
        },
      ]),
    );

    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1" });
    await result;

    // Regex, not an exact string: the visible label is the chevron plus the
    // wording, and it is the wording this test is about.
    expect(screen.getByText(/What the card said/)).toBeTruthy();
    expect(screen.getByText(/What you said/)).toBeTruthy();

    // The accessibility label has to follow, or the wording is only corrected
    // for people who can see it.
    await act(async () => {
      fireEvent.press(
        screen.getByRole("button", { name: /show what the card said/i }),
      );
    });
    expect(screen.getByText(/SENIOR ENGINEER/)).toBeTruthy();
  });

  test("should show who came up in a note and route to their profile when tapped", async () => {
    (useQuery as jest.Mock).mockReturnValue(
      withNotes([
        {
          _id: "note-1",
          createdAt: Date.now(),
          text: "Met Nina at Marcus's housewarming.",
          mentions: [
            { profileId: "profile-minho", name: "Marcus", quote: "at Marcus's housewarming" },
          ],
        },
      ]),
    );

    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1" });
    await result;

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Open Marcus" }));
    });

    expect(result.getPathname()).toBe("/profile/profile-minho");
  });

  test("should render a Mentioned in section and route to the note's own profile when an entry is tapped", async () => {
    (useQuery as jest.Mock).mockReturnValue(
      withNotes([], [
        {
          noteId: "note-elsewhere",
          createdAt: Date.now(),
          quote: "at Marcus's housewarming",
          aboutProfileId: "profile-jisoo",
          aboutName: "Nina",
        },
      ]),
    );

    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1" });
    await result;

    expect(screen.getByText("Mentioned in")).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Open Nina" }));
    });

    expect(result.getPathname()).toBe("/profile/profile-jisoo");
  });

  test("should render neither a note's mentions nor the Mentioned in section when there is nothing to show", async () => {
    (useQuery as jest.Mock).mockReturnValue(
      withNotes([
        { _id: "note-1", createdAt: Date.now(), text: "A note that mentions no one." },
      ]),
    );

    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1" });
    await result;

    expect(screen.queryByText("Mentioned in")).toBeNull();
    expect(screen.queryByText("A note that mentions no one.")).toBeTruthy();
  });

  test("should offer a way to add a note, scoped to this profile's capture route", async () => {
    // Without this the profile is read-only and there is no route from noticing
    // something is missing to recording it.
    //
    // Routed by function name because this test crosses into the capture
    // screen, which also asks `profiles.resolveNames` which names in the draft
    // more than one person answers to. A blanket mock hands that a profile
    // where it expects a list of questions.
    (useQuery as jest.Mock).mockImplementation((reference: unknown) =>
      getFunctionName(reference as never) === "profiles:resolveNames"
        ? []
        : withNotes([]),
    );

    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1" });
    await result;

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Add a note" }));
    });

    expect(result.getSegments()).toEqual(["(app)", "profile", "[id]", "capture"]);
  });
});

test("should keep a deleted person's name in the note but stop it opening anything", async () => {
  (useQuery as jest.Mock).mockReturnValue(
    withNotes([
      {
        _id: "note-1",
        createdAt: 1787933613833,
        text: "Met Emma at Marcus's housewarming.",
        keyFacts: ["Met at a housewarming."],
        mentions: [
          {
            profileId: "gone-1",
            name: "Marcus",
            quote: "at Marcus's housewarming",
            exists: false,
          },
        ],
      },
    ]),
  );

  const result = renderRouter("src/app", { initialUrl: "/profile/contact-1" });
  await result;

  // The name stays: removing it would rewrite what this note recorded, which
  // is not something deleting somebody else should be able to do.
  expect(screen.getByText(/Marcus/)).toBeTruthy();
  // But it leads nowhere, and a button that opens a missing profile promises
  // something the app cannot do.
  expect(screen.queryByRole("button", { name: "Open Marcus" })).toBeNull();
});

test("should show the other names a person answers to", async () => {
  (useQuery as jest.Mock).mockReturnValue({
    ...withNotes([]),
    profile: { ...buildProfile(), aliases: ["Em", "Emma"] },
  });

  const result = renderRouter("src/app", { initialUrl: "/profile/contact-1" });
  await result;

  // Otherwise the only way to know Andy will recognise them is to try.
  expect(screen.getByText("also Em, Emma")).toBeTruthy();
});

test("should say how many mentions were left out when the list is truncated, and stay quiet when it is not", async () => {
  // Someone who comes up in fifty conversations should say so rather than
  // quietly showing five; a complete list needs no count next to it.
  const entry = {
    noteId: "note-a",
    createdAt: 1787933613833,
    quote: "at Marcus's housewarming",
    aboutProfileId: "profile-other",
    aboutName: "Emma",
  };

  (useQuery as jest.Mock).mockReturnValue(withNotes([], [entry], 12));
  const truncated = renderRouter("src/app", { initialUrl: "/profile/contact-1" });
  await truncated;
  expect(screen.getByText("1 of 12")).toBeTruthy();

  (useQuery as jest.Mock).mockReturnValue(withNotes([], [entry]));
  const complete = renderRouter("src/app", { initialUrl: "/profile/contact-1" });
  await complete;
  expect(screen.queryByText(/of 1$/)).toBeNull();
});

describe("follow-up email", () => {
  /**
   * `useAction` is pinned to `api.followUp.draft` by name rather than mocked
   * wholesale. The generated `api` is a Proxy, so a blanket `mockReturnValue`
   * would keep passing if the button were rewired to call something else.
   */
  function mockDraft(draft: jest.Mock) {
    (useAction as jest.Mock).mockImplementation((reference: unknown) =>
      getFunctionName(reference as never) === getFunctionName(api.followUp.draft)
        ? draft
        : jest.fn(async () => undefined),
    );
  }

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  async function reachProfile() {
    (useQuery as jest.Mock).mockReturnValue(
      withNotes([
        {
          _id: "note-1",
          text: "Nina is moving to Berlin.",
          keyFacts: ["Moving to Berlin"],
          createdAt: new Date("2026-09-01T12:00:00").getTime(),
          mentions: [],
        },
      ]),
    );
    const result = renderRouter("src/app", { initialUrl: "/profile/profile-1" });
    await result;
    return result;
  }

  /** Render a profile whose query result is spelled out, not the default one. */
  async function reachProfileWith(result: Record<string, unknown>) {
    (useQuery as jest.Mock).mockReturnValue(result);
    const rendered = renderRouter("src/app", {
      initialUrl: "/profile/profile-1",
    });
    await rendered;
    return rendered;
  }

  const WITH_FACTS = {
    _id: "note-1",
    text: "Nina is moving to Berlin.",
    keyFacts: ["Moving to Berlin"],
    createdAt: new Date("2026-09-01T12:00:00").getTime(),
    mentions: [],
  };

  test("should not offer a draft for somebody who only comes up in other people's notes", async () => {
    mockDraft(jest.fn());
    // Reported from the device, and the reason this test exists in this shape.
    // Andy invents a person the moment a note names them, so John has a profile
    // and a timeline — made entirely of somebody else's note. Tapping said
    // "there's nothing written down about them yet" in front of a visible note.
    await reachProfileWith(
      withNotes(
        [],
        [
          {
            noteId: "note-1",
            createdAt: new Date("2026-09-01T12:00:00").getTime(),
            quote: "John is going through a divorce",
            aboutProfileId: "profile-2",
            aboutName: "Amy",
          },
        ],
      ),
    );

    expect(screen.queryByLabelText("Draft a follow-up")).toBeNull();
    expect(screen.getByTestId("follow-up-unavailable")).toHaveTextContent(
      /only comes up in notes about other people/,
    );
  });

  test("should name the missing facts when the notes are there and carry none", async () => {
    mockDraft(jest.fn());
    await reachProfileWith(
      withNotes([
        {
          _id: "note-1",
          text: "Met Nina at the conference.",
          createdAt: new Date("2026-09-01T12:00:00").getTime(),
          mentions: [],
        },
      ]),
    );

    // Pointing them at "record a note" would point them at the one thing they
    // have already done.
    expect(screen.queryByLabelText("Draft a follow-up")).toBeNull();
    expect(screen.getByTestId("follow-up-unavailable")).toHaveTextContent(
      /What to remember/,
    );
  });

  test("should treat a fact of nothing but spaces as no fact at all", async () => {
    mockDraft(jest.fn());
    // `updateNote` accepts a blank fact, and the server drops it. If the screen
    // counted it the button would be offered and the action would refuse —
    // which is the whole failure this change exists to remove, reintroduced at
    // the other end.
    await reachProfileWith(
      withNotes([{ ...WITH_FACTS, keyFacts: ["   ", ""] }]),
    );

    expect(screen.queryByLabelText("Draft a follow-up")).toBeNull();
  });

  test("should say nothing at all on an animal, rather than advise recording a note about a cat", async () => {
    mockDraft(jest.fn());
    await reachProfileWith({
      ...withNotes([]),
      profile: buildProfile({ name: "Biscuit", entityType: "animal" }),
    });

    expect(screen.queryByLabelText("Draft a follow-up")).toBeNull();
    // Neither the button nor the explanation — "record a note to draft a
    // follow-up" is not advice anybody wants about a foster cat.
    expect(screen.queryByTestId("follow-up-unavailable")).toBeNull();
  });

  test("should offer the draft where there is something to draft from", async () => {
    mockDraft(jest.fn());
    // The positive case, kept next to the refusals: a gate that never opens
    // passes every test above.
    await reachProfileWith(withNotes([WITH_FACTS]));

    expect(screen.getByLabelText("Draft a follow-up")).toBeTruthy();
    expect(screen.queryByTestId("follow-up-unavailable")).toBeNull();
  });

  /** Draft, then press the button, and land in the sheet. */
  async function draftAndOpen(draft: jest.Mock) {
    mockDraft(draft);
    const opened = await reachProfile();
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Draft a follow-up"));
    });
    await waitFor(() => expect(screen.getByLabelText("Message")).toBeTruthy());
    return opened;
  }

  const NINA = {
    personName: "Nina",
    subject: "How's the move going?",
    body: "Hope Berlin is treating you well.",
  };

  test("should show the draft in the app and open nothing, since it may not be an email at all", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    await draftAndOpen(jest.fn(async () => NINA));

    expect(screen.getByDisplayValue("How's the move going?")).toBeTruthy();
    expect(screen.getByDisplayValue("Hope Berlin is treating you well.")).toBeTruthy();
    // This used to hand the draft to Mail through a `mailto:` URL. A follow-up
    // gets sent by text, or KakaoTalk, or pasted somewhere — `mailto:` was a
    // dead end for all of those, and it took a `&bcc=` injection surface with
    // it when it went.
    expect(open).not.toHaveBeenCalled();
  });

  test("should copy the message on its own, since a subject is an email's idea", async () => {
    const set = jest.spyOn(Clipboard, "setStringAsync").mockResolvedValue(true);
    await draftAndOpen(jest.fn(async () => NINA));

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Copy the message"));
    });

    expect(set).toHaveBeenCalledWith("Hope Berlin is treating you well.");
    expect(screen.getByTestId("copied")).toHaveTextContent("Message copied");
  });

  test("should say out loud that it copied, since the result is invisible", async () => {
    jest.spyOn(Clipboard, "setStringAsync").mockResolvedValue(true);
    const announce = jest
      .spyOn(AccessibilityInfo, "announceForAccessibility")
      .mockImplementation(() => {});
    await draftAndOpen(jest.fn(async () => NINA));

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Copy the message"));
    });

    // `accessibilityLiveRegion` is Android-only in React Native, and on iOS a
    // `Text` that changes elsewhere on screen is announced only if VoiceOver
    // already happens to be focused on it. Without this, the one control whose
    // whole result is invisible confirms nothing to the person least able to
    // go and check the clipboard.
    expect(announce).toHaveBeenCalledWith("Message copied");
  });

  test("should copy the subject with the message when that is what is wanted", async () => {
    const set = jest.spyOn(Clipboard, "setStringAsync").mockResolvedValue(true);
    await draftAndOpen(jest.fn(async () => NINA));

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Copy the subject and message"));
    });

    expect(set).toHaveBeenCalledWith(
      "How's the move going?\n\nHope Berlin is treating you well.",
    );
  });

  test("should copy what is on screen now, not what Claude first wrote", async () => {
    const set = jest.spyOn(Clipboard, "setStringAsync").mockResolvedValue(true);
    await draftAndOpen(jest.fn(async () => NINA));

    await act(async () => {
      fireEvent.changeText(
        screen.getByLabelText("Message"),
        "Hope Jeju is treating you well.",
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Copy the message"));
    });

    // The whole reason the field is editable. Copying the original after an
    // edit would be a silent wrong answer — the user would paste something
    // they had already corrected.
    expect(set).toHaveBeenCalledWith("Hope Jeju is treating you well.");
  });

  test("should stop saying it copied once the text has changed underneath", async () => {
    jest.spyOn(Clipboard, "setStringAsync").mockResolvedValue(true);
    await draftAndOpen(jest.fn(async () => NINA));

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Copy the message"));
    });
    expect(screen.getByTestId("copied")).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Message"), "Different now.");
    });

    // Cleared by the edit rather than by a timer — a timer would make this the
    // one thing on the screen a test has to wait for, and the line stops being
    // true the moment the text moves.
    expect(screen.queryByTestId("copied")).toBeNull();
  });

  test("should write another straight away when there is nothing of the user's to lose", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const draft = jest.fn(async () => NINA);
    await draftAndOpen(draft);

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Write another draft"));
    });

    await waitFor(() => expect(draft).toHaveBeenCalledTimes(2));
    expect(alert).not.toHaveBeenCalled();
  });

  test("should ask before throwing away an edit for a new draft", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const draft = jest.fn(async () => NINA);
    await draftAndOpen(draft);

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Message"), "My own wording.");
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Write another draft"));
    });

    // Asked only when there is something to lose — the same rule the capture
    // screen follows when the transcript and the facts disagree.
    expect(alert).toHaveBeenCalledTimes(1);
    expect(draft).toHaveBeenCalledTimes(1);

    const [, , buttons] = alert.mock.calls[0] ?? [];
    const confirm = (buttons as { text: string; onPress?: () => void }[]).find(
      (button) => button.text === "Write another",
    );
    await act(async () => {
      confirm?.onPress?.();
    });
    await waitFor(() => expect(draft).toHaveBeenCalledTimes(2));
  });

  test("should replace the fields when a new draft lands, even an identical one", async () => {
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const draft = jest.fn(async () => NINA);
    await draftAndOpen(draft);

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Message"), "My own wording.");
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Write another draft"));
    });
    const [, , buttons] = (Alert.alert as jest.Mock).mock.calls[0] ?? [];
    await act(async () => {
      (buttons as { text: string; onPress?: () => void }[])
        .find((button) => button.text === "Write another")
        ?.onPress?.();
    });

    // Claude can return word-for-word what it returned before, so comparing
    // the text would leave the old edit sitting there after a rewrite the user
    // paid for. The sheet is keyed on the attempt instead.
    await waitFor(() =>
      expect(screen.getByDisplayValue("Hope Berlin is treating you well.")).toBeTruthy(),
    );
    expect(screen.queryByDisplayValue("My own wording.")).toBeNull();
  });

  test("should discard the draft when it is closed, since nothing here is saved", async () => {
    await draftAndOpen(jest.fn(async () => NINA));

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Close the draft"));
    });

    // A draft is generated from the notes rather than being a document of its
    // own. Keeping it would create a second thing to hold in step with the
    // notes it came from, and the notes are the record.
    expect(screen.queryByLabelText("Message")).toBeNull();
  });

  test("should send the id from the route and the device's date, not the server's", async () => {
    const draft = jest.fn(
      async (_args: { profileId: string; today: string }) => ({
        personName: "Nina",
        subject: "s",
        body: "b",
      }),
    );
    mockDraft(draft);
    await reachProfile();

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Draft a follow-up"));
    });

    await waitFor(() => expect(draft).toHaveBeenCalledTimes(1));
    const [args] = draft.mock.calls[0] ?? [];
    expect(args?.profileId).toBe("profile-1");
    // A follow-up that says "September" to somebody for whom it is already
    // October reads as inattentive, and the deployment has no idea what day it
    // is where the user is.
    // The actual date, not its shape. `toMatch(/^\d{4}-\d{2}-\d{2}$/)` passes
    // on a hardcoded "2020-01-01", so it promised more than it checked.
    expect(args?.today).toBe(new Date().toLocaleDateString("en-CA"));
  });

  test("should show the server's own words when there is nothing to follow up on", async () => {
    mockDraft(
      jest.fn(async () => {
        throw new ConvexError(
          "There's nothing written down about them yet — record a note first.",
        );
      }),
    );
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    await reachProfile();

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Draft a follow-up"));
    });

    await waitFor(() =>
      expect(screen.getByText(/nothing written down/)).toBeTruthy(),
    );
    // And Mail is never opened on an empty draft.
    expect(open).not.toHaveBeenCalled();
  });

  test("should not put a raw failure on screen when the error was not written for a person", async () => {
    mockDraft(
      jest.fn(async () => {
        throw new Error("fetch failed: ECONNREFUSED 10.0.0.1");
      }),
    );
    await reachProfile();

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Draft a follow-up"));
    });

    await waitFor(() =>
      expect(screen.getByText(/couldn't reach that just now/)).toBeTruthy(),
    );
    expect(screen.queryByText(/ECONNREFUSED/)).toBeNull();
  });

  test("should still be one paid call when two touches land inside one commit window", async () => {
    let release: (value: unknown) => void = () => {};
    const draft = jest.fn(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    mockDraft(draft as unknown as jest.Mock);
    jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    await reachProfile();

    const button = screen.getByLabelText("Draft a follow-up");
    await act(async () => {
      // Not awaited between them. Both handlers run before React has committed
      // `drafting`, so `disabled` has not taken effect yet — which is exactly
      // the device race it cannot cover, and the only reason the ref latch
      // exists. The other double-press test presses in two `act` blocks and so
      // never reaches this state.
      void fireEvent.press(button);
      void fireEvent.press(button);
    });

    expect(draft).toHaveBeenCalledTimes(1);
    await act(async () => {
      release({ personName: "Nina", subject: "s", body: "b" });
    });
  });

  test("should not offer a follow-up on an animal", async () => {
    mockDraft(jest.fn());
    (useQuery as jest.Mock).mockReturnValue({
      ...withNotes([
        {
          _id: "note-1",
          text: "Mochi was 3.2kg today.",
          keyFacts: ["Weighed 3.2kg"],
          createdAt: new Date("2026-09-01T12:00:00").getTime(),
          mentions: [],
        },
      ]),
      profile: buildProfile({ name: "Mochi", entityType: "animal" }),
    });
    const result = renderRouter("src/app", { initialUrl: "/profile/profile-1" });
    await result;

    // An email to a foster cat would send its health notes on a trip they have
    // no reason to take, addressed to the cat by name.
    expect(screen.queryByLabelText("Draft a follow-up")).toBeNull();
    // The rest of the screen is unchanged — this hides one control, not a
    // whole class of profile.
    expect(screen.getByLabelText("Add a note")).toBeTruthy();
  });

  test("should not draft twice while the first one is still being written", async () => {
    let release: (value: unknown) => void = () => {};
    const draft = jest.fn(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    mockDraft(draft as unknown as jest.Mock);
    jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    await reachProfile();

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Draft a follow-up"));
    });
    // Both halves asserted. The label is how a person knows the tap landed; the
    // `disabled` state is the thing actually stopping the second call, and a
    // test that checked only the call count would pass with either the label or
    // the guard removed.
    expect(screen.getByText("Writing…")).toBeTruthy();
    expect(
      screen.getByLabelText("Draft a follow-up").props.accessibilityState
        .disabled,
    ).toBe(true);

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Draft a follow-up"));
    });
    // Each press is a paid Claude call. A double tap on a slow network must not
    // become two of them.
    expect(draft).toHaveBeenCalledTimes(1);

    await act(async () => {
      release({ personName: "Nina", subject: "s", body: "b" });
    });
  });
});

describe("profile photo", () => {
  function mockPhotoMutations(fns: {
    generateUploadUrl?: jest.Mock;
    attach?: jest.Mock;
    remove?: jest.Mock;
  }) {
    (useMutation as jest.Mock).mockImplementation((reference: unknown) => {
      const name = getFunctionName(reference as never);
      if (name === getFunctionName(api.photos.generateUploadUrl)) {
        return fns.generateUploadUrl ?? jest.fn(async () => "https://upload");
      }
      if (name === getFunctionName(api.photos.attach)) {
        return fns.attach ?? jest.fn(async () => null);
      }
      if (name === getFunctionName(api.photos.remove)) {
        return fns.remove ?? jest.fn(async () => null);
      }
      return jest.fn(async () => undefined);
    });
  }

  async function reachProfile(photoUrl: string | null = null) {
    (useQuery as jest.Mock).mockReturnValue({
      ...withNotes([
        {
          _id: "note-1",
          text: "Nina is moving to Berlin.",
          keyFacts: ["Moving to Berlin"],
          createdAt: new Date("2026-09-01T12:00:00").getTime(),
          mentions: [],
        },
      ]),
      photoUrl,
    });
    const result = renderRouter("src/app", { initialUrl: "/profile/profile-1" });
    await result;
    return result;
  }

  afterEach(() => {
    jest.clearAllMocks();
    // Restore too, not only clear. `clearAllMocks` resets calls and leaves the
    // implementation in place, so the `global.fetch` and `Alert` spies below
    // would stay installed for every test after them — which is how a test in
    // this repo once passed on a spy set up four tests earlier.
    jest.restoreAllMocks();
  });

  test("should offer to add a photo when there is none, and to replace one when there is", async () => {
    mockPhotoMutations({});
    await reachProfile(null);
    // The same control, saying which of the two it is. A separate "Add a photo"
    // button would sit on every profile for something most will never have.
    expect(screen.getByLabelText("Add a photo")).toBeTruthy();
    expect(screen.queryByLabelText("Replace photo")).toBeNull();

    await reachProfile("https://files/photo.jpg");
    expect(screen.getByLabelText("Replace photo")).toBeTruthy();
    expect(screen.getByLabelText("Photo of Nina")).toBeTruthy();
  });

  test("should not ask for the whole photo library to get one picked image", async () => {
    mockPhotoMutations({});
    const ask = ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock;
    const launch = ImagePicker.launchImageLibraryAsync as jest.Mock;
    launch.mockResolvedValueOnce({ canceled: true, assets: null });
    await reachProfile(null);

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Add a photo"));
    });

    await waitFor(() => expect(launch).toHaveBeenCalledTimes(1));
    // On iOS 14+ the picker runs out-of-process and needs no library access to
    // return one image the user chose. Asking would buy read access to their
    // entire library for nothing — and refusing on a "no" would deny a feature
    // that works regardless. Day 2 logged the same call on the card path as
    // unnecessary; this asserts a second instance was not added.
    expect(ask).not.toHaveBeenCalled();
  });

  test("should say so rather than fail silently if the picker cannot be opened", async () => {
    mockPhotoMutations({});
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockRejectedValueOnce(
      new Error("no access"),
    );
    await reachProfile(null);

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Add a photo"));
    });

    await waitFor(() =>
      expect(screen.getByText(/couldn't open your photos/)).toBeTruthy(),
    );
  });

  test("should upload the picked file and put it on this person", async () => {
    const generateUploadUrl = jest.fn(async () => "https://upload/here");
    const attach = jest.fn(
      async (_args: { profileId: string; storageId: string }) => null,
    );
    mockPhotoMutations({ generateUploadUrl, attach });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///picked.jpg", mimeType: "image/jpeg" }],
    });
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ blob: async () => new Blob(["bytes"]) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ storageId: "storage-1" }),
      });
    jest.spyOn(global, "fetch").mockImplementation(fetchMock);
    await reachProfile(null);

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Add a photo"));
    });

    await waitFor(() => expect(attach).toHaveBeenCalledTimes(1));
    expect(generateUploadUrl).toHaveBeenCalledTimes(1);
    expect(attach.mock.calls[0]?.[0]).toEqual({
      profileId: "profile-1",
      storageId: "storage-1",
    });
  });

  test("should crop on the way in, since the screen shows a square and bytes are paid for", async () => {
    mockPhotoMutations({});
    const launch = ImagePicker.launchImageLibraryAsync as jest.Mock;
    launch.mockResolvedValueOnce({ canceled: true, assets: null });
    await reachProfile(null);

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Add a photo"));
    });

    await waitFor(() => expect(launch).toHaveBeenCalledTimes(1));
    const [options] = launch.mock.calls[0] ?? [];
    // Day 2 learned this on the business-card path: an uncropped 12MP frame is
    // bytes the user stores and never sees.
    expect(options?.allowsEditing).toBe(true);
    expect(options?.aspect).toEqual([1, 1]);
  });

  test("should do nothing at all when the picker is cancelled", async () => {
    const generateUploadUrl = jest.fn(async () => "https://upload");
    mockPhotoMutations({ generateUploadUrl });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
      canceled: true,
      assets: null,
    });
    await reachProfile(null);

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Add a photo"));
    });

    // Not even an upload URL: backing out of the picker must cost nothing.
    expect(generateUploadUrl).not.toHaveBeenCalled();
    expect(screen.queryByText(/couldn't save that photo/)).toBeNull();
  });

  test("should ask before removing a photo, and remove it when the answer is yes", async () => {
    const remove = jest.fn(async (_args: { profileId: string }) => null);
    mockPhotoMutations({ remove });
    jest
      .spyOn(Alert, "alert")
      .mockImplementation((_title, _message, buttons) => {
        buttons?.find((b) => b.text === "Remove")?.onPress?.();
      });
    await reachProfile("https://files/photo.jpg");

    await act(async () => {
      fireEvent(screen.getByLabelText("Replace photo"), "longPress");
    });

    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    expect(remove.mock.calls[0]?.[0]).toEqual({ profileId: "profile-1" });
  });

  test("should remove nothing when the confirmation is dismissed", async () => {
    const remove = jest.fn(async () => null);
    mockPhotoMutations({ remove });
    jest
      .spyOn(Alert, "alert")
      .mockImplementation((_title, _message, buttons) => {
        buttons?.find((b) => b.text === "Cancel")?.onPress?.();
      });
    await reachProfile("https://files/photo.jpg");

    await act(async () => {
      fireEvent(screen.getByLabelText("Replace photo"), "longPress");
    });

    expect(remove).not.toHaveBeenCalled();
  });

  test("should not offer to remove a photo that is not there", async () => {
    mockPhotoMutations({});
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await reachProfile(null);

    await act(async () => {
      fireEvent(screen.getByLabelText("Add a photo"), "longPress");
    });

    // A long press on an empty circle should do nothing, not offer to delete
    // something that does not exist.
    expect(alert).not.toHaveBeenCalled();
  });
});
