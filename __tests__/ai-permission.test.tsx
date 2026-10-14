import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { useAction, useMutation, useQuery } from "convex/react";
import { router } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import { api } from "@convex/_generated/api";
import * as native from "@/lib/native";
import { answerByName, nameOf, quietCall } from "../test-support/convex-mocks";
import { pressConfirmButton } from "../test-support/dialog";

/**
 * The go-ahead before anything reaches an AI service, the asking half
 * (`docs/design/decisions/pre-submission-privacy.md`, option A). The server
 * half, which refuses whatever slips past, is `convex/aiPermission.test.ts`.
 */

const WRITE_BODY = /^Write (or paste )?what you want to remember/;
const SHEET_TITLE = "Before Andy reads your notes";

jest.mock("expo-camera", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  const CameraView = React.forwardRef((props: object, ref: React.Ref<unknown>) => {
    React.useImperativeHandle(ref, () => ({
      takePictureAsync: async () => ({ uri: "file:///frame.jpg", width: 2000, height: 1500 }),
    }));
    return React.createElement(View, props);
  });
  return {
    CameraView,
    useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
  };
});
jest.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  ImageManipulator: {
    manipulate: () => ({
      resize: jest.fn(),
      renderAsync: async () => ({
        saveAsync: async () => ({ uri: "file:///small.jpg", base64: "c21hbGw=" }),
      }),
    }),
  },
}));

const PERSON = {
  profile: { _id: "profile-1", name: "Nina", entityType: "person", tags: [], autoCreated: false },
  photoUrl: null,
  notes: [
    {
      note: {
        _id: "note-1",
        source: "voice",
        text: "Nina is moving to Berlin.",
        keyFacts: ["Moving to Berlin"],
        createdAt: new Date("2026-09-01T12:00:00").getTime(),
      },
      mentions: [],
    },
  ],
  mentionedIn: [],
  mentionedInTotal: 0,
};

type Server = {
  /** Keys switched off; `undefined` is "not told yet". */
  switchedOff?: string[];
  allowedAt?: number;
};

function server({ switchedOff = [], allowedAt }: Server = {}) {
  const allow = jest.fn(async () => null);
  const withdraw = jest.fn(async () => null);
  const extract = jest.fn(async () => ({ name: "Nina", keyFacts: [], mentions: [] }));
  const readPhoto = jest.fn(async () => ({ about: "Nina", text: "coffee" }));
  const recall = jest.fn(async () => ({ query: "q", answer: "", results: [] }));
  const draft = jest.fn(async () => ({ personName: "Nina", subject: "Hi", body: "Hello" }));
  answerByName(
    useQuery,
    {
      [nameOf(api.featureFlags.switchedOff)]: switchedOff,
      [nameOf(api.users.current)]: {
        _id: "user-1",
        _creationTime: 1,
        tokenIdentifier: "t|alice",
        ...(allowedAt === undefined ? {} : { aiAllowedAt: allowedAt }),
      },
      "profiles:resolveNames": [],
      "profiles:people": [],
      [nameOf(api.people.search)]: { people: [], mentions: [] },
    },
    () => PERSON,
  );
  answerByName(
    useMutation,
    { [nameOf(api.aiPermission.allow)]: allow, [nameOf(api.aiPermission.withdraw)]: withdraw },
    quietCall,
  );
  answerByName(
    useAction,
    {
      [nameOf(api.extraction.fromTranscript)]: extract,
      [nameOf(api.extraction.fromPhoto)]: readPhoto,
      [nameOf(api.search.recall)]: recall,
      [nameOf(api.followUp.draft)]: draft,
    },
    quietCall,
  );
  return { allow, withdraw, extract, readPhoto, recall, draft };
}

async function open(url = "/") {
  const result = renderRouter("src/app", { initialUrl: url });
  await result;
  // Wrapped: an async function returning the result itself would await it away.
  return { getPathname: () => result.getPathname() };
}

async function press(name: string) {
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name }));
  });
}

/** Answer the sheet Andy put up when it opened, so a test starts from home. */
async function notNowAtOpen() {
  await waitFor(() => expect(screen.getByText(SHEET_TITLE)).toBeTruthy());
  await press("Not now");
}

async function askAndy(question: string) {
  await act(async () => {
    router.push("/search");
  });
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText("Ask Andy"), question);
  });
  await act(async () => {
    fireEvent.press(screen.getByLabelText("Ask"));
  });
}

beforeEach(() => {
  jest.spyOn(native, "hasNativeModule").mockReturnValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("should ask once when Andy opens, and remember a yes on the server", async () => {
  const { allow } = server();
  await open();

  await waitFor(() => expect(screen.getByText(SHEET_TITLE)).toBeTruthy());
  expect(screen.getByText(/Anthropic \(Claude\)/)).toBeTruthy();
  await press("Allow");

  expect(allow).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(SHEET_TITLE)).toBeNull();
});

test("should ask again at Ask after Not now, and send nothing until allowed", async () => {
  const { recall, allow } = server();
  await open();
  await notNowAtOpen();

  await askAndy("who moved to Berlin");
  expect(screen.getByText(SHEET_TITLE)).toBeTruthy();
  await press("Not now");
  expect(recall).not.toHaveBeenCalled();

  await act(async () => {
    fireEvent.press(screen.getByLabelText("Ask"));
  });
  await press("Allow");
  expect(allow).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(recall).toHaveBeenCalledWith({ query: "who moved to Berlin" }));
});

test("should keep written words and read nothing after Not now", async () => {
  const { extract } = server();
  await open();
  await notNowAtOpen();
  await act(async () => {
    router.push("/capture?door=write");
  });
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText(WRITE_BODY), "Nina is moving to Berlin.");
  });

  await press("Let Andy read it");
  expect(screen.getByText(SHEET_TITLE)).toBeTruthy();
  await press("Not now");

  expect(extract).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue("Nina is moving to Berlin.")).toBeTruthy();
});

test("should not send a photo to be read after Not now", async () => {
  const { readPhoto } = server();
  const result = await open();
  await notNowAtOpen();
  await act(async () => {
    router.push("/capture?door=photo");
  });
  await waitFor(() => expect(screen.getByTestId("photo-camera")).toBeTruthy());

  await press("Take photo");
  await waitFor(() => expect(screen.getByText(SHEET_TITLE)).toBeTruthy());
  await press("Not now");

  expect(readPhoto).not.toHaveBeenCalled();
  // Back where the note was started, as closing the camera does — not left on
  // the voice screen with no photo to retry.
  await waitFor(() => expect(result.getPathname()).toBe("/"));
});

test("should send once, however many times it is pressed while the question is up", async () => {
  const { recall } = server();
  await open();
  await notNowAtOpen();
  await act(async () => {
    router.push("/search");
  });
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText("Ask Andy"), "who moved to Berlin");
  });

  // Two presses land before the sheet is answered.
  await act(async () => {
    fireEvent.press(screen.getByLabelText("Ask"));
    fireEvent.press(screen.getByLabelText("Ask"));
  });
  await press("Allow");

  await waitFor(() => expect(recall).toHaveBeenCalledTimes(1));
});

test("should draft nothing after Not now, and ask again on the next tap", async () => {
  const { draft } = server();
  await open("/profile/profile-1");
  await notNowAtOpen();

  await press("Draft a follow-up");
  await press("Not now");
  expect(draft).not.toHaveBeenCalled();

  // Not stuck: the button asks again rather than doing nothing.
  await press("Draft a follow-up");
  expect(screen.getByText(SHEET_TITLE)).toBeTruthy();
});

test("should never ask someone who already said yes", async () => {
  const { recall } = server({ allowedAt: 1 });
  await open();

  await askAndy("who moved to Berlin");

  expect(screen.queryByText(SHEET_TITLE)).toBeNull();
  await waitFor(() => expect(recall).toHaveBeenCalledTimes(1));
});

test("should never ask with the switch off, as production runs until build 6", async () => {
  const { recall } = server({ switchedOff: ["aiPermission"] });
  await open();

  await askAndy("who moved to Berlin");

  expect(screen.queryByText(SHEET_TITLE)).toBeNull();
  await waitFor(() => expect(recall).toHaveBeenCalledTimes(1));
});

test("should not ask at open before the switch has been read", async () => {
  server({ switchedOff: undefined });
  // Everything else answered — the user row included — so only the switch is unknown.
  answerByName(
    useQuery,
    {
      [nameOf(api.featureFlags.switchedOff)]: undefined,
      [nameOf(api.users.current)]: { _id: "user-1", _creationTime: 1, tokenIdentifier: "t|alice" },
      [nameOf(api.people.search)]: { people: [], mentions: [] },
      "profiles:people": [],
    },
    () => undefined,
  );
  await open();
  // Given every chance to appear — the same wait the tests above use to find
  // it — and it does not.
  await expect(
    waitFor(() => expect(screen.getByText(SHEET_TITLE)).toBeTruthy(), { timeout: 500 }),
  ).rejects.toThrow();
  expect(screen.queryByText(SHEET_TITLE)).toBeNull();
});

test("should say in Settings that nothing is allowed, and allow from there", async () => {
  const { allow } = server();
  await open("/settings");
  await notNowAtOpen();

  expect(screen.getByTestId("ai-section")).toBeTruthy();
  expect(screen.getByText(/Not allowed/)).toBeTruthy();
  await press("Allow");

  expect(allow).toHaveBeenCalledTimes(1);
});

test("should ask before stopping, and stop only when told to", async () => {
  const { withdraw } = server({ allowedAt: 1 });
  const asked = pressConfirmButton("Stop sending");
  await open("/settings");

  expect(screen.getByText("You've allowed this.")).toBeTruthy();
  await press("Stop sending");

  expect(asked).toHaveBeenCalledWith("Stop sending?", expect.any(String), expect.any(Array));
  expect(withdraw).toHaveBeenCalledTimes(1);
});

test("should show nothing in Settings with the switch off", async () => {
  server({ switchedOff: ["aiPermission"] });
  await open("/settings");

  expect(screen.queryByTestId("ai-section")).toBeNull();
});
