import { act, fireEvent, screen } from "@testing-library/react-native";
import { useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { renderRouter } from "expo-router/testing-library";
import { api } from "@convex/_generated/api";

/**
 * src/app/(app)/index.tsx's three branches — loading, empty, populated — are
 * driven entirely by what `api.profiles.recent` returns, the same shape as
 * __tests__/profile.test.tsx's coverage of `api.profiles.withNotes`.
 *
 * Unlike that file, this route tree now has two `useQuery` call sites live at
 * once when home is what's mounted at "/" isn't true in practice (the
 * profile screen only mounts on its own route), but a bare `mockReturnValue`
 * would still be wrong here on principle — the generated `api` is a Proxy, so
 * nothing stops a future screen sharing this tree from adding a second
 * `useQuery` caller silently. Branching by `getFunctionName` pins this test
 * to `api.profiles.recent` specifically, the way capture.test.tsx's
 * `mockSaveCapture` pins `useMutation` to `api.notes.saveCapture`.
 */

function mockRecentQuery(value: unknown) {
  (useQuery as jest.Mock).mockImplementation((fn: unknown) =>
    getFunctionName(fn as never) === getFunctionName(api.profiles.recent)
      ? value
      : undefined,
  );
}

function buildPerson(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    profile: {
      _id: "profile-1",
      name: "지수",
      entityType: "person",
      tags: [],
      autoCreated: false,
      ...((overrides.profile as object) ?? {}),
    },
    lastNoteAt: new Date("2026-08-20").getTime(),
    noteCount: 1,
    ...overrides,
  };
}

describe("home screen", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("should show a loading state when the query has not resolved yet", async () => {
    mockRecentQuery(undefined);

    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;

    expect(screen.getByText("Loading…")).toBeTruthy();
  });

  test("should show the invitation copy when there is no one yet", async () => {
    mockRecentQuery([]);

    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;

    expect(
      screen.getByText("No one yet — tap record to remember your first person."),
    ).toBeTruthy();
  });

  test("should render a row for each person when the query resolves", async () => {
    mockRecentQuery([
      buildPerson({
        profile: { _id: "profile-1", name: "지수" },
        noteCount: 2,
      }),
      buildPerson({
        profile: { _id: "profile-2", name: "민호" },
        noteCount: 1,
      }),
    ]);

    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;

    expect(screen.getByText("지수")).toBeTruthy();
    expect(screen.getByText("민호")).toBeTruthy();
  });

  test("should route to that person's profile when a row is tapped", async () => {
    mockRecentQuery([buildPerson({ profile: { _id: "profile-42", name: "지수" } })]);

    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "지수" }));
    });

    expect(result.getPathname()).toBe("/profile/profile-42");
  });

  test("should route to capture when Record is tapped", async () => {
    mockRecentQuery([]);

    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Record" }));
    });

    expect(result.getSegments()).toEqual(["(app)", "capture"]);
  });

  test("should route to settings when the header Settings button is tapped", async () => {
    mockRecentQuery([]);

    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Settings" }));
    });

    expect(result.getPathname()).toBe("/settings");
  });
});
