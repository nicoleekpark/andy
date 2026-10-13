import { othersWorthShowing } from "../src/lib/ask-results";

const note = (id: string, score: number, used = false) => ({ id, score, used });

test("should fold only the notes that matched at least as well as the weakest one the answer used", () => {
  const results = [
    note("used-a", 0.62, true),
    note("used-b", 0.48, true),
    note("close", 0.5),
    note("tied", 0.48),
    note("weaker", 0.31),
    note("noise", 0.17),
  ];

  // Device QA #38: nine "other notes", all unrelated. A note that matched less
  // well than every note the answer relied on cannot be one it missed.
  expect(othersWorthShowing(results).map((result) => result.id)).toEqual(["close", "tied"]);
});

test("should fold nothing when the answer used nothing", () => {
  // Nothing to compare against, and the screen lists everything unfolded then.
  expect(othersWorthShowing([note("a", 0.6), note("b", 0.4)])).toEqual([]);
});

test("should never fold a note the answer used", () => {
  expect(othersWorthShowing([note("a", 0.6, true)])).toEqual([]);
});
