import { INDEX_FROM, sectionFor, sectionsOf } from "../src/lib/name-index";

const named = (names: string[]) => names.map((name) => ({ name }));
const nameOf = (row: { name: string }) => row.name;

/** `INDEX_FROM` people: "Adam 0"… then the names given, all sorted already. */
function longList(names: string[]) {
  const filler = Array.from({ length: INDEX_FROM - names.length }, (_, i) => `Adam ${i}`);
  return named([...filler, ...names]);
}

test("should show no letters and no index for a short list", () => {
  const rows = named(Array.from({ length: INDEX_FROM - 1 }, (_, i) => `Person ${i}`));

  expect(sectionsOf(rows, nameOf)).toEqual({
    indexed: false,
    sections: [{ letter: "", data: rows }],
  });
});

test("should have no sections at all when nobody is in Andy", () => {
  // home's empty state shows only when there is nothing to list.
  expect(sectionsOf([], nameOf)).toEqual({ indexed: false, sections: [] });
});

test("should cut a long list into letters, with # last", () => {
  const { indexed, sections } = sectionsOf(longList(["Bea", "Émile", "Eve", "김지선"]), nameOf);

  expect(indexed).toBe(true);
  expect(sections.map((s) => [s.letter, s.data.length])).toEqual([
    ["A", INDEX_FROM - 4],
    ["B", 1],
    ["E", 2],
    ["#", 1],
  ]);
});

test("should jump to the letter itself when somebody is under it", () => {
  const sections = [{ letter: "A" }, { letter: "E" }, { letter: "#" }];
  expect(sectionFor("E", sections)).toBe(1);
});

test("should jump to the next letter down when nobody is under the one tapped", () => {
  const sections = [{ letter: "A" }, { letter: "E" }, { letter: "#" }];
  // Contacts' behaviour: C has nobody, so the list goes to E rather than nowhere.
  expect(sectionFor("C", sections)).toBe(1);
  expect(sectionFor("F", sections)).toBe(2);
});

test("should go to the last section when nothing comes after the letter", () => {
  expect(sectionFor("Z", [{ letter: "A" }, { letter: "E" }])).toBe(1);
});
