import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import { Connecting, RetryConnectionContext } from "../src/components/connecting";
import { drawn } from "../test-support/drawn";

/**
 * Covers src/components/connecting.tsx, the screen both auth gates show while
 * Convex has not confirmed the token.
 *
 * The whole design of this component is in its timing, so the tests are too:
 * what it shows is a function of how long it has been waiting. Fake timers make
 * that assertable in milliseconds instead of asking a person to sit in front of
 * a simulator for twenty seconds — which is exactly why the failure state went
 * unnoticed until day 3, when a stuck `isLoading` showed a blank paper screen
 * indistinguishable from a crash.
 *
 * Each test advances from mount rather than continuing the previous one's
 * clock: the phases are absolute offsets in the implementation, and a test that
 * accumulated time would keep passing if they were rewritten as a chain.
 */
// The thread is hidden from assistive tech on purpose (the words carry the
// meaning), and testing-library skips hidden elements unless told otherwise.
const HIDDEN = { includeHiddenElements: true } as const;

describe("connecting screen", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  async function advance(ms: number) {
    await act(async () => {
      jest.advanceTimersByTime(ms);
    });
  }

  test("should hold the launch screen's still loop for the first moment, with no words", async () => {
    await render(<Connecting />);

    await advance(1_400);

    // The loop the launch image left, so the hand-over is not a cut to blank
    // paper; and no words, so a normal launch never flickers.
    expect(screen.getByTestId("thread-loop-still", HIDDEN)).toBeTruthy();
    expect(screen.queryByTestId("thread-loop-moving", HIDDEN)).toBeNull();
    expect(screen.queryByText("Connecting…")).toBeNull();
    // Decorative: not a focus stop for a screen reader.
    expect(screen.queryByTestId("thread-loop-still")).toBeNull();
  });

  test("should say it is connecting once the quiet window has passed", async () => {
    await render(<Connecting />);

    await advance(1_500);

    expect(screen.getByText("Connecting…")).toBeTruthy();
    expect(screen.getByTestId("thread-loop-moving", HIDDEN)).toBeTruthy();
  });

  test("should pass the thread through: drawn in, whole, then leaving", async () => {
    await render(<Connecting />);
    await advance(1_400);
    const whole = drawn("thread-loop-still");

    await advance(100); // connecting: the motion starts once this commits
    await advance(300); // 0.3 s into drawing in
    const drawingIn = drawn("thread-loop-moving");
    await advance(900); // into the hold
    const held = drawn("thread-loop-moving");
    await advance(700); // leaving
    const leaving = drawn("thread-loop-moving");

    // Part-way, not blank-then-whole: some of the twist, not all of it.
    expect(drawingIn).toBeGreaterThan(1);
    expect(drawingIn).toBeLessThan(whole);
    expect(held).toBe(whole);
    expect(leaving).toBeLessThan(whole);
  });

  // Found on the simulator 2026-10-01: the moving thread lost the twist the
  // launch image and the still loop both carry, so it changed look the moment
  // it started.
  test("should keep the twist on the thread while it moves", async () => {
    await render(<Connecting />);

    await advance(1_400);
    const still = drawn("thread-loop-still");
    await advance(100); // connecting: the motion starts once this commits
    await advance(1_200); // held, whole
    const moving = drawn("thread-loop-moving");

    // The thread plus every dash of its twist, in both states.
    expect(still).toBeGreaterThan(10);
    expect(moving).toBe(still);
  });

  test("should keep the loop still when Reduce Motion is on", async () => {
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValueOnce(true);
    await render(<Connecting />);

    await advance(1_500);
    const at = drawn("thread-loop-still");
    await advance(700);

    // The words still say it is connecting; only the motion goes.
    expect(screen.getByText("Connecting…")).toBeTruthy();
    expect(screen.queryByTestId("thread-loop-moving", HIDDEN)).toBeNull();
    expect(drawn("thread-loop-still")).toBe(at);
  });

  test("should not move before the system has said whether Reduce Motion is on", async () => {
    // An answer that never comes: the thread must wait for it, not assume.
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockReturnValueOnce(new Promise(() => {}));
    await render(<Connecting />);

    await advance(1_500);
    const at = drawn("thread-loop-still");
    await advance(700);

    expect(screen.queryByTestId("thread-loop-moving", HIDDEN)).toBeNull();
    expect(drawn("thread-loop-still")).toBe(at);
  });

  test("should point at the network once connecting has taken too long", async () => {
    await render(<Connecting />);

    await advance(8_000);

    // Two lines, two jobs: what is happening, then what to do.
    expect(screen.getByText("Still connecting.")).toBeTruthy();
    expect(screen.getByText("Check your internet connection.")).toBeTruthy();
    expect(screen.queryByText("Connecting…")).toBeNull();
  });

  test("should stop promising and offer a way out after twenty seconds", async () => {
    await render(<Connecting />);

    await advance(20_000);

    expect(screen.getByText("Andy can't reach the server.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(
      screen.getByText(
        "If that doesn't help, close the app completely and open it again.",
      ),
    ).toBeTruthy();
    // The thread has to go: left moving it would keep saying that waiting is
    // enough, at the one moment the screen exists to say it isn't.
    expect(screen.queryByTestId("thread-loop-moving", HIDDEN)).toBeNull();
    expect(screen.queryByTestId("thread-loop-still", HIDDEN)).toBeNull();
  });

  test("should ask for a new session when the way out is taken", async () => {
    const retry = jest.fn();
    await render(
      <RetryConnectionContext.Provider value={retry}>
        <Connecting />
      </RetryConnectionContext.Provider>,
    );

    await advance(20_000);
    fireEvent.press(screen.getByRole("button", { name: "Try again" }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

});
