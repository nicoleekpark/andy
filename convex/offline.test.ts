/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const ALICE = { subject: "alice", name: "Alice", email: "alice@example.com" };
const BOB = { subject: "bob", name: "Bob", email: "bob@example.com" };

/** Alice and Bob, one person and one note each; Alice's note carries a vector. */
async function twoAccounts() {
  const t = convexTest(schema, modules);
  await t.withIdentity(ALICE).mutation(api.users.ensureUser, {});
  await t.withIdentity(BOB).mutation(api.users.ensureUser, {});
  const ids = await t.run(async (ctx) => {
    const users = await ctx.db.query("users").collect();
    const alice = users.find((u) => u.tokenIdentifier.includes("alice"))!;
    const bob = users.find((u) => u.tokenIdentifier.includes("bob"))!;
    const nina = await ctx.db.insert("profiles", {
      userId: alice._id,
      name: "Nina",
      entityType: "person",
      tags: [],
      autoCreated: false,
    });
    const noteId = await ctx.db.insert("notes", {
      userId: alice._id,
      profileId: nina,
      text: "Nina fosters two greyhounds.",
      keyFacts: ["Fosters two greyhounds"],
      embedding: Array.from({ length: 1536 }, () => 0.1),
      source: "manual",
      createdAt: 1,
    });
    const rowan = await ctx.db.insert("profiles", {
      userId: bob._id,
      name: "Rowan",
      entityType: "person",
      tags: [],
      autoCreated: false,
    });
    await ctx.db.insert("notes", {
      userId: bob._id,
      profileId: rowan,
      text: "Rowan runs a bakery.",
      source: "manual",
      createdAt: 2,
    });
    return { nina, noteId };
  });
  return { t, ...ids };
}

test("should give an account only its own people and notes for the phone's copy", async () => {
  const { t } = await twoAccounts();

  const copy = await t.withIdentity(ALICE).query(api.offline.snapshot, {});

  expect(copy.profiles.map((p) => p.name)).toEqual(["Nina"]);
  expect(copy.notes.map((n) => n.text)).toEqual(["Nina fosters two greyhounds."]);
});

test("should never send a note's search vector to the phone", async () => {
  const { t, nina, noteId } = await twoAccounts();
  const asAlice = t.withIdentity(ALICE);

  const copy = await asAlice.query(api.offline.snapshot, {});
  const page = await asAlice.query(api.profiles.withNotes, { profileId: nina });
  const note = await asAlice.query(api.notes.byId, { noteId });

  expect(copy.notes[0]).not.toHaveProperty("embedding");
  expect(page?.notes[0]?.note).not.toHaveProperty("embedding");
  expect(note?.note).not.toHaveProperty("embedding");
});

test("should refuse the copy to someone signed out", async () => {
  const { t } = await twoAccounts();

  await expect(t.query(api.offline.snapshot, {})).rejects.toThrow();
});

test("should build the same screens from the phone's copy as the server sends online", async () => {
  const { t, nina, noteId } = await twoAccounts();
  const asAlice = t.withIdentity(ALICE);
  const { peopleView, withNotesView, noteView, searchView } = await import("./offlineViews");

  const copy = await asAlice.query(api.offline.snapshot, {});

  expect(peopleView(copy.profiles, copy.notes)).toEqual(await asAlice.query(api.profiles.people, {}));
  expect(withNotesView(nina, copy.profiles, copy.notes, copy.links, null)).toEqual(
    await asAlice.query(api.profiles.withNotes, { profileId: nina }),
  );
  expect(noteView(noteId, copy.profiles, copy.notes)).toEqual(
    await asAlice.query(api.notes.byId, { noteId }),
  );
  expect(searchView("nin", copy.profiles, copy.notes, copy.links)).toEqual(
    await asAlice.query(api.people.search, { query: "nin" }),
  );
});

test("should order two notes saved at the same moment the same way online and offline", async () => {
  const { t, nina } = await twoAccounts();
  const asAlice = t.withIdentity(ALICE);
  const { withNotesView } = await import("./offlineViews");
  await t.run(async (ctx) => {
    const alice = (await ctx.db.query("users").collect()).find((u) => u.tokenIdentifier.includes("alice"))!;
    for (const text of ["first saved", "second saved"]) {
      await ctx.db.insert("notes", { userId: alice._id, profileId: nina, text, source: "manual", createdAt: 5 });
    }
  });

  const online = await asAlice.query(api.profiles.withNotes, { profileId: nina });
  const copy = await asAlice.query(api.offline.snapshot, {});
  const offline = withNotesView(nina, copy.profiles, copy.notes, copy.links, null);

  // The later of the two comes first — and the same either way.
  expect(online?.notes.map((n) => n.note.text).slice(0, 2)).toEqual(["second saved", "first saved"]);
  expect(offline?.notes.map((n) => n.note.text)).toEqual(online?.notes.map((n) => n.note.text));
});

/**
 * Finding someone by a word in what you kept about them, not only by name
 * (decided 2026-10-08) — the same online and offline, since both run
 * `searchView`.
 */
async function marcusTheDogLover() {
  const t = convexTest(schema, modules);
  await t.withIdentity(ALICE).mutation(api.users.ensureUser, {});
  await t.run(async (ctx) => {
    const alice = (await ctx.db.query("users").collect())[0]!;
    const marcus = await ctx.db.insert("profiles", {
      userId: alice._id,
      name: "Marcus",
      entityType: "person",
      relationshipContext: "Climbing partner",
      tags: ["dog lover"],
      autoCreated: false,
    });
    const nina = await ctx.db.insert("profiles", {
      userId: alice._id,
      name: "Nina",
      entityType: "person",
      tags: [],
      autoCreated: false,
    });
    await ctx.db.insert("notes", {
      userId: alice._id,
      profileId: marcus,
      text: "Coffee with Marcus.",
      keyFacts: ["Runs a climbing gym in Oakland"],
      source: "manual",
      createdAt: 1,
    });
    await ctx.db.insert("notes", {
      userId: alice._id,
      profileId: nina,
      text: "Met Nina at the shelter. She fosters two greyhounds and hates mornings.",
      source: "manual",
      createdAt: 2,
    });
  });
  return t.withIdentity(ALICE);
}

test("should find someone by a word in their tags, details or notes, saying where", async () => {
  const asAlice = await marcusTheDogLover();
  const find = async (query: string) =>
    (await asAlice.query(api.people.search, { query })).people.map((p) => [p.name, p.matchedIn]);

  // By name, as before.
  expect(await find("Mar")).toEqual([["Marcus", undefined]]);
  // By a tag, both words and either one.
  expect(await find("dog lover")).toEqual([["Marcus", "dog lover"]]);
  expect(await find("lover")).toEqual([["Marcus", "dog lover"]]);
  // By what to remember, and how you know them.
  expect(await find("oakland")).toEqual([["Marcus", "Runs a climbing gym in Oakland"]]);
  expect(await find("climbing")).toEqual([["Marcus", "Climbing partner"]]);
  // By the note's own words — the sentence it is in.
  expect(await find("greyhound")).toEqual([["Nina", "She fosters two greyhounds and hates mornings."]]);
});

test("should not search by word on a single letter, which is in everyone", async () => {
  const asAlice = await marcusTheDogLover();

  // "o" is in nearly every note here, and in no one's name.
  const result = await asAlice.query(api.people.search, { query: "o" });

  expect(result.people).toEqual([]);
});

test("should not let a name hide someone else's word match — a dog called Max, Marcus tagged 'max effort'", async () => {
  const t = convexTest(schema, modules);
  await t.withIdentity(ALICE).mutation(api.users.ensureUser, {});
  await t.run(async (ctx) => {
    const alice = (await ctx.db.query("users").collect())[0]!;
    await ctx.db.insert("profiles", {
      userId: alice._id,
      name: "Max",
      entityType: "animal",
      tags: [],
      autoCreated: false,
    });
    const marcus = await ctx.db.insert("profiles", {
      userId: alice._id,
      name: "Marcus",
      entityType: "person",
      tags: ["max effort athlete"],
      autoCreated: false,
    });
    await ctx.db.insert("notes", {
      userId: alice._id,
      profileId: marcus,
      text: "Trained with Marcus.",
      source: "manual",
      createdAt: 1,
    });
  });

  const result = await t.withIdentity(ALICE).query(api.people.search, { query: "max" });

  // Max by name first, then Marcus by his tag.
  expect(result.people.map((p) => [p.name, p.matchedIn])).toEqual([
    ["Max", undefined],
    ["Marcus", "max effort athlete"],
  ]);
});
