import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Connecting, RetryConnectionContext } from "../src/components/connecting";

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
describe("connecting screen", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function advance(ms: number) {
    await act(async () => {
      jest.advanceTimersByTime(ms);
    });
  }

  test("should show nothing at all for the first moment, so a normal launch never flickers", async () => {
    await render(<Connecting />);

    await advance(1_400);

    expect(screen.queryByText("Connecting…")).toBeNull();
    expect(screen.queryByTestId("connecting-spinner")).toBeNull();
  });

  test("should say it is connecting once the quiet window has passed", async () => {
    await render(<Connecting />);

    await advance(1_500);

    expect(screen.getByText("Connecting…")).toBeTruthy();
    expect(screen.queryByTestId("connecting-spinner")).toBeTruthy();
  });

  test("should point at the network once connecting has taken too long", async () => {
    await render(<Connecting />);

    await advance(8_000);

    expect(
      screen.getByText("Still connecting. Check your internet connection."),
    ).toBeTruthy();
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
    // The spinner has to go: left running it would keep saying that waiting is
    // enough, at the one moment the screen exists to say it isn't.
    expect(screen.queryByTestId("connecting-spinner")).toBeNull();
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
