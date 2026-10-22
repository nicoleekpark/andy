import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { useAction, useConvexConnectionState, useQuery } from "convex/react";
import { StyleSheet } from "react-native";
import { renderRouter } from "expo-router/testing-library";
import { api } from "@convex/_generated/api";
import { answerByName, nameOf } from "../test-support/convex-mocks";

/**
 * Home's bottom bar (`home-actions.md`, Final choice: S1, V-NOTCHED): a field
 * that filters home in place, free and offline, a labelled row that hands the
 * words to Ask, and the round + that opens the doors.
 */

const files = () =>
  (jest.requireMock("expo-file-system") as { __files: Map<string, string> }).__files;
const COPY = "file:///documents/offline-copy/copy.json";

function person(id: string, name: string) {
  return {
    profile: { _id: id, name, entityType: "person", tags: [], autoCreated: false },
    lastNoteAt: 1_700_000_000_000,
    noteCount: 1,
    latestFact: null,
    photoUrl: null,
  };
}

const PRIYA_FOUND = {
  people: [
    {
      profileId: "p-priya",
      name: "Priya",
      matchedName: "Priya",
      entityType: "person",
      noteCount: 2,
      mentionCount: 0,
      lastNoteAt: 1_700_000_000_000,
    },
  ],
  mentions: [],
};

/** Home's list, and what the name search answers. */
function server(found: unknown = PRIYA_FOUND) {
  (useQuery as jest.Mock).mockImplementation((reference: unknown, args: unknown) => {
    const name = nameOf(reference);
    if (name === nameOf(api.profiles.people)) return [person("p-nina", "Nina"), person("p-priya", "Priya")];
    // Like Convex: a skipped query answers nothing.
    if (name === nameOf(api.people.search)) return args === "skip" ? undefined : found;
    return undefined;
  });
}

function online(isWebSocketConnected: boolean) {
  (useConvexConnectionState as jest.Mock).mockReturnValue({
    hasInflightRequests: false,
    isWebSocketConnected,
    timeOfOldestInflightRequest: null,
    hasEverConnected: true,
    connectionCount: 1,
    connectionRetries: 0,
    inflightMutations: 0,
    inflightActions: 0,
  });
}

async function type(text: string) {
  await act(async () => {
    fireEvent(screen.getByTestId("home-search-field"), "focus");
    fireEvent.changeText(screen.getByTestId("home-search-field"), text);
  });
}

test("should show + and the search field at rest, and no Ask row", async () => {
  server();
  await renderRouter("src/app", { initialUrl: "/" });

  expect(screen.getByRole("button", { name: "New note" })).toBeTruthy();
  expect(screen.getByLabelText("Find a name or a word")).toBeTruthy();
  expect(screen.queryByTestId("home-ask-row")).toBeNull();
});

test("should filter home to who matches, using Ask's own name search, without calling anything paid", async () => {
  server();
  const recall = jest.fn();
  (useAction as jest.Mock).mockReturnValue(recall);
  await renderRouter("src/app", { initialUrl: "/" });

  await type("pri");

  await waitFor(() => expect(screen.getByRole("button", { name: "Open Priya" })).toBeTruthy());
  // The A–Z list is gone while a query is present: Nina is not a match.
  expect(screen.queryByText("Nina")).toBeNull();
  // R4: the same query Ask uses, never a matcher of home's own.
  const asked = (useQuery as jest.Mock).mock.calls
    .filter(([reference]) => nameOf(reference) === nameOf(api.people.search))
    .map(([, args]) => args);
  expect(asked).toContainEqual({ query: "pri" });
  expect(recall).not.toHaveBeenCalled();
});

test("should say so when no one matches", async () => {
  server({ people: [], mentions: [] });
  await renderRouter("src/app", { initialUrl: "/" });

  await type("zed");

  await waitFor(() => expect(screen.getByText("No one matches “zed”.")).toBeTruthy());
});

test("should hand the words to Ask, which waits for a tap before asking", async () => {
  server();
  const recall = jest.fn();
  (useAction as jest.Mock).mockReturnValue(recall);
  const result = renderRouter("src/app", { initialUrl: "/" });
  await result;

  await type("who moved to Lisbon");
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Advanced search: who moved to Lisbon" }));
  });

  expect(result.getPathname()).toBe("/search");
  expect(screen.getByLabelText("Advanced search").props.value).toBe("who moved to Lisbon");
  expect(recall).not.toHaveBeenCalled();
});

test("should offer Ask in your own words while the field is empty and in use", async () => {
  server();
  const result = renderRouter("src/app", { initialUrl: "/" });
  await result;

  await act(async () => {
    fireEvent(screen.getByTestId("home-search-field"), "focus");
  });
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Advanced search" }));
  });

  expect(result.getPathname()).toBe("/search");
  expect(screen.getByLabelText("Advanced search").props.value).toBe("");
});

test("should step + aside while searching, and bring it back on Cancel", async () => {
  server();
  await renderRouter("src/app", { initialUrl: "/" });

  await type("pri");
  expect(screen.queryByRole("button", { name: "New note" })).toBeNull();

  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    fireEvent(screen.getByTestId("home-search-field"), "blur");
  });

  expect(screen.getByRole("button", { name: "New note" })).toBeTruthy();
  expect(screen.getByTestId("home-search-field").props.value).toBe("");
});

test("should still find people offline from the phone's copy, and say asking needs a connection", async () => {
  files().set(
    COPY,
    JSON.stringify({
      ownerId: "user_default",
      takenAt: 1_700_000_000_000,
      profiles: [{ _id: "p-nina", _creationTime: 1, userId: "u1", name: "Nina", entityType: "person", tags: [], autoCreated: false }],
      notes: [
        {
          _id: "n-1",
          _creationTime: 2,
          userId: "u1",
          profileId: "p-nina",
          text: "Nina fosters two greyhounds.",
          keyFacts: ["Fosters two greyhounds"],
          source: "manual",
          createdAt: 1_700_000_000_000,
        },
      ],
      links: [],
    }),
  );
  online(false);
  answerByName(useQuery, {}, () => undefined);
  await renderRouter("src/app", { initialUrl: "/" });

  await type("greyhound");

  await waitFor(() => expect(screen.getByRole("button", { name: "Open Nina" })).toBeTruthy());
  expect(screen.getByText("Advanced search needs a connection. Names and words still work.")).toBeTruthy();
  expect(screen.queryByTestId("home-ask-row")).toBeNull();
  files().delete(COPY);
  online(true);
});

test("should show no search field while no one is kept yet", async () => {
  answerByName(useQuery, { [nameOf(api.profiles.people)]: [] });
  await renderRouter("src/app", { initialUrl: "/" });

  expect(screen.queryByTestId("home-search-field")).toBeNull();
  expect(screen.getByRole("button", { name: "New note" })).toBeTruthy();
});

test("should empty the field with Clear, and keep it in use", async () => {
  server();
  await renderRouter("src/app", { initialUrl: "/" });

  await type("pri");
  await act(async () => {
    fireEvent.press(screen.getByTestId("home-search-clear"));
  });

  expect(screen.getByTestId("home-search-field").props.value).toBe("");
  expect(screen.getByRole("button", { name: "Advanced search" })).toBeTruthy();
});

test("should be read list, then field, then + — though + is drawn on top", async () => {
  server();
  await renderRouter("src/app", { initialUrl: "/" });

  const order = screen
    .getAllByLabelText(/^(Find a name or a word|New note)$/)
    .map((element) => element.props.accessibilityLabel);

  // Tree order is what VoiceOver follows (home-actions.md: list → field → +).
  expect(order).toEqual(["Find a name or a word", "New note"]);
});

test("should hide the lines above the list while a query is present, and bring them back", async () => {
  files().set(
    "file:///documents/outbox/notes.json",
    JSON.stringify([{ id: "o1", ownerId: "user_default", keptAt: 1, today: "2026-10-13", text: "x", kind: "typed" }]),
  );
  server();
  await renderRouter("src/app", { initialUrl: "/" });
  expect(screen.getByTestId("outbox-line")).toBeTruthy();

  await type("pri");
  expect(screen.queryByTestId("outbox-line")).toBeNull();

  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
  });
  expect(screen.getByTestId("outbox-line")).toBeTruthy();
  files().delete("file:///documents/outbox/notes.json");
});

test("should keep + a circle that a fallback word can widen, never a fixed width", async () => {
  server();
  await renderRouter("src/app", { initialUrl: "/" });

  const style = StyleSheet.flatten(screen.getByTestId("capture-orbit-trigger").props.style);
  expect(style.width).toBeUndefined();
  expect(style.minWidth).toBe(72);
});


test("should make the waiting-notes line and Sync at least 44pt tall to touch", async () => {
  files().set(
    "file:///documents/outbox/notes.json",
    JSON.stringify([{ id: "o1", ownerId: "user_default", keptAt: 1, today: "2026-10-14", text: "x", kind: "typed" }]),
  );
  files().set(
    "file:///documents/pending/changes.json",
    JSON.stringify({
      ownerId: "user_default",
      changes: [{ id: "c1", kind: "removeNote", noteId: "n1", base: { keyFacts: [] }, madeAt: 1 }],
    }),
  );
  server();
  await renderRouter("src/app", { initialUrl: "/" });

  // Each is one 21pt line; the rest has to come from hitSlop (device QA, build 4).
  for (const id of ["outbox-line", "pending-line-sync"]) {
    const { top, bottom } = screen.getByTestId(id).props.hitSlop as { top: number; bottom: number };
    expect(21 + top + bottom).toBeGreaterThanOrEqual(44);
  }
  // And the gap between lines is the two targets' reach together, so a tap
  // between them never lands on the wrong one.
  const gap = StyleSheet.flatten(screen.getByTestId("pending-line").props.style).marginBottom as number;
  const { bottom } = screen.getByTestId("outbox-line").props.hitSlop as { bottom: number };
  const { top } = screen.getByTestId("pending-line-sync").props.hitSlop as { top: number };
  expect(gap).toBeGreaterThanOrEqual(top + bottom);
  files().delete("file:///documents/outbox/notes.json");
  files().delete("file:///documents/pending/changes.json");
});
