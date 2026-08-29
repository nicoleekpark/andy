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
      text: "First note, oldest.",
      source: "manual",
      createdAt: 1,
    });
    await ctx.db.insert("notes", {
      userId: aliceUserId,
      profileId,
      text: "Second note, newest.",
      source: "manual",
      createdAt: 2,
    });
    // Belongs to a different profile of the same user — must not leak in.
    await ctx.db.insert("notes", {
      userId: aliceUserId,
      profileId: otherProfileId,
      text: "Note about someone else entirely.",
      source: "manual",
      createdAt: 3,
    });

    return { profileId, otherProfileId };
  });

  const result = await asAlice.query(api.profiles.withNotes, { profileId });

  expect(result).not.toBeNull();
  expect(result?.profile._id).toBe(profileId);
  expect(result?.notes.map((entry) => entry.note.text)).toEqual([
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

test("should exclude a profile that exists only because it was mentioned in another note", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  // The stub is created the way the app really creates one: as a mention on
  // someone else's saved capture, not a direct insert.
  await asAlice.mutation(api.notes.saveCapture, {
    transcript: "Met 지수 at 민호's dinner party.",
    draft: {
      primary: {
        name: "지수",
        entityType: "person",
        relationshipContext: null,
        tags: [],
        firstMetDate: null,
        keyFacts: [],
      },
      mentions: [
        {
          name: "민호",
          entityType: "person",
          quote: "언급된 자리",
        },
      ],
    },
    source: "voice",
  });

  const result = await asAlice.query(api.profiles.recent, {});

  // Only 지수, who was actually recorded, appears — 민호 is a real row (a
  // stub) but never chosen, so home must not show him.
  expect(result).toHaveLength(1);
  expect(result[0]?.profile.name).toBe("지수");
});

test("should order by most recent note rather than by profile creation order, and count only each profile's own notes", async () => {
  const t = convexTest(schema, modules);
  const aliceUserId = await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  // Created in this order: A first, B second. If the sort were dropped, the
  // handler's own scan order (by creation) would return A before B — the
  // opposite of what the note timestamps below demand.
  const { profileA, profileB } = await t.run(async (ctx) => {
    const profileA = await ctx.db.insert("profiles", {
      userId: aliceUserId,
      name: "A",
      entityType: "person",
      tags: [],
      isStub: false,
    });
    const profileB = await ctx.db.insert("profiles", {
      userId: aliceUserId,
      name: "B",
      entityType: "person",
      tags: [],
      isStub: false,
    });

    // A has two notes of its own; B has one. B's single note is the most
    // recent thing written about anyone, so B must sort first despite being
    // created after A and having fewer notes.
    await ctx.db.insert("notes", {
      userId: aliceUserId,
      profileId: profileA,
      text: "A, first note.",
      source: "manual",
      createdAt: 1,
    });
    await ctx.db.insert("notes", {
      userId: aliceUserId,
      profileId: profileA,
      text: "A, second note.",
      source: "manual",
      createdAt: 2,
    });
    await ctx.db.insert("notes", {
      userId: aliceUserId,
      profileId: profileB,
      text: "B, only note, newest overall.",
      source: "manual",
      createdAt: 3,
    });

    return { profileA, profileB };
  });

  const result = await asAlice.query(api.profiles.recent, {});

  expect(result.map((r) => r.profile._id)).toEqual([profileB, profileA]);
  const byId = new Map(result.map((r) => [r.profile._id, r]));
  expect(byId.get(profileB)?.noteCount).toBe(1);
  expect(byId.get(profileA)?.noteCount).toBe(2);
  expect(byId.get(profileB)?.lastNoteAt).toBe(3);
  expect(byId.get(profileA)?.lastNoteAt).toBe(2);
});

test("should populate both directions of a mention: the note lists who came up in it, and the mentioned profile's mentionedIn lists that note with the same quote", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  const jisoo = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "지수를 민호네 집들이에서 만났다.",
    draft: {
      primary: {
        name: "지수",
        entityType: "person",
        relationshipContext: null,
        tags: [],
        firstMetDate: null,
        keyFacts: [],
      },
      mentions: [
        {
          name: "민호",
          entityType: "person",
          quote: "민호네 집들이에서",
        },
      ],
    },
    source: "voice",
  });

  const minhoId = await t.run(async (ctx) => {
    const links = await ctx.db.query("noteMentions").collect();
    expect(links).toHaveLength(1);
    return links[0].profileId;
  });

  const jisooResult = await asAlice.query(api.profiles.withNotes, {
    profileId: jisoo.profileId,
  });
  expect(jisooResult?.notes).toHaveLength(1);
  expect(jisooResult?.notes[0]?.mentions).toEqual([
    { profileId: minhoId, name: "민호", quote: "민호네 집들이에서" },
  ]);

  const minhoResult = await asAlice.query(api.profiles.withNotes, {
    profileId: minhoId,
  });
  // 민호 has no note of his own yet — he's a stub — but the other direction
  // shows where he came up.
  expect(minhoResult?.notes).toEqual([]);
  expect(minhoResult?.mentionedIn).toEqual([
    {
      noteId: jisoo.noteId,
      createdAt: expect.any(Number),
      quote: "민호네 집들이에서",
      aboutProfileId: jisoo.profileId,
      aboutName: "지수",
    },
  ]);
});

test("should never show a profile's own note in its own mentionedIn", async () => {
  const t = convexTest(schema, modules);
  const aliceUserId = await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  // saveCapture never lets a note list its own subject as a mention of
  // itself, so this shape can only be reached by a bad write elsewhere — the
  // query's own guard (`source.profileId !== profileId`) is what's under test
  // here, not saveCapture's dedupe.
  const { profileId, noteId } = await t.run(async (ctx) => {
    const profileId = await ctx.db.insert("profiles", {
      userId: aliceUserId,
      name: "지수",
      entityType: "person",
      tags: [],
      isStub: false,
    });
    const noteId = await ctx.db.insert("notes", {
      userId: aliceUserId,
      profileId,
      text: "A note about 지수 herself.",
      source: "manual",
      createdAt: 1,
    });
    await ctx.db.insert("noteMentions", {
      userId: aliceUserId,
      noteId,
      profileId,
      quote: "shouldn't count as a mention of herself",
    });
    return { profileId, noteId };
  });

  const result = await asAlice.query(api.profiles.withNotes, { profileId });

  expect(result?.mentionedIn).toEqual([]);
  // The timeline itself is unaffected — this is her own note, so it still
  // shows there, just not doubled into mentionedIn.
  expect(result?.notes.map((entry) => entry.note._id)).toEqual([noteId]);
});

test("should return mentionedIn newest first", async () => {
  const t = convexTest(schema, modules);
  const aliceUserId = await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  // Built directly rather than through two saveCapture calls: that mutation
  // stamps `createdAt` from `Date.now()`, and two calls in the same test can
  // land in the same millisecond, which would make this test pass or fail by
  // timing luck rather than by what the sort actually does.
  const { minhoId, olderNoteId, newerNoteId } = await t.run(async (ctx) => {
    const jisooId = await ctx.db.insert("profiles", {
      userId: aliceUserId,
      name: "지수",
      entityType: "person",
      tags: [],
      isStub: false,
    });
    const hyunwooId = await ctx.db.insert("profiles", {
      userId: aliceUserId,
      name: "현우",
      entityType: "person",
      tags: [],
      isStub: false,
    });
    const minhoId = await ctx.db.insert("profiles", {
      userId: aliceUserId,
      name: "민호",
      entityType: "person",
      tags: [],
      isStub: true,
    });

    const olderNoteId = await ctx.db.insert("notes", {
      userId: aliceUserId,
      profileId: jisooId,
      text: "지수 얘기 중 민호가 나왔다.",
      source: "manual",
      createdAt: 1,
    });
    const newerNoteId = await ctx.db.insert("notes", {
      userId: aliceUserId,
      profileId: hyunwooId,
      text: "현우 얘기 중에도 민호가 또 나왔다.",
      source: "manual",
      createdAt: 2,
    });

    await ctx.db.insert("noteMentions", {
      userId: aliceUserId,
      noteId: olderNoteId,
      profileId: minhoId,
      quote: "older mention",
    });
    await ctx.db.insert("noteMentions", {
      userId: aliceUserId,
      noteId: newerNoteId,
      profileId: minhoId,
      quote: "newer mention",
    });

    return { minhoId, olderNoteId, newerNoteId };
  });

  const result = await asAlice.query(api.profiles.withNotes, {
    profileId: minhoId,
  });

  expect(result?.mentionedIn.map((entry) => entry.noteId)).toEqual([
    newerNoteId,
    olderNoteId,
  ]);
});

test("should never let one user's note mentioning a name leak into another user's identically named profile's mentionedIn", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  await ensureUser(t, BOB);
  const asAlice = t.withIdentity(ALICE);
  const asBob = t.withIdentity(BOB);

  // Alice mentions "민호" inside her own note about 지수 — creates Alice's own
  // stub profile named 민호.
  await asAlice.mutation(api.notes.saveCapture, {
    transcript: "지수를 민호네 집들이에서 만났다.",
    draft: {
      primary: {
        name: "지수",
        entityType: "person",
        relationshipContext: null,
        tags: [],
        firstMetDate: null,
        keyFacts: [],
      },
      mentions: [
        {
          name: "민호",
          entityType: "person",
          quote: "민호네 집들이에서",
        },
      ],
    },
    source: "voice",
  });

  // Bob has his own, unrelated 민호 — a direct profile, same name, different
  // person entirely, different owner.
  const bobMinho = await asBob.mutation(api.notes.saveCapture, {
    transcript: "민호를 직접 만났다.",
    draft: {
      primary: {
        name: "민호",
        entityType: "person",
        relationshipContext: null,
        tags: [],
        firstMetDate: null,
        keyFacts: [],
      },
      mentions: [],
    },
    source: "voice",
  });

  const result = await asBob.query(api.profiles.withNotes, {
    profileId: bobMinho.profileId,
  });

  // Same property withNotes already protects for notes, on the new link
  // table's surface: Alice's note about 지수 must never show up here just
  // because both profiles happen to be named 민호.
  expect(result?.mentionedIn).toEqual([]);
});

test("should throw when recent is called while signed out", async () => {
  const t = convexTest(schema, modules);

  await expect(t.query(api.profiles.recent, {})).rejects.toThrow();
});

test("should never include another user's profiles", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  await ensureUser(t, BOB);
  const asAlice = t.withIdentity(ALICE);
  const asBob = t.withIdentity(BOB);

  await asBob.mutation(api.notes.saveCapture, {
    transcript: "Bob's own note about someone.",
    draft: {
      primary: {
        name: "Bob's Friend",
        entityType: "person",
        relationshipContext: null,
        tags: [],
        firstMetDate: null,
        keyFacts: [],
      },
      mentions: [],
    },
    source: "voice",
  });

  const result = await asAlice.query(api.profiles.recent, {});

  expect(result).toEqual([]);
});

test("should cap mentionedIn at the five most recent and report the true total", async () => {
  const t = convexTest(schema, modules);
  const aliceUserId = await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  // Seven notes about seven different people, each mentioning 민호. Built
  // directly so `createdAt` is explicit — `saveCapture` stamps Date.now(), and
  // seven calls in one test would land in the same millisecond and make the
  // "most recent" claim depend on a tie.
  const minhoId = await t.run(async (ctx) => {
    const minho = await ctx.db.insert("profiles", {
      userId: aliceUserId,
      name: "민호",
      entityType: "person",
      tags: [],
      isStub: true,
    });

    for (let i = 1; i <= 7; i += 1) {
      const speakerId = await ctx.db.insert("profiles", {
        userId: aliceUserId,
        name: `Speaker ${i}`,
        entityType: "person",
        tags: [],
        isStub: false,
      });
      const noteId = await ctx.db.insert("notes", {
        userId: aliceUserId,
        profileId: speakerId,
        text: `Note ${i}`,
        source: "manual",
        createdAt: i,
      });
      await ctx.db.insert("noteMentions", {
        userId: aliceUserId,
        noteId,
        profileId: minho,
        quote: `quote ${i}`,
      });
    }

    return minho;
  });

  const result = await asAlice.query(api.profiles.withNotes, {
    profileId: minhoId,
  });

  expect(result?.mentionedIn).toHaveLength(5);
  // The count is the point of truncating: five shown, seven there.
  expect(result?.mentionedInTotal).toBe(7);
  // The five kept are the newest, not the first five found.
  expect(result?.mentionedIn.map((entry) => entry.quote)).toEqual([
    "quote 7",
    "quote 6",
    "quote 5",
    "quote 4",
    "quote 3",
  ]);
});
