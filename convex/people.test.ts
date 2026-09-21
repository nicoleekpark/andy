/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { bestMatch, rankName, searchKey } from "./peopleSearch";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const ALICE = { subject: "alice", name: "Alice", email: "alice@example.com" };
const BOB = { subject: "bob", name: "Bob", email: "bob@example.com" };

// ---------------------------------------------------------------------------
// Folding — the part that makes a person findable
// ---------------------------------------------------------------------------

test("should ignore case, spacing and punctuation when folding a name", () => {
  // Every one of these is the same person typed differently. The apostrophe is
  // the one that matters: the full-text index this replaces could not match
  // `oneill` to `O'Neill`, measured against the deployment on day 7.
  expect(searchKey("Judy O'Neill")).toBe("judyoneill");
  expect(searchKey("judy o'neill")).toBe("judyoneill");
  expect(searchKey("  JUDY  O'NEILL  ")).toBe("judyoneill");
  expect(searchKey("Judy-O'Neill")).toBe("judyoneill");
});

test("should leave a Korean name whole", () => {
  expect(searchKey("지선희")).toBe("지선희");
  expect(searchKey(" 박 지선 ")).toBe("박지선");
});

test("should rank an exact name above a prefix above a substring", () => {
  expect(rankName("judy", "judy", false)).toBeLessThan(
    rankName("judy", "judyoneill", false),
  );
  expect(rankName("judy", "judyoneill", false)).toBeLessThan(
    rankName("judy", "notjudyhere", false),
  );
});

test("should rank a name above an alias that matched the same way", () => {
  // An alias matching exactly is still a nickname. Putting it above an exact
  // name would make the list disagree with the profile screen.
  expect(rankName("chen", "chen", false)).toBeLessThan(
    rankName("chen", "chen", true),
  );
});

test("should report which of a person's names actually matched", () => {
  const match = bestMatch("chenny", [
    { name: "Sarah Chen", isAlias: false },
    { name: "Chenny", isAlias: true },
  ]);

  // A result showing "Sarah Chen" when you typed "Chenny" makes you wonder
  // why she is in the list.
  expect(match?.matchedName).toBe("Chenny");
});

// ---------------------------------------------------------------------------
// The query
// ---------------------------------------------------------------------------

async function seed(t: ReturnType<typeof convexTest>) {
  const userId = await t.withIdentity(ALICE).mutation(api.users.ensureUser, {});
  return t.run(async (ctx) => {
    const person = async (
      name: string,
      over: Record<string, unknown> = {},
    ): Promise<Id<"profiles">> =>
      ctx.db.insert("profiles", {
        userId,
        name,
        entityType: "person" as const,
        tags: [],
        autoCreated: false,
        ...over,
      });

    // Inserted out of alphabetical order on purpose. Seeded A-then-B, a sort
    // that does nothing returns the same list and the assertion below proves
    // nothing — day 5 lost three attempts to exactly that with the ranking
    // tests.
    const judyB = await person("Judy Park", { relationshipContext: "Work" });
    const judyA = await person("Judy O'Neill", {
      relationshipContext: "From the gym",
    });
    const marcus = await person("Marcus", { aliases: ["Marc"] });
    const jisun = await person("지선");
    const jisunhee = await person("지선희");

    await ctx.db.insert("notes", {
      userId,
      profileId: judyA,
      text: "Judy is moving.",
      keyFacts: ["Moving in March"],
      source: "voice" as const,
      createdAt: Date.UTC(2026, 8, 1, 12),
    });

    // Marcus's note mentions Judy — the other direction, and the whole point
    // of cross-profile mention search.
    const marcusNote = await ctx.db.insert("notes", {
      userId,
      profileId: marcus,
      text: "Climbing with Marcus. Judy was there too.",
      keyFacts: ["Climbs on Thursdays"],
      source: "voice" as const,
      createdAt: Date.UTC(2026, 8, 5, 12),
    });
    await ctx.db.insert("noteMentions", {
      userId,
      noteId: marcusNote,
      profileId: judyA,
      name: "Judy",
      quote: "Judy was there too",
    });

    return { userId, judyA, judyB, marcus, jisun, jisunhee, marcusNote };
  });
}

async function find(t: ReturnType<typeof convexTest>, q: string) {
  return t.withIdentity(ALICE).query(api.people.search, { query: q });
}

test("should find everyone who answers to the name, both of them", async () => {
  const t = convexTest(schema, modules);
  const { judyA, judyB } = await seed(t);

  const found = await find(t, "judy");

  // Two Judys is an ordinary state here, and the list is how the app refuses
  // to decide which one you meant.
  expect(found.people.map((p) => p.profileId)).toEqual([judyA, judyB]);
  expect(found.people[0]?.relationshipContext).toBe("From the gym");
});

test("should order equal matches alphabetically, so the list never reshuffles", async () => {
  const t = convexTest(schema, modules);
  await seed(t);

  const found = await find(t, "judy");

  // Stored Park-then-O'Neill, listed the other way. A stable rule matters more
  // than which rule — a list that reshuffles between two equally-good matches
  // looks like it is thinking.
  expect(found.people.map((p) => p.name)).toEqual(["Judy O'Neill", "Judy Park"]);
});

test("should order Korean names the way a Korean reader expects", async () => {
  const t = convexTest(schema, modules);
  const { userId } = await seed(t);
  await t.run(async (ctx) => {
    for (const name of ["하지원", "가지원", "나지원"]) {
      await ctx.db.insert("profiles", {
        userId,
        name,
        entityType: "person" as const,
        tags: [],
        autoCreated: false,
      });
    }
  });

  const found = await find(t, "지원");

  // `localeCompare`, not `<`. Code-point order and 가나다 order are not the
  // same thing, and this list is read by somebody who knows the difference.
  expect(found.people.map((p) => p.name)).toEqual(["가지원", "나지원", "하지원"]);
});

test("should find a name typed without its punctuation", async () => {
  const t = convexTest(schema, modules);
  const { judyA } = await seed(t);

  // The query the full-text index could not answer.
  for (const typed of ["oneill", "ONEILL", "o'neill", "judy oneill", "neill"]) {
    const found = await find(t, typed);
    expect(found.people.map((p) => p.profileId)).toContain(judyA);
  }
});

test("should narrow as more of the name is typed", async () => {
  const t = convexTest(schema, modules);
  const { judyA } = await seed(t);

  const found = await find(t, "judy o");

  // "judy o" is Judy O'Neill and not Judy Park — the index returned both,
  // because it matched the tokens separately.
  expect(found.people.map((p) => p.profileId)).toEqual([judyA]);
});

test("should find a Korean name from the middle of it", async () => {
  const t = convexTest(schema, modules);
  const { jisunhee } = await seed(t);

  const found = await find(t, "선희");

  // A script with no spaces has no mid-word prefix for a tokeniser to find.
  // This is the case that disqualified the index for a bilingual app.
  expect(found.people.map((p) => p.profileId)).toEqual([jisunhee]);
});

test("should find the shorter Korean name and the longer one that contains it", async () => {
  const t = convexTest(schema, modules);
  const { jisun, jisunhee } = await seed(t);

  const found = await find(t, "지선");

  // The opposite call from the calendar matcher, and deliberately so: there,
  // 지선 must never match 지선희 because the app is picking alone. Here the
  // person is reading a list and taps the one they meant.
  expect(found.people.map((p) => p.profileId)).toEqual([jisun, jisunhee]);
  expect(found.people[0]?.name).toBe("지선");
});

test("should find somebody by an alias, and say which name matched", async () => {
  const t = convexTest(schema, modules);
  const { marcus } = await seed(t);

  const found = await find(t, "marc");

  expect(found.people[0]?.profileId).toBe(marcus);
  // "Marc" *is* the alias and merely starts the name, so the alias wins —
  // across tiers, exact beats prefix even with the alias penalty. The row says
  // "Marc", which is what was typed, and the name is shown beside it. I had
  // this the other way round in the test and the code was right.
  expect(found.people[0]?.matchedName).toBe("Marc");
  expect(found.people[0]?.name).toBe("Marcus");
});

test("should show a single match as a list, not open it", async () => {
  const t = convexTest(schema, modules);
  const { marcus } = await seed(t);

  const found = await find(t, "marcus");

  // The screen decides nothing on the caller's behalf. "There is only one
  // Marcus" is itself worth seeing.
  expect(found.people).toHaveLength(1);
  expect(found.people[0]?.profileId).toBe(marcus);
});

// ---------------------------------------------------------------------------
// The other direction — where somebody comes up inside another person's note
// ---------------------------------------------------------------------------

test("should show where the name comes up in somebody else's note", async () => {
  const t = convexTest(schema, modules);
  const { marcus, judyA } = await seed(t);

  const found = await find(t, "judy");

  expect(found.mentions).toHaveLength(1);
  expect(found.mentions[0]?.aboutProfileId).toBe(marcus);
  expect(found.mentions[0]?.aboutName).toBe("Marcus");
  expect(found.mentions[0]?.profileId).toBe(judyA);
  // The verbatim quote from that note — `noteMentions` carries it so the link
  // belongs to neither end alone.
  expect(found.mentions[0]?.quote).toBe("Judy was there too");
});

test("should not repeat a person's own notes as mentions", async () => {
  const t = convexTest(schema, modules);
  await seed(t);

  const found = await find(t, "marcus");

  // Marcus's own note is what opening Marcus shows. This list is the other
  // direction, and listing it twice would make the shorter list the noisy one.
  expect(found.mentions).toEqual([]);
});

test("should still find a mention of somebody who has been deleted", async () => {
  const t = convexTest(schema, modules);
  const { userId, marcusNote } = await seed(t);
  await t.run(async (ctx) => {
    const gone = await ctx.db.insert("profiles", {
      userId,
      name: "Temporary",
      entityType: "person" as const,
      tags: [],
      autoCreated: true,
    });
    await ctx.db.insert("noteMentions", {
      userId,
      noteId: marcusNote,
      profileId: gone,
      name: "Priya",
      quote: "Priya came along",
    });
    await ctx.db.delete("profiles", gone);
  });

  const found = await find(t, "priya");

  // Deleting somebody must not erase them from the notes of everyone who
  // mentioned them. The name still shows and simply stops opening anything.
  expect(found.mentions).toHaveLength(1);
  expect(found.mentions[0]?.name).toBe("Priya");
  expect(found.mentions[0]?.profileId).toBeNull();
});

// ---------------------------------------------------------------------------
// Nothing, and nobody else's
// ---------------------------------------------------------------------------

test("should answer an empty query with nothing rather than everything", async () => {
  const t = convexTest(schema, modules);
  await seed(t);

  for (const blank of ["", "   ", "!!!"]) {
    const found = await find(t, blank);
    // A fold that empties would otherwise be a substring of every name.
    expect(found).toEqual({ people: [], mentions: [] });
  }
});

test("should find nobody when nobody is called that", async () => {
  const t = convexTest(schema, modules);
  await seed(t);

  expect(await find(t, "nobodyhere")).toEqual({ people: [], mentions: [] });
});

test("should never return another user's people or their mentions", async () => {
  const t = convexTest(schema, modules);
  await seed(t);
  await t.withIdentity(BOB).mutation(api.users.ensureUser, {});

  const found = await t
    .withIdentity(BOB)
    .query(api.people.search, { query: "judy" });

  expect(found).toEqual({ people: [], mentions: [] });
});

test("should refuse a signed-out caller", async () => {
  const t = convexTest(schema, modules);
  await seed(t);

  await expect(api.people.search).toBeDefined();
  await expect(
    t.query(api.people.search, { query: "judy" }),
  ).rejects.toThrow();
});
