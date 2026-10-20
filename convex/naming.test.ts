import { expect, test } from "vitest";
import {
  candidatesForSpokenName,
  compareNamesForList,
  givenName,
  listLetterOf,
  namesOf,
  namesOverlap,
} from "./naming";

// ---------------------------------------------------------------------------
// namesOverlap
// ---------------------------------------------------------------------------

test("should relate a first name to a fuller name that starts with it", () => {
  // Reported live: three people kept as "Maisie", "Maisie H" and "Maisie
  // Park". Saying "Maisie" used to reach only a profile literally named
  // "Maisie" — the other two were never even offered as candidates.
  expect(namesOverlap("Maisie", "Maisie H")).toBe(true);
  expect(namesOverlap("Maisie", "Maisie Park")).toBe(true);
  // The developer's own example: "Nicole" for "Nicole Park".
  expect(namesOverlap("Nicole", "Nicole Park")).toBe(true);
});

test("should relate either direction — the fuller name spoken, the short one kept", () => {
  expect(namesOverlap("Nicole Park", "Nicole")).toBe(true);
  expect(namesOverlap("Maisie Park", "Maisie")).toBe(true);
});

test("should not relate two full names that merely share a first word", () => {
  // "Maisie H" and "Maisie Park" are two different people. Both relate to
  // "Maisie" independently; neither relates to the other.
  expect(namesOverlap("Maisie H", "Maisie Park")).toBe(false);
  expect(namesOverlap("Judy O'Neill", "Judy Park")).toBe(false);
});

test("should not relate a fragment cut from the middle of a name", () => {
  // Day 7's protection, carried over: "Al" must not match "Alignment review",
  // and the same shape of mistake here would let "H" match "Maisie H" or
  // "arcus" match "Marcus". A person is addressed by their names, not by a
  // piece of one.
  expect(namesOverlap("H", "Maisie H")).toBe(false);
  expect(namesOverlap("arcus", "Marcus")).toBe(false);
  expect(namesOverlap("Marc", "Marcus")).toBe(false);
});

test("should not relate two Korean names that share no full word", () => {
  // The exact collision `CLAUDE.md` and the day 7 calendar matcher both
  // refuse to allow. A Korean name is usually one word with no space in it,
  // so as unequal single tokens these relate to nothing but themselves.
  expect(namesOverlap("지선", "지선희")).toBe(false);
  expect(namesOverlap("민호", "민호준")).toBe(false);
});

test("should still relate a Korean name that does carry a space", () => {
  expect(namesOverlap("지선", "지선 언니")).toBe(true);
});

test("should treat two equal names as related", () => {
  expect(namesOverlap("Priya", "Priya")).toBe(true);
  expect(namesOverlap("Priya", "priya")).toBe(true);
});

test("should relate nothing to an empty name", () => {
  expect(namesOverlap("", "Maisie")).toBe(false);
  expect(namesOverlap("Maisie", "")).toBe(false);
  expect(namesOverlap("   ", "Maisie")).toBe(false);
});

// ---------------------------------------------------------------------------
// candidatesForSpokenName
// ---------------------------------------------------------------------------

type Person = { name: string; aliases?: string[] };

function kept(...names: string[]): Person[] {
  return names.map((name) => ({ name }));
}

test("should find every person a short name could mean", () => {
  // Two words spoken, so the derived first name (B5-8) cannot reach these:
  // they are found only by the whole-word overlap this test is about.
  const owned = kept("Maisie H", "Maisie H Park", "Maisie H Lee", "Priya");
  const found = candidatesForSpokenName(owned, "Maisie H").map((p) => p.name);
  expect(found).toEqual(["Maisie H", "Maisie H Lee", "Maisie H Park"]);
});

test("should put the exact match first", () => {
  const owned = kept("Maisie Park", "Maisie", "Maisie H");
  const found = candidatesForSpokenName(owned, "Maisie").map((p) => p.name);
  expect(found[0]).toBe("Maisie");
});

test("should order each tier alphabetically, so the list does not depend on storage order", () => {
  // The overlap tier, kept out of the first-name path as above.
  const owned = kept("Maisie H Park", "Maisie H Lee");
  const found = candidatesForSpokenName(owned, "Maisie H").map((p) => p.name);
  expect(found).toEqual(["Maisie H Lee", "Maisie H Park"]);
});

test("should keep the exact tier ahead of the overlap tier, even against the alphabet", () => {
  // A string that is an exact prefix of another always sorts first anyway, so
  // "Maisie" ahead of "Maisie Park" alone would prove nothing — alphabetical
  // order alone gets that right too. This forces the two apart: an exact
  // match reached through an ALIAS, whose own name sorts *after* the overlap
  // match's name. If the exact tier were not actually checked first, plain
  // alphabetical order would put "Maisie Park" ahead of "Zed" instead.
  // A first name now counts as exact (B5-8), so the overlap here runs the
  // other way: the spoken name is the longer one.
  const owned: Person[] = [
    { name: "Maisie" },
    { name: "Zed", aliases: ["Maisie H"] },
  ];
  const found = candidatesForSpokenName(owned, "Maisie H").map((p) => p.name);
  expect(found).toEqual(["Zed", "Maisie"]);
});

test("should find a fuller name from a name kept only as an alias", () => {
  const owned: Person[] = [{ name: "Sarah Chen", aliases: ["Chenny"] }];
  expect(candidatesForSpokenName(owned, "Sarah")).toHaveLength(1);
});

test("should find nobody for a name that overlaps nothing", () => {
  const owned = kept("Marcus", "Priya");
  expect(candidatesForSpokenName(owned, "Judy")).toEqual([]);
});

test("should still refuse a fragment, through this entry point too", () => {
  const owned = kept("Marcus");
  expect(candidatesForSpokenName(owned, "arc")).toEqual([]);
});

test("should not offer a Korean name for one it merely starts", () => {
  const owned = kept("지선희");
  expect(candidatesForSpokenName(owned, "지선")).toEqual([]);
});

// ---------------------------------------------------------------------------
// compareNamesForList
// ---------------------------------------------------------------------------

function listed(names: string[]) {
  return [...names].sort(compareNamesForList);
}

test("should list A to Z, then pure Hangul names after Z", () => {
  expect(listed(["민호", "Zoe", "지수", "Aaron"])).toEqual(["Aaron", "Zoe", "민호", "지수"]);
});

test("should place a name mixing both scripts by its characters in order", () => {
  // The three examples the order was decided with, 2026-09-29.
  expect(listed(["Adam 한솔", "Aaron"])).toEqual(["Aaron", "Adam 한솔"]);
  expect(listed(["Adam 한솔", "Adam Aron"])).toEqual(["Adam Aron", "Adam 한솔"]);
  expect(listed(["Azizi", "Adam 한솔"])).toEqual(["Adam 한솔", "Azizi"]);
});

test("should ignore case, accents and punctuation, and put a shorter name first", () => {
  expect(listed(["emma", "Émile", "Adam", "Oliver", "O’Brien"])).toEqual([
    "Adam",
    "Émile",
    "emma",
    "O’Brien",
    "Oliver",
  ]);
  expect(listed(["Adamo", "Adam Aron", "Adam"])).toEqual(["Adam", "Adam Aron", "Adamo"]);
});

test("should put Hangul before any other script", () => {
  expect(listed(["Анна", "민호"])).toEqual(["민호", "Анна"]);
});

// ---------------------------------------------------------------------------
// home's A–Z index (device QA #7, decided 2026-10-11)
// ---------------------------------------------------------------------------

test("should file a name under its first letter, whatever its case or accent", () => {
  expect(listLetterOf("emily")).toBe("E");
  expect(listLetterOf("Émile")).toBe("E");
  expect(listLetterOf("O'Brien")).toBe("O");
});

test("should file Korean and anything not A–Z under #", () => {
  expect(listLetterOf("김지선")).toBe("#");
  expect(listLetterOf("42 Club")).toBe("#");
});

test("should file a name by its first letter when it starts with a symbol the sort ignores", () => {
  // The sort key drops it, so "🙂 Sam" sits among the S names — and its
  // letter has to say S, or the index would point somewhere it is not.
  expect(listLetterOf("🙂 Sam")).toBe("S");
});

test("should keep every name under one letter together, with # last, in the list's own order", () => {
  const names = ["Zoe", "김지선", "adam", "Émile", "Eve", "42 Club", "Bea"];
  const letters = [...names].sort(compareNamesForList).map(listLetterOf);

  // Grouped (no letter reappears after another) and in index order.
  expect(letters).toEqual(["A", "B", "E", "E", "Z", "#", "#"]);
});


// ---------------------------------------------------------------------------
// The first name inside a full one (device QA B5-8, owner 2026-10-19)
// ---------------------------------------------------------------------------

test("should answer to the first name of a full name, derived and never stored", () => {
  expect(givenName("Barbara Apple")).toBe("Barbara");
  expect(namesOf({ name: "Barbara Apple" })).toEqual(["Barbara Apple", "Barbara"]);
  // Renamed, and the first name moves with the name — there is no copy to update.
  expect(namesOf({ name: "Barbary Appley" })).toEqual(["Barbary Appley", "Barbary"]);
  // Not repeated when an alias already says it.
  expect(namesOf({ name: "Barbara Apple", aliases: ["barbara"] })).toEqual(["Barbara Apple", "barbara"]);
});

test("should never take a surname, a one-word name, an honorific or an initial", () => {
  expect(namesOf({ name: "Barbara Apple" })).not.toContain("Apple");
  expect(givenName("지선희")).toBeNull();
  expect(givenName("Marcus")).toBeNull();
  expect(givenName("Dr. Kim")).toBeNull();
  expect(givenName("J. Smith")).toBeNull();
  expect(givenName("  Nicole   Park ")).toBe("Nicole");
  // An honorific is skipped when a full name follows it, not the whole name.
  expect(givenName("Sir John Smith")).toBe("John");
});

test("should put a full name in the exact tier for its first name", () => {
  const owned: Person[] = [{ name: "Barbara Apple" }, { name: "Barbara" }];
  expect(candidatesForSpokenName(owned, "Barbara").map((p) => p.name)).toEqual([
    "Barbara",
    "Barbara Apple",
  ]);
});
