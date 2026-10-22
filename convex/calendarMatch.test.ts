import { expect, test } from "vitest";
import type { Id } from "./_generated/dataModel";
import { type CalendarEvent, matchEventsIn } from "./calendarMatch";

// `matchEventsIn` is a pure function over rows (it runs on the phone too), so
// these need no database — rows are written the shape it reads.

function person(id: string, name: string, aliases: string[] = []) {
  return {
    _id: id as Id<"profiles">,
    name,
    aliases,
    entityType: "person" as const,
  };
}

function event(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    eventId: "evt-1",
    title: "Standup",
    startsAt: 0,
    endsAt: 3_600_000,
    attendeeNames: [],
    ...over,
  };
}

// Two people called Priya; one also answers to her fuller name.
const priyaShah = person("p-shah", "Priya", ["Priya Shah"]);
const priyaKumar = person("p-kumar", "Priya", ["Priya K"]);
const priyas = [priyaShah, priyaKumar];

// ---------------------------------------------------------------------------
// M1 — a name only inside a longer matched name is not a second name
// ---------------------------------------------------------------------------

test("should brief the fuller name alone when the title only says it in full", () => {
  const [matched] = matchEventsIn(priyas, [], [event({ title: "Coffee with Priya Shah" })]);

  // Device QA #11: this showed Priya Shah *and* "2 people called Priya".
  expect(matched?.people.map((p) => p.profileId)).toEqual(["p-shah"]);
  expect(matched?.ambiguous).toEqual([]);
});

// ---------------------------------------------------------------------------
// M2 — the invitation settles the title
// ---------------------------------------------------------------------------

test("should take the title's shared name as the invited person who answers to it", () => {
  const [matched] = matchEventsIn(
    priyas,
    [],
    [event({ title: "Coffee with Priya", attendeeNames: ["Priya Shah"] })],
  );

  // The event already said which Priya is coming; asking would be asking a
  // question it answered.
  expect(matched?.people.map((p) => p.profileId)).toEqual(["p-shah"]);
  expect(matched?.ambiguous).toEqual([]);
});

test("should still ask when the fuller name is only in the title, beside the short one", () => {
  // "Priya Shah / Priya" may be two Priyas. Only the attendee list is the
  // event saying who is coming; a title can name two people.
  const [matched] = matchEventsIn(priyas, [], [event({ title: "Priya Shah / Priya" })]);

  expect(matched?.people.map((p) => p.profileId)).toEqual(["p-shah"]);
  expect(matched?.ambiguous.map((a) => a.key)).toEqual(["priya"]);
});

test("should still ask when the invited person does not answer to the title's name", () => {
  const sam = person("p-sam", "Sam");
  const [matched] = matchEventsIn(
    [...priyas, sam],
    [],
    [event({ title: "Priya + Sam", attendeeNames: ["Sam"] })],
  );

  // Sam being invited says nothing about which Priya.
  expect(matched?.people.map((p) => p.profileId)).toEqual(["p-sam"]);
  expect(matched?.ambiguous.map((a) => a.key)).toEqual(["priya"]);
});

test("should still ask about a second attendee who shares the invited person's short name", () => {
  // Two entries on the invitation are two people. Priya Shah being one of
  // them says nothing about who the other Priya is.
  const [matched] = matchEventsIn(
    priyas,
    [],
    [event({ attendeeNames: ["Priya Shah", "Priya"] })],
  );

  expect(matched?.people.map((p) => p.profileId)).toEqual(["p-shah"]);
  expect(matched?.ambiguous.map((a) => a.key)).toEqual(["priya"]);
});

// ---------------------------------------------------------------------------
// M3 — one person once per meeting
// ---------------------------------------------------------------------------

test("should show a person once however many of their names the event uses", () => {
  const marcus = person("p-marcus", "Marcus Lee", ["ML"]);
  const [matched] = matchEventsIn([marcus], [], [event({ title: "ML / Marcus Lee" })]);

  expect(matched?.people.map((p) => p.profileId)).toEqual(["p-marcus"]);
});

// ---------------------------------------------------------------------------
// M5 — what a picker needs
// ---------------------------------------------------------------------------

test("should name everyone who answers to a shared name, in the picker's order", () => {
  const zed = person("p-zed", "Zoe", ["Jo"]);
  const amy = person("p-amy", "Amy", ["Jo"]);
  const [matched] = matchEventsIn([zed, amy], [], [event({ title: "Lunch with Jo" })]);

  // The ids a pick is saved against, so the card cannot offer one set of
  // people while the store saves against another. Alphabetical by name, as
  // `review`'s `name-choice` lists them — not in the order they were written.
  expect(matched?.ambiguous).toEqual([
    { name: "Amy", key: "jo", count: 2, profileIds: ["p-amy", "p-zed"] },
  ]);
});

test("should brief a full name from its first name in a title, with no alias written down (B5-8)", () => {
  // Owner, 2026-10-19: "Barbara" is how people say "Barbara Apple"; the first
  // name is derived from the name, so nobody has to keep it as an alias.
  const barbara = person("p-barbara", "Barbara Apple");
  const [matched] = matchEventsIn([barbara], [], [event({ title: "Coffee with Barbara" })]);
  expect(matched?.people.map((p) => p.profileId)).toEqual(["p-barbara"]);
});

test("should never brief a surname alone from a title", () => {
  const barbara = person("p-barbara", "Barbara Apple");
  const [matched] = matchEventsIn([barbara], [], [event({ title: "Apple keynote" })]);
  expect(matched?.people ?? []).toEqual([]);
  expect(matched?.ambiguous ?? []).toEqual([]);
});

test("should ask, not guess, when two full names share the first name in a title", () => {
  const apple = person("p-apple", "Barbara Apple");
  const kim = person("p-kim", "Barbara Kim");
  const [matched] = matchEventsIn([apple, kim], [], [event({ title: "Coffee with Barbara" })]);
  expect(matched?.people ?? []).toEqual([]);
  expect(matched?.ambiguous.length).toBe(1);
});
