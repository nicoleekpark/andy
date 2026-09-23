import { expect, test } from "vitest";
import { nameToFileUnder, possessiveBases } from "./possessive";

test("should find the name inside an English possessive", () => {
  // The real failure: the recogniser dropped the apostrophe and extraction
  // read what was left as somebody's name.
  expect(possessiveBases("Parks")).toContain("Park");
  expect(possessiveBases("Park's")).toContain("Park");
  expect(possessiveBases("Park’s")).toContain("Park");
  expect(possessiveBases("Parks'")).toContain("Park");
});

test("should find the name inside a Korean possessive", () => {
  // 민호네 집들이 — the same failure, in the other language this app ships in.
  expect(possessiveBases("민호네")).toContain("민호");
  expect(possessiveBases("민호의")).toContain("민호");
});

test("should propose nothing for a name that is not a possessive of anything", () => {
  expect(possessiveBases("Judy")).toEqual([]);
  expect(possessiveBases("지선")).toEqual([]);
});

test("should not propose a base too short to be a name", () => {
  // Otherwise every "As" and "Os" in a calendar becomes a question about a
  // one-letter person.
  expect(possessiveBases("As")).toEqual([]);
  expect(possessiveBases("s")).toEqual([]);
  expect(possessiveBases("")).toEqual([]);
});

test("should still propose for a name that legitimately ends in s", () => {
  // "Marcus" proposes "Marcu", which matches nobody and costs nothing. The
  // rule is allowed to be generous here precisely because a proposal only
  // becomes a question when the base is somebody the user actually keeps.
  expect(possessiveBases("Marcus")).toEqual(["Marcu"]);
});

test("should ignore case when spotting the suffix", () => {
  expect(possessiveBases("PARKS")).toContain("PARK");
  // And keeps the spelling it was given — the base is looked up by `matchKey`
  // later, and what is shown to a person should be what they said.
  expect(possessiveBases("PARKS")[0]).toBe("PARK");
});

// ---------------------------------------------------------------------------
// The name a new person is actually filed under
// ---------------------------------------------------------------------------

test("should never file somebody under a written possessive", () => {
  // "Priya and I went to MET to see Prisley's show" names nobody the user
  // keeps, so the possessive *question* never fires — and a person called
  // "Prisley's" was created instead. An apostrophe-possessive is grammar.
  expect(nameToFileUnder("Prisley's")).toBe("Prisley");
  expect(nameToFileUnder("Prisley’s")).toBe("Prisley");
  expect(nameToFileUnder("Judy's")).toBe("Judy");
  expect(nameToFileUnder("Jones'")).toBe("Jones");
});

test("should leave a bare trailing s alone", () => {
  // Parks is a surname and only the speaker knows whether this is one. That
  // case gets the question instead; stripping it here would answer it.
  expect(nameToFileUnder("Parks")).toBe("Parks");
  expect(nameToFileUnder("Marcus")).toBe("Marcus");
});

test("should leave an ordinary name alone", () => {
  expect(nameToFileUnder("Priya")).toBe("Priya");
  expect(nameToFileUnder("지선")).toBe("지선");
  expect(nameToFileUnder("  Judy  ")).toBe("Judy");
});

test("should not reduce a name to nothing", () => {
  expect(nameToFileUnder("A's")).toBe("A's");
  expect(nameToFileUnder("'s")).toBe("'s");
});
