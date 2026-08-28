/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { MAX_DRAFT_CHARS, MAX_TRANSCRIPT_CHARS } from "./extractionPrompt";

const modules = import.meta.glob("./**/*.ts");

/**
 * A full, valid draft with sane defaults, so each test only overrides the
 * field it's actually exercising — mirrors the pattern in extraction.test.ts.
 */
function buildDraft(overrides: {
  primaryName?: string;
  relationshipContext?: string | null;
  firstMetDate?: string | null;
  tags?: string[];
  keyFacts?: string[];
  mentions?: {
    name: string;
    entityType?: "person" | "animal";
    relationshipContext?: string | null;
    context?: string;
  }[];
} = {}) {
  return {
    primary: {
      name: overrides.primaryName ?? "지수",
      entityType: "person" as const,
      relationshipContext: overrides.relationshipContext ?? null,
      tags: overrides.tags ?? [],
      firstMetDate: overrides.firstMetDate ?? null,
      keyFacts: overrides.keyFacts ?? [],
    },
    mentions: (overrides.mentions ?? []).map((m) => ({
      name: m.name,
      entityType: m.entityType ?? ("person" as const),
      relationshipContext: m.relationshipContext ?? null,
      context: m.context ?? "Came up in the note.",
    })),
  };
}

async function ensureUser(t: ReturnType<typeof convexTest>, identity: { subject: string; name: string; email: string }) {
  return t.withIdentity(identity).mutation(api.users.ensureUser, {});
}

const ALICE = { subject: "alice", name: "Alice", email: "alice@example.com" };
const BOB = { subject: "bob", name: "Bob", email: "bob@example.com" };

test("should create a new profile with createdProfile true and isStub false when the primary name has never been seen", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  const result = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "Met 지수 at a cafe.",
    draft: buildDraft({ primaryName: "지수" }),
    source: "voice",
  });

  expect(result.createdProfile).toBe(true);

  await t.run(async (ctx) => {
    const profile = await ctx.db.get(result.profileId);
    expect(profile).toMatchObject({ name: "지수", isStub: false });
  });
});

test("should append a second note to the same profile rather than creating a duplicate when the primary name is seen again", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  const first = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "Met Sarah Chen at a conference.",
    draft: buildDraft({ primaryName: "Sarah Chen" }),
    source: "voice",
  });
  expect(first.createdProfile).toBe(true);

  const second = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "Ran into sarah chen again.",
    draft: buildDraft({ primaryName: "sarah chen" }),
    source: "voice",
  });
  expect(second.createdProfile).toBe(false);
  expect(second.profileId).toBe(first.profileId);

  await t.run(async (ctx) => {
    const profiles = await ctx.db.query("profiles").collect();
    expect(profiles).toHaveLength(1);

    const notes = await ctx.db.query("notes").collect();
    expect(notes).toHaveLength(2);

    // Stored name keeps the original casing from the first save.
    const profile = await ctx.db.get(first.profileId);
    expect(profile?.name).toBe("Sarah Chen");
  });
});

test("should not erase existing relationshipContext, firstMetDate, or tags when a later note leaves them null or a subset", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  const first = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "Met Jisoo, a client, first met 2026-01-15.",
    draft: buildDraft({
      primaryName: "Jisoo",
      relationshipContext: "client",
      firstMetDate: "2026-01-15",
      tags: ["design"],
    }),
    source: "voice",
  });

  await asAlice.mutation(api.notes.saveCapture, {
    transcript: "Talked to Jisoo again, no new details about how we met.",
    draft: buildDraft({
      primaryName: "Jisoo",
      relationshipContext: null,
      firstMetDate: null,
      tags: ["coffee"],
    }),
    source: "voice",
  });

  await t.run(async (ctx) => {
    const profile = await ctx.db.get(first.profileId);
    expect(profile?.relationshipContext).toBe("client");
    expect(profile?.firstMetDate).toBe("2026-01-15");
    expect(profile?.tags.sort()).toEqual(["coffee", "design"]);
  });
});

test("should create a stub profile for a mentioned person and promote it to a non-stub profile when a later capture is about them", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  const first = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "Met 지수 at 민호's dinner party.",
    draft: buildDraft({
      primaryName: "지수",
      mentions: [{ name: "민호" }],
    }),
    source: "voice",
  });
  expect(first.createdMentionCount).toBe(1);

  const note1 = await t.run(async (ctx) => ctx.db.get(first.noteId));
  const stubId = note1!.mentionedEntityIds[0];

  await t.run(async (ctx) => {
    const stub = await ctx.db.get(stubId);
    expect(stub?.isStub).toBe(true);
  });

  const second = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "Caught up with 민호 one-on-one.",
    draft: buildDraft({ primaryName: "민호" }),
    source: "voice",
  });
  expect(second.createdProfile).toBe(false);
  expect(second.profileId).toBe(stubId);

  await t.run(async (ctx) => {
    const promoted = await ctx.db.get(stubId);
    expect(promoted?.isStub).toBe(false);
  });
});

test("should record mentionedEntityIds for each mention, dedupe a repeated mention name, and exclude the primary from its own mentions", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  const result = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "Dinner with 지수, 민호, and 민호 again, also 지수 was there.",
    draft: buildDraft({
      primaryName: "지수",
      mentions: [
        { name: "민호", context: "First mention." },
        { name: "민호", context: "Second mention, same person." },
        { name: "지수", context: "The primary should never appear here." },
      ],
    }),
    source: "voice",
  });

  expect(result.createdMentionCount).toBe(1);

  await t.run(async (ctx) => {
    const note = await ctx.db.get(result.noteId);
    expect(note?.mentionedEntityIds).toHaveLength(1);

    const mentioned = await ctx.db.get(note!.mentionedEntityIds[0]);
    expect(mentioned?.name).toBe("민호");

    const allProfiles = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", mentioned!.userId))
      .collect();
    // Only 지수 (primary) and 민호 (mention) — no duplicate 민호 row.
    expect(allProfiles).toHaveLength(2);
  });
});

test("should store relationshipContext and firstMetDate as absent fields, never as stored null, when the draft leaves them null", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  const result = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "Met someone new, no details yet.",
    draft: buildDraft({ primaryName: "New Person", relationshipContext: null, firstMetDate: null }),
    source: "voice",
  });

  await t.run(async (ctx) => {
    const profile = await ctx.db.get(result.profileId);
    expect(profile).not.toBeNull();
    expect("relationshipContext" in (profile as object)).toBe(false);
    expect("firstMetDate" in (profile as object)).toBe(false);
    expect(profile?.relationshipContext).toBeUndefined();
    expect(profile?.firstMetDate).toBeUndefined();
  });
});

test("should store keyFacts on the note when present and store nothing when the array is empty", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  const withFacts = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "Jisoo has a daughter starting school in March.",
    draft: buildDraft({
      primaryName: "Jisoo With Facts",
      keyFacts: ["Has a daughter starting school in March."],
    }),
    source: "voice",
  });

  const withoutFacts = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "Nothing specific to note.",
    draft: buildDraft({ primaryName: "No Facts Person", keyFacts: [] }),
    source: "voice",
  });

  await t.run(async (ctx) => {
    const noteWithFacts = await ctx.db.get(withFacts.noteId);
    expect(noteWithFacts?.keyFacts).toEqual(["Has a daughter starting school in March."]);

    const noteWithoutFacts = await ctx.db.get(withoutFacts.noteId);
    expect(noteWithoutFacts?.keyFacts).toBeUndefined();
  });
});

test("should refuse and write nothing when the transcript is empty or whitespace-only", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  await expect(
    asAlice.mutation(api.notes.saveCapture, {
      transcript: "   ",
      draft: buildDraft(),
      source: "voice",
    }),
  ).rejects.toBeInstanceOf(ConvexError);

  await t.run(async (ctx) => {
    expect(await ctx.db.query("profiles").collect()).toHaveLength(0);
    expect(await ctx.db.query("notes").collect()).toHaveLength(0);
  });
});

test("should refuse and write nothing when the primary name is empty", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  await expect(
    asAlice.mutation(api.notes.saveCapture, {
      transcript: "Garbled, unintelligible note.",
      draft: buildDraft({ primaryName: "" }),
      source: "voice",
    }),
  ).rejects.toBeInstanceOf(ConvexError);

  await t.run(async (ctx) => {
    expect(await ctx.db.query("profiles").collect()).toHaveLength(0);
    expect(await ctx.db.query("notes").collect()).toHaveLength(0);
  });
});

test("should refuse and write nothing when the transcript is longer than MAX_TRANSCRIPT_CHARS", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  const tooLong = "a".repeat(MAX_TRANSCRIPT_CHARS + 1);

  await expect(
    asAlice.mutation(api.notes.saveCapture, {
      transcript: tooLong,
      draft: buildDraft(),
      source: "voice",
    }),
  ).rejects.toBeInstanceOf(ConvexError);

  await t.run(async (ctx) => {
    expect(await ctx.db.query("profiles").collect()).toHaveLength(0);
    expect(await ctx.db.query("notes").collect()).toHaveLength(0);
  });
});

test("should refuse and write nothing when the draft has more than 32 mentions", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  const tooManyMentions = Array.from({ length: 33 }, (_, i) => ({ name: `Person ${i}` }));

  await expect(
    asAlice.mutation(api.notes.saveCapture, {
      transcript: "A note naming way too many people.",
      draft: buildDraft({ mentions: tooManyMentions }),
      source: "voice",
    }),
  ).rejects.toBeInstanceOf(ConvexError);

  await t.run(async (ctx) => {
    expect(await ctx.db.query("profiles").collect()).toHaveLength(0);
    expect(await ctx.db.query("notes").collect()).toHaveLength(0);
  });
});

test("should give user B a new profile of their own, never user A's, when both save a capture with the same primary name", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  await ensureUser(t, BOB);
  const asAlice = t.withIdentity(ALICE);
  const asBob = t.withIdentity(BOB);

  const aliceResult = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "Met 지수 at a networking event.",
    draft: buildDraft({ primaryName: "지수", tags: ["networking"] }),
    source: "voice",
  });

  const bobResult = await asBob.mutation(api.notes.saveCapture, {
    transcript: "Met 지수 too, different person entirely.",
    draft: buildDraft({ primaryName: "지수", tags: ["gym"] }),
    source: "voice",
  });

  expect(bobResult.createdProfile).toBe(true);
  expect(bobResult.profileId).not.toBe(aliceResult.profileId);

  await t.run(async (ctx) => {
    const aliceProfile = await ctx.db.get(aliceResult.profileId);
    const bobProfile = await ctx.db.get(bobResult.profileId);
    expect(aliceProfile?.userId).not.toBe(bobProfile?.userId);
    // Bob's save never touched Alice's data.
    expect(aliceProfile?.tags).toEqual(["networking"]);
    expect(bobProfile?.tags).toEqual(["gym"]);

    const allProfiles = await ctx.db.query("profiles").collect();
    expect(allProfiles).toHaveLength(2);
    const allNotes = await ctx.db.query("notes").collect();
    expect(allNotes).toHaveLength(2);
  });
});

test("should give user B their own new profile for a mentioned name, never resolving to user A's profile of the same name", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  await ensureUser(t, BOB);
  const asAlice = t.withIdentity(ALICE);
  const asBob = t.withIdentity(BOB);

  // Alice already has a profile named 민호 (created as a primary, not a stub).
  const alicePrimary = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "Met 민호 directly.",
    draft: buildDraft({ primaryName: "민호" }),
    source: "voice",
  });

  // Bob saves a capture that merely mentions someone also named 민호.
  const bobResult = await asBob.mutation(api.notes.saveCapture, {
    transcript: "Met 지수, who mentioned her friend 민호.",
    draft: buildDraft({ primaryName: "지수", mentions: [{ name: "민호" }] }),
    source: "voice",
  });

  expect(bobResult.createdMentionCount).toBe(1);

  await t.run(async (ctx) => {
    const bobNote = await ctx.db.get(bobResult.noteId);
    const bobMentionedId = bobNote!.mentionedEntityIds[0];
    expect(bobMentionedId).not.toBe(alicePrimary.profileId);

    const bobMentioned = await ctx.db.get(bobMentionedId);
    expect(bobMentioned?.userId).not.toBe((await ctx.db.get(alicePrimary.profileId))?.userId);
    expect(bobMentioned?.isStub).toBe(true);

    // Alice's profile is untouched: still not a stub, still just her one note.
    const aliceProfile = await ctx.db.get(alicePrimary.profileId);
    expect(aliceProfile?.isStub).toBe(false);
    const aliceNotes = await ctx.db
      .query("notes")
      .withIndex("by_user", (q) => q.eq("userId", aliceProfile!.userId))
      .collect();
    expect(aliceNotes).toHaveLength(1);
  });
});

test("should throw when saveCapture is called while signed out", async () => {
  const t = convexTest(schema, modules);

  await expect(
    t.mutation(api.notes.saveCapture, {
      transcript: "Some note.",
      draft: buildDraft(),
      source: "voice",
    }),
  ).rejects.toThrow();
});

test("should refuse and write nothing when the draft as a whole is larger than MAX_DRAFT_CHARS", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  // The mention count and the transcript are both well within their own limits;
  // it is the draft's own content that is oversized here, which is exactly the
  // gap this cap exists to close.
  const oversizedTag = "가".repeat(MAX_DRAFT_CHARS);

  await expect(
    asAlice.mutation(api.notes.saveCapture, {
      transcript: "A short note carrying an absurdly large draft.",
      draft: buildDraft({ tags: [oversizedTag] }),
      source: "voice",
    }),
  ).rejects.toBeInstanceOf(ConvexError);

  await t.run(async (ctx) => {
    expect(await ctx.db.query("profiles").collect()).toHaveLength(0);
    expect(await ctx.db.query("notes").collect()).toHaveLength(0);
  });
});

test("should let a direct note overwrite a relationshipContext that came from someone else's passing mention", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  // 민호 first appears only inside a note about 지수, so everything recorded
  // about him comes from a passing reference in somebody else's story.
  await asAlice.mutation(api.notes.saveCapture, {
    transcript: "지수를 민호네 집들이에서 만났다.",
    draft: buildDraft({
      primaryName: "지수",
      mentions: [{ name: "민호", relationshipContext: "acquaintance" }],
    }),
    source: "voice",
  });

  // Now a note about 민호 himself, which is a direct statement.
  await asAlice.mutation(api.notes.saveCapture, {
    transcript: "민호는 오래된 친구다.",
    draft: buildDraft({ primaryName: "민호", relationshipContext: "friend" }),
    source: "voice",
  });

  await t.run(async (ctx) => {
    const minho = (await ctx.db.query("profiles").collect()).find(
      (p) => p.name === "민호",
    );
    expect(minho).toBeDefined();
    expect(minho?.isStub).toBe(false);
    // The mention-derived value must not outrank the person's own note.
    expect(minho?.relationshipContext).toBe("friend");
  });
});

test("should drop a blanked-out key fact and store a whitespace-only relationshipContext as absent", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  // Both of these are what the review screen makes possible: a fact whose text
  // was deleted without pressing ×, and a context field left holding spaces.
  // Filtered server-side rather than on the screen, because saveCapture is a
  // public entry point a client can reach without going through that screen.
  const { profileId, noteId } = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "A note with some blanked-out edits.",
    draft: buildDraft({
      primaryName: "Blank Fields Person",
      relationshipContext: "   ",
      keyFacts: ["Real fact.", "   ", ""],
    }),
    source: "voice",
  });

  await t.run(async (ctx) => {
    const profile = await ctx.db.get("profiles", profileId);
    // Absent, not an empty string: the table spells "the note didn't say" as a
    // missing field, and a stored "" would later read as a real answer.
    expect(profile?.relationshipContext).toBeUndefined();

    const note = await ctx.db.get("notes", noteId);
    expect(note?.keyFacts).toEqual(["Real fact."]);
  });
});

test("should treat tags that differ only by case as one tag, keeping the first spelling", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  const first = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "First note about her.",
    draft: buildDraft({ primaryName: "Sarah Chen", tags: ["Cats", "Design"] }),
    source: "voice",
  });

  await asAlice.mutation(api.notes.saveCapture, {
    transcript: "Second note about her.",
    draft: buildDraft({ primaryName: "Sarah Chen", tags: ["cats", "notion"] }),
    source: "voice",
  });

  await t.run(async (ctx) => {
    const profile = await ctx.db.get("profiles", first.profileId);
    // "cats" must not join "Cats" as a second tag, and the spelling the user
    // saw first is the one that survives.
    expect(profile?.tags).toEqual(["Cats", "Design", "notion"]);
  });
});
