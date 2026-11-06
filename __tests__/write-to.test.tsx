jest.mock("../src/lib/native", () => ({ hasNativeModule: jest.fn(() => true) }));

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import { AccessibilityInfo } from "react-native";
import { useAction, useConvexConnectionState, useMutation, useQuery } from "convex/react";
import { renderRouter } from "expo-router/testing-library";
import { api } from "@convex/_generated/api";
import { WriteToSheet, useWriteTo } from "../src/components/write-to";
import { OfflineCopyProvider } from "../src/lib/offline-copy";
import { LockedContext } from "../src/lib/lock-context";
import { MAX_WRITE_TO_CHARS } from "../convex/writeToPrompt";
import { answerByName, nameOf, quietCall } from "../test-support/convex-mocks";

/**
 * Write to {name}, the screen half (`docs/design/decisions/draft-editing.md`,
 * Final design F). The server half is `convex/writeTo.test.ts`.
 */

const ANSWER = {
  text: "Hi Nina, are you free Thursday?",
  tone: "casual",
  format: "message",
  droppedDetails: [] as string[],
};

const ASK = "Ask Andy";

function person() {
  return {
    profile: { _id: "profile-1", name: "Nina", entityType: "person", tags: [], autoCreated: false },
    photoUrl: null,
    notes: [],
    mentionedIn: [],
    mentionedInTotal: 0,
  };
}

async function open(
  write: jest.Mock,
  rememberStyle: jest.Mock = jest.fn(async () => undefined),
  // The AI go-ahead is off unless a test is about it, as in production until build 6.
  { switchedOff = ["aiPermission"] as string[] } = {},
) {
  answerByName(
    useQuery,
    {
      [nameOf(api.featureFlags.switchedOff)]: switchedOff,
      [nameOf(api.users.current)]: { _id: "user-1", _creationTime: 1, tokenIdentifier: "t|alice" },
    },
    () => person(),
  );
  answerByName(useAction, { [nameOf(api.writeTo.write)]: write }, quietCall);
  answerByName(useMutation, { [nameOf(api.writeTo.rememberStyle)]: rememberStyle }, quietCall);
  await renderRouter("src/app", { initialUrl: "/profile/profile-1" });
  await act(async () => {
    fireEvent.press(screen.getByTestId("follow-up-button"));
  });
}

async function typeAsk(text: string) {
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText("What to write to Nina"), text);
  });
}

async function press(label: string) {
  await act(async () => {
    fireEvent.press(screen.getByLabelText(label));
  });
}

async function askAndy(write: jest.Mock, rememberStyle?: jest.Mock) {
  await open(write, rememberStyle);
  await typeAsk("ask if she is free Thursday");
  await press(ASK);
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

afterEach(() => {
  online(true);
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

test("should open on box A with the arrow disabled, and enable it when something is typed", async () => {
  await open(jest.fn(async () => ANSWER));

  expect(screen.getByLabelText("What to write to Nina")).toBeTruthy();
  expect(screen.getByTestId("write-to-arrow")).toBeDisabled();

  await typeAsk("hello");
  expect(screen.getByTestId("write-to-arrow")).not.toBeDisabled();
});

test("should call write with the request and show the answer in box B when the arrow is tapped", async () => {
  const write = jest.fn(async () => ANSWER);
  await askAndy(write);

  expect(write).toHaveBeenCalledWith({
    profileId: "profile-1",
    today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    request: "ask if she is free Thursday",
    earlierInstructions: [],
  });
  expect(screen.getByLabelText("Message to Nina").props.value).toBe(ANSWER.text);
});

test("should keep box A's text and say so when the write is rejected", async () => {
  const write = jest.fn(async () => {
    throw new Error("boom");
  });
  await askAndy(write);

  expect(screen.getByTestId("write-to-status-line")).toHaveTextContent(
    "Andy couldn't write that just now. Your text is still here. Try again.",
  );
  expect(screen.getByLabelText("What to write to Nina").props.value).toBe("ask if she is free Thursday");
  expect(screen.queryByLabelText("Message to Nina")).toBeNull();
});

test("should refuse to ask and say how much to cut when the text is over the limit", async () => {
  const write = jest.fn(async () => ANSWER);
  await open(write);
  await typeAsk("a".repeat(MAX_WRITE_TO_CHARS + 1));

  expect(screen.getByTestId("write-to-status-line")).toHaveTextContent(
    "That's too long for Andy to read at once. Shorten it by 1 characters to ask.",
  );
  expect(screen.getByTestId("write-to-arrow")).toBeDisabled();
  await press(ASK);
  expect(write).not.toHaveBeenCalled();
});

describe("copy", () => {
  test("should put the edited text on the clipboard, remember the style and drop Copied on edit", async () => {
    const set = jest.spyOn(Clipboard, "setStringAsync").mockResolvedValue(true);
    const rememberStyle = jest.fn(async () => undefined);
    await askAndy(jest.fn(async () => ANSWER), rememberStyle);

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Message to Nina"), "Hi Nina, Friday instead?");
    });
    await press("Copy the message");

    expect(set).toHaveBeenCalledWith("Hi Nina, Friday instead?");
    expect(screen.getByText("Copied")).toBeTruthy();
    expect(rememberStyle).toHaveBeenCalledWith({
      profileId: "profile-1",
      style: { tone: "casual", format: "message" },
    });

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Message to Nina"), "Hi Nina, Saturday?");
    });
    expect(screen.queryByText("Copied")).toBeNull();
  });

  test("should show the clipboard line and not remember the style when the clipboard rejects", async () => {
    jest.spyOn(Clipboard, "setStringAsync").mockRejectedValue(new Error("no"));
    const rememberStyle = jest.fn(async () => undefined);
    await askAndy(jest.fn(async () => ANSWER), rememberStyle);
    await press("Copy the message");

    expect(screen.getByTestId("write-to-status-line")).toHaveTextContent(
      "Andy couldn't reach the clipboard. Your text is still here — select it to copy it by hand.",
    );
    expect(screen.queryByText("Copied")).toBeNull();
    expect(rememberStyle).not.toHaveBeenCalled();
  });
});

test("should list the details Andy left out when the answer has droppedDetails", async () => {
  await askAndy(jest.fn(async () => ({ ...ANSWER, droppedDetails: ["Thursday", "3:30"] })));

  expect(screen.getByTestId("write-to-status-line")).toHaveTextContent("Check: Thursday, 3:30");
});

test("should send nothing and say so when the AI go-ahead is declined", async () => {
  const write = jest.fn(async () => ANSWER);
  await open(write, undefined, { switchedOff: [] });
  await typeAsk("ask if she is free Thursday");
  await press(ASK);

  expect(screen.getByText("Let Andy read your notes?")).toBeTruthy();
  await press("Not now");

  expect(write).not.toHaveBeenCalled();
  expect(screen.getByTestId("write-to-status-line")).toHaveTextContent(
    "Nothing was sent. Tap the arrow when you want Andy to write it.",
  );
});

test("should start the next sheet empty and usable when Close came while the write was pending", async () => {
  let resolve!: (a: typeof ANSWER) => void;
  const write = jest.fn(
    () =>
      new Promise<typeof ANSWER>((r) => {
        resolve = r;
      }),
  );
  await askAndy(write);
  expect(write).toHaveBeenCalledTimes(1);

  await press("Close");
  await act(async () => {
    resolve(ANSWER);
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId("follow-up-button"));
  });

  expect(screen.getByLabelText("What to write to Nina").props.value).toBe("");
  expect(screen.queryByLabelText("Message to Nina")).toBeNull();

  await typeAsk("again");
  await press(ASK);
  expect(write).toHaveBeenCalledTimes(2);
});

test("should not show the offline line, and keep the Check line, when the connection drops after an answer", async () => {
  const { Pressable, Text } = jest.requireActual("react-native") as typeof import("react-native");
  function Sheet() {
    const controller = useWriteTo("profile-1");
    return (
      <>
        <WriteToSheet personName="Nina" controller={controller} />
        <Pressable testID="open-it" onPress={controller.show}>
          <Text>open</Text>
        </Pressable>
      </>
    );
  }
  const tree = () => (
    <OfflineCopyProvider ownerId="user-1">
      <Sheet />
    </OfflineCopyProvider>
  );
  answerByName(useAction, { [nameOf(api.writeTo.write)]: jest.fn(async () => ({ ...ANSWER, droppedDetails: ["Thursday"] })) }, quietCall);
  answerByName(useMutation, {}, quietCall);
  answerByName(useQuery, { [nameOf(api.featureFlags.switchedOff)]: ["aiPermission"] }, () => undefined);
  const { rerender } = await render(tree());
  await fireEvent.press(screen.getByTestId("open-it"));
  await typeAsk("hi");

  // Before the answer, offline is said: asking needs a connection.
  online(false);
  await rerender(tree());
  expect(screen.getByTestId("write-to-status-line")).toHaveTextContent(/You're offline/);

  online(true);
  await rerender(tree());
  await press(ASK);
  expect(screen.getByTestId("write-to-status-line")).toHaveTextContent("Check: Thursday");

  online(false);
  await rerender(tree());
  expect(screen.getByTestId("write-to-status-line")).toHaveTextContent("Check: Thursday");
  expect(screen.queryByText(/You're offline/)).toBeNull();
});

describe("announcements", () => {
  test("should announce the failed line with its text when the write is rejected", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
    await askAndy(
      jest.fn(async () => {
        throw new Error("boom");
      }),
    );

    expect(announce).toHaveBeenCalledWith("Andy couldn't write that just now. Your text is still here. Try again.");
  });

  test("should announce the spoken Not now line, not the written one, when the go-ahead is declined", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
    await open(jest.fn(async () => ANSWER), undefined, { switchedOff: [] });
    await typeAsk("hi");
    await press(ASK);
    await press("Not now");

    expect(announce).toHaveBeenCalledWith("Nothing was sent. Tap Ask Andy when you want Andy to write it.");
  });
});

test("should not say Copied when the text was edited while the copy ran", async () => {
  let finish!: (ok: boolean) => void;
  jest.spyOn(Clipboard, "setStringAsync").mockImplementation(
    () =>
      new Promise<boolean>((r) => {
        finish = r;
      }),
  );
  await askAndy(jest.fn(async () => ANSWER));
  await press("Copy the message");
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText("Message to Nina"), "Hi Nina, Saturday?");
  });
  await act(async () => {
    finish(true);
  });

  expect(screen.queryByText("Copied")).toBeNull();
});

describe("app lock", () => {
  function Harness({ locked }: { locked: boolean }) {
    const controller = useWriteTo("profile-1");
    return (
      <LockedContext.Provider value={locked}>
        <WriteToSheet personName="Nina" controller={controller} />
        {controller.open ? null : <OpenIt onOpen={controller.show} />}
      </LockedContext.Provider>
    );
  }
  const { Pressable, Text } = jest.requireActual("react-native") as typeof import("react-native");
  function OpenIt({ onOpen }: { onOpen: () => void }) {
    return (
      <Pressable testID="open-it" onPress={onOpen}>
        <Text>open</Text>
      </Pressable>
    );
  }

  test("should hide the sheet while locked and bring the typed text back on unlock", async () => {
    answerByName(useAction, {}, quietCall);
    answerByName(useMutation, {}, quietCall);
    answerByName(useQuery, { [nameOf(api.featureFlags.switchedOff)]: ["aiPermission"] }, () => undefined);
    const { rerender } = await render(<Harness locked={false} />);
    await fireEvent.press(screen.getByTestId("open-it"));
    await fireEvent.changeText(screen.getByLabelText("What to write to Nina"), "keep me");

    await rerender(<Harness locked />);
    expect(screen.queryByLabelText("What to write to Nina")).toBeNull();

    await rerender(<Harness locked={false} />);
    expect(screen.getByLabelText("What to write to Nina").props.value).toBe("keep me");
  });
});

test("should not show the clipboard line or remember the style on the next sheet when Close came while the copy ran and then failed", async () => {
  let fail!: (e: Error) => void;
  jest.spyOn(Clipboard, "setStringAsync").mockImplementation(
    () =>
      new Promise<boolean>((_resolve, reject) => {
        fail = reject;
      }),
  );
  const rememberStyle = jest.fn(async () => undefined);
  await askAndy(jest.fn(async () => ANSWER), rememberStyle);
  await press("Copy the message");
  await press("Close");
  await act(async () => {
    fail(new Error("no"));
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId("follow-up-button"));
  });

  expect(screen.queryByText(/couldn't reach the clipboard/)).toBeNull();
  expect(screen.queryByText("Copied")).toBeNull();
  expect(rememberStyle).not.toHaveBeenCalled();
});
