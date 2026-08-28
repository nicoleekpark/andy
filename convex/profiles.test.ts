/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const ALICE = { subject: "alice", name: "Alice", email: "alice@example.com" };
const BOB = { subject: "bob", name: "Bob", email: "bob@example.com" };

async function ensureUser(t: ReturnType<typeof convexTest>, identity: { subject: string; name: string; email: string }) {
  return t.withIdentity(identity).mutation(api.users.ensureUser, {});
}

test("should return null when the profile belongs to a different user", async () => {
  const t = convexTest(schema, modules);
  const aliceUserId = await ensureUser(t, ALICE);
  await ensureUser(t, BOB);
  const asBob = t.withIdentity(BOB);

  const aliceProfileId = await t.run(async (ctx) =>
    ctx.db.insert("profiles", {
      userId: aliceUserId,
      name: "지수",
      entityType: "person",
      tags: [],
      isStub: false,
    }),
  );

  // This is the test that would go green even with the ownership check
  // deleted, so make sure it wouldn't: Bob is asking with Alice's real,
  // existing profile id, not a made-up or malformed one.
  const result = await asBob.query(api.profiles.withNotes, {
    profileId: aliceProfileId,
  });

  expect(result).toBeNull();
});

test("should throw when withNotes is called while signed out", async () => {
  const t = convexTest(schema, modules);
  const aliceUserId = await ensureUser(t, ALICE);
  const profileId = await t.run(async (ctx) =>
    ctx.db.insert("profiles", {
      userId: aliceUserId,
      name: "지수",
      entityType: "person",
      tags: [],
      isStub: false,
    }),
  );

  await expect(t.query(api.profiles.withNotes, { profileId })).rejects.toThrow();
});

test("should return null rather than throw for a malformed or non-existent profile id", async () => {
  const t = convexTest(schema, modules);
  const aliceUserId = await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  // Not a real Convex id at all — the string a typo'd URL would produce.
  const malformed = await asAlice.query(api.profiles.withNotes, {
    profileId: "not-a-real-id",
  });
  expect(malformed).toBeNull();

  // A syntactically valid id, but for the wrong table — normalizeId scopes
  // by table, so this must not resolve to a profiles row by accident.
  const wrongTable = await asAlice.query(api.profiles.withNotes, {
    profileId: aliceUserId,
  });
  expect(wrongTable).toBeNull();
});

test("should return the caller's own profile with its notes newest first, excluding notes from another profile", async () => {
  const t = convexTest(schema, modules);
  const aliceUserId = await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  const { profileId } = await t.run(async (ctx) => {
    const profileId = await ctx.db.insert("profiles", {
      userId: aliceUserId,
      name: "지수",
      entityType: "person",
      tags: [],
      isStub: false,
    });
    const otherProfileId = await ctx.db.insert("profiles", {
      userId: aliceUserId,
      name: "민호",
      entityType: "person",
      tags: [],
      isStub: false,
    });

    await ctx.db.insert("notes", {
      userId: aliceUserId,
      profileId,
      mentionedEntityIds: [],
      text: "First note, oldest.",
      source: "manual",
      createdAt: 1,
    });
    await ctx.db.insert("notes", {
      userId: aliceUserId,
      profileId,
      mentionedEntityIds: [],
      text: "Second note, newest.",
      source: "manual",
      createdAt: 2,
    });
    // Belongs to a different profile of the same user — must not leak in.
    await ctx.db.insert("notes", {
      userId: aliceUserId,
      profileId: otherProfileId,
      mentionedEntityIds: [],
      text: "Note about someone else entirely.",
      source: "manual",
      createdAt: 3,
    });

    return { profileId, otherProfileId };
  });

  const result = await asAlice.query(api.profiles.withNotes, { profileId });

  expect(result).not.toBeNull();
  expect(result?.profile._id).toBe(profileId);
  expect(result?.notes.map((n) => n.text)).toEqual([
    "Second note, newest.",
    "First note, oldest.",
  ]);
});

test("should return an empty notes array, not null, for a profile with no notes", async () => {
  const t = convexTest(schema, modules);
  const aliceUserId = await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  const profileId = await t.run(async (ctx) =>
    ctx.db.insert("profiles", {
      userId: aliceUserId,
      name: "지수",
      entityType: "person",
      tags: [],
      isStub: false,
    }),
  );

  const result = await asAlice.query(api.profiles.withNotes, { profileId });

  expect(result).not.toBeNull();
  expect(result?.notes).toEqual([]);
});
