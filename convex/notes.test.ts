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
  primaryEntityType?: "person" | "animal";
  relationshipContext?: string | null;
  firstMetDate?: string | null;
  tags?: string[];
  keyFacts?: string[];
  mentions?: {
    name: string;
    entityType?: "person" | "animal";
    quote?: string;
  }[];
} = {}) {
  return {
    primary: {
      name: overrides.primaryName ?? "지수",
      entityType: overrides.primaryEntityType ?? ("person" as const),
      relationshipContext: overrides.relationshipContext ?? null,
      tags: overrides.tags ?? [],
      firstMetDate: overrides.firstMetDate ?? null,
      keyFacts: overrides.keyFacts ?? [],
    },
    mentions: (overrides.mentions ?? []).map((m) => ({
      name: m.name,
      entityType: m.entityType ?? ("person" as const),
      quote: m.quote ?? "came up in the note",
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

  const stubId = await t.run(async (ctx) => {
    const links = await ctx.db.query("noteMentions").collect();
    expect(links).toHaveLength(1);
    expect(links[0].noteId).toBe(first.noteId);
    const stub = await ctx.db.get("profiles", links[0].profileId);
    expect(stub?.isStub).toBe(true);
    return links[0].profileId;
  });

  const second = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "Caught up with 민호 one-on-one.",
    draft: buildDraft({ primaryName: "민호" }),
    source: "voice",
  });
  expect(second.createdProfile).toBe(false);
  expect(second.profileId).toBe(stubId);

  await t.run(async (ctx) => {
    const promoted = await ctx.db.get("profiles", stubId);
    expect(promoted?.isStub).toBe(false);
  });
});

test("should link each mention to the note with its quote, dedupe a repeated name, and exclude the primary from its own note", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  const result = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "Dinner with 지수, 민호, and 민호 again, also 지수 was there.",
    draft: buildDraft({
      primaryName: "지수",
      mentions: [
        { name: "민호", quote: "민호네 집들이에서" },
        { name: "민호", quote: "민호도 왔어" },
        { name: "지수", quote: "지수 만났는데" },
      ],
    }),
    source: "voice",
  });

  expect(result.createdMentionCount).toBe(1);

  await t.run(async (ctx) => {
    const links = await ctx.db.query("noteMentions").collect();
    // 민호 twice and 지수 (the primary) in the draft, one link out: a note never
    // lists its own subject as a mention of itself, and a repeated name is one
    // person.
    expect(links).toHaveLength(1);
    expect(links[0].noteId).toBe(result.noteId);
    // The first quote seen wins, the same way the first spelling of a tag does.
    expect(links[0].quote).toBe("민호네 집들이에서");

    const mentioned = await ctx.db.get("profiles", links[0].profileId);
    expect(mentioned?.name).toBe("민호");

    const allProfiles = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", mentioned!.userId))
      .collect();
    // Only 지수 (primary) and 민호 (mention) — no duplicate 민호 row.
    expect(allProfiles).toHaveLength(2);
  });
});

test("should store a different quote on each noteMentions row when the same person is mentioned in two different notes", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  // The quote belongs to the link, not to the mentioned profile — this is the
  // whole reason noteMentions is a table rather than an array on the profile.
  const first = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "지수를 민호네 집들이에서 만났다.",
    draft: buildDraft({
      primaryName: "지수",
      mentions: [{ name: "민호", quote: "민호네 집들이에서" }],
    }),
    source: "voice",
  });

  const second = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "오늘 민호랑 통화했다는 얘기를 지수한테 들었다.",
    draft: buildDraft({
      primaryName: "지수",
      mentions: [{ name: "민호", quote: "민호랑 통화했다는" }],
    }),
    source: "voice",
  });

  await t.run(async (ctx) => {
    const links = await ctx.db.query("noteMentions").collect();
    expect(links).toHaveLength(2);

    const byNote = new Map(links.map((link) => [link.noteId, link]));
    expect(byNote.get(first.noteId)?.quote).toBe("민호네 집들이에서");
    expect(byNote.get(second.noteId)?.quote).toBe("민호랑 통화했다는");
    // Both rows point at the same 민호 profile — it's the quote that differs,
    // not the person.
    expect(byNote.get(first.noteId)?.profileId).toBe(
      byNote.get(second.noteId)?.profileId,
    );
  });
});

test("should still create a noteMentions link when the mention's quote is empty", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  // Extraction returns "" when it couldn't copy an exact span, and migrated
  // rows have no quote at all — an empty quote is not a reason to drop the
  // person, the screens just treat it as nothing to show.
  const result = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "지수, 민호 얘기도 잠깐 나왔다.",
    draft: buildDraft({
      primaryName: "지수",
      mentions: [{ name: "민호", quote: "" }],
    }),
    source: "voice",
  });
  expect(result.createdMentionCount).toBe(1);

  await t.run(async (ctx) => {
    const links = await ctx.db.query("noteMentions").collect();
    expect(links).toHaveLength(1);
    expect(links[0].noteId).toBe(result.noteId);
    expect(links[0].quote).toBe("");

    const mentioned = await ctx.db.get("profiles", links[0].profileId);
    expect(mentioned?.name).toBe("민호");
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
    const bobLinks = (await ctx.db.query("noteMentions").collect()).filter(
      (link) => link.noteId === bobResult.noteId,
    );
    expect(bobLinks).toHaveLength(1);

    const bobMentionedId = bobLinks[0].profileId;
    // The name matched Alice's profile exactly; Bob still got his own row.
    expect(bobMentionedId).not.toBe(alicePrimary.profileId);

    const bobMentioned = await ctx.db.get("profiles", bobMentionedId);
    const aliceProfile = await ctx.db.get("profiles", alicePrimary.profileId);
    expect(bobMentioned?.userId).not.toBe(aliceProfile?.userId);
    expect(bobMentioned?.isStub).toBe(true);

    // Alice's profile is untouched: still not a stub, still just her one note.
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

test("should leave a mentioned person's profile carrying nothing but their name and kind", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  // 민호 appears only inside a note about 지수. The review screen shows a
  // mention's name and its quote and nothing else, so anything else a draft
  // claimed about him was never put in front of the user to confirm — and an
  // unconfirmed claim must not end up on a person's profile.
  await asAlice.mutation(api.notes.saveCapture, {
    transcript: "지수를 민호네 집들이에서 만났다.",
    draft: buildDraft({
      primaryName: "지수",
      mentions: [{ name: "민호", quote: "민호네 집들이에서" }],
    }),
    source: "voice",
  });

  await t.run(async (ctx) => {
    const minho = (await ctx.db.query("profiles").collect()).find(
      (p) => p.name === "민호",
    );
    expect(minho).toBeDefined();
    expect(minho?.isStub).toBe(true);
    expect(minho?.entityType).toBe("person");
    expect(minho?.tags).toEqual([]);
    expect(minho?.relationshipContext).toBeUndefined();
    expect(minho?.firstMetDate).toBeUndefined();

    // What the note did say about him is on the link, verbatim, where it can be
    // read back against the note it came from.
    const link = (await ctx.db.query("noteMentions").collect())[0];
    expect(link?.quote).toBe("민호네 집들이에서");
  });
});

test("should fill a promoted stub's relationship from its own first note by the ordinary empty-field rule", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  await asAlice.mutation(api.notes.saveCapture, {
    transcript: "지수를 민호네 집들이에서 만났다.",
    draft: buildDraft({ primaryName: "지수", mentions: [{ name: "민호" }] }),
    source: "voice",
  });

  // A note about 민호 himself. Nothing has to be overwritten for this to land:
  // the stub arrived with the field empty, so promotion needs no exception for
  // it — which is the point of the mention no longer writing one.
  await asAlice.mutation(api.notes.saveCapture, {
    transcript: "민호는 오래된 친구다.",
    draft: buildDraft({ primaryName: "민호", relationshipContext: "friend" }),
    source: "voice",
  });

  await t.run(async (ctx) => {
    const minho = (await ctx.db.query("profiles").collect()).find(
      (p) => p.name === "민호",
    );
    expect(minho?.isStub).toBe(false);
    expect(minho?.relationshipContext).toBe("friend");
  });
});

test("should let a direct note correct the kind a passing mention had to guess", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  // entityType is the one thing a stub cannot be created without, so it is the
  // one thing promotion still overwrites rather than fills.
  await asAlice.mutation(api.notes.saveCapture, {
    transcript: "지수가 콩이 얘기를 했다.",
    draft: buildDraft({
      primaryName: "지수",
      mentions: [{ name: "콩이", entityType: "person" }],
    }),
    source: "voice",
  });

  await asAlice.mutation(api.notes.saveCapture, {
    transcript: "콩이는 지수네 강아지다.",
    draft: buildDraft({ primaryName: "콩이", primaryEntityType: "animal" }),
    source: "voice",
  });

  await t.run(async (ctx) => {
    const kong = (await ctx.db.query("profiles").collect()).find(
      (p) => p.name === "콩이",
    );
    expect(kong?.isStub).toBe(false);
    // The mention guessed "person"; the note about 콩이 says otherwise and wins.
    expect(kong?.entityType).toBe("animal");
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

/**
 * Editing a note after it is saved.
 *
 * `saveCapture` takes names and never ids, so it had nothing to check. These
 * two take a note id straight from a route, which is a value anybody can type,
 * so ownership is proven here or not at all — this is the second of the two
 * join sites CLAUDE.md flags as where ownership leaks in practice.
 */
test("should return a note with its profile's name to its owner", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  const { noteId } = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "지선은 브랜딩 디자이너다.",
    draft: buildDraft({ primaryName: "지선", keyFacts: ["브랜딩 디자이너다."] }),
    source: "voice",
  });

  const result = await asAlice.query(api.notes.byId, { noteId });

  expect(result?.note.text).toBe("지선은 브랜딩 디자이너다.");
  expect(result?.note.keyFacts).toEqual(["브랜딩 디자이너다."]);
  expect(result?.profileName).toBe("지선");
});

test("should hide another user's note behind the same null as a note that does not exist", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  await ensureUser(t, BOB);

  const { noteId } = await t.withIdentity(ALICE).mutation(api.notes.saveCapture, {
    transcript: "지선은 브랜딩 디자이너다.",
    draft: buildDraft({ primaryName: "지선" }),
    source: "voice",
  });

  // Bob holds a real, valid id — the case a per-user filter alone would let
  // through, because the row exists and the query would find it.
  expect(await t.withIdentity(BOB).query(api.notes.byId, { noteId })).toBeNull();
  // Indistinguishable from a made-up id, so a valid one tells him nothing.
  expect(
    await t.withIdentity(BOB).query(api.notes.byId, { noteId: "not-an-id" }),
  ).toBeNull();
});

test("should save a corrected fact and transcript over the ones extraction wrote", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  // The measured failure this exists for: extraction moved the hardship from
  // the mother onto the person the note was filed under, and until now that
  // was permanent the moment it was saved.
  const { noteId } = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "어머니가 암에 걸리셔서 요즘 많이 힘들어 하신데",
    draft: buildDraft({
      primaryName: "지선",
      keyFacts: ["어머니가 암에 걸렸다", "어머니 때문에 요즘 힘들어하고 있다"],
    }),
    source: "voice",
  });

  await asAlice.mutation(api.notes.updateNote, {
    noteId,
    text: "어머니가 암에 걸리셔서 요즘 많이 힘들어 하신대",
    keyFacts: ["어머니가 암에 걸렸다", "어머니가 요즘 많이 힘들어하신다"],
  });

  const result = await asAlice.query(api.notes.byId, { noteId });
  expect(result?.note.text).toBe("어머니가 암에 걸리셔서 요즘 많이 힘들어 하신대");
  expect(result?.note.keyFacts).toEqual([
    "어머니가 암에 걸렸다",
    "어머니가 요즘 많이 힘들어하신다",
  ]);
});

test("should drop a fact that was blanked out, and store no facts at all rather than an empty list", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  const { noteId } = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "지선은 브랜딩 디자이너다.",
    draft: buildDraft({ primaryName: "지선", keyFacts: ["브랜딩 디자이너다."] }),
    source: "voice",
  });

  await asAlice.mutation(api.notes.updateNote, {
    noteId,
    text: "지선은 브랜딩 디자이너다.",
    keyFacts: ["   ", ""],
  });

  await t.run(async (ctx) => {
    const note = await ctx.db.get("notes", noteId);
    // Absent, not `[]`. An empty array would claim extraction ran and found
    // nothing, which is a different thing from a note that has no facts.
    expect(note?.keyFacts).toBeUndefined();
  });
});

test("should refuse to write another user's note", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  await ensureUser(t, BOB);

  const { noteId } = await t.withIdentity(ALICE).mutation(api.notes.saveCapture, {
    transcript: "지선은 브랜딩 디자이너다.",
    draft: buildDraft({ primaryName: "지선" }),
    source: "voice",
  });

  await expect(
    t.withIdentity(BOB).mutation(api.notes.updateNote, {
      noteId,
      text: "Bob was here.",
      keyFacts: [],
    }),
  ).rejects.toBeInstanceOf(ConvexError);

  await t.run(async (ctx) => {
    const note = await ctx.db.get("notes", noteId);
    expect(note?.text).toBe("지선은 브랜딩 디자이너다.");
  });
});

test("should refuse to empty a note rather than deleting it by stealth", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  const { noteId } = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "지선은 브랜딩 디자이너다.",
    draft: buildDraft({ primaryName: "지선" }),
    source: "voice",
  });

  await expect(
    asAlice.mutation(api.notes.updateNote, { noteId, text: "   ", keyFacts: [] }),
  ).rejects.toBeInstanceOf(ConvexError);
});

test("should reject a transcript longer than the capture path would have accepted", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  const { noteId } = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "지선은 브랜딩 디자이너다.",
    draft: buildDraft({ primaryName: "지선" }),
    source: "voice",
  });

  // The ceiling is repeated here rather than assumed: this is a second public
  // door into the same rows, and a caller can reach it without ever going
  // through capture.
  await expect(
    asAlice.mutation(api.notes.updateNote, {
      noteId,
      text: "가".repeat(MAX_TRANSCRIPT_CHARS + 1),
      keyFacts: [],
    }),
  ).rejects.toBeInstanceOf(ConvexError);
});

test("should take a note's mention links with it, so nothing points at a note that is gone", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  const { noteId } = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "지선을 민호네 집들이에서 만났다.",
    draft: buildDraft({
      primaryName: "지선",
      mentions: [{ name: "민호", quote: "민호네 집들이에서" }],
    }),
    source: "voice",
  });

  await asAlice.mutation(api.notes.remove, { noteId });

  await t.run(async (ctx) => {
    expect(await ctx.db.query("notes").collect()).toHaveLength(0);
    // Convex has no cascading delete. A link left behind is not inert: it is a
    // row on somebody's profile that can no longer be opened.
    expect(await ctx.db.query("noteMentions").collect()).toHaveLength(0);
  });
});

test("should remove a stub the deleted note was the last reason to keep", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  const { noteId } = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "지선을 민호네 집들이에서 만났다.",
    draft: buildDraft({ primaryName: "지선", mentions: [{ name: "민호" }] }),
    source: "voice",
  });

  const { removedStubCount } = await asAlice.mutation(api.notes.remove, { noteId });

  expect(removedStubCount).toBe(1);
  await t.run(async (ctx) => {
    const names = (await ctx.db.query("profiles").collect()).map((p) => p.name);
    // 민호 only ever existed because that note named him in passing; with it
    // gone he has no notes, no mentions and no screen that can reach him.
    expect(names).not.toContain("민호");
    // 지선 stays. She was chosen, and losing her last note is not a decision to
    // stop keeping her.
    expect(names).toContain("지선");
  });
});

test("should keep a mentioned person who is still mentioned somewhere else", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  const first = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "지선을 민호네 집들이에서 만났다.",
    draft: buildDraft({ primaryName: "지선", mentions: [{ name: "민호" }] }),
    source: "voice",
  });
  await asAlice.mutation(api.notes.saveCapture, {
    transcript: "수진이도 민호를 안다고 한다.",
    draft: buildDraft({ primaryName: "수진", mentions: [{ name: "민호" }] }),
    source: "voice",
  });

  const { removedStubCount } = await asAlice.mutation(api.notes.remove, {
    noteId: first.noteId,
  });

  expect(removedStubCount).toBe(0);
  await t.run(async (ctx) => {
    const names = (await ctx.db.query("profiles").collect()).map((p) => p.name);
    expect(names).toContain("민호");
  });
});

test("should keep a promoted stub that now has notes of its own", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  const first = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "지선을 민호네 집들이에서 만났다.",
    draft: buildDraft({ primaryName: "지선", mentions: [{ name: "민호" }] }),
    source: "voice",
  });
  // 민호 stops being a stub the moment he gets a note of his own.
  await asAlice.mutation(api.notes.saveCapture, {
    transcript: "민호는 오래된 친구다.",
    draft: buildDraft({ primaryName: "민호" }),
    source: "voice",
  });

  await asAlice.mutation(api.notes.remove, { noteId: first.noteId });

  await t.run(async (ctx) => {
    const minho = (await ctx.db.query("profiles").collect()).find(
      (p) => p.name === "민호",
    );
    expect(minho).toBeDefined();
    expect(minho?.isStub).toBe(false);
  });
});

test("should refuse to delete another user's note", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  await ensureUser(t, BOB);

  const { noteId } = await t.withIdentity(ALICE).mutation(api.notes.saveCapture, {
    transcript: "지선은 브랜딩 디자이너다.",
    draft: buildDraft({ primaryName: "지선" }),
    source: "voice",
  });

  await expect(
    t.withIdentity(BOB).mutation(api.notes.remove, { noteId }),
  ).rejects.toBeInstanceOf(ConvexError);

  await t.run(async (ctx) => {
    expect(await ctx.db.query("notes").collect()).toHaveLength(1);
  });
});

test("should keep a person the user chose even once nothing is left pointing at them", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);

  // 민호 arrives as a real profile: this note is about him.
  const own = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "민호는 오래된 친구다.",
    draft: buildDraft({ primaryName: "민호" }),
    source: "voice",
  });
  // And is separately mentioned in a note about somebody else.
  const mentioning = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "지선을 민호네 집들이에서 만났다.",
    draft: buildDraft({ primaryName: "지선", mentions: [{ name: "민호" }] }),
    source: "voice",
  });

  // Both go, in the order that empties him last: after this he has no notes
  // and no mentions, exactly like the stub in the test above. The only thing
  // separating them is that somebody decided to keep him.
  await asAlice.mutation(api.notes.remove, { noteId: own.noteId });
  const { removedStubCount } = await asAlice.mutation(api.notes.remove, {
    noteId: mentioning.noteId,
  });

  expect(removedStubCount).toBe(0);
  await t.run(async (ctx) => {
    const names = (await ctx.db.query("profiles").collect()).map((p) => p.name);
    expect(names).toContain("민호");
  });
});

/**
 * Two people who share a name.
 *
 * `saveCapture` resolves a spoken name against the caller's profiles, which was
 * an answer only while names were unique. They are not: people share them, and
 * a name saved by ear turns out to be spelled the way somebody else's already
 * is. Taking whichever row was written first files the note on a coin toss.
 */
async function twoBySameName(t: ReturnType<typeof convexTest>) {
  const asAlice = t.withIdentity(ALICE);
  const first = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "치선은 브랜딩 디자이너다.",
    draft: buildDraft({ primaryName: "치선" }),
    source: "voice",
  });
  const second = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "지선은 옆집 이웃이다.",
    draft: buildDraft({ primaryName: "지선" }),
    source: "voice",
  });
  await asAlice.mutation(api.profiles.updateProfile, {
    profileId: second.profileId,
    name: "치선",
    entityType: "person",
    relationshipContext: "이웃",
    firstMetDate: "",
    tags: [],
  });
  return { first: first.profileId, second: second.profileId };
}

test("should refuse to guess which of two people by the same name a note is about", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);
  await twoBySameName(t);

  await expect(
    asAlice.mutation(api.notes.saveCapture, {
      transcript: "치선을 오늘 만났다.",
      draft: buildDraft({ primaryName: "치선" }),
      source: "voice",
    }),
  ).rejects.toBeInstanceOf(ConvexError);

  await t.run(async (ctx) => {
    // Nothing half-written: the note is not saved under one of them "for now".
    expect(await ctx.db.query("notes").collect()).toHaveLength(2);
  });
});

test("should file the note on the person the caller picked", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);
  const { second } = await twoBySameName(t);

  const saved = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "치선을 오늘 만났다.",
    draft: buildDraft({ primaryName: "치선" }),
    source: "voice",
    resolutions: [{ name: "치선", profileId: second }],
  });

  // The one the person who was there chose, not the one written first.
  expect(saved.profileId).toBe(second);
  expect(saved.createdProfile).toBe(false);
});

test("should settle an ambiguous mention by the same answer, not a second mechanism", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);
  const { first } = await twoBySameName(t);

  const saved = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "민호를 치선이랑 같이 봤다.",
    draft: buildDraft({
      primaryName: "민호",
      mentions: [{ name: "치선", quote: "치선이랑 같이" }],
    }),
    source: "voice",
    // Keyed by name, so the primary and every mention are settled the same way.
    resolutions: [{ name: "치선", profileId: first }],
  });

  await t.run(async (ctx) => {
    const links = (await ctx.db.query("noteMentions").collect()).filter(
      (link) => link.noteId === saved.noteId,
    );
    expect(links).toHaveLength(1);
    expect(links[0]?.profileId).toBe(first);
  });
});

test("should refuse an answer naming somebody else's profile", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  await ensureUser(t, BOB);
  await twoBySameName(t);

  const bobsOwn = await t.withIdentity(BOB).mutation(api.notes.saveCapture, {
    transcript: "치선은 내 친구다.",
    draft: buildDraft({ primaryName: "치선" }),
    source: "voice",
  });

  // The first id this mutation has ever accepted, so this is the check that
  // has to hold: an id is only ever a way to choose among the caller's own.
  await expect(
    t.withIdentity(ALICE).mutation(api.notes.saveCapture, {
      transcript: "치선을 오늘 만났다.",
      draft: buildDraft({ primaryName: "치선" }),
      source: "voice",
      resolutions: [{ name: "치선", profileId: bobsOwn.profileId }],
    }),
  ).rejects.toBeInstanceOf(ConvexError);
});

test("should refuse an answer that does not go by the name it claims to settle", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);
  await twoBySameName(t);

  const other = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "민호는 오래된 친구다.",
    draft: buildDraft({ primaryName: "민호" }),
    source: "voice",
  });

  // A stale screen: the name was edited after the choice was made, so the
  // answer now points at somebody this note never mentions.
  await expect(
    asAlice.mutation(api.notes.saveCapture, {
      transcript: "치선을 오늘 만났다.",
      draft: buildDraft({ primaryName: "치선" }),
      source: "voice",
      resolutions: [{ name: "치선", profileId: other.profileId }],
    }),
  ).rejects.toBeInstanceOf(ConvexError);
});

test("should still create somebody new without asking, when nobody answers to the name", async () => {
  const t = convexTest(schema, modules);
  await ensureUser(t, ALICE);
  const asAlice = t.withIdentity(ALICE);
  await twoBySameName(t);

  // Only a name two people answer to is a question. One match, or none, is not.
  const saved = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "수진을 오늘 처음 만났다.",
    draft: buildDraft({ primaryName: "수진" }),
    source: "voice",
  });

  expect(saved.createdProfile).toBe(true);
});
