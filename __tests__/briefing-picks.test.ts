import {
  FORGET_AFTER_MS,
  MAX_PICKS,
  NONE,
  type Pick,
  applyPicks,
  pick,
  picksOf,
  prunePicks,
  unpick,
} from "../src/lib/briefing-picks";
import { forgetOnThisPhone } from "../src/lib/on-phone";

/**
 * Which person a shared name on a calendar event means
 * (docs/design/decisions/briefing-card-people.md, R-P1–R-P8).
 */
const files = () =>
  (jest.requireMock("expo-file-system") as { __files: Map<string, string> }).__files;
const PICKS = "file:///documents/briefing-picks/picks.json";

const DAY = 24 * 3600_000;
const NOW = Date.UTC(2026, 9, 11, 9);

afterEach(() => {
  forgetOnThisPhone();
});

function answer(over: Partial<Pick> = {}): Pick {
  return {
    eventId: "evt-1",
    nameKey: "priya",
    profileId: "p-shah",
    pickedAt: NOW,
    lastSeenAt: NOW,
    ...over,
  };
}

const priyaShah = { _id: "p-shah", name: "Priya", aliases: ["Priya Shah"] };
const priyaKumar = { _id: "p-kumar", name: "Priya" };

// ---------------------------------------------------------------------------
// Kept on this phone, for this account
// ---------------------------------------------------------------------------

test("should keep an answer on this phone, tagged with its account", () => {
  pick("alice", "evt-1", "priya", "p-shah", NOW);

  expect(JSON.parse(files().get(PICKS)!)).toEqual({
    ownerId: "alice",
    picks: [answer()],
  });
});

test("should not show one account's answers to another", () => {
  pick("alice", "evt-1", "priya", "p-shah", NOW);

  expect(picksOf("bob")).toEqual([]);
});

test("should replace an answer rather than keep two for the same name", () => {
  pick("alice", "evt-1", "priya", "p-shah", NOW);
  pick("alice", "evt-1", "priya", "p-kumar", NOW + 1);

  expect(picksOf("alice").map((p) => p.profileId)).toEqual(["p-kumar"]);
});

test("should go back to unanswered when the answer is taken back", () => {
  pick("alice", "evt-1", "priya", "p-shah", NOW);
  pick("alice", "evt-1", "sam", "p-sam", NOW);
  unpick("alice", "evt-1", "priya");

  expect(picksOf("alice").map((p) => p.nameKey)).toEqual(["sam"]);
});

test("should leave nothing behind after a sign-out, in memory or on disk", () => {
  pick("alice", "evt-1", "priya", "p-shah", NOW);

  forgetOnThisPhone();

  // R-P8: sign-out and deletion clear the answers.
  expect(files().has(PICKS)).toBe(false);
  expect(picksOf("alice")).toEqual([]);
});

// ---------------------------------------------------------------------------
// Pruned on every read (R-P7)
// ---------------------------------------------------------------------------

test("should drop an answer whose person has been deleted", () => {
  expect(prunePicks([answer()], [priyaKumar], new Set(), NOW)).toEqual([]);
});

test("should drop an answer whose person no longer answers to the name", () => {
  const renamed = { _id: "p-shah", name: "Pia" };
  expect(prunePicks([answer()], [renamed], new Set(), NOW)).toEqual([]);
});

test("should keep an answer of Neither, which names nobody to check", () => {
  const neither = answer({ profileId: NONE });
  expect(prunePicks([neither], [], new Set(), NOW)).toEqual([neither]);
});

test("should drop an answer for an event not seen in ninety days", () => {
  const stale = answer({ lastSeenAt: NOW - FORGET_AFTER_MS });
  const recent = answer({ eventId: "evt-2", lastSeenAt: NOW - FORGET_AFTER_MS + DAY });

  expect(prunePicks([stale, recent], [priyaShah], new Set(), NOW)).toEqual([recent]);
});

test("should note an event as seen, but at most once a day", () => {
  const yesterday = answer({ lastSeenAt: NOW - DAY });
  const anHourAgo = answer({ eventId: "evt-2", lastSeenAt: NOW - 3600_000 });

  const kept = prunePicks([yesterday, anHourAgo], [priyaShah], new Set(["evt-1", "evt-2"]), NOW);

  expect(kept.find((p) => p.eventId === "evt-1")?.lastSeenAt).toBe(NOW);
  // Not rewritten for an hour's difference — every refresh would write the file.
  expect(kept.find((p) => p.eventId === "evt-2")?.lastSeenAt).toBe(NOW - 3600_000);
});

test("should keep at most the cap, letting the longest-unseen go first", () => {
  const many = Array.from({ length: MAX_PICKS + 1 }, (_, i) =>
    answer({ eventId: `evt-${i}`, profileId: NONE, lastSeenAt: NOW - i * 1000 }),
  );

  const kept = prunePicks(many, [], new Set(), NOW);

  expect(kept).toHaveLength(MAX_PICKS);
  expect(kept.some((p) => p.eventId === `evt-${MAX_PICKS}`)).toBe(false);
});

// ---------------------------------------------------------------------------
// Applied to a matched meeting (R-P3, R-P6)
// ---------------------------------------------------------------------------

const ambiguousPriya = {
  name: "Priya",
  key: "priya",
  count: 2,
  profileIds: ["p-kumar", "p-shah"],
};
const people = new Map([
  ["p-shah", { profileId: "p-shah", name: "Priya", noteCount: 3 }],
  ["p-kumar", { profileId: "p-kumar", name: "Priya", noteCount: 1 }],
]);
const personFor = (id: string) => people.get(id);

test("should brief the picked person, marked as picked for that name", () => {
  const applied = applyPicks(
    { eventId: "evt-1", people: [], ambiguous: [ambiguousPriya] },
    [answer()],
    personFor,
  );

  expect(applied.people).toEqual([
    { profileId: "p-shah", name: "Priya", noteCount: 3, pickedFor: "priya" },
  ]);
  expect(applied.ambiguous).toEqual([]);
  expect(applied.declined).toEqual([]);
});

test("should say Neither rather than ask again", () => {
  const applied = applyPicks(
    { eventId: "evt-1", people: [], ambiguous: [ambiguousPriya] },
    [answer({ profileId: NONE })],
    personFor,
  );

  expect(applied.people).toEqual([]);
  expect(applied.ambiguous).toEqual([]);
  expect(applied.declined).toEqual([{ name: "Priya", key: "priya" }]);
});

test("should still ask when the answer names somebody who is not one of the candidates", () => {
  const applied = applyPicks(
    { eventId: "evt-1", people: [], ambiguous: [ambiguousPriya] },
    [answer({ profileId: "p-someone-else" })],
    () => ({ profileId: "p-someone-else", name: "Priya", noteCount: 9 }),
  );

  // R-P3: never trusted stale. An answer is only as good as its candidates.
  expect(applied.people).toEqual([]);
  expect(applied.ambiguous).toEqual([ambiguousPriya]);
});

test("should not use an answer given for a different event or name", () => {
  const applied = applyPicks(
    { eventId: "evt-1", people: [], ambiguous: [ambiguousPriya] },
    [answer({ eventId: "evt-2" }), answer({ nameKey: "sam" })],
    personFor,
  );

  expect(applied.ambiguous).toEqual([ambiguousPriya]);
});

test("should not show a picked person twice when the meeting already names them", () => {
  const shah = { profileId: "p-shah", name: "Priya", noteCount: 3 };
  const applied = applyPicks(
    { eventId: "evt-1", people: [shah], ambiguous: [ambiguousPriya] },
    [answer()],
    personFor,
  );

  expect(applied.people).toEqual([shah]);
});
