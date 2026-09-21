/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const ALICE = { subject: "alice", name: "Alice", email: "alice@example.com" };
const BOB = { subject: "bob", name: "Bob", email: "bob@example.com" };

const AT = Date.UTC(2026, 8, 22, 10);

function event(over: Partial<Record<string, unknown>> = {}) {
  return {
    eventId: "evt-1",
    title: "Standup",
    startsAt: AT,
    endsAt: AT + 3600_000,
    attendeeNames: [] as string[],
    ...over,
  };
}

async function seed(t: ReturnType<typeof convexTest>) {
  const userId = await t.withIdentity(ALICE).mutation(api.users.ensureUser, {});
  return t.run(async (ctx) => {
    const marcus = await ctx.db.insert("profiles", {
      userId,
      name: "Marcus",
      aliases: ["Marc"],
      entityType: "person" as const,
      tags: [],
      autoCreated: false,
    });
    await ctx.db.insert("notes", {
      userId,
      profileId: marcus,
      text: "Marcus runs a climbing gym.",
      keyFacts: ["Runs a climbing gym in Oakland"],
      source: "voice" as const,
      createdAt: Date.UTC(2026, 8, 1, 12),
    });
    return { userId, marcus };
  });
}

// ---------------------------------------------------------------------------
// Finding the right person
// ---------------------------------------------------------------------------

test("should find the person a meeting title names", async () => {
  const t = convexTest(schema, modules);
  const { marcus } = await seed(t);

  const [matched] = await t
    .withIdentity(ALICE)
    .query(api.calendar.matchEvents, {
      events: [event({ title: "Coffee with Marcus" })],
    });

  expect(matched?.people).toHaveLength(1);
  expect(matched?.people[0]?.profileId).toBe(marcus);
  expect(matched?.people[0]?.via).toBe("title");
  // The digest a briefing is written from — carried here so the card needs no
  // second round trip to know whether there is anything to say.
  expect(matched?.people[0]?.noteCount).toBe(1);
});

test("should find a person by an alias, the same as every other name lookup", async () => {
  const t = convexTest(schema, modules);
  const { marcus } = await seed(t);

  const [matched] = await t
    .withIdentity(ALICE)
    .query(api.calendar.matchEvents, { events: [event({ title: "Marc 1:1" })] });

  // `namesOf` is the rule — a profile answers to its name *and* its aliases.
  // A calendar that says "Marc" is the case this exists for.
  expect(matched?.people[0]?.profileId).toBe(marcus);
});

test("should take an attendee's name directly rather than searching for it", async () => {
  const t = convexTest(schema, modules);
  const { marcus } = await seed(t);

  const [matched] = await t
    .withIdentity(ALICE)
    .query(api.calendar.matchEvents, {
      events: [event({ title: "Standup", attendeeNames: ["Marcus"] })],
    });

  expect(matched?.people[0]?.profileId).toBe(marcus);
  // An invitation is a stronger claim about who is coming than a word in a
  // title, and the screen is allowed to say which it was.
  expect(matched?.people[0]?.via).toBe("attendee");
});

test("should count somebody once when they are both on the invitation and in the title", async () => {
  const t = convexTest(schema, modules);
  await seed(t);

  const [matched] = await t
    .withIdentity(ALICE)
    .query(api.calendar.matchEvents, {
      events: [
        event({ title: "Coffee with Marcus", attendeeNames: ["Marcus"] }),
      ],
    });

  expect(matched?.people).toHaveLength(1);
  expect(matched?.people[0]?.via).toBe("attendee");
});

test("should answer for every event in one call, in the order asked", async () => {
  const t = convexTest(schema, modules);
  await seed(t);

  const matched = await t
    .withIdentity(ALICE)
    .query(api.calendar.matchEvents, {
      events: [
        event({ eventId: "a", title: "Standup" }),
        event({ eventId: "b", title: "Coffee with Marcus" }),
      ],
    });

  expect(matched.map((m) => m.eventId)).toEqual(["a", "b"]);
  expect(matched[0]?.people).toEqual([]);
  expect(matched[1]?.people).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// Refusing to guess
// ---------------------------------------------------------------------------

test("should refuse to pick between two people who answer to the same name", async () => {
  const t = convexTest(schema, modules);
  const { userId } = await seed(t);
  await t.run(async (ctx) => {
    for (const relationshipContext of ["From the gym", "From work"]) {
      const id = await ctx.db.insert("profiles", {
        userId,
        name: "Judy",
        entityType: "person" as const,
        relationshipContext,
        tags: [],
        autoCreated: false,
      });
      // One of them has more notes, so a resolver that quietly ranked would
      // have something to rank by — and would be wrong half the time.
      if (relationshipContext === "From work") {
        await ctx.db.insert("notes", {
          userId,
          profileId: id,
          text: "Judy is going freelance.",
          keyFacts: ["Going freelance"],
          source: "voice" as const,
          createdAt: Date.UTC(2026, 8, 2, 12),
        });
      }
    }
  });

  const [matched] = await t
    .withIdentity(ALICE)
    .query(api.calendar.matchEvents, {
      events: [event({ title: "Lunch with Judy" })],
    });

  // `CLAUDE.md`: two people may share a name and the app must not make them
  // one. A briefing about the wrong Judy reads as the app knowing something it
  // does not.
  expect(matched?.people).toEqual([]);
  expect(matched?.ambiguous).toEqual([{ matchedAs: "judy", count: 2 }]);
});

test("should find nobody in a meeting that is not about a person", async () => {
  const t = convexTest(schema, modules);
  await seed(t);

  const matched = await t
    .withIdentity(ALICE)
    .query(api.calendar.matchEvents, {
      events: [
        event({ eventId: "a", title: "Standup" }),
        event({ eventId: "b", title: "Dentist" }),
        event({ eventId: "c", title: "" }),
      ],
    });

  expect(matched.flatMap((m) => m.people)).toEqual([]);
});

test("should ignore an attendee nobody has written anything about", async () => {
  const t = convexTest(schema, modules);
  await seed(t);

  const [matched] = await t
    .withIdentity(ALICE)
    .query(api.calendar.matchEvents, {
      events: [event({ attendeeNames: ["Someone Unknown", ""] })],
    });

  // A calendar is full of people this app has never heard of. They are not
  // profiles and must not become them — Andy invents a person from a *note*,
  // never from a meeting invitation.
  expect(matched?.people).toEqual([]);
});

// ---------------------------------------------------------------------------
// Whose calendar, whose people
// ---------------------------------------------------------------------------

test("should never match a name against another user's people", async () => {
  const t = convexTest(schema, modules);
  await seed(t);
  await t.withIdentity(BOB).mutation(api.users.ensureUser, {});

  const [matched] = await t
    .withIdentity(BOB)
    .query(api.calendar.matchEvents, {
      events: [event({ title: "Coffee with Marcus" })],
    });

  // Bob's calendar naming Alice's Marcus must tell Bob nothing — not the
  // profile, not that one exists.
  expect(matched?.people).toEqual([]);
  expect(matched?.ambiguous).toEqual([]);
});

test("should refuse a batch too large to answer, rather than time out on it", async () => {
  const t = convexTest(schema, modules);
  await seed(t);

  // A calendar sync that duplicates a recurring event is a plausible Tuesday,
  // not an attack — and the work here is events x names x title length, so it
  // should get a sentence rather than a query that never returns.
  await expect(
    t.withIdentity(ALICE).query(api.calendar.matchEvents, {
      events: Array.from({ length: 201 }, (_, i) =>
        event({ eventId: `e${i}` }),
      ),
    }),
  ).rejects.toThrow(/too many calendar events/);

  // And the largest allowed batch still answers.
  const ok = await t.withIdentity(ALICE).query(api.calendar.matchEvents, {
    events: Array.from({ length: 200 }, (_, i) => event({ eventId: `e${i}` })),
  });
  expect(ok).toHaveLength(200);
});

test("should search a long title without letting it set the cost", async () => {
  const t = convexTest(schema, modules);
  const { marcus } = await seed(t);

  const [found] = await t.withIdentity(ALICE).query(api.calendar.matchEvents, {
    events: [event({ title: `Coffee with Marcus ${"x".repeat(20000)}` })],
  });
  // Truncated, not refused: one odd event must not cost the whole day's
  // briefing, and a name sits at the start of a title in every form this has
  // been seen in.
  expect(found?.people[0]?.profileId).toBe(marcus);

  const [missed] = await t.withIdentity(ALICE).query(api.calendar.matchEvents, {
    events: [event({ title: `${"x".repeat(20000)} Marcus` })],
  });
  expect(missed?.people).toEqual([]);
});

test("should refuse a signed-out caller", async () => {
  const t = convexTest(schema, modules);
  await seed(t);

  await expect(
    t.query(api.calendar.matchEvents, { events: [event()] }),
  ).rejects.toThrow();
});
