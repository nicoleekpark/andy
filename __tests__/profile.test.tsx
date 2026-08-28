import { act, fireEvent, screen } from "@testing-library/react-native";
import { useQuery } from "convex/react";
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
      profile: buildProfile({ name: "지수" }),
      notes: [
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
      ],
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
    (useQuery as jest.Mock).mockReturnValue({
      profile: buildProfile(),
      notes: [
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
      ],
    });

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
    (useQuery as jest.Mock).mockReturnValue({
      profile: buildProfile(),
      notes: [
        {
          _id: "note-1",
          createdAt: 1787933613833,
          text: "오늘 지선 만났는데 민호네 집들이에서 봤어",
          keyFacts: ["브랜딩 디자이너다."],
        },
      ],
    });

    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1" });
    await result;

    expect(screen.getByText("브랜딩 디자이너다.")).toBeTruthy();
    expect(screen.queryByText(/민호네 집들이/)).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByText("What you said"));
    });
    expect(screen.getByText(/민호네 집들이/)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText("Hide what you said"));
    });
    expect(screen.queryByText(/민호네 집들이/)).toBeNull();
  });

  test("should offer a way to add a note, scoped to this profile's capture route", async () => {
    // Without this the profile is read-only and there is no route from noticing
    // something is missing to recording it.
    (useQuery as jest.Mock).mockReturnValue({
      profile: buildProfile(),
      notes: [],
    });

    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1" });
    await result;

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Add a note" }));
    });

    expect(result.getSegments()).toEqual(["(app)", "profile", "[id]", "capture"]);
  });
});
