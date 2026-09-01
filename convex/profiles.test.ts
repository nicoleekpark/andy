/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
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
      autoCreated: false,
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
      autoCreated: false,
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
      autoCreated: false,
    });
    const otherProfileId = await ctx.db.insert("profiles", {
      userId: aliceUserId,
      name: "민호",
      entityType: "person",
      tags: [],
      autoCreated: false,
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
      autoCreated: false,
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
      autoCreated: false,
    });
    const profileB = await ctx.db.insert("profiles", {
      userId: aliceUserId,
      name: "B",
      entityType: "person",
      tags: [],
      autoCreated: false,
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
      autoCreated: false,
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
      autoCreated: false,
    });
    const hyunwooId = await ctx.db.insert("profiles", {
      userId: aliceUserId,
      name: "현우",
      entityType: "person",
      tags: [],
      autoCreated: false,
    });
    const minhoId = await ctx.db.insert("profiles", {
      userId: aliceUserId,
      name: "민호",
      entityType: "person",
      tags: [],
      autoCreated: true,
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
      autoCreated: true,
    });

    for (let i = 1; i <= 7; i += 1) {
      const speakerId = await ctx.db.insert("profiles", {
        userId: aliceUserId,
        name: `Speaker ${i}`,
        entityType: "person",
        tags: [],
        autoCreated: false,
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

/**
 * `updateProfile` — the second function to take a profile id from a route, and
 * the first to write through one. `withNotes` only had to refuse to *show*
 * somebody else's row; this one has to refuse to change it.
 */
function capture(name: string, overrides: Record<string, unknown> = {}) {
  return {
    transcript: `${name} 이야기.`,
    draft: {
      primary: {
        name,
        entityType: "person" as const,
        relationshipContext: null,
        tags: [],
        firstMetDate: null,
        keyFacts: [],
        ...overrides,
      },
      mentions: [],
    },
    source: "voice" as const,
  };
}

test("should write every edited field, and clear the ones left empty", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  const { profileId } = await asAlice.mutation(
    api.notes.saveCapture,
    capture("JOE KING", { relationshipContext: "networking", firstMetDate: "2026-08-27" }),
  );

  await asAlice.mutation(api.profiles.updateProfile, {
    profileId,
    name: "Joe King",
    entityType: "person",
    relationshipContext: "",
    firstMetDate: "",
    tags: ["cleaning", "Cleaning", "  professional  "],
  });

  await t.run(async (ctx) => {
    const profile = await ctx.db.get("profiles", profileId);
    expect(profile?.name).toBe("Joe King");
    // Absent, not "". The table spells "not known" as a missing field, and a
    // stored empty string would be a third state nothing else reads.
    expect(profile?.relationshipContext).toBeUndefined();
    expect(profile?.firstMetDate).toBeUndefined();
    // Deduplicated the way a capture merges them, first spelling kept, trimmed.
    expect(profile?.tags).toEqual(["cleaning", "professional"]);
  });
});

test("should allow a rename onto a name the user already keeps", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  await asAlice.mutation(api.notes.saveCapture, capture("치선"));
  const { profileId } = await asAlice.mutation(api.notes.saveCapture, capture("지선"));

  // Two people share a name. An address book that refuses the second one is
  // telling the user their friend does not exist, and the case that forces it
  // is ordinary: a name written down by ear turns out to be spelled the way
  // somebody else's already is.
  await asAlice.mutation(api.profiles.updateProfile, {
    profileId,
    name: "치선",
    entityType: "person",
    relationshipContext: "",
    firstMetDate: "",
    tags: [],
  });

  await t.run(async (ctx) => {
    const names = (await ctx.db.query("profiles").collect()).map((p) => p.name);
    expect(names.filter((n) => n === "치선")).toHaveLength(2);
  });
});

test("should allow saving a profile without renaming it", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  const { profileId } = await asAlice.mutation(api.notes.saveCapture, capture("지선"));

  // The clash check has to exclude the row being edited, or editing anything
  // else about a person would be blocked by their own name.
  await asAlice.mutation(api.profiles.updateProfile, {
    profileId,
    name: "지선",
    entityType: "person",
    relationshipContext: "friend",
    firstMetDate: "",
    tags: [],
  });

  await t.run(async (ctx) => {
    expect((await ctx.db.get("profiles", profileId))?.relationshipContext).toBe("friend");
  });
});

test("should refuse an empty name and a date that is not a date", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  const { profileId } = await asAlice.mutation(api.notes.saveCapture, capture("지선"));
  const base = {
    profileId,
    entityType: "person" as const,
    relationshipContext: "",
    firstMetDate: "",
    tags: [],
  };

  await expect(
    asAlice.mutation(api.profiles.updateProfile, { ...base, name: "   " }),
  ).rejects.toBeInstanceOf(ConvexError);
  await expect(
    asAlice.mutation(api.profiles.updateProfile, {
      ...base,
      name: "지선",
      firstMetDate: "last August",
    }),
  ).rejects.toBeInstanceOf(ConvexError);
});

test("should stop being a stub once somebody edits it by hand", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  await asAlice.mutation(api.notes.saveCapture, {
    transcript: "지선을 민호네 집들이에서 만났다.",
    draft: {
      primary: {
        name: "지선",
        entityType: "person" as const,
        relationshipContext: null,
        tags: [],
        firstMetDate: null,
        keyFacts: [],
      },
      mentions: [{ name: "민호", entityType: "person" as const, quote: "민호네" }],
    },
    source: "voice" as const,
  });

  const minho = await t.run(async (ctx) =>
    (await ctx.db.query("profiles").collect()).find((p) => p.name === "민호"),
  );
  expect(minho?.autoCreated).toBe(true);

  await asAlice.mutation(api.profiles.updateProfile, {
    profileId: minho!._id,
    name: "민호",
    entityType: "person",
    relationshipContext: "friend",
    firstMetDate: "",
    tags: [],
  });

  await t.run(async (ctx) => {
    // Editing somebody by hand is choosing to keep them, which is what autoCreated
    // means. Left true, they would vanish when the note that named them went.
    expect((await ctx.db.get("profiles", minho!._id))?.autoCreated).toBe(false);
  });
});

test("should refuse to write another user's profile", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  await ensureUser(t, BOB);

  const { profileId } = await t
    .withIdentity(ALICE)
    .mutation(api.notes.saveCapture, capture("지선"));

  await expect(
    t.withIdentity(BOB).mutation(api.profiles.updateProfile, {
      profileId,
      name: "Bob's friend",
      entityType: "person",
      relationshipContext: "",
      firstMetDate: "",
      tags: [],
    }),
  ).rejects.toBeInstanceOf(ConvexError);

  await t.run(async (ctx) => {
    expect((await ctx.db.get("profiles", profileId))?.name).toBe("지선");
  });
});

test("should not let one user's name block another user's", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  await ensureUser(t, BOB);

  await t.withIdentity(ALICE).mutation(api.notes.saveCapture, capture("민호"));
  const { profileId } = await t
    .withIdentity(BOB)
    .mutation(api.notes.saveCapture, capture("지선"));

  // The clash check is scoped to the caller's own rows. Anything wider would
  // leak whether a stranger keeps somebody by that name.
  await t.withIdentity(BOB).mutation(api.profiles.updateProfile, {
    profileId,
    name: "민호",
    entityType: "person",
    relationshipContext: "",
    firstMetDate: "",
    tags: [],
  });

  await t.run(async (ctx) => {
    expect((await ctx.db.get("profiles", profileId))?.name).toBe("민호");
  });
});

test("should refuse to write another user's profile", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  await ensureUser(t, BOB);

  const { profileId } = await t
    .withIdentity(ALICE)
    .mutation(api.notes.saveCapture, capture("지선"));

  await expect(
    t.withIdentity(BOB).mutation(api.profiles.updateProfile, {
      profileId,
      name: "Bob's friend",
      entityType: "person",
      relationshipContext: "",
      firstMetDate: "",
      tags: [],
    }),
  ).rejects.toBeInstanceOf(ConvexError);

  await t.run(async (ctx) => {
    expect((await ctx.db.get("profiles", profileId))?.name).toBe("지선");
  });
});

test("should not let one user's name block another user's", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  await ensureUser(t, BOB);

  await t.withIdentity(ALICE).mutation(api.notes.saveCapture, capture("민호"));
  const { profileId } = await t
    .withIdentity(BOB)
    .mutation(api.notes.saveCapture, capture("지선"));

  // The clash check is scoped to the caller's own rows. Anything wider would
  // leak whether a stranger keeps somebody by that name.
  await t.withIdentity(BOB).mutation(api.profiles.updateProfile, {
    profileId,
    name: "민호",
    entityType: "person",
    relationshipContext: "",
    firstMetDate: "",
    tags: [],
  });

  await t.run(async (ctx) => {
    expect((await ctx.db.get("profiles", profileId))?.name).toBe("민호");
  });
});


/**
 * `resolveNames` — what the capture screen asks before it saves: who each name
 * in the draft would land on, and whether it lands on anybody at all.
 */
test("should ask only about names more than one person answers to", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  const first = await asAlice.mutation(api.notes.saveCapture, capture("치선"));
  const second = await asAlice.mutation(api.notes.saveCapture, capture("지선"));
  await asAlice.mutation(api.profiles.updateProfile, {
    profileId: second.profileId,
    name: "치선",
    entityType: "person",
    relationshipContext: "이웃",
    firstMetDate: "",
    tags: [],
  });

  const asked = await asAlice.query(api.profiles.resolveNames, {
    names: ["치선", "민호", "치선"],
  });

  // Two names, not three: the repeat is the same question asked twice.
  expect(asked).toHaveLength(2);
  const chiseon = asked.find((one) => one.name === "치선");
  expect(chiseon?.candidates.map((c) => c.profileId).sort()).toEqual(
    [first.profileId, second.profileId].sort(),
  );
  // 민호 is nobody yet. Returned with no candidates rather than left out — the
  // absence is what tells the screen a new person is about to be invented,
  // which is how a misheard name gets noticed before it becomes one.
  expect(asked.find((one) => one.name === "민호")?.candidates).toEqual([]);
  // Identical names are not a choice — what separates them has to come too.
  const neighbour = asked[0]?.candidates.find((c) => c.relationshipContext === "이웃");
  expect(neighbour?.noteCount).toBe(1);
  expect(neighbour?.lastNoteAt).not.toBeNull();
});

test("should not offer another user's people as candidates", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  await ensureUser(t, BOB);

  await t.withIdentity(ALICE).mutation(api.notes.saveCapture, capture("치선"));
  await t.withIdentity(ALICE).mutation(api.notes.saveCapture, capture("민호"));
  await t.withIdentity(BOB).mutation(api.notes.saveCapture, capture("치선"));

  // Bob keeps exactly one 치선, so there is nothing to ask him. Counting
  // Alice's would both invent a question and tell him a stranger keeps
  // somebody by that name.
  const asked = await t
    .withIdentity(BOB)
    .query(api.profiles.resolveNames, { names: ["치선"] });
  expect(asked[0]?.candidates).toHaveLength(1);
});
