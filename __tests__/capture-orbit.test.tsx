import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import * as ReactNative from "react-native";
import { useConvexConnectionState, useQuery } from "convex/react";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { renderRouter } from "expo-router/testing-library";
import { api } from "@convex/_generated/api";
import * as native from "@/lib/native";
import { answerByName, nameOf } from "../test-support/convex-mocks";
import { answerDialog, spyOnConfirm } from "../test-support/dialog";

/** The Write body, by the words on screen (its label is its placeholder). */
const WRITE_BODY = /^Write (or paste )?what you want to remember/;

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: "light" },
}));

/**
 * The orbit (`docs/design/decisions/capture-doors.md`, Final choice): home's +
 * and a person's "Add a note" open Voice, Write and Photo.
 */

const files = () =>
  (jest.requireMock("expo-file-system") as { __files: Map<string, string> }).__files;
const COPY = "file:///documents/offline-copy/copy.json";

const NINA = { _id: "contact-1", _creationTime: 1, userId: "u1", name: "Nina", entityType: "person", tags: [], autoCreated: false };

function server() {
  answerByName(
    useQuery,
    {
      [nameOf(api.profiles.people)]: [
        { profile: NINA, lastNoteAt: 1, noteCount: 1, latestFact: null, photoUrl: null },
      ],
      "profiles:resolveNames": [],
    },
    () => ({ profile: NINA, photoUrl: null, notes: [], mentionedIn: [], mentionedInTotal: 0 }),
  );
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

async function openOrbit() {
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "New note" }));
  });
}

afterEach(() => {
  jest.restoreAllMocks();
  online(true);
  files().delete(COPY);
});

test("should open Voice, Write and Photo from home's +, read in that order, then Close", async () => {
  server();
  await renderRouter("src/app", { initialUrl: "/" });

  await openOrbit();

  const order = screen
    .getAllByRole("button", { name: /^(Voice|Write|Photo|Close)$/ })
    .map((element) => element.props.accessibilityLabel);
  expect(order).toEqual(["Voice", "Write", "Photo", "Close"]);
});

test("should close on ✕ and on a tap of the dimmed screen", async () => {
  server();
  await renderRouter("src/app", { initialUrl: "/" });

  await openOrbit();
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Close" }));
  });
  expect(screen.queryByTestId("capture-orbit")).toBeNull();

  await openOrbit();
  await act(async () => {
    // Not a VoiceOver stop (hidden from it on purpose), but there to tap.
    fireEvent.press(screen.getByTestId("capture-orbit-scrim", { includeHiddenElements: true }));
  });
  expect(screen.queryByTestId("capture-orbit")).toBeNull();
});

test("should open the editor straight away through Write", async () => {
  server();
  const result = renderRouter("src/app", { initialUrl: "/" });
  await result;

  await openOrbit();
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Write" }));
  });

  expect(result.getPathname()).toBe("/capture");
  expect(result.getSearchParams()).toEqual({ door: "write" });
  expect(screen.getByLabelText(WRITE_BODY)).toBeTruthy();
});

test("should start listening at once through Voice — asking for the microphone first", async () => {
  server();
  const result = renderRouter("src/app", { initialUrl: "/" });
  await result;

  await openOrbit();
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Voice" }));
  });

  expect(result.getSearchParams()).toEqual({ door: "voice" });
  await waitFor(() => expect(ExpoSpeechRecognitionModule.requestPermissionsAsync).toHaveBeenCalled());
});

test("should not start listening when capture is opened without a door", async () => {
  server();
  (ExpoSpeechRecognitionModule.requestPermissionsAsync as jest.Mock).mockClear();

  await renderRouter("src/app", { initialUrl: "/capture" });
  // Long enough for a start that was going to happen to have asked.
  const openedAt = Date.now();
  await waitFor(() => expect(Date.now() - openedAt).toBeGreaterThan(50));

  expect(ExpoSpeechRecognitionModule.requestPermissionsAsync).not.toHaveBeenCalled();
});

test("should ask for the picture through Photo", async () => {
  server();
  const confirm = spyOnConfirm().mockImplementation(() => {});
  await renderRouter("src/app", { initialUrl: "/" });

  await openOrbit();
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Photo" }));
  });

  await waitFor(() =>
    expect(confirm).toHaveBeenCalledWith("Scan a business card", undefined, expect.any(Array)),
  );
});

test("should say over the open orbit that Photo needs a connection, and offer Write instead", async () => {
  files().set(
    COPY,
    JSON.stringify({ ownerId: "user_default", takenAt: 1, profiles: [NINA], notes: [], links: [] }),
  );
  online(false);
  answerByName(useQuery, {}, () => undefined);
  const result = renderRouter("src/app", { initialUrl: "/" });
  await result;

  await openOrbit();
  expect(screen.getByText("Needs a connection")).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Photo, Needs a connection" }));
  });

  // The real dialog, drawn while the orbit is still open (capture-doors.md §6).
  // Inside the orbit's own modal: the app's host would sit behind it on iOS.
  const dialog = within(screen.getByTestId("capture-orbit")).getByTestId("confirm-dialog");
  expect(within(dialog).getByText("Reading a photo needs a connection.")).toBeTruthy();
  expect(screen.getByTestId("capture-orbit")).toBeTruthy();

  // Cancel: back to the doors.
  await act(async () => {
    await answerDialog("Cancel");
  });
  expect(screen.queryByTestId("confirm-dialog")).toBeNull();
  expect(screen.getByTestId("capture-orbit")).toBeTruthy();

  // Write instead: the orbit closes and Write opens.
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Photo, Needs a connection" }));
  });
  await act(async () => {
    await answerDialog("Write instead");
  });
  expect(screen.queryByTestId("capture-orbit")).toBeNull();
  expect(result.getSearchParams()).toEqual({ door: "write" });
});

test("should open the same doors from a person's Add a note, about that person", async () => {
  server();
  const result = renderRouter("src/app", { initialUrl: "/profile/contact-1" });
  await result;

  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Add a note" }));
  });
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Write" }));
  });

  expect(result.getPathname()).toBe("/profile/contact-1/capture");
  expect(result.getSearchParams()).toEqual({ id: "contact-1", door: "write" });
});

test("should become a plain list at the largest text sizes", async () => {
  server();
  jest
    .spyOn(ReactNative, "useWindowDimensions")
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 2 });
  await renderRouter("src/app", { initialUrl: "/" });

  await openOrbit();

  expect(screen.getByRole("button", { name: "Voice" })).toBeTruthy();
  expect(screen.queryByTestId("capture-orbit-item--voice")).toBeNull();
});

test("should give a light tap as it opens, where the build has haptics", async () => {
  server();
  jest.spyOn(native, "hasNativeModule").mockImplementation((name) => name === "ExpoHaptics");
  const Haptics = jest.requireMock("expo-haptics") as { impactAsync: jest.Mock };
  Haptics.impactAsync.mockClear();
  await renderRouter("src/app", { initialUrl: "/" });

  await openOrbit();

  expect(Haptics.impactAsync).toHaveBeenCalledWith("light");
});
