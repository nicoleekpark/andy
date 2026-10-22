jest.mock("../src/lib/native", () => ({ hasNativeModule: jest.fn(() => true) }));

import { act, fireEvent, screen } from "@testing-library/react-native";
import { useAction, useMutation, useQuery } from "convex/react";
import { renderRouter } from "expo-router/testing-library";
import { api } from "@convex/_generated/api";
import { reachOutSources } from "../src/components/write-to-sheet";
import { answerByName, nameOf, quietCall } from "../test-support/convex-mocks";

/**
 * Write to → Reach out, the screen half (`docs/design/decisions/
 * follow-up-redesign.md`, decision 4; storyboard strip 4). The server half is
 * `convex/followUp.test.ts`.
 */

const NEWER = {
  note: {
    _id: "note-new",
    source: "voice",
    text: "Nina starts at Figma on Nov 3.",
    keyFacts: ["Starting at Figma on Nov 3"],
    createdAt: new Date("2026-10-18T12:00:00").getTime(),
  },
  mentions: [],
};
const OLDER = {
  note: {
    _id: "note-old",
    source: "voice",
    text: "Nina is training for Chicago.",
    keyFacts: ["Training for the Chicago half marathon"],
    createdAt: new Date("2026-09-02T12:00:00").getTime(),
  },
  mentions: [],
};
// A note with nothing under "What to remember": never offered to tick.
const BARE = {
  note: { _id: "note-bare", source: "voice", text: "words", keyFacts: [], createdAt: new Date("2026-10-20T12:00:00").getTime() },
  mentions: [],
};

function person(notes: unknown[], name = "Nina") {
  return {
    profile: { _id: "profile-1", name, entityType: "person", tags: [], autoCreated: false },
    photoUrl: null,
    notes,
    mentionedIn: [],
    mentionedInTotal: 0,
  };
}

function written() {
  return jest.fn(async (args: { style: { tone: string } }) => ({
    personName: "Nina",
    body: `Hi Nina (${args.style.tone})`,
    intent: "Asked about the new job.",
    usedNotes: ["2026-10-18"],
  }));
}

async function open(
  draft: jest.Mock,
  // The AI go-ahead is off unless a test is about it, as in production until build 6.
  { result = person([BARE, NEWER, OLDER]), switchedOff = ["aiPermission"] as string[] } = {},
) {
  answerByName(
    useQuery,
    {
      [nameOf(api.featureFlags.switchedOff)]: switchedOff,
      [nameOf(api.users.current)]: { _id: "user-1", _creationTime: 1, tokenIdentifier: "t|alice" },
    },
    () => result,
  );
  answerByName(useAction, { [nameOf(api.followUp.draft)]: draft }, quietCall);
  answerByName(useMutation, {}, quietCall);
  await renderRouter("src/app", { initialUrl: "/profile/profile-1" });
  await act(async () => {
    fireEvent.press(screen.getByTestId("follow-up-button"));
  });
}

async function press(label: string) {
  await act(async () => {
    fireEvent.press(screen.getByLabelText(label));
  });
}

afterEach(() => {
  jest.clearAllMocks();
});

test("should open on what to write from, costing nothing, with only the newest saved note ticked", async () => {
  const draft = written();
  await open(draft);

  expect(screen.getByText("Reach out to Nina")).toBeTruthy();
  expect(draft).not.toHaveBeenCalled();
  expect(screen.getByTestId("reach-out-note--note-new").props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
  expect(screen.getByTestId("reach-out-note--note-old").props.accessibilityState).toEqual(expect.objectContaining({ checked: false }));
  // Nothing saved under "What to remember": not offered.
  expect(screen.queryByTestId("reach-out-note--note-bare")).toBeNull();
});

test("should write from the ticked notes and the words typed, in the tone chosen", async () => {
  const draft = written();
  await open(draft);

  await press("Training for the Chicago half marathon".replace(/^/, "2026-09-02: "));
  await act(async () => {
    fireEvent.changeText(screen.getByTestId("reach-out-say"), "check in if she's free this weekend");
  });
  await press("Professional");
  await press("Write it");

  expect(draft).toHaveBeenCalledWith(
    expect.objectContaining({
      profileId: "profile-1",
      style: { format: "message", tone: "professional" },
      reachOut: { noteIds: ["note-new", "note-old"], instruction: "check in if she's free this weekend" },
    }),
  );
  expect(await screen.findByDisplayValue("Hi Nina (professional)")).toBeTruthy();
  expect(screen.getByTestId("draft-intent-line")).toHaveTextContent("Asked about the new job.");
  expect(screen.getByTestId("draft-sources-line")).toHaveTextContent("Written from your note of 2026-10-18.");
});

test("should not write until there is a note ticked or something said, and say why", async () => {
  const draft = written();
  await open(draft);

  await press("2026-10-18: Starting at Figma on Nov 3");
  expect(screen.getByTestId("generate-button")).toBeDisabled();
  expect(screen.getByTestId("generate-hint")).toHaveTextContent("Tell Andy what you want to say.");
  await press("Write it");
  expect(draft).not.toHaveBeenCalled();

  // A quick start fills the field — and writes nothing by itself.
  await press("Check in");
  expect(screen.getByTestId("reach-out-say").props.value).toBe("Check in");
  expect(draft).not.toHaveBeenCalled();
  expect(screen.getByTestId("generate-button")).not.toBeDisabled();
});

test("should offer Write to someone with no notes, and write from the words alone", async () => {
  const draft = written();
  await open(draft, { result: person([], "Noa") });

  expect(screen.getByTestId("reach-out-no-notes")).toHaveTextContent("Nothing written about Noa yet.");
  await act(async () => {
    fireEvent.changeText(screen.getByTestId("reach-out-say"), "ask if she's free Saturday");
  });
  await press("Write it");
  expect(draft).toHaveBeenCalledWith(
    expect.objectContaining({ reachOut: { noteIds: [], instruction: "ask if she's free Saturday" } }),
  );
});

test("should go back from the draft to what it was written from, keeping it", async () => {
  const draft = written();
  await open(draft);
  await act(async () => {
    fireEvent.changeText(screen.getByTestId("reach-out-say"), "say congrats");
  });
  await press("Write it");
  await screen.findByDisplayValue("Hi Nina (friendly)");

  await press("Back to what to write from");
  expect(screen.getByTestId("reach-out-say").props.value).toBe("say congrats");
  expect(screen.getByTestId("reach-out-note--note-new").props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
});

test("should rewrite in another tone from the same notes and words", async () => {
  const draft = written();
  await open(draft);
  await press("Write it");
  await screen.findByDisplayValue("Hi Nina (friendly)");

  await press("Brief");
  expect(draft).toHaveBeenLastCalledWith(
    expect.objectContaining({
      style: { format: "message", tone: "brief" },
      reachOut: { noteIds: ["note-new"], instruction: "" },
    }),
  );
  expect(await screen.findByDisplayValue("Hi Nina (brief)")).toBeTruthy();
});

test("should ask before anything is sent, and send nothing on Not now", async () => {
  const draft = written();
  await open(draft, { switchedOff: [] });

  await press("Write it");
  expect(screen.getByText("Let Andy read your notes?")).toBeTruthy();
  await press("Not now");
  expect(draft).not.toHaveBeenCalled();
});

test("should name only what the draft actually used", () => {
  expect(reachOutSources([])).toBe("Written from what you asked for.");
  expect(reachOutSources(["2026-10-18"])).toBe("Written from your note of 2026-10-18.");
  expect(reachOutSources(["2026-10-18", "2026-09-02"])).toBe(
    "Written from your notes of 2026-10-18 and 2026-09-02.",
  );
});

test("should hold every input still while a draft is being written", async () => {
  let finish: (value: unknown) => void = () => {};
  const draft = jest.fn(() => new Promise((resolve) => (finish = resolve)));
  await open(draft);
  await press("Write it");

  expect(screen.getByTestId("reach-out-note--note-old")).toBeDisabled();
  expect(screen.getByTestId("draft-quick-start--Check in")).toBeDisabled();
  expect(screen.getByTestId("reach-out-tone-chip--brief")).toBeDisabled();
  expect(screen.getByTestId("reach-out-say").props.editable).toBe(false);
  await act(async () => {
    finish({ personName: "Nina", body: "Hi", intent: "", usedNotes: [] });
  });
});

test("should tell VoiceOver why Write it is waiting, on the button itself", async () => {
  await open(written());
  await press("2026-10-18: Starting at Figma on Nov 3");
  expect(screen.getByTestId("generate-button").props.accessibilityHint).toBe("Tell Andy what you want to say.");
});
