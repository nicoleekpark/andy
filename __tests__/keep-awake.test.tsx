import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { useAction, useQuery } from "convex/react";
import { useSpeechRecognitionEvent } from "expo-speech-recognition";
import { renderRouter } from "expo-router/testing-library";
import { render } from "@testing-library/react-native";
import { useKeepAwakeWhile } from "@/lib/keep-awake";
import { answerByName, quietCall } from "../test-support/convex-mocks";

/**
 * Device QA B5-1 (`docs/qa/findings.md`): the phone auto-locked mid-recording
 * and the recording was cut off. The screen stays on while something is live.
 */

const mockActivate = jest.fn(async (_tag?: string) => {});
const mockDeactivate = jest.fn(async (_tag?: string) => {});
jest.mock("expo-keep-awake", () => ({
  activateKeepAwakeAsync: (tag?: string) => mockActivate(tag),
  deactivateKeepAwake: (tag?: string) => mockDeactivate(tag),
}));

type Listener = (event?: unknown) => void;

function captureListeners(): Record<string, Listener> {
  const handlers: Record<string, Listener> = {};
  (useSpeechRecognitionEvent as jest.Mock).mockImplementation((name: string, handler: Listener) => {
    handlers[name] = handler;
  });
  return handlers;
}

beforeEach(() => {
  answerByName(useQuery, { "profiles:resolveNames": [], "profiles:people": [] }, () => undefined);
  answerByName(useAction, {}, quietCall);
  mockActivate.mockClear();
  mockDeactivate.mockClear();
});

test("should keep the screen on while recording, and let it sleep once the words are in", async () => {
  const handlers = captureListeners();
  await renderRouter("src/app", { initialUrl: "/capture?door=voice" });

  await act(async () => {
    handlers.start?.();
  });
  expect(mockActivate).toHaveBeenCalledWith(expect.stringMatching(/^capture-/));
  expect(mockDeactivate).not.toHaveBeenCalled();

  await act(async () => {
    handlers.result?.({ results: [{ transcript: "Met Priya at the gym." }], isFinal: true });
  });
  await act(async () => {
    handlers.end?.();
  });

  // On the check step nothing is live: the phone may sleep as usual.
  await waitFor(() => expect(screen.getByRole("button", { name: "Let Andy read it" })).toBeTruthy());
  expect(mockDeactivate).toHaveBeenCalledWith(mockActivate.mock.calls[0]?.[0]);
});

test("should not keep the screen on while nothing is live", async () => {
  captureListeners();
  await renderRouter("src/app", { initialUrl: "/capture?door=write" });

  expect(mockActivate).not.toHaveBeenCalled();
});

test("should keep the screen on while Andy reads what was written", async () => {
  captureListeners();
  answerByName(useAction, { "extraction:fromTranscript": jest.fn(() => new Promise(() => {})) }, quietCall);
  await renderRouter("src/app", { initialUrl: "/capture?door=write" });
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText(/^Write (or paste )?what you want to remember/), "Met Priya.");
  });

  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Let Andy read it" }));
  });

  expect(mockActivate).toHaveBeenCalledWith(expect.stringMatching(/^capture-/));
});

test("should not let one screen switch the screen off under another that is still live", async () => {
  function Two({ first, second }: { first: boolean; second: boolean }) {
    useKeepAwakeWhile(first, "capture");
    useKeepAwakeWhile(second, "capture");
    return null;
  }
  const view = await render(<Two first second />);
  const [held, other] = mockActivate.mock.calls.map((call) => call[0]);
  expect(held).not.toBe(other);

  await view.rerender(<Two first second={false} />);

  expect(mockDeactivate).toHaveBeenCalledWith(other);
  expect(mockDeactivate).not.toHaveBeenCalledWith(held);
});
