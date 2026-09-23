import { expect, test } from "vitest";
import { candidatesForSpokenName, namesOverlap } from "./naming";

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
  const owned = kept("Maisie", "Maisie H", "Maisie Park", "Priya");
  const found = candidatesForSpokenName(owned, "Maisie").map((p) => p.name);
  expect(found).toEqual(["Maisie", "Maisie H", "Maisie Park"]);
});

test("should put the exact match first", () => {
  const owned = kept("Maisie Park", "Maisie", "Maisie H");
  const found = candidatesForSpokenName(owned, "Maisie").map((p) => p.name);
  expect(found[0]).toBe("Maisie");
});

test("should order each tier alphabetically, so the list does not depend on storage order", () => {
  const owned = kept("Maisie Park", "Maisie H");
  const found = candidatesForSpokenName(owned, "Maisie").map((p) => p.name);
  expect(found).toEqual(["Maisie H", "Maisie Park"]);
});

test("should keep the exact tier ahead of the overlap tier, even against the alphabet", () => {
  // A string that is an exact prefix of another always sorts first anyway, so
  // "Maisie" ahead of "Maisie Park" alone would prove nothing — alphabetical
  // order alone gets that right too. This forces the two apart: an exact
  // match reached through an ALIAS, whose own name sorts *after* the overlap
  // match's name. If the exact tier were not actually checked first, plain
  // alphabetical order would put "Maisie Park" ahead of "Zed" instead.
  const owned: Person[] = [
    { name: "Maisie Park" },
    { name: "Zed", aliases: ["Maisie"] },
  ];
  const found = candidatesForSpokenName(owned, "Maisie").map((p) => p.name);
  expect(found).toEqual(["Zed", "Maisie Park"]);
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
