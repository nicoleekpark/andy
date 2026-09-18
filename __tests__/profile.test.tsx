import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";
import { useAction, useQuery } from "convex/react";
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

  test("should hand Mail the subject and body, and no recipient", async () => {
    const draft = jest.fn(async () => ({
      personName: "Nina",
      subject: "How's the move going?",
      body: "Hope Berlin is treating you well.",
    }));
    mockDraft(draft);
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    await reachProfile();

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Draft a follow-up"));
    });

    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    const url = open.mock.calls[0]?.[0] ?? "";
    expect(url).toContain("mailto:?");
    expect(url).toContain(encodeURIComponent("How's the move going?"));
    expect(url).toContain(encodeURIComponent("Hope Berlin is treating you well."));
    // No recipient, deliberately. This app does not read Contacts and V1 stores
    // no address, so Mail's own autocomplete is the honest place for that — and
    // an address invented here would be worse than an empty line.
    expect(url.startsWith("mailto:?")).toBe(true);
  });

  test("should not let a drafted body add a header of its own to the mailto URL", async () => {
    mockDraft(
      jest.fn(async () => ({
        personName: "Nina",
        // The one that would actually matter. A note whose content steered the
        // model into writing this would otherwise blind-copy a stranger on a
        // message about somebody's private life — and the sender would see a
        // normal-looking compose window.
        subject: "Hi&bcc=attacker@example.com",
        body: "Hope you are well.\n&bcc=attacker@example.com&cc=someone@example.com",
      })),
    );
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    await reachProfile();

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Draft a follow-up"));
    });

    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    const url = open.mock.calls[0]?.[0] ?? "";
    // Exactly two parameters, both ours. `encodeURIComponent` turns the `&`
    // into `%26`, so the text stays text — asserted rather than assumed,
    // because this is the difference between a draft and a leak.
    expect(url.split("&")).toHaveLength(2);
    expect(url).not.toMatch(/&bcc=/);
    expect(url).not.toMatch(/&cc=/);
    expect(url).toContain("%26bcc%3D");
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
    jest.spyOn(Linking, "openURL").mockResolvedValue(true);
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

  test("should say so rather than do nothing when there is no mail app to open", async () => {
    mockDraft(
      jest.fn(async () => ({ personName: "Nina", subject: "s", body: "b" })),
    );
    // `openURL` rejecting, not `canOpenURL` returning false. On iOS that check
    // returns false for any scheme missing from `LSApplicationQueriesSchemes`,
    // and `app.json` has no `infoPlist` block — so asking first risked every
    // tap reporting "no mail app" with the whole suite green.
    jest
      .spyOn(Linking, "openURL")
      .mockRejectedValue(new Error("no handler for mailto:"));
    await reachProfile();

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Draft a follow-up"));
    });

    await waitFor(() =>
      expect(screen.getByText(/no mail app set up/)).toBeTruthy(),
    );
    // And it says what to do, not only what happened.
    expect(screen.getByText(/Set one up and tap again/)).toBeTruthy();
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
