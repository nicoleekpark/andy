import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { AppState } from "react-native";
import { useAction, useMutation, useQuery } from "convex/react";
import { router } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import { api } from "@convex/_generated/api";
import type { Draft } from "@convex/extractionPrompt";
import type { CaptureDraft } from "../src/lib/capture-draft";
import { forgetOnThisPhone } from "../src/lib/on-phone";
import { answerByName, nameOf, quietCall } from "../test-support/convex-mocks";
import { answerDialog, pressConfirmButton } from "../test-support/dialog";

/** The Write body, by the words on screen (its label is its placeholder). */
const WRITE_BODY = /^Write (or paste )?what you want to remember/;

/**
 * The note on the capture screen survives iOS closing Andy (device QA #52):
 * kept on the phone as it changes, offered on home as Continue / Discard, and
 * put away only when the screen is left on purpose. Up to three at once.
 */

const files = () =>
  (jest.requireMock("expo-file-system") as { __files: Map<string, string> }).__files;
const DRAFT = "file:///documents/capture-draft/draft.json";

/** Everything kept on the phone. */
const all = (): CaptureDraft[] => {
  const raw = files().get(DRAFT);
  return raw === undefined ? [] : (JSON.parse(raw) as CaptureDraft[]);
};
/** The one kept draft, in tests that only ever write one. */
const kept = (): CaptureDraft | null => {
  const drafts = all();
  if (drafts.length > 1) throw new Error(`expected at most one draft, found ${drafts.length}`);
  return drafts[0] ?? null;
};

function draftOf(name: string, keyFacts: string[]): Draft {
  return {
    primary: {
      name,
      entityType: "person",
      relationshipContext: null,
      tags: [],
      firstMetDate: null,
      keyFacts,
    },
    mentions: [],
  };
}

function draft(over: Partial<CaptureDraft>): CaptureDraft {
  return {
    id: "d1",
    ownerId: "user_default",
    keptAt: 1,
    today: "2026-10-12",
    source: "manual",
    ...over,
  };
}

/** What iOS closing Andy leaves: the file, and nothing held in memory. */
function seed(...drafts: Partial<CaptureDraft>[]) {
  forgetOnThisPhone();
  files().set(DRAFT, JSON.stringify(drafts.map(draft)));
}

beforeEach(() => {
  answerByName(useQuery, { "profiles:resolveNames": [], "profiles:people": [] }, () => undefined);
});

afterEach(() => {
  forgetOnThisPhone();
});

async function typeANote(words: string) {
  // From home, as a person gets there — so there is somewhere to go back to.
  const result = renderRouter("src/app", { initialUrl: "/" });
  await result;
  await act(async () => {
    router.push("/capture");
  });
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Type it instead" }));
  });
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText(WRITE_BODY), words);
  });
  return result;
}

test("should keep typed words on the phone as they are written, tagged with the account", async () => {
  await typeANote("Priya moved to Lisbon");

  await waitFor(() => expect(kept()?.words).toBe("Priya moved to Lisbon"));
  expect(kept()).toMatchObject({ ownerId: "user_default", source: "manual" });
});

test("should keep the words at once when Andy goes to the background", async () => {
  // jest-expo's AppState.addEventListener is a mock already: what it was
  // handed during this test is every listener the screens added.
  const addListener = AppState.addEventListener as jest.Mock;
  const before = addListener.mock.calls.length;
  await typeANote("Priya moved to Lisbon");

  // Before the pause after typing has passed. "inactive" comes first on the
  // way out (the app switcher, a call), and iOS may close Andy any time after.
  const listeners = addListener.mock.calls
    .slice(before)
    .map((call) => call[1] as (state: string) => void);
  await act(async () => listeners.forEach((listener) => listener("inactive")));

  expect(kept()?.words).toBe("Priya moved to Lisbon");
  // And back, so nothing listening is left thinking Andy is away.
  await act(async () => listeners.forEach((listener) => listener("active")));
});

test("should keep the draft when the screen goes without being left (iOS closing Andy, a session ending)", async () => {
  await typeANote("Priya moved to Lisbon");
  await waitFor(() => expect(kept()).not.toBeNull());

  await screen.unmount();

  expect(kept()?.words).toBe("Priya moved to Lisbon");
});

test("should put the draft away when the screen is backed out of", async () => {
  await typeANote("Priya moved to Lisbon");
  await waitFor(() => expect(kept()).not.toBeNull());

  await act(async () => {
    router.back();
  });
  // Written words ask before going (the Write screen); this one says yes.
  await act(async () => {
    await answerDialog("Discard");
  });

  expect(kept()).toBeNull();
});

test("should put the draft away once the note is saved", async () => {
  (useAction as jest.Mock).mockReturnValue(
    jest.fn(async () => draftOf("Priya", ["moved to Lisbon"])),
  );
  const saveCapture = jest.fn(async () => ({ profileId: "p-priya" }));
  answerByName(useMutation, { [nameOf(api.notes.saveCapture)]: saveCapture }, quietCall);
  await typeANote("Priya moved to Lisbon");
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Let Andy read it" }));
  });
  // Under review now, and kept as such.
  await waitFor(() => expect(kept()?.review?.draft.primary.name).toBe("Priya"));

  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Remember this" }));
  });

  await waitFor(() => expect(saveCapture).toHaveBeenCalledTimes(1));
  expect(kept()).toBeNull();
});

test("should offer the half-written note on home, and continue it as it was", async () => {
  seed({ words: "Priya moved to Lisbon" });

  const result = renderRouter("src/app", { initialUrl: "/" });
  await result;
  expect(screen.getByText("You were writing a note.")).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Continue the note you were writing" }));
  });

  expect(result.getPathname()).toBe("/capture");
  expect(result.getSearchParams()).toEqual({ resume: "d1" });
  expect(screen.getByLabelText(WRITE_BODY).props.value).toBe("Priya moved to Lisbon");
});

test("should continue a note recorded on someone's page from that page", async () => {
  seed({ words: "She moved", profileId: "contact-1", aboutName: "Priya" });

  const result = renderRouter("src/app", { initialUrl: "/" });
  await result;
  expect(screen.getByText("You were writing about Priya.")).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Continue the note about Priya" }));
  });

  expect(result.getPathname()).toBe("/profile/contact-1/capture");
});

test("should continue a note under review on the review screen, with its corrections, without reading it again", async () => {
  const extract = jest.fn(async () => draftOf("Priya", ["what Andy read"]));
  (useAction as jest.Mock).mockReturnValue(extract);
  const read = draftOf("Priya", ["moved to Lisbn"]);
  seed({
    words: "Priya moved to Lisbn",
    review: {
      transcript: "Priya moved to Lisbn",
      readTranscript: "Priya moved to Lisbn",
      draft: draftOf("Priya", ["moved to Lisbon"]),
      extracted: read,
      resolutions: {},
    },
  });

  await renderRouter("src/app", { initialUrl: "/capture?resume=d1" });

  expect(screen.getByRole("button", { name: "Remember this" })).toBeTruthy();
  expect(screen.getByDisplayValue("moved to Lisbon")).toBeTruthy();
  expect(extract).not.toHaveBeenCalled();
});

test("should discard the half-written note from home only once asked", async () => {
  seed({ words: "Priya moved to Lisbon" });
  const asked = pressConfirmButton("Discard");

  await renderRouter("src/app", { initialUrl: "/" });
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Discard the note you were writing" }));
  });

  expect(asked).toHaveBeenCalledWith("Discard this note?", expect.any(String), expect.any(Array));
  expect(kept()).toBeNull();
  expect(screen.queryByTestId("draft-line")).toBeNull();
});

test("should not offer another account's half-written note", async () => {
  seed({ ownerId: "someone-else", words: "theirs" });

  await renderRouter("src/app", { initialUrl: "/" });

  expect(screen.queryByTestId("draft-line")).toBeNull();
});

test("should not open a new note with the kept words unless Continue was chosen", async () => {
  seed({ words: "Priya moved to Lisbon" });

  await renderRouter("src/app", { initialUrl: "/" });
  await act(async () => {
    router.push("/capture");
  });

  expect(screen.queryByLabelText(WRITE_BODY)).toBeNull();
  // And opening it without writing anything leaves the kept one alone.
  await act(async () => {
    router.back();
  });
  expect(kept()?.words).toBe("Priya moved to Lisbon");
});

test("should make Continue and Discard at least 44pt tall to touch", async () => {
  seed({ words: "Priya moved to Lisbon" });

  await renderRouter("src/app", { initialUrl: "/" });

  // The words are one 21pt line; the rest has to come from hitSlop.
  for (const id of ["draft-line-continue", "draft-line-discard"]) {
    const { top, bottom } = screen.getByTestId(id).props.hitSlop as { top: number; bottom: number };
    expect(21 + top + bottom).toBeGreaterThanOrEqual(44);
  }
});

test("should keep a new note beside one still waiting on home, without touching it", async () => {
  seed({ words: "Priya moved to Lisbon", aboutName: "Priya" });

  await typeANote("Sam got a dog");

  await waitFor(() => expect(all()).toHaveLength(2));
  expect(all().find((d) => d.id === "d1")?.words).toBe("Priya moved to Lisbon");
  expect(all().find((d) => d.id !== "d1")?.words).toBe("Sam got a dog");
});

test("should offer each kept note on its own line, newest first, and continue the one chosen", async () => {
  seed(
    { id: "a", words: "Priya moved", aboutName: "Priya", keptAt: 1 },
    { id: "b", words: "Sam got a dog", aboutName: "Sam", keptAt: 3 },
    { id: "c", words: "Lunch", keptAt: 2 },
  );

  const result = renderRouter("src/app", { initialUrl: "/" });
  await result;
  expect(screen.getAllByTestId("draft-line").map((line) => line.props.children[0].props.children)).toEqual([
    "You were writing about Sam.",
    "You were writing a note.",
    "You were writing about Priya.",
  ]);
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Continue the note about Priya" }));
  });

  expect(result.getSearchParams()).toEqual({ resume: "a" });
  expect(screen.getByLabelText(WRITE_BODY).props.value).toBe("Priya moved");
});

test("should not keep a fourth note while three are waiting — and throw none of the three away", async () => {
  seed(
    { id: "a", words: "one", keptAt: 1 },
    { id: "b", words: "two", keptAt: 2 },
    { id: "c", words: "three", keptAt: 3 },
  );

  await typeANote("four");
  // Longer than the pause after typing.
  const typedAt = Date.now();
  await waitFor(() => expect(Date.now() - typedAt).toBeGreaterThan(600));

  expect(all().map((d) => d.words).sort()).toEqual(["one", "three", "two"]);
});

test("should put away only its own note when backed out of, never another one waiting", async () => {
  seed({ words: "Priya moved to Lisbon" });
  await typeANote("Sam got a dog");
  await waitFor(() => expect(all()).toHaveLength(2));

  await act(async () => {
    router.back();
  });
  await act(async () => {
    await answerDialog("Discard");
  });

  expect(all().map((d) => d.words)).toEqual(["Priya moved to Lisbon"]);
});

test("should keep updating the note it continued rather than add a second copy", async () => {
  seed({ words: "Priya moved" });

  await renderRouter("src/app", { initialUrl: "/capture?resume=d1" });
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText(WRITE_BODY), "Priya moved to Lisbon");
  });

  await waitFor(() => expect(kept()?.words).toBe("Priya moved to Lisbon"));
  expect(kept()?.id).toBe("d1");
});

test("should still offer a note kept the way the first version wrote it, as one draft on its own", async () => {
  forgetOnThisPhone();
  files().set(
    DRAFT,
    JSON.stringify({ ownerId: "user_default", keptAt: 1, today: "2026-10-12", source: "manual", words: "Priya moved" }),
  );

  const result = renderRouter("src/app", { initialUrl: "/" });
  await result;
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Continue the note you were writing" }));
  });

  expect(screen.getByLabelText(WRITE_BODY).props.value).toBe("Priya moved");
});
