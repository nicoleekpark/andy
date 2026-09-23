import { expect, test } from "vitest";
import { namesFoundIn } from "./calendarNames";
import { matchKey } from "./naming";

/** Both sides folded the way every other name comparison in this repo folds. */
function find(title: string, known: string[]): string[] {
  return namesFoundIn(matchKey(title), known.map(matchKey));
}

// ---------------------------------------------------------------------------
// Finding somebody
// ---------------------------------------------------------------------------

test("should find a name inside the sentence a calendar title actually is", () => {
  expect(find("Coffee with Marcus", ["Marcus"])).toEqual(["marcus"]);
  expect(find("Marcus / Nicole 1:1", ["Marcus"])).toEqual(["marcus"]);
  expect(find("Lunch – Judy", ["Judy"])).toEqual(["judy"]);
  expect(find("Judy", ["Judy"])).toEqual(["judy"]);
});

test("should find a name whatever case the calendar wrote it in", () => {
  // The whole reason `matchKey` exists, applied to a title rather than to a
  // spoken name. Calendars are full of "LUNCH WITH JUDY".
  expect(find("LUNCH WITH JUDY", ["Judy"])).toEqual(["judy"]);
  expect(find("lunch with judy", ["Judy"])).toEqual(["judy"]);
});

test("should find several people in one meeting", () => {
  expect(find("Marcus, Judy and Priya — planning", ["Marcus", "Judy", "Priya"]))
    .toEqual(["marcus", "judy", "priya"]);
});

test("should return each name once however often the title says it", () => {
  expect(find("Judy 1:1 — Judy's review", ["Judy"])).toEqual(["judy"]);
});

test("should keep the order it was given, not the order the title uses", () => {
  // The caller's order is the one it can explain. A title's word order says
  // nothing about who the meeting is with.
  expect(find("Judy and Marcus", ["Marcus", "Judy"])).toEqual([
    "marcus",
    "judy",
  ]);
});

// ---------------------------------------------------------------------------
// Not finding somebody who is not there — the half that matters
// ---------------------------------------------------------------------------

test("should not find a short name inside a longer word", () => {
  // "Al" in "Alignment" is how a briefing about a stranger reaches somebody's
  // phone. Every calendar has words like this in it.
  expect(find("Alignment review", ["Al"])).toEqual([]);
  expect(find("Marshal briefing", ["Hal"])).toEqual([]);
  expect(find("Standup", ["Stan"])).toEqual([]);
  expect(find("Retrospective", ["Ret"])).toEqual([]);
});

test("should not find anybody in a meeting that names nobody", () => {
  expect(find("Standup", ["Marcus", "Judy"])).toEqual([]);
  expect(find("Dentist", ["Marcus"])).toEqual([]);
  expect(find("", ["Marcus"])).toEqual([]);
});

test("should not treat an empty name as matching everything", () => {
  // A profile cannot be named "" — but `matchKey("   ")` is `""`, and
  // `indexOf("")` is 0 for every string in the language. Without the guard,
  // one whitespace alias would put every person in every meeting.
  expect(find("Standup", ["   "])).toEqual([]);
  expect(namesFoundIn("standup", [""])).toEqual([]);
});

// ---------------------------------------------------------------------------
// Korean — where "followed by a boundary" is the wrong rule
// ---------------------------------------------------------------------------

test("should find a Korean name carrying a particle", () => {
  // The ordinary way to write a name in Korean. Requiring a boundary after the
  // name would make the common case the one case that fails.
  expect(find("지선이랑 점심", ["지선"])).toEqual(["지선"]);
  expect(find("지선과 미팅", ["지선"])).toEqual(["지선"]);
  expect(find("지선님 1:1", ["지선"])).toEqual(["지선"]);
  expect(find("민호에게 전화", ["민호"])).toEqual(["민호"]);
  expect(find("지선이 오는 날", ["지선"])).toEqual(["지선"]);
});

test("should not find a Korean name inside a different, longer name", () => {
  // 지선 and 지선희 are two people. Allowing any trailing Hangul would merge
  // them — the exact failure `CLAUDE.md` names when it says refusing the second
  // 치선 tells the user their friend does not exist.
  expect(find("지선희와 점심", ["지선"])).toEqual([]);
  expect(find("민호준 미팅", ["민호"])).toEqual([]);
});

test("should not find a Korean name that only starts inside another word", () => {
  expect(find("박지선희", ["지선"])).toEqual([]);
});

test("should still find the longer name when that is who it is", () => {
  expect(find("지선희와 점심", ["지선희"])).toEqual(["지선희"]);
  // And when both are kept, only the one the title actually says.
  expect(find("지선희와 점심", ["지선", "지선희"])).toEqual(["지선희"]);
});

test("should find a Latin name carrying a Korean particle", () => {
  // A particle belongs to the sentence, not to the name. Somebody writing
  // their calendar in Korean writes "Judy랑 점심" as readily as "지선이랑".
  // The first version restricted particles to Hangul names and nothing caught
  // it — mutation testing did.
  expect(find("Judy랑 점심", ["Judy"])).toEqual(["judy"]);
  expect(find("Marcus님 1:1", ["Marcus"])).toEqual(["marcus"]);
});

test("should not let the particle rule turn a longer Latin word into a match", () => {
  expect(find("Marcuse reading group", ["Marcus"])).toEqual([]);
});

test("should say a shared name once, not once per person who answers to it", () => {
  // Two profiles named Judy is an ordinary state here — `CLAUDE.md` is
  // explicit that names are not unique — and both fold to the same key. The
  // title names her once; deciding *which* Judy is the caller's problem.
  expect(find("Lunch with Judy", ["Judy", "judy"])).toEqual(["judy"]);
});
