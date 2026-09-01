import { act, fireEvent, screen } from "@testing-library/react-native";
import { useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { renderRouter } from "expo-router/testing-library";

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
    name: "지수",
    entityType: "person",
    tags: [],
    isStub: false,
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
      mentions: (mentions as Record<string, unknown>[] | undefined) ?? [],
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
      profile: buildProfile({ name: "지수" }),
    });

    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1" });
    await result;

    expect(screen.getByText("지수")).toBeTruthy();

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
          text: "오늘 지선 만났는데 민호네 집들이에서 봤어",
          keyFacts: ["브랜딩 디자이너다."],
        },
      ]),
    );

    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1" });
    await result;

    expect(screen.getByText("브랜딩 디자이너다.")).toBeTruthy();
    expect(screen.queryByText(/민호네 집들이/)).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: /show what you said/i }));
    });
    expect(screen.getByText(/민호네 집들이/)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: /hide what you said/i }));
    });
    expect(screen.queryByText(/민호네 집들이/)).toBeNull();
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
          keyFacts: ["ACME에서 senior engineer로 일한다."],
        },
        {
          _id: "note-voice",
          createdAt: Date.now(),
          source: "voice",
          text: "오늘 지수 만났는데",
          keyFacts: ["브랜딩 디자이너다."],
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
          text: "지수를 민호네 집들이에서 만났다.",
          mentions: [
            { profileId: "profile-minho", name: "민호", quote: "민호네 집들이에서" },
          ],
        },
      ]),
    );

    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1" });
    await result;

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Open 민호" }));
    });

    expect(result.getPathname()).toBe("/profile/profile-minho");
  });

  test("should render a Mentioned in section and route to the note's own profile when an entry is tapped", async () => {
    (useQuery as jest.Mock).mockReturnValue(
      withNotes([], [
        {
          noteId: "note-elsewhere",
          createdAt: Date.now(),
          quote: "민호네 집들이에서",
          aboutProfileId: "profile-jisoo",
          aboutName: "지수",
        },
      ]),
    );

    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1" });
    await result;

    expect(screen.getByText("Mentioned in")).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Open 지수" }));
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
    // screen, which also asks `profiles.candidatesFor` which names in the draft
    // more than one person answers to. A blanket mock hands that a profile
    // where it expects a list of questions.
    (useQuery as jest.Mock).mockImplementation((reference: unknown) =>
      getFunctionName(reference as never) === "profiles:candidatesFor"
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

test("should say how many mentions were left out when the list is truncated, and stay quiet when it is not", async () => {
  // Someone who comes up in fifty conversations should say so rather than
  // quietly showing five; a complete list needs no count next to it.
  const entry = {
    noteId: "note-a",
    createdAt: 1787933613833,
    quote: "민호네 집들이에서",
    aboutProfileId: "profile-other",
    aboutName: "지선",
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
