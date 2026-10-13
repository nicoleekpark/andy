import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { useConvexConnectionState, useQuery } from "convex/react";
import { router } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import { MAX_TRANSCRIPT_CHARS } from "@convex/extractionPrompt";
import { answerByName } from "../test-support/convex-mocks";
import { answerDialog } from "../test-support/dialog";

/** The Write body, by the words on screen (its label is its placeholder). */
const WRITE_BODY = /^Write (or paste )?what you want to remember/;

/**
 * The Write door (`docs/design/decisions/capture-doors.md`, Final choice:
 * the Write screen).
 */

const NINA = { _id: "contact-1", name: "Nina", entityType: "person", tags: [], autoCreated: false };

beforeEach(() => {
  answerByName(
    useQuery,
    { "profiles:resolveNames": [], "profiles:people": [] },
    () => ({ profile: NINA, photoUrl: null, notes: [], mentionedIn: [], mentionedInTotal: 0 }),
  );
});

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

afterEach(() => online(true));

/** Write, reached from home the way a person gets there. */
async function openWrite(path: "/capture?door=write" | "/profile/contact-1/capture?door=write" = "/capture?door=write") {
  const result = renderRouter("src/app", { initialUrl: "/" });
  await result;
  await act(async () => {
    router.push(path);
  });
  // Wrapped: returned bare from an async function it would be awaited away.
  return { getPathname: () => result.getPathname() };
}

async function write(text: string) {
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText(WRITE_BODY), text);
  });
}

test("should open on the body with the keyboard up, inviting a paste, and one button", async () => {
  await openWrite();

  const body = screen.getByLabelText(WRITE_BODY);
  expect(body.props.autoFocus).toBe(true);
  expect(body.props.placeholder).toBe(
    "Write or paste what you want to remember — one person's notes at a time.",
  );
  expect(screen.queryByTestId("write-about")).toBeNull();
  expect(screen.getByRole("button", { name: "Let Andy read it" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
});

test("should say who it is about when opened from their page", async () => {
  await openWrite("/profile/contact-1/capture?door=write");

  await waitFor(() => expect(screen.getByTestId("write-about")).toBeTruthy());
  expect(screen.getByText("Nina")).toBeTruthy();
  expect(screen.getByLabelText(WRITE_BODY).props.placeholder).toBe(
    "Write what you want to remember about Nina.",
  );
  // Named by the words on screen, so Voice Control can say them (WCAG 2.5.3).
  expect(screen.getByLabelText("Write what you want to remember about Nina")).toBeTruthy();
});

test("should leave at once when nothing is written", async () => {
  const result = await openWrite();

  await act(async () => {
    router.back();
  });

  expect(result.getPathname()).toBe("/");
  expect(screen.queryByTestId("confirm-dialog")).toBeNull();
});

test("should ask before throwing written words away, and stay on Cancel", async () => {
  const result = await openWrite();
  await write("Nina moved to Lisbon");

  await act(async () => {
    router.back();
  });
  const dialog = screen.getByTestId("confirm-dialog");
  expect(within(dialog).getByText("Discard this note?")).toBeTruthy();
  expect(within(dialog).getByText("What you wrote will be cleared.")).toBeTruthy();

  await act(async () => {
    await answerDialog("Cancel");
  });
  expect(result.getPathname()).toBe("/capture");
  expect(screen.getByLabelText(WRITE_BODY).props.value).toBe("Nina moved to Lisbon");

  await act(async () => {
    router.back();
  });
  await act(async () => {
    await answerDialog("Discard");
  });
  expect(result.getPathname()).toBe("/");
});

test("should count near the limit, and refuse to read past it rather than cut", async () => {
  await openWrite();

  await write("a".repeat(MAX_TRANSCRIPT_CHARS - 500));
  expect(screen.getByTestId("write-count")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Let Andy read it" })).not.toBeDisabled();

  await write("a".repeat(MAX_TRANSCRIPT_CHARS + 1));
  expect(screen.getByText("That note is longer than Andy can take in one go. Try splitting it into two.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Let Andy read it" })).toBeDisabled();
});

test("should show no count on an ordinary note", async () => {
  await openWrite();
  await write("Nina moved to Lisbon");

  expect(screen.queryByTestId("write-count")).toBeNull();
});

test("should leave without asking once the note is kept on the phone offline", async () => {
  online(false);
  const result = await openWrite();
  await write("Nina moved to Lisbon");

  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Keep this note" }));
  });

  expect(result.getPathname()).toBe("/");
  expect(screen.queryByTestId("confirm-dialog")).toBeNull();
});
