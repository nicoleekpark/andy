jest.mock("../src/lib/native", () => ({ hasNativeModule: jest.fn(() => true) }));

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import { AccessibilityInfo, Dimensions, StyleSheet } from "react-native";
import { size } from "../src/constants/theme";
import { useAction, useConvexConnectionState, useMutation, useQuery } from "convex/react";
import { renderRouter } from "expo-router/testing-library";
import { api } from "@convex/_generated/api";
import { WriteToSheet, forgetWriteToSheets, useWriteTo } from "../src/components/write-to";
import { ConfirmProvider } from "../src/components/confirm-dialog";
import { answerDialog } from "../test-support/dialog";
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
  // Tucked-away sheets live in memory for the app's life; each test starts clean.
  forgetWriteToSheets();
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
      fireEvent.changeText(screen.getByTestId("write-to-draft-box"), "Hi Nina, Saturday?");
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
  await answerDialog("Close");
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
    <ConfirmProvider>
      <OfflineCopyProvider ownerId="user-1">
        <Sheet />
      </OfflineCopyProvider>
    </ConfirmProvider>
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
    const { rerender } = await render(<ConfirmProvider><Harness locked={false} /></ConfirmProvider>);
    await fireEvent.press(screen.getByTestId("open-it"));
    await fireEvent.changeText(screen.getByLabelText("What to write to Nina"), "keep me");

    await rerender(<ConfirmProvider><Harness locked /></ConfirmProvider>);
    expect(screen.queryByLabelText("What to write to Nina")).toBeNull();

    await rerender(<ConfirmProvider><Harness locked={false} /></ConfirmProvider>);
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
  await answerDialog("Close");
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

describe("asking again (slice 4b)", () => {
  const CHAT = "write-to-chat-line";
  const ARROW = "write-to-arrow";
  const ANSWER_2 = { ...ANSWER, text: "Hi Nina, Friday?" };

  async function chat(text: string) {
    await act(async () => {
      fireEvent.changeText(screen.getByTestId(CHAT), text);
    });
  }
  async function editB(text: string) {
    await act(async () => {
      fireEvent.changeText(screen.getByTestId("write-to-draft-box"), text);
    });
  }
  async function arrow() {
    await act(async () => {
      fireEvent.press(screen.getByTestId(ARROW));
    });
  }

  test("should show the hint and a disabled arrow after an answer, and enable it when the chat line has text", async () => {
    await askAndy(jest.fn(async () => ANSWER));

    expect(screen.getByTestId("write-to-hint")).toBeTruthy();
    expect(screen.getByLabelText("Anything else for Andy? Optional")).toBeTruthy();
    expect(screen.getByTestId(ARROW)).toBeDisabled();

    await chat("warmer");
    expect(screen.getByTestId(ARROW)).not.toBeDisabled();
  });

  test("should show Edited, the edited label and an enabled arrow when box B differs from the answer", async () => {
    await askAndy(jest.fn(async () => ANSWER));
    const hidden = { includeHiddenElements: true };
    expect(screen.queryByText("Edited", hidden)).toBeNull();

    await editB("Hi Nina, Friday instead?");

    expect(screen.getByText("Edited", hidden)).toBeTruthy();
    expect(screen.getByLabelText("Message to Nina, edited")).toBeTruthy();
    expect(screen.getByTestId(ARROW)).not.toBeDisabled();
  });

  test("should send box B, the last answer and the chat line, empty the line and send earlier lines on the next ask", async () => {
    const write = jest.fn().mockResolvedValueOnce(ANSWER).mockResolvedValue(ANSWER_2);
    await askAndy(write);

    await editB("Hi Nina, mine");
    await chat("warmer");
    await arrow();
    expect(write).toHaveBeenLastCalledWith({
      profileId: "profile-1",
      today: expect.any(String),
      request: "ask if she is free Thursday",
      earlierInstructions: [],
      current: "Hi Nina, mine",
      lastAnswer: ANSWER.text,
      instruction: "warmer",
    });
    expect(screen.getByTestId(CHAT).props.value).toBe("");

    await chat("shorter");
    await arrow();
    expect(write).toHaveBeenLastCalledWith(
      expect.objectContaining({ earlierInstructions: ["warmer"], instruction: "shorter", lastAnswer: ANSWER_2.text }),
    );
    expect(screen.getByTestId(CHAT).props.value).toBe("");
  });

  test("should keep box B and the chat line and not count the line when a later ask fails", async () => {
    const write = jest.fn().mockResolvedValueOnce(ANSWER).mockRejectedValueOnce(new Error("boom")).mockResolvedValue(ANSWER_2);
    await askAndy(write);
    await editB("my edit");
    await chat("warmer");
    await arrow();

    expect(screen.getByTestId("write-to-draft-box").props.value).toBe("my edit");
    expect(screen.getByTestId(CHAT).props.value).toBe("warmer");
    expect(screen.getByTestId("write-to-status-line")).toHaveTextContent(/couldn't write that/);

    await arrow();
    expect(write).toHaveBeenLastCalledWith(expect.objectContaining({ earlierInstructions: [] }));
  });

  test("should show the cap line and disable the arrow when ten later asks have been answered", async () => {
    const write = jest.fn(async () => ANSWER);
    await askAndy(write);
    for (let i = 0; i < 10; i++) {
      expect(screen.queryByText(/That's the most Andy can do/)).toBeNull();
      await chat(`change ${i}`);
      await arrow();
    }

    expect(screen.getByTestId("write-to-status-line")).toHaveTextContent(
      "That's the most Andy can do in one go. Copy it, or close and start again.",
    );
    await chat("one more");
    expect(screen.getByTestId(ARROW)).toBeDisabled();
    expect(write).toHaveBeenCalledTimes(11);
  });

  test("should keep the Check line above the cap line when the last answer still left a detail out", async () => {
    const write = jest.fn(async () => ANSWER);
    await askAndy(write);
    for (let i = 0; i < 9; i++) {
      await chat(`change ${i}`);
      await arrow();
    }
    write.mockResolvedValueOnce({ ...ANSWER, droppedDetails: ["Thursday"] });
    await chat("last change");
    await arrow();

    // At the cap, copying is all that is left: the missing detail matters most.
    expect(screen.getByTestId("write-to-status-line")).toHaveTextContent("Check: Thursday");
    expect(screen.getByTestId(ARROW)).toBeDisabled();
  });

  test("should say how much to cut and disable the arrow when the chat line is over 500 characters", async () => {
    await askAndy(jest.fn(async () => ANSWER));
    await chat("a".repeat(501));

    expect(screen.getByTestId("write-to-status-line")).toHaveTextContent("Shorten this by 1 characters.");
    expect(screen.getByTestId(ARROW)).toBeDisabled();
  });

  test("should lock box B and the chat line while a later ask is writing", async () => {
    let resolve!: (a: typeof ANSWER) => void;
    const write = jest
      .fn()
      .mockResolvedValueOnce(ANSWER)
      .mockImplementationOnce(
        () =>
          new Promise<typeof ANSWER>((r) => {
            resolve = r;
          }),
      );
    await askAndy(write);
    await chat("warmer");
    await arrow();

    expect(screen.getByTestId("write-to-draft-box").props.editable).toBe(false);
    expect(screen.getByTestId(CHAT).props.editable).toBe(false);
    expect(screen.getByTestId("write-to-status-line")).toHaveTextContent("Andy is writing…");

    await act(async () => {
      resolve(ANSWER_2);
    });
    expect(screen.getByTestId("write-to-draft-box").props.editable).toBe(true);
    expect(screen.getByTestId(CHAT).props.editable).toBe(true);
  });

  test("should remove the failed line when the chat line is typed in after a later ask fails", async () => {
    const write = jest.fn().mockResolvedValueOnce(ANSWER).mockRejectedValueOnce(new Error("boom"));
    await askAndy(write);
    await chat("warmer");
    await arrow();
    expect(screen.getByTestId("write-to-status-line")).toHaveTextContent(/couldn't write that/);

    await chat("warmer please");
    expect(screen.queryByText(/couldn't write that/)).toBeNull();

    await chat("a".repeat(501));
    expect(screen.getByTestId("write-to-status-line")).toHaveTextContent("Shorten this by 1 characters.");
  });

  test("should not show Edited and keep the arrow disabled when box B only gains a trailing space", async () => {
    await askAndy(jest.fn(async () => ANSWER));

    await editB(`${ANSWER.text} \n`);

    expect(screen.queryByText("Edited", { includeHiddenElements: true })).toBeNull();
    expect(screen.getByTestId(ARROW)).toBeDisabled();
  });

  test("should disable the copy button while a later ask is writing", async () => {
    const write = jest
      .fn()
      .mockResolvedValueOnce(ANSWER)
      .mockImplementationOnce(() => new Promise<typeof ANSWER>(() => {}));
    await askAndy(write);
    expect(screen.getByTestId("write-to-copy-button")).not.toBeDisabled();

    await chat("warmer");
    await arrow();

    expect(screen.getByTestId("write-to-copy-button")).toBeDisabled();
  });

  test("should show the offline line and disable the arrow when the connection drops after an answer", async () => {
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
      <ConfirmProvider>
        <OfflineCopyProvider ownerId="user-1">
          <Sheet />
        </OfflineCopyProvider>
      </ConfirmProvider>
    );
    answerByName(useAction, { [nameOf(api.writeTo.write)]: jest.fn(async () => ANSWER) }, quietCall);
    answerByName(useMutation, {}, quietCall);
    answerByName(useQuery, { [nameOf(api.featureFlags.switchedOff)]: ["aiPermission"] }, () => undefined);
    const { rerender } = await render(tree());
    await fireEvent.press(screen.getByTestId("open-it"));
    await typeAsk("hi");
    await press(ASK);
    await chat("warmer");
    expect(screen.queryByText(/You're offline/)).toBeNull();
    expect(screen.getByTestId(ARROW)).not.toBeDisabled();

    online(false);
    await rerender(tree());

    expect(screen.getByTestId("write-to-status-line")).toHaveTextContent(/You're offline/);
    expect(screen.getByTestId(ARROW)).toBeDisabled();
  });
});

describe("versions (slice 4c)", () => {
  const CHAT = "write-to-chat-line";
  const STEPPER = "write-to-version-stepper";
  const A1 = { ...ANSWER, text: "Version one text", tone: "casual", format: "message" };
  const A2 = { ...ANSWER, text: "Version two text", tone: "formal", format: "email" };
  const A3 = { ...ANSWER, text: "Version three text", tone: "warm", format: "note" };
  const A4 = { ...ANSWER, text: "Version four text", tone: "warm", format: "note" };
  const draftBox = () => screen.getByTestId("write-to-draft-box");

  async function chatAndAsk(text = "change it") {
    await act(async () => {
      fireEvent.changeText(screen.getByTestId(CHAT), text);
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("write-to-arrow"));
    });
  }
  async function editB(text: string) {
    await act(async () => {
      fireEvent.changeText(draftBox(), text);
    });
  }
  async function back(times = 1) {
    for (let i = 0; i < times; i++) await press("Previous version");
  }
  async function forward(times = 1) {
    for (let i = 0; i < times; i++) await press("Next version");
  }
  /** Four versions: A1, A2, the person's "my edit", A3; shown is the last. */
  async function fourVersions(write: jest.Mock, rememberStyle?: jest.Mock) {
    await askAndy(write, rememberStyle);
    await chatAndAsk();
    await editB("my edit");
    await chatAndAsk();
  }

  test("should show no stepper after one answer and 2 of 2 with the announcement after a second", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
    await askAndy(jest.fn().mockResolvedValueOnce(A1).mockResolvedValue(A2));
    expect(screen.queryByTestId(STEPPER)).toBeNull();
    expect(announce).toHaveBeenCalledWith("Andy's answer is ready. Version 1 of 1.");

    await chatAndAsk();

    expect(screen.getByTestId(STEPPER)).toBeTruthy();
    expect(screen.getByLabelText("Version 2 of 2")).toHaveTextContent("2 of 2");
    expect(announce).toHaveBeenCalledWith("Andy's answer is ready. Version 2 of 2.");
  });

  test("should add the edited text as its own version before Andy's answer when asking again after an edit", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
    await fourVersions(jest.fn().mockResolvedValueOnce(A1).mockResolvedValueOnce(A2).mockResolvedValue(A3));

    expect(screen.getByLabelText("Version 4 of 4")).toBeTruthy();
    expect(announce).toHaveBeenCalledWith("Andy's answer is ready. Version 4 of 4.");
    expect(draftBox().props.value).toBe(A3.text);
    await back();
    expect(announce).toHaveBeenLastCalledWith("Version 3 of 4");
    expect(draftBox().props.value).toBe("my edit");
  });

  test("should keep an unsent edit on a version when stepping away and back", async () => {
    await fourVersions(jest.fn().mockResolvedValueOnce(A1).mockResolvedValueOnce(A2).mockResolvedValue(A3));
    await back(2);
    expect(draftBox().props.value).toBe(A2.text);

    await editB("edit on two");
    await forward(2);
    expect(draftBox().props.value).toBe(A3.text);
    await back(2);

    expect(draftBox().props.value).toBe("edit on two");
    expect(screen.getByLabelText("Message to Nina, edited")).toBeTruthy();
    await forward(2);
    expect(draftBox().props.value).toBe(A3.text);
    expect(screen.getByLabelText("Message to Nina")).toBeTruthy();
  });

  test("should append and send the shown version as lastAnswer when asking from an edited older version", async () => {
    const write = jest.fn().mockResolvedValueOnce(A1).mockResolvedValueOnce(A2).mockResolvedValue(A3);
    await askAndy(write);
    await chatAndAsk();
    await back();
    await editB("older edit");
    await chatAndAsk("warmer");

    expect(write).toHaveBeenLastCalledWith(
      expect.objectContaining({ current: "older edit", lastAnswer: A1.text, instruction: "warmer" }),
    );
    expect(screen.getByLabelText("Version 4 of 4")).toBeTruthy();
    await back(3);
    expect(screen.getByLabelText("Version 1 of 4")).toBeTruthy();
    expect(draftBox().props.value).toBe(A1.text);
    await forward();
    expect(draftBox().props.value).toBe(A2.text);
    await forward();
    expect(draftBox().props.value).toBe("older edit");
  });

  test("should disable Previous at the first version, Next at the last, and both while writing", async () => {
    let resolve!: (a: typeof A1) => void;
    const write = jest
      .fn()
      .mockResolvedValueOnce(A1)
      .mockResolvedValueOnce(A2)
      .mockResolvedValueOnce(A3)
      .mockImplementationOnce(
        () =>
          new Promise<typeof A1>((r) => {
            resolve = r;
          }),
      );
    await askAndy(write);
    await chatAndAsk();
    await chatAndAsk();
    expect(screen.getByLabelText("Next version")).toBeDisabled();
    expect(screen.getByLabelText("Previous version")).not.toBeDisabled();
    await back(2);
    expect(screen.getByLabelText("Previous version")).toBeDisabled();
    expect(screen.getByLabelText("Next version")).not.toBeDisabled();

    await forward();
    expect(screen.getByLabelText("Previous version")).not.toBeDisabled();
    expect(screen.getByLabelText("Next version")).not.toBeDisabled();
    await chatAndAsk();
    expect(screen.getByLabelText("Previous version")).toBeDisabled();
    expect(screen.getByLabelText("Next version")).toBeDisabled();

    await act(async () => {
      resolve(A4);
    });
    expect(screen.getByLabelText("Previous version")).not.toBeDisabled();
  });

  test("should copy the shown version's text and remember the style of the version it was edited from when the person's version is shown", async () => {
    const set = jest.spyOn(Clipboard, "setStringAsync").mockResolvedValue(true);
    const rememberStyle = jest.fn(async () => undefined);
    await fourVersions(jest.fn().mockResolvedValueOnce(A1).mockResolvedValueOnce(A2).mockResolvedValue(A3), rememberStyle);

    await back();
    await press("Copy the message");
    expect(set).toHaveBeenLastCalledWith("my edit");
    expect(rememberStyle).toHaveBeenLastCalledWith({ profileId: "profile-1", style: { tone: "formal", format: "email" } });

    await back(2);
    await press("Copy the message");
    expect(set).toHaveBeenLastCalledWith(A1.text);
    expect(rememberStyle).toHaveBeenLastCalledWith({ profileId: "profile-1", style: { tone: "casual", format: "message" } });
  });

  test("should keep another version's unsent edit when asking again from an edited version", async () => {
    await askAndy(jest.fn().mockResolvedValueOnce(A1).mockResolvedValueOnce(A2).mockResolvedValue(A3));
    await chatAndAsk();
    await back();
    await editB("edit on one");
    await forward();
    await editB("edit on two");
    await chatAndAsk();

    await back(3);
    expect(screen.getByLabelText("Version 1 of 4")).toBeTruthy();
    expect(draftBox().props.value).toBe("edit on one");
    expect(screen.getByLabelText("Message to Nina, edited")).toBeTruthy();
  });

  test("should remember the style of the version a person's edit came from when it is copied", async () => {
    jest.spyOn(Clipboard, "setStringAsync").mockResolvedValue(true);
    const rememberStyle = jest.fn(async () => undefined);
    await askAndy(jest.fn().mockResolvedValueOnce(A1).mockResolvedValueOnce(A2).mockResolvedValue(A3), rememberStyle);
    await chatAndAsk();
    await back();
    await editB("edit of one");
    await chatAndAsk();
    await back();
    expect(draftBox().props.value).toBe("edit of one");
    await press("Copy the message");

    expect(rememberStyle).toHaveBeenLastCalledWith({ profileId: "profile-1", style: { tone: "casual", format: "message" } });
  });

  describe("box height", () => {
    const heightOf = () => StyleSheet.flatten(screen.getByTestId("write-to-ask-box").parent?.props.style).height;
    const withFontScale = (fontScale: number) =>
      jest.spyOn(Dimensions, "get").mockReturnValue({ width: 390, height: 844, scale: 3, fontScale });

    test("should grow both boxes with the text size when Dynamic Type is above 1", async () => {
      withFontScale(2);
      await open(jest.fn(async () => ANSWER));
      expect(heightOf()).toBe(size.writeBox * 2);
    });

    test("should keep the box at its base height when the text size is below 1", async () => {
      withFontScale(0.8);
      await open(jest.fn(async () => ANSWER));
      expect(heightOf()).toBe(size.writeBox);
    });
  });

  test("should show the Check line only on the Andy version that left details out", async () => {
    const write = jest
      .fn()
      .mockResolvedValueOnce(A1)
      .mockResolvedValueOnce({ ...A2, droppedDetails: ["Thursday"] })
      .mockResolvedValue(A3);
    await askAndy(write);
    await chatAndAsk();
    expect(screen.getByTestId("write-to-status-line")).toHaveTextContent("Check: Thursday");
    await editB("my edit");
    await chatAndAsk();
    expect(screen.queryByText(/Check:/)).toBeNull();

    await back();
    // The person's version carries no Check line, even though the Andy answer before it did.
    expect(draftBox().props.value).toBe("my edit");
    expect(screen.queryByText(/Check:/)).toBeNull();
    await back();
    expect(draftBox().props.value).toBe(A2.text);
    expect(screen.getByTestId("write-to-status-line")).toHaveTextContent("Check: Thursday");
    await back();
    expect(screen.queryByText(/Check:/)).toBeNull();
  });
});

describe("Close and swipe-down (slice 4d)", () => {
  const CHAT = "write-to-chat-line";
  const A2 = { ...ANSWER, text: "Hi Nina, Friday?" };

  /** What a swipe down does: the sheet's Modal is asked to close. */
  async function swipeDown() {
    let node = screen.getByTestId("write-to").parent;
    while (node !== null && node.props.presentationStyle !== "pageSheet") node = node.parent;
    await act(async () => {
      node!.props.onRequestClose();
    });
  }
  async function reopen() {
    await act(async () => {
      fireEvent.press(screen.getByTestId("follow-up-button"));
    });
  }
  /** Two answers, a chat line half-written: everything the sheet can hold. */
  async function everything() {
    await askAndy(jest.fn().mockResolvedValueOnce(ANSWER).mockResolvedValue(A2));
    await act(async () => {
      fireEvent.changeText(screen.getByTestId(CHAT), "warmer");
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("write-to-arrow"));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByTestId(CHAT), "half written");
    });
  }

  test("should ask first, keep everything on Keep writing, and start empty after Close when there is text and nothing was copied", async () => {
    await askAndy(jest.fn(async () => ANSWER));

    await press("Close");
    expect(screen.getByTestId("confirm-dialog")).toHaveTextContent(/Close without copying\?/);
    expect(screen.getByTestId("confirm-dialog")).toHaveTextContent(/Your text won't be kept\./);

    await answerDialog("Keep writing");
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    expect(screen.getByLabelText("Message to Nina").props.value).toBe(ANSWER.text);

    await press("Close");
    await answerDialog("Close");
    expect(screen.queryByLabelText("What to write to Nina")).toBeNull();
    await reopen();
    expect(screen.getByLabelText("What to write to Nina").props.value).toBe("");
    expect(screen.queryByLabelText("Message to Nina")).toBeNull();
  });

  test("should ask when only box A has text", async () => {
    await open(jest.fn(async () => ANSWER));
    await typeAsk("just a start");

    await press("Close");

    expect(screen.getByTestId("confirm-dialog")).toHaveTextContent(/Close without copying\?/);
  });

  test("should close at once without asking when the text was copied", async () => {
    jest.spyOn(Clipboard, "setStringAsync").mockResolvedValue(true);
    await askAndy(jest.fn(async () => ANSWER));
    await press("Copy the message");

    await press("Close");

    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    expect(screen.queryByLabelText("What to write to Nina")).toBeNull();
    await reopen();
    expect(screen.getByLabelText("What to write to Nina").props.value).toBe("");
  });

  test("should close at once without asking when there is no text", async () => {
    await open(jest.fn(async () => ANSWER));

    await press("Close");

    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    expect(screen.queryByLabelText("What to write to Nina")).toBeNull();
  });

  test("should hide the sheet on a swipe down and bring back box A, box B, every version and the chat line on reopening", async () => {
    await everything();

    await swipeDown();
    expect(screen.queryByLabelText("What to write to Nina")).toBeNull();
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    await reopen();

    expect(screen.getByTestId("write-to-draft-box").props.value).toBe(A2.text);
    expect(screen.getByLabelText("Version 2 of 2")).toBeTruthy();
    expect(screen.getByTestId(CHAT).props.value).toBe("half written");
  });

  test("should bring back box A's text on reopening when the sheet was tucked away before asking", async () => {
    await open(jest.fn(async () => ANSWER));
    await typeAsk("a start");

    await swipeDown();
    await reopen();

    expect(screen.getByLabelText("What to write to Nina").props.value).toBe("a start");
  });

  test("should keep the sheet across the profile screen being left and opened again", async () => {
    await everything();
    await swipeDown();

    await screen.unmount();
    await open(jest.fn(async () => ANSWER));

    expect(screen.getByTestId("write-to-draft-box").props.value).toBe(A2.text);
    expect(screen.getByLabelText("Version 2 of 2")).toBeTruthy();
    expect(screen.getByTestId(CHAT).props.value).toBe("half written");
  });

  test("should open empty on a remounted screen when the tucked sheets were forgotten", async () => {
    await everything();
    await swipeDown();

    forgetWriteToSheets();
    await screen.unmount();
    await open(jest.fn(async () => ANSWER));

    expect(screen.getByLabelText("What to write to Nina").props.value).toBe("");
    expect(screen.queryByTestId("write-to-draft-box")).toBeNull();
  });

  test("should give each person their own sheet when the screen is reused for someone else, and never file one person's text under another", async () => {
    answerByName(useAction, {}, quietCall);
    answerByName(useMutation, {}, quietCall);
    answerByName(useQuery, { [nameOf(api.featureFlags.switchedOff)]: ["aiPermission"] }, () => undefined);
    function Inner({ id }: { id: string }) {
      const controller = useWriteTo(id);
      return (
        <>
          <WriteToSheet personName="Nina" controller={controller} />
          <ShowIt onShow={controller.show} />
        </>
      );
    }
    const Reused = ({ id }: { id: string }) => (
      <ConfirmProvider>
        <Inner id={id} />
      </ConfirmProvider>
    );
    const { Pressable, Text } = jest.requireActual("react-native") as typeof import("react-native");
    function ShowIt({ onShow }: { onShow: () => void }) {
      return (
        <Pressable testID="show-it" onPress={onShow}>
          <Text>show</Text>
        </Pressable>
      );
    }
    const boxA = () => screen.getByLabelText("What to write to Nina");
    const show = () => act(async () => { fireEvent.press(screen.getByTestId("show-it")); });

    const { rerender } = await render(<Reused id="amy" />);
    await show();
    await fireEvent.changeText(boxA(), "for Amy");
    await swipeDown();

    await rerender(<Reused id="ben" />);
    await show();
    expect(boxA().props.value).toBe("");
    await swipeDown();

    await rerender(<Reused id="amy" />);
    await show();
    expect(boxA().props.value).toBe("for Amy");
    await swipeDown();

    await rerender(<Reused id="ben" />);
    await screen.unmount();
    await render(<Reused id="ben" />);
    await show();
    expect(boxA().props.value).toBe("");
  });

  test("should drop an ask still running for the previous person when the screen is reused for someone else", async () => {
    let finish: (v: typeof ANSWER) => void = () => undefined;
    const write = jest.fn(() => new Promise<typeof ANSWER>((r) => { finish = r; }));
    answerByName(useAction, { [nameOf(api.writeTo.write)]: write }, quietCall);
    answerByName(useMutation, {}, quietCall);
    answerByName(useQuery, { [nameOf(api.featureFlags.switchedOff)]: ["aiPermission"] }, () => undefined);
    const { Pressable, Text } = jest.requireActual("react-native") as typeof import("react-native");
    function Inner({ id }: { id: string }) {
      const controller = useWriteTo(id);
      return (
        <>
          <WriteToSheet personName="Nina" controller={controller} />
          <Pressable testID="show-it" onPress={controller.show}>
            <Text>show</Text>
          </Pressable>
        </>
      );
    }
    const Reused = ({ id }: { id: string }) => (
      <ConfirmProvider>
        <Inner id={id} />
      </ConfirmProvider>
    );
    const boxA = () => screen.getByLabelText("What to write to Nina");
    const show = () => act(async () => { fireEvent.press(screen.getByTestId("show-it")); });

    const { rerender } = await render(<Reused id="amy" />);
    await show();
    await fireEvent.changeText(boxA(), "for Amy");
    await press(ASK);
    expect(write).toHaveBeenCalledTimes(1);

    await rerender(<Reused id="ben" />);
    await act(async () => { finish(ANSWER); });
    await show();
    expect(screen.queryByTestId("write-to-draft-box")).toBeNull();
    expect(boxA().props.value).toBe("");

    await fireEvent.changeText(boxA(), "for Ben");
    await press(ASK);
    expect(write).toHaveBeenCalledTimes(2);
  });
});
