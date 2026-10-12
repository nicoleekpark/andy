import { initialsOf } from "../src/components/person-avatar";

test("should take the first letters of the first and last words", () => {
  expect(initialsOf("Emily Watson")).toBe("EW");
  expect(initialsOf("Mary Ann van der Berg")).toBe("MB");
});

test("should take one letter from a one-word name", () => {
  expect(initialsOf("Marcus")).toBe("M");
  expect(initialsOf("김지선")).toBe("김");
});

test("should not be thrown by spacing or case", () => {
  expect(initialsOf("  emily   watson ")).toBe("EW");
});

test("should keep a letter outside the basic plane whole", () => {
  // Split by code point: half a surrogate pair renders as a box.
  expect(initialsOf("𝒜da Lovelace")).toBe("𝒜L");
});
