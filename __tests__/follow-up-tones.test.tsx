jest.mock("../src/lib/native", () => ({ hasNativeModule: jest.fn(() => true) }));

import { useEffect, useReducer } from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { useAction, useConvexConnectionState, useQuery } from "convex/react";
import { renderRouter } from "expo-router/testing-library";
import { api } from "@convex/_generated/api";
import { answerByName, nameOf, quietCall } from "../test-support/convex-mocks";
import { pressConfirmButton } from "../test-support/dialog";

/**
 * Follow-up formats and tones, the sheet half (`docs/design/decisions/
 * follow-up-tones.md`, business rules 1–11). The server half is
 * `convex/followUp.test.ts`.
 */

const NOTE = {
  note: {
    _id: "note-1",
    source: "voice",
    text: "Nina is moving to Berlin.",
    keyFacts: ["Moving to Berlin"],
    createdAt: new Date("2026-09-01T12:00:00").getTime(),
  },
  mentions: [],
};

function profileWith(followUpStyle?: { format: string; tone: string }) {
  return {
    profile: {
      _id: "profile-1",
      name: "Nina",
      entityType: "person",
      tags: [],
      autoCreated: false,
      ...(followUpStyle ? { followUpStyle } : {}),
    },
    photoUrl: null,
    notes: [NOTE],
    mentionedIn: [],
    mentionedInTotal: 0,
  };
}

/** A draft written to the style asked for, so each one can be told apart. */
function writer() {
  return jest.fn(async (args: { style?: { format: string; tone: string } }) => ({
    personName: "Nina",
    ...(args.style?.format === "message" ? {} : { subject: "How's Berlin?" }),
    body: args.style ? `${args.style.format} ${args.style.tone}` : "today's email",
  }));
}

/**
 * The connection, as Convex's own hook gives it: a subscription, so a drop
 * re-renders whoever reads it. A plain return value would only be seen by the
 * next render something else happened to cause.
 */
const mockConnection = { up: true, listeners: new Set<() => void>() };

function connected(up: boolean) {
  mockConnection.up = up;
  mockConnection.listeners.forEach((listener) => listener());
}

beforeEach(() => {
  (useConvexConnectionState as jest.Mock).mockImplementation(() => {
    const [, rerender] = useReducer((n: number) => n + 1, 0);
    useEffect(() => {
      mockConnection.listeners.add(rerender);
      return () => {
        mockConnection.listeners.delete(rerender);
      };
    }, []);
    return {
      hasInflightRequests: false,
      isWebSocketConnected: mockConnection.up,
      timeOfOldestInflightRequest: null,
      hasEverConnected: true,
      connectionCount: 1,
      connectionRetries: 0,
      inflightMutations: 0,
      inflightActions: 0,
    };
  });
});

async function openSheet(
  draft: jest.Mock,
  { result = profileWith(), switchedOff = [] as string[] } = {},
) {
  answerByName(useQuery, { [nameOf(api.featureFlags.switchedOff)]: switchedOff }, () => result);
  answerByName(useAction, { [nameOf(api.followUp.draft)]: draft }, quietCall);
  await renderRouter("src/app", { initialUrl: "/profile/profile-1" });
  await act(async () => {
    fireEvent.press(screen.getByLabelText("Draft a follow-up"));
  });
  await waitFor(() => expect(draft).toHaveBeenCalledTimes(1));
}

async function press(testID: string) {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
}

afterEach(() => {
  jest.restoreAllMocks();
  mockConnection.up = true;
  mockConnection.listeners.clear();
  (useConvexConnectionState as jest.Mock).mockReset();
});

test("should open a first follow-up as a friendly message, with no subject to fill or copy", async () => {
  const draft = writer();
  await openSheet(draft);

  expect(draft).toHaveBeenCalledWith(
    expect.objectContaining({ style: { format: "message", tone: "friendly" } }),
  );
  expect(await screen.findByDisplayValue("message friendly")).toBeTruthy();
  expect(screen.getByTestId("draft-format-option--message")).toHaveProp(
    "accessibilityState",
    expect.objectContaining({ selected: true }),
  );
  expect(screen.getByTestId("draft-tone-chip--friendly")).toHaveProp(
    "accessibilityState",
    expect.objectContaining({ selected: true }),
  );
  expect(screen.queryByLabelText("Subject")).toBeNull();
  expect(screen.queryByLabelText("Copy the subject and message")).toBeNull();
});

test("should open the way this person's last follow-up was written", async () => {
  const draft = writer();
  await openSheet(draft, { result: profileWith({ format: "email", tone: "professional" }) });

  expect(draft).toHaveBeenCalledWith(
    expect.objectContaining({ style: { format: "email", tone: "professional" } }),
  );
  expect(await screen.findByDisplayValue("email professional")).toBeTruthy();
  // An email has a subject, and it can be copied with the message.
  expect(screen.getByLabelText("Subject")).toBeTruthy();
  expect(screen.getByLabelText("Copy the subject and message")).toBeTruthy();
});

test("should write again in the format or tone chosen, keeping the rest", async () => {
  const draft = writer();
  await openSheet(draft);
  await screen.findByDisplayValue("message friendly");

  await press("draft-format-option--email");
  await waitFor(() =>
    expect(draft).toHaveBeenLastCalledWith(
      expect.objectContaining({ style: { format: "email", tone: "friendly" } }),
    ),
  );
  expect(await screen.findByDisplayValue("email friendly")).toBeTruthy();

  await press("draft-tone-chip--brief");
  await waitFor(() =>
    expect(draft).toHaveBeenLastCalledWith(
      expect.objectContaining({ style: { format: "email", tone: "brief" } }),
    ),
  );
  expect(await screen.findByDisplayValue("email brief")).toBeTruthy();
  expect(draft).toHaveBeenCalledTimes(3);
});

test("should bring back a draft already written in this sheet without asking for it again", async () => {
  const draft = writer();
  await openSheet(draft);
  await screen.findByDisplayValue("message friendly");
  await press("draft-tone-chip--brief");
  await screen.findByDisplayValue("message brief");

  await press("draft-tone-chip--friendly");

  expect(await screen.findByDisplayValue("message friendly")).toBeTruthy();
  expect(draft).toHaveBeenCalledTimes(2);
});

test("should do nothing when the chosen chip is tapped again — no call, no question, edits kept", async () => {
  const draft = writer();
  const asked = pressConfirmButton("Write another");
  await openSheet(draft);
  await act(async () => {
    fireEvent.changeText(await screen.findByDisplayValue("message friendly"), "my own words");
  });

  await press("draft-tone-chip--friendly");
  await press("draft-format-option--message");

  expect(draft).toHaveBeenCalledTimes(1);
  expect(asked).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue("my own words")).toBeTruthy();
});

test("should ask before replacing edits, and change nothing when they are kept", async () => {
  const draft = writer();
  const asked = pressConfirmButton("Keep my edits");
  await openSheet(draft);
  await act(async () => {
    fireEvent.changeText(await screen.findByDisplayValue("message friendly"), "my own words");
  });

  await press("draft-tone-chip--brief");

  expect(asked).toHaveBeenCalledWith(
    "Write another?",
    "Your edits to this draft will be replaced.",
    expect.any(Array),
  );
  expect(draft).toHaveBeenCalledTimes(1);
  expect(screen.getByDisplayValue("my own words")).toBeTruthy();
  expect(screen.getByTestId("draft-tone-chip--friendly")).toHaveProp(
    "accessibilityState",
    expect.objectContaining({ selected: true }),
  );
});

test("should write over edits once the person says so", async () => {
  const draft = writer();
  pressConfirmButton("Write another");
  await openSheet(draft);
  await act(async () => {
    fireEvent.changeText(await screen.findByDisplayValue("message friendly"), "my own words");
  });

  await press("draft-tone-chip--brief");

  expect(await screen.findByDisplayValue("message brief")).toBeTruthy();
});

test("should leave the picker and chips waiting while there is no connection", async () => {
  const draft = writer();
  await openSheet(draft);
  await screen.findByDisplayValue("message friendly");

  await act(async () => connected(false));
  await press("draft-tone-chip--brief");
  await press("draft-format-option--email");

  expect(draft).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId("draft-tone-chip--brief")).toHaveProp(
    "accessibilityState",
    expect.objectContaining({ disabled: true }),
  );
  expect(screen.getByLabelText("Write another draft")).toBeDisabled();
});

test("should leave the chips waiting while a draft is being written", async () => {
  let finish: (value: { personName: string; body: string }) => void = () => {};
  const draft = writer();
  await openSheet(draft);
  await screen.findByDisplayValue("message friendly");
  draft.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));

  await press("draft-tone-chip--brief");
  await press("draft-tone-chip--professional");

  expect(draft).toHaveBeenCalledTimes(2);
  expect(screen.getByTestId("draft-tone-chip--professional")).toHaveProp(
    "accessibilityState",
    expect.objectContaining({ disabled: true }),
  );
  await act(async () => finish({ personName: "Nina", body: "message brief" }));
});

test("should show today's email and no picker with the switch off", async () => {
  const draft = writer();
  await openSheet(draft, { switchedOff: ["followUpTones"] });

  expect(draft.mock.calls[0][0]).not.toHaveProperty("style");
  expect(await screen.findByDisplayValue("today's email")).toBeTruthy();
  expect(screen.queryByTestId("draft-format-picker")).toBeNull();
  expect(screen.queryByTestId("draft-tone-chip--friendly")).toBeNull();
  expect(screen.getByLabelText("Subject")).toBeTruthy();
});

test("should keep the draft and its chip when a new one cannot be written", async () => {
  const draft = writer();
  await openSheet(draft);
  await screen.findByDisplayValue("message friendly");
  draft.mockRejectedValueOnce(new Error("network"));

  await press("draft-tone-chip--brief");

  expect(await screen.findByText("Andy couldn't reach that just now. Try again.")).toBeTruthy();
  expect(screen.getByDisplayValue("message friendly")).toBeTruthy();
  expect(screen.getByTestId("draft-tone-chip--friendly")).toHaveProp(
    "accessibilityState",
    expect.objectContaining({ selected: true }),
  );
});

test("should hold the subject too while an email is being rewritten", async () => {
  let finish: (value: { personName: string; subject: string; body: string }) => void = () => {};
  const draft = writer();
  await openSheet(draft, { result: profileWith({ format: "email", tone: "friendly" }) });
  await screen.findByDisplayValue("email friendly");
  draft.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));

  await press("draft-tone-chip--brief");

  expect(screen.getByLabelText("Subject")).toHaveProp("editable", false);
  await act(async () => finish({ personName: "Nina", subject: "Hi", body: "email brief" }));
  expect(screen.getByLabelText("Subject")).toHaveProp("editable", true);
});
