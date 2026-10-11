import { TimedOut, withTimeout } from "../src/lib/with-timeout";

describe("withTimeout", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("should give back the work's own result when it comes in time", async () => {
    await expect(withTimeout(Promise.resolve("answer"), 30_000)).resolves.toBe("answer");
  });

  test("should give up with TimedOut once the wait runs out", async () => {
    const waiting = withTimeout(new Promise(() => {}), 30_000);
    const settled = expect(waiting).rejects.toBeInstanceOf(TimedOut);
    await jest.advanceTimersByTimeAsync(30_000);
    await settled;
  });

  test("should not leave its timer behind once the work has answered", async () => {
    await withTimeout(Promise.resolve("answer"), 30_000);
    // Device QA #44's fix, reviewed: the wait goes with the question it was
    // guarding rather than staying scheduled for the rest of its thirty seconds.
    expect(jest.getTimerCount()).toBe(0);
  });

  test("should not leave its timer behind when the work fails", async () => {
    await expect(withTimeout(Promise.reject(new Error("no")), 30_000)).rejects.toThrow("no");
    expect(jest.getTimerCount()).toBe(0);
  });
});
