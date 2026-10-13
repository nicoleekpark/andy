import { act, fireEvent, screen } from "@testing-library/react-native";
import { AccessibilityInfo, SectionList } from "react-native";
import { useQuery } from "convex/react";
import { renderRouter } from "expo-router/testing-library";
import { api } from "@convex/_generated/api";
import { forgetSession } from "@/lib/use-once-per-session";
import { drawn } from "../test-support/drawn";
import { LOOP_WRITE_MS } from "@/components/thread-loop";
import { answerByName, nameOf } from "../test-support/convex-mocks";
import * as briefingModule from "@/lib/use-briefing";
import { INDEX_FROM } from "@/lib/name-index";

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
  answerByName(useQuery, { [nameOf(api.profiles.people)]: value });
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
    photoUrl: null,
    ...overrides,
  };
}

// The loop is hidden from assistive tech on purpose (the words carry the
// meaning), and testing-library skips hidden elements unless told otherwise.
const HIDDEN = { includeHiddenElements: true } as const;

describe("the remote switch", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // Home is the only place the briefing runs, so it is the place that has to
  // hand the switch to it (INFRA.md #6). What "off" then does is
  // briefing.test.tsx's business.
  test("should switch the briefing off when the server says calendarBriefing is off", async () => {
    const briefing = jest.spyOn(briefingModule, "useBriefing");
    answerByName(useQuery, {
      [nameOf(api.profiles.people)]: [],
      [nameOf(api.featureFlags.switchedOff)]: ["calendarBriefing"],
    });

    await renderRouter("src/app", { initialUrl: "/" });

    expect(briefing).toHaveBeenLastCalledWith(false);
  });

  test("should leave it on when nothing is switched off, or before the answer lands", async () => {
    const briefing = jest.spyOn(briefingModule, "useBriefing");
    answerByName(useQuery, {
      [nameOf(api.profiles.people)]: [],
      [nameOf(api.featureFlags.switchedOff)]: undefined,
    });

    await renderRouter("src/app", { initialUrl: "/" });

    expect(briefing).toHaveBeenLastCalledWith(true);
  });
});

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
      screen.getByText("No one yet — tap + to remember your first person."),
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
    expect(
      screen.getByRole("button", { name: "Marcus, Opening a gym in Oakland" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nina" })).toBeTruthy();
  });

  test("should show a person's photo beside their name", async () => {
    mockPeopleQuery([buildPerson({ photoUrl: "https://example.test/nina.jpg" })]);
    await renderRouter("src/app", { initialUrl: "/" });

    const photo = screen.getByTestId("profile-row-avatar-photo", HIDDEN);
    // expo-image hands its native view a list of sources.
    expect(photo.props.source).toEqual([{ uri: "https://example.test/nina.jpg" }]);
  });

  test("should show initials in the circle for someone with no photo", async () => {
    mockPeopleQuery([buildPerson({ profile: { name: "Emily Watson" } })]);
    await renderRouter("src/app", { initialUrl: "/" });

    // Device QA #8: names stay lined up, and a row reads as a person.
    expect(screen.getByText("EW", HIDDEN)).toBeTruthy();
    expect(screen.queryByTestId("profile-row-avatar-photo", HIDDEN)).toBeNull();
  });

  test("should fall back to initials when a photo cannot be loaded", async () => {
    mockPeopleQuery([buildPerson({ photoUrl: "https://example.test/gone.jpg" })]);
    await renderRouter("src/app", { initialUrl: "/" });

    await act(async () => {
      fireEvent(screen.getByTestId("profile-row-avatar-photo", HIDDEN), "error", {
        nativeEvent: { error: "not found" },
      });
    });

    // Not an empty ring: a photo deleted elsewhere, or never cached offline.
    expect(screen.getByText("N", HIDDEN)).toBeTruthy();
  });

  test("should keep the circle out of VoiceOver, which already hears the name", async () => {
    mockPeopleQuery([buildPerson()]);
    await renderRouter("src/app", { initialUrl: "/" });

    expect(screen.queryByText("N")).toBeNull();
    expect(screen.getByLabelText("Nina")).toBeTruthy();
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

  test("should route to capture through the orbit's Voice door", async () => {
    mockPeopleQuery([]);

    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "New note" }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Voice" }));
    });

    expect(result.getSegments()).toEqual(["(app)", "capture"]);
    expect(result.getSearchParams()).toEqual({ door: "voice" });
  });

  test("should show Settings as the gear, a 44pt target still called Settings", async () => {
    mockPeopleQuery([buildPerson()]);
    await renderRouter("src/app", { initialUrl: "/" });

    // Device QA #3: an icon rather than the word, as iOS apps do.
    const button = screen.getByRole("button", { name: "Settings" });
    expect(button.props.testID).toBe("settings-button");
    expect(screen.getByTestId("settings-gear").props.name).toBe("gearshape");
    const style = Object.assign({}, ...[button.props.style].flat(Infinity));
    expect([style.width, style.height]).toEqual([44, 44]);
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
    mockPeopleQuery([buildPerson()]);

    const router = renderRouter("src/app", { initialUrl: "/" });
    await router;

    // Through the bottom bar's field (`home-actions.md`, S1): in use, it
    // offers Ask.
    await act(async () => {
      fireEvent(screen.getByTestId("home-search-field"), "focus");
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Ask Andy in your own words" }));
    });

    expect(router.getPathname()).toBe("/search");
  });
});

describe("the A–Z index", () => {
  // Device QA #7 (decided 2026-10-11): letters and an index from INDEX_FROM
  // people, like Contacts; a short list stays one calm column.
  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** n people, sorted the way home sorts them: Adam…, then the names given. */
  function people(n: number, last: string[] = []) {
    const names = [
      ...Array.from({ length: n - last.length }, (_, i) => `Adam ${String(i).padStart(2, "0")}`),
      ...last,
    ];
    return names.map((name, i) => buildPerson({ profile: { _id: `p-${i}`, name } }));
  }

  test("should show no letters and no index below the threshold", async () => {
    mockPeopleQuery(people(INDEX_FROM - 1));
    await renderRouter("src/app", { initialUrl: "/" });

    expect(screen.queryByTestId("home-index")).toBeNull();
    expect(screen.queryByRole("header", { name: "A" })).toBeNull();
  });

  test("should show a letter over each group and the index from the threshold", async () => {
    mockPeopleQuery(people(INDEX_FROM, ["Eve", "김지선"]));
    await renderRouter("src/app", { initialUrl: "/" });

    expect(screen.getByTestId("home-index")).toBeTruthy();
    expect(screen.getByRole("header", { name: "A" })).toBeTruthy();
    // The list draws only its first screenful, so the later groups are read
    // through the index: stepping it visits each letter that has anybody.
    // Korean names under #, last (V1 launches English-only).
    const index = screen.getByRole("adjustable", { name: "Jump to a letter" });
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      await fireEvent(index, "accessibilityAction", { nativeEvent: { actionName: "increment" } });
      seen.push(index.props.accessibilityValue.text);
    }
    expect(seen).toEqual(["A", "E", "#", "#"]);
  });

  test("should jump to a letter tapped on the index, or the next one with anybody", async () => {
    const scroll = jest.spyOn(SectionList.prototype, "scrollToLocation").mockImplementation(() => {});
    mockPeopleQuery(people(INDEX_FROM, ["Eve", "김지선"]));
    await renderRouter("src/app", { initialUrl: "/" });
    const index = screen.getByTestId("home-index");
    // 27 letters in 270pt: one per 10pt, A at the top.
    await fireEvent(index, "layout", { nativeEvent: { layout: { height: 270 } } });

    await fireEvent(index, "responderGrant", { nativeEvent: { locationY: 45 } }); // E
    expect(scroll).toHaveBeenLastCalledWith(expect.objectContaining({ sectionIndex: 1, itemIndex: 0 }));

    await fireEvent(index, "responderMove", { nativeEvent: { locationY: 15 } }); // B: nobody
    // Contacts' way: on to the next letter that has somebody, E.
    expect(scroll).toHaveBeenLastCalledWith(expect.objectContaining({ sectionIndex: 1 }));

    await fireEvent(index, "responderMove", { nativeEvent: { locationY: 265 } }); // #
    expect(scroll).toHaveBeenLastCalledWith(expect.objectContaining({ sectionIndex: 2 }));
  });

  test("should be one adjustable control to VoiceOver, stepping through letters with anybody", async () => {
    const scroll = jest.spyOn(SectionList.prototype, "scrollToLocation").mockImplementation(() => {});
    mockPeopleQuery(people(INDEX_FROM, ["Eve", "김지선"]));
    await renderRouter("src/app", { initialUrl: "/" });
    const index = screen.getByRole("adjustable", { name: "Jump to a letter" });

    await fireEvent(index, "accessibilityAction", { nativeEvent: { actionName: "increment" } });
    await fireEvent(index, "accessibilityAction", { nativeEvent: { actionName: "increment" } });

    // A, then E — never a letter with nobody under it.
    expect(scroll).toHaveBeenLastCalledWith(expect.objectContaining({ sectionIndex: 1 }));
    expect(index.props.accessibilityValue).toEqual({ text: "E" });
  });
});

