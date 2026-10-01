import { act, fireEvent, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import { useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { renderRouter } from "expo-router/testing-library";
import { api } from "@convex/_generated/api";
import { forgetSession } from "@/lib/use-once-per-session";
import { drawn } from "../test-support/drawn";
import { LOOP_WRITE_MS } from "@/components/thread-loop";

/**
 * src/app/(app)/index.tsx's three branches — loading, empty, populated — are
 * driven entirely by what `api.profiles.people` returns, the same shape as
 * __tests__/profile.test.tsx's coverage of `api.profiles.withNotes`.
 *
 * Unlike that file, this route tree now has two `useQuery` call sites live at
 * once when home is what's mounted at "/" isn't true in practice (the
 * profile screen only mounts on its own route), but a bare `mockReturnValue`
 * would still be wrong here on principle — the generated `api` is a Proxy, so
 * nothing stops a future screen sharing this tree from adding a second
 * `useQuery` caller silently. Branching by `getFunctionName` pins this test
 * to `api.profiles.people` specifically, the way capture.test.tsx's
 * `mockSaveCapture` pins `useMutation` to `api.notes.saveCapture`.
 */

function mockPeopleQuery(value: unknown) {
  (useQuery as jest.Mock).mockImplementation((fn: unknown) =>
    getFunctionName(fn as never) === getFunctionName(api.profiles.people)
      ? value
      : undefined,
  );
}

function buildPerson(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    profile: {
      _id: "profile-1",
      name: "Nina",
      entityType: "person",
      tags: [],
      autoCreated: false,
      ...((overrides.profile as object) ?? {}),
    },
    lastNoteAt: new Date("2026-08-20").getTime(),
    noteCount: 1,
    latestFact: null,
    ...overrides,
  };
}

// The loop is hidden from assistive tech on purpose (the words carry the
// meaning), and testing-library skips hidden elements unless told otherwise.
const HIDDEN = { includeHiddenElements: true } as const;

describe("home screen", () => {
  beforeEach(() => {
    forgetSession();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("should show a loading state when the query has not resolved yet", async () => {
    mockPeopleQuery(undefined);

    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;

    expect(screen.getByText("Loading…")).toBeTruthy();
  });

  test("should show the invitation copy when there is no one yet", async () => {
    mockPeopleQuery([]);

    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;

    expect(
      screen.getByText("No one yet — tap record to remember your first person."),
    ).toBeTruthy();
  });

  // The empty home greets you once: the loop draws itself the first time it
  // appears in a run of the app, then rests; after that it is simply there.
  // Measured by what is drawn over time, not by whether an animation was
  // asked for (an Animated version passed that while sitting blank).
  test("should draw the loop the first time the empty home appears, and not again", async () => {
    jest.useFakeTimers();
    mockPeopleQuery([]);

    const first = renderRouter("src/app", { initialUrl: "/" });
    await first;
    await act(async () => {});
    expect(screen.getByTestId("thread-loop-drawing", HIDDEN)).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(LOOP_WRITE_MS * 0.4);
    });
    const midway = drawn("thread-loop-drawing");
    await act(async () => {
      jest.advanceTimersByTime(LOOP_WRITE_MS * 0.6 + 200);
    });
    const written = drawn("thread-loop-drawing");
    // Part-way: more than the bare thread (1 path, nothing of the twist yet)
    // and less than all of it. Blank-then-whole fails the first half.
    expect(midway).toBeGreaterThan(1);
    expect(midway).toBeLessThan(written);

    // A second render in the same test is the second appearance: `screen`
    // follows the latest render. Fine here because only the second tree is
    // queried; a test querying both would hit duplicate testIDs.
    const second = renderRouter("src/app", { initialUrl: "/" });
    await second;
    await act(async () => {});

    expect(screen.getByTestId("thread-loop-still", HIDDEN)).toBeTruthy();
    expect(drawn("thread-loop-still")).toBe(written);
    jest.useRealTimers();
  });

  test("should not draw the loop when Reduce Motion is on", async () => {
    jest.useFakeTimers();
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValueOnce(true);
    mockPeopleQuery([]);

    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;
    await act(async () => {});
    const at = drawn("thread-loop-still");
    await act(async () => {
      jest.advanceTimersByTime(800);
    });

    expect(screen.getByTestId("thread-loop-still", HIDDEN)).toBeTruthy();
    expect(at).toBeGreaterThan(10);
    expect(drawn("thread-loop-still")).toBe(at);
    jest.useRealTimers();
  });

  test("should render a row for each person when the query resolves", async () => {
    mockPeopleQuery([
      buildPerson({
        profile: { _id: "profile-1", name: "Nina" },
        noteCount: 2,
      }),
      buildPerson({
        profile: { _id: "profile-2", name: "Marcus" },
        noteCount: 1,
      }),
    ]);

    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;

    expect(screen.getByText("Nina")).toBeTruthy();
    expect(screen.getByText("Marcus")).toBeTruthy();
  });

  test("should show the latest saved fact under a name, and nothing when there is none", async () => {
    mockPeopleQuery([
      buildPerson({
        profile: { _id: "p-1", name: "Marcus" },
        latestFact: "Opening a gym in Oakland",
      }),
      buildPerson({ profile: { _id: "p-2", name: "Nina" } }),
    ]);

    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;

    const fact = screen.getByText("Opening a gym in Oakland");
    // One line: the profile is where the rest is.
    expect(fact.props.numberOfLines).toBe(1);
    // Nina has none, so her row says nothing rather than an empty line.
    expect(screen.getAllByText(/Opening a gym/)).toHaveLength(1);
  });

  test("should route to that person's profile when a row is tapped", async () => {
    mockPeopleQuery([buildPerson({ profile: { _id: "profile-42", name: "Nina" } })]);

    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Nina" }));
    });

    expect(result.getPathname()).toBe("/profile/profile-42");
  });

  test("should route to capture when Record is tapped", async () => {
    mockPeopleQuery([]);

    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Record" }));
    });

    expect(result.getSegments()).toEqual(["(app)", "capture"]);
  });

  test("should route to settings when the header Settings button is tapped", async () => {
    mockPeopleQuery([]);

    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Settings" }));
    });

    expect(result.getPathname()).toBe("/settings");
  });

  test("should offer a way into Ask Andy, since a screen nobody can reach is not shipped", async () => {
    mockPeopleQuery([]);

    const router = renderRouter("src/app", { initialUrl: "/" });
    await router;

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Ask Andy"));
    });

    expect(router.getPathname()).toBe("/search");
  });
});
