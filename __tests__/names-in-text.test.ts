import { namesInText } from "@/lib/names-in-text";

/** Suggestions for "About" when Andy is not reading (Save as written). */
const PEOPLE = [
  { name: "Priya" },
  { name: "Priya" },
  { name: "May" },
  { name: "Jisoo Kim", aliases: ["지수"] },
  { name: "민호" },
];

test("should find a kept name in a possessive, once however many people share it", () => {
  expect(namesInText("Priya's daughter starts school", PEOPLE)).toEqual(["Priya"]);
});

test("should not find a name inside another word", () => {
  expect(namesInText("Met the mayor at the gala", PEOPLE)).toEqual([]);
  expect(namesInText("Saw May at the gala", PEOPLE)).toEqual(["May"]);
});

test("should find a Korean name with its particle attached, and offer the stored name for an alias", () => {
  expect(namesInText("지수가 다음 달에 공방을 연대", PEOPLE)).toEqual(["Jisoo Kim"]);
  expect(namesInText("민호네 집들이", PEOPLE)).toEqual(["민호"]);
});

test("should order suggestions by where they appear, and stop at three", () => {
  expect(namesInText("민호 and May met Priya and Jisoo Kim", PEOPLE)).toEqual(["민호", "May", "Priya"]);
});

test("should ignore case and never suggest a one-letter name", () => {
  expect(namesInText("PRIYA called", [{ name: "Priya" }, { name: "J" }])).toEqual(["Priya"]);
  expect(namesInText("J called", [{ name: "J" }])).toEqual([]);
});

test("should not suggest a Korean name found only inside a longer one", () => {
  expect(namesInText("이민호 만났어", PEOPLE)).toEqual([]);
  expect(namesInText("민호진이랑 커피", PEOPLE)).toEqual([]);
});

test("should not suggest a shorter name the text only says as part of a longer one", () => {
  expect(namesInText("Coffee with Priya Shah", [{ name: "Priya" }, { name: "Priya Shah" }])).toEqual([
    "Priya Shah",
  ]);
});

test("should suggest a full name from its first name in the words (B5-8)", () => {
  expect(namesInText("Barbara came by the studio", [{ name: "Barbara Apple" }])).toEqual(["Barbara Apple"]);
  // Never from the surname alone.
  expect(namesInText("bought an apple", [{ name: "Barbara Apple" }])).toEqual([]);
});
