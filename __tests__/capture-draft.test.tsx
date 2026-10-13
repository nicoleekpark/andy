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
import { pressConfirmButton } from "../test-support/dialog";

/**
 * The note on the capture screen survives iOS closing Andy (device QA #52):
 * kept on the phone as it changes, offered on home as Continue / Discard, and
 * put away only when the screen is left on purpose.
 */

const files = () =>
  (jest.requireMock("expo-file-system") as { __files: Map<string, string> }).__files;
const DRAFT = "file:///documents/capture-draft/draft.json";

const kept = (): CaptureDraft | null => {
  const raw = files().get(DRAFT);
  return raw === undefined ? null : (JSON.parse(raw) as CaptureDraft);
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

/** What iOS closing Andy leaves: the file, and nothing held in memory. */
function seed(over: Partial<CaptureDraft>) {
  forgetOnThisPhone();
  files().set(
    DRAFT,
    JSON.stringify({
      ownerId: "user_default",
      keptAt: 1,
      today: "2026-10-12",
      source: "manual",
      ...over,
    }),
  );
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
    fireEvent.changeText(screen.getByLabelText("Type a note"), words);
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
    fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  });

  expect(result.getPathname()).toBe("/capture");
  expect(screen.getByLabelText("Type a note").props.value).toBe("Priya moved to Lisbon");
});

test("should continue a note recorded on someone's page from that page", async () => {
  seed({ words: "She moved", profileId: "contact-1", aboutName: "Priya" });

  const result = renderRouter("src/app", { initialUrl: "/" });
  await result;
  expect(screen.getByText("You were writing about Priya.")).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Continue" }));
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

  await renderRouter("src/app", { initialUrl: "/capture?resume=1" });

  expect(screen.getByRole("button", { name: "Remember this" })).toBeTruthy();
  expect(screen.getByDisplayValue("moved to Lisbon")).toBeTruthy();
  expect(extract).not.toHaveBeenCalled();
});

test("should discard the half-written note from home only once asked", async () => {
  seed({ words: "Priya moved to Lisbon" });
  const asked = pressConfirmButton("Discard");

  await renderRouter("src/app", { initialUrl: "/" });
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Discard" }));
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

  expect(screen.queryByLabelText("Type a note")).toBeNull();
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

test("should not write over a note still waiting on home when a new one is started", async () => {
  seed({ words: "Priya moved to Lisbon", aboutName: "Priya" });

  await typeANote("Sam got a dog");
  // Longer than the pause after typing.
  const typedAt = Date.now();
  await waitFor(() => expect(Date.now() - typedAt).toBeGreaterThan(600));

  expect(kept()?.words).toBe("Priya moved to Lisbon");
});
