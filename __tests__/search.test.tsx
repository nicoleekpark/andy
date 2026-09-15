import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { useAction } from "convex/react";
import { ConvexError } from "convex/values";
import { getFunctionName } from "convex/server";
import { renderRouter } from "expo-router/testing-library";
import { api } from "@convex/_generated/api";

/**
 * src/app/(app)/search.tsx is the first screen in this app driven by an action
 * rather than a query, and that difference is what most of these tests are
 * about. A query screen renders whatever `useQuery` hands it; this one has
 * states of its own — untouched, in flight, answered, empty, refused — and the
 * transitions between them are the behaviour.
 *
 * `useAction` is pinned to `api.search.recall` by name the way home.test.tsx
 * pins `useQuery` to `api.profiles.recent`: the generated `api` is a Proxy, so a
 * blanket `mockReturnValue` would keep passing if the screen were rewired to
 * call something else entirely.
 */

const recall = jest.fn();

function mockRecall() {
  (useAction as jest.Mock).mockImplementation((reference: unknown) =>
    getFunctionName(reference as never) === getFunctionName(api.search.recall)
      ? recall
      : jest.fn(async () => undefined),
  );
}

function buildResult(overrides: Record<string, unknown> = {}) {
  return {
    noteId: "note-1",
    score: 0.62,
    text: "Got a business card from Marcus, he runs a climbing gym in Oakland.",
    keyFacts: ["Runs a climbing gym in Oakland"],
    createdAt: new Date("2026-08-20T12:00:00Z").getTime(),
    source: "voice",
    profile: {
      profileId: "profile-marcus",
      name: "Marcus",
      entityType: "person",
      relationshipContext: "networking",
    },
    mentions: [],
    ...overrides,
  };
}

/**
 * Wrapped in an object on purpose.
 *
 * `renderRouter`'s result is itself a thenable, so returning it from an `async`
 * function lets `await` unwrap it — and the resolved value has no
 * `getPathname()`. `day-01.dev.md` records this exact trap; this helper walked
 * straight back into it, and the symptom is `router.getPathname is not a
 * function` three tests later rather than anything at the seam.
 */
async function renderSearch() {
  const router = renderRouter("src/app", { initialUrl: "/search" });
  await router;
  return { router };
}

/**
 * Type a question and press Ask.
 *
 * Both halves are awaited inside `act`. RTL v14 is async throughout, and an
 * un-awaited `changeText` leaves `question` empty — which keeps the Ask button
 * disabled, so the press does nothing and the failure reads as "the action was
 * never called" rather than "the typing never landed".
 */
async function type(question: string) {
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText("Ask Andy"), question);
  });
}

async function ask(question: string) {
  await type(question);
  await act(async () => {
    fireEvent.press(screen.getByLabelText("Ask"));
  });
}

describe("search screen", () => {
  beforeEach(() => {
    mockRecall();
  });

  afterEach(() => {
    jest.clearAllMocks();
    recall.mockReset();
  });

  test("should invite a question rather than apologise for having no results yet", async () => {
    await renderSearch();

    expect(screen.getByText(/Ask in your own words/)).toBeTruthy();
    // Nothing has been asked, so nothing has been spent.
    expect(recall).not.toHaveBeenCalled();
  });

  test("should not search while the question is still being typed", async () => {
    await renderSearch();

    await type("who runs a climbing gym");

    // The typing has to be asserted, or this passes for the wrong reason: an
    // un-awaited `changeText` leaves the field empty and "nothing was searched"
    // becomes true because nothing happened at all. That is how it was written
    // the first time.
    expect(screen.getByLabelText("Ask Andy").props.value).toBe(
      "who runs a climbing gym",
    );
    // Every question is a paid embedding call. A `useAction` wired to
    // `onChangeText` would turn this one question into twenty-three of them.
    expect(recall).not.toHaveBeenCalled();
  });

  test("should refuse to ask an empty question", async () => {
    await renderSearch();

    await ask("   ");

    // Three assertions because there are two guards — `disabled` on the button
    // and the early return in `ask()` — and deleting either one alone left this
    // test green when it only checked that nothing was called. Naming the
    // mechanism is what makes each of them load-bearing.
    expect(screen.getByLabelText("Ask Andy").props.value).toBe("   ");
    expect(
      screen.getByLabelText("Ask").props.accessibilityState.disabled,
    ).toBe(true);
    expect(recall).not.toHaveBeenCalled();
  });

  test("should show that it is searching while the answer is still coming back", async () => {
    // Deferred on purpose: with a resolved promise the spinner is gone before
    // anything can look at it, and the branch that renders it was reachable by
    // no test at all — deleting it entirely kept the suite green.
    let release: (value: unknown) => void = () => {};
    recall.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    await renderSearch();

    await ask("who runs a climbing gym");
    expect(screen.getByLabelText("Searching")).toBeTruthy();
    // And not the invitation, which would read as though nothing was asked.
    expect(screen.queryByText(/Ask in your own words/)).toBeNull();

    await act(async () => {
      release({ query: "who runs a climbing gym", results: [buildResult()] });
    });
    expect(screen.queryByLabelText("Searching")).toBeNull();
    expect(screen.getByText("Marcus")).toBeTruthy();
  });

  test("should send the trimmed question and show the note that answered it", async () => {
    recall.mockResolvedValue({
      query: "who runs a climbing gym",
      results: [buildResult()],
    });
    await renderSearch();

    await ask("  who runs a climbing gym  ");

    expect(recall).toHaveBeenCalledWith({ query: "who runs a climbing gym" });
    expect(screen.getByText("Marcus")).toBeTruthy();
    expect(screen.getByText("Runs a climbing gym in Oakland")).toBeTruthy();
  });

  test.each([
    ["never had an extraction step", undefined],
    ["had every fact blanked out", []],
  ])(
    "should show the transcript when a note %s",
    async (_case, keyFacts) => {
      recall.mockResolvedValue({
        query: "anything",
        results: [buildResult({ keyFacts })],
      });
      await renderSearch();

      await ask("anything");

      expect(screen.getByText(/Got a business card from Marcus/)).toBeTruthy();
    },
  );

  test("should show each confirmed fact on its own line rather than as one run-on", async () => {
    recall.mockResolvedValue({
      query: "priya",
      results: [
        buildResult({
          keyFacts: [
            "Moving to Seattle in October 2026",
            "Starting a new job at a robotics startup",
          ],
        }),
      ],
    });
    await renderSearch();

    await ask("priya");

    expect(screen.getByText("Moving to Seattle in October 2026")).toBeTruthy();
    expect(
      screen.getByText("Starting a new job at a robotics startup"),
    ).toBeTruthy();
  });

  test("should offer everyone who came up in a note, not only the person it is about", async () => {
    recall.mockResolvedValue({
      query: "the Meta developer",
      results: [
        buildResult({
          profile: {
            profileId: "profile-amy",
            name: "Amy",
            entityType: "person",
          },
          mentions: [
            {
              profileId: "profile-john",
              name: "John",
              quote: "a software developer from Meta",
              exists: true,
            },
          ],
        }),
      ],
    });
    const { router } = await renderSearch();

    await ask("the Meta developer");

    // The note is about Amy; John is why it matched. Somebody who exists only
    // inside another person's note is reachable here or nowhere.
    expect(screen.getByText("Amy")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText("John"));
    });
    expect(router.getPathname()).toBe("/profile/profile-john");
  });

  test("should leave a deleted person's name on the note but open nothing when it is pressed", async () => {
    recall.mockResolvedValue({
      query: "the birthday",
      results: [
        buildResult({
          mentions: [
            {
              profileId: null,
              name: "지선",
              quote: "지선 was there",
              exists: false,
            },
          ],
        }),
      ],
    });
    const { router } = await renderSearch();

    await ask("the birthday");

    // The name stays — deleting somebody must not rewrite the notes of everyone
    // who mentioned them — but it is not a control. Day 3 shipped the version
    // where it was still tappable, and the test that missed it checked only
    // that the name was *visible*, which is why all three of these are here.
    const name = screen.getByText("지선");
    expect(name).toBeTruthy();
    // Not a button at all, rather than a disabled one: VoiceOver should not
    // announce a name that was never tappable as a dimmed control.
    expect(screen.queryByLabelText("지선")).toBeNull();
    await act(async () => {
      fireEvent.press(name);
    });
    expect(router.getPathname()).toBe("/search");
  });

  test("should open the person a result is about when their name is pressed", async () => {
    recall.mockResolvedValue({ query: "marcus", results: [buildResult()] });
    const { router } = await renderSearch();

    await ask("marcus");
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Marcus"));
    });

    expect(router.getPathname()).toBe("/profile/profile-marcus");
  });

  test("should say plainly that nothing is saved about it rather than showing an empty list", async () => {
    recall.mockResolvedValue({ query: "the capital of France", results: [] });
    await renderSearch();

    await ask("what is the capital of France");

    expect(
      screen.getByText(/Nothing saved about that yet/),
    ).toBeTruthy();
    // And not the untouched-state invitation, which would read as though the
    // question had never been asked.
    expect(screen.queryByText(/Ask in your own words/)).toBeNull();
  });

  test("should show the server's own words when it refuses, since they were written for a person", async () => {
    recall.mockRejectedValue(new ConvexError("That's a long question. Try a shorter one."));
    await renderSearch();

    await ask("a very long question");

    await waitFor(() =>
      expect(
        screen.getByText("That's a long question. Try a shorter one."),
      ).toBeTruthy(),
    );
  });

  test("should not put a raw failure on screen when the error was not written for a person", async () => {
    recall.mockRejectedValue(new Error("fetch failed: ECONNREFUSED 10.0.0.1"));
    await renderSearch();

    await ask("anything");

    await waitFor(() =>
      expect(
        screen.getByText("Andy couldn't reach that just now. Try again."),
      ).toBeTruthy(),
    );
    expect(screen.queryByText(/ECONNREFUSED/)).toBeNull();
  });

  test("should not fall back to the untouched invitation underneath an error", async () => {
    recall.mockRejectedValue(new ConvexError("Ask Andy something first."));
    await renderSearch();

    await ask("anything");

    await waitFor(() =>
      expect(screen.getByText("Ask Andy something first.")).toBeTruthy(),
    );
    // The invitation says nothing has happened yet. Printed under an apology it
    // makes the screen contradict itself.
    expect(screen.queryByText(/Ask in your own words/)).toBeNull();
  });

  test("should clear a previous refusal once a later question succeeds", async () => {
    recall.mockRejectedValueOnce(new ConvexError("Ask Andy something first."));
    await renderSearch();
    await ask("anything");
    await waitFor(() =>
      expect(screen.getByText("Ask Andy something first.")).toBeTruthy(),
    );

    recall.mockResolvedValueOnce({ query: "marcus", results: [buildResult()] });
    await ask("marcus");

    await waitFor(() => expect(screen.getByText("Marcus")).toBeTruthy());
    expect(screen.queryByText("Ask Andy something first.")).toBeNull();
  });
});
