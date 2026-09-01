import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { matchKey, mergeTags } from "./naming";
import schema from "./schema";
import { getAuthenticatedUser } from "./users";
import {
  MAX_DRAFT_CHARS,
  MAX_TRANSCRIPT_CHARS,
  draftValidator,
} from "./extractionPrompt";

/**
 * Writing a capture to the database — the step where an extracted draft stops
 * being a suggestion and becomes the user's data.
 *
 * The shape of this file is set by one rule from CLAUDE.md: Convex has no
 * row-level security, so ownership is enforced here, by hand, on every read and
 * every write. The strongest version of that is not to *check* ids but to never
 * accept them: this mutation takes people's **names**, resolves them against
 * the caller's own profiles, and creates what is missing. There is no argument
 * through which one user could reach another user's row, so there is nothing to
 * forget to check.
 */

const MAX_MENTIONS = 32;

export const saveCapture = mutation({
  args: {
    /** What was actually said. Stored verbatim as the note's body. */
    transcript: v.string(),
    /** The draft, as the user confirmed it — not necessarily as Claude wrote it. */
    draft: draftValidator,
    source: v.union(
      v.literal("voice"),
      v.literal("manual"),
      v.literal("business_card"),
      v.literal("calendar_nudge"),
    ),
  },
  returns: v.object({
    profileId: v.id("profiles"),
    noteId: v.id("notes"),
    /** True when this capture created the primary profile rather than appending. */
    createdProfile: v.boolean(),
    /** How many mentioned people were new, so the UI can say what it did. */
    createdMentionCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    const text = args.transcript.trim();
    if (text === "") {
      throw new ConvexError("There's nothing to save yet.");
    }
    // Same ceiling the extraction action applies. Repeated rather than assumed:
    // this is a separate public entry point, and a client could call it without
    // ever going through extraction.
    if (text.length > MAX_TRANSCRIPT_CHARS) {
      throw new ConvexError(
        "That note is longer than Andy can take in one go. Try splitting it into two.",
      );
    }

    // A fact the user blanked out instead of deleting is a fact they removed.
    // Filtered here rather than on the screen because this mutation is a public
    // entry point in its own right.
    const keyFacts = args.draft.primary.keyFacts
      .map((fact) => fact.trim())
      .filter((fact) => fact !== "");

    const relationshipContext =
      args.draft.primary.relationshipContext?.trim() || null;

    const primaryName = args.draft.primary.name.trim();
    if (primaryName === "") {
      // Extraction returns an empty name when a note is too garbled to identify
      // anyone. Saving that would create a nameless profile nobody can ever
      // find again.
      throw new ConvexError(
        "Andy couldn't tell who this note is about. Add a name and try again.",
      );
    }

    if (JSON.stringify(args.draft).length > MAX_DRAFT_CHARS) {
      throw new ConvexError(
        "There's more detail in that note than Andy can save at once. Try splitting it into two.",
      );
    }

    if (args.draft.mentions.length > MAX_MENTIONS) {
      throw new ConvexError(
        "That note mentions too many people at once. Try splitting it into two.",
      );
    }

    // One scan of the caller's own profiles, reused for the primary and every
    // mention. `by_user` is the only way in, so nothing outside this user's
    // data is ever in scope to be matched against.
    const owned = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const byName = new Map<string, Doc<"profiles">>();
    for (const profile of owned) {
      // First writer wins, so a pre-existing duplicate name resolves to the
      // same row every time rather than alternating between them.
      if (!byName.has(matchKey(profile.name))) {
        byName.set(matchKey(profile.name), profile);
      }
    }

    const { primary } = args.draft;
    const existing = byName.get(matchKey(primaryName)) ?? null;

    let profileId: Id<"profiles">;
    let createdProfile = false;

    if (existing === null) {
      profileId = await ctx.db.insert("profiles", {
        userId: user._id,
        name: primaryName,
        entityType: primary.entityType,
        // `null` is extraction's "the note didn't say"; the table spells that
        // as an absent field. Converting here keeps the two conventions from
        // leaking into each other.
        relationshipContext: relationshipContext ?? undefined,
        tags: mergeTags([], primary.tags),
        firstMetDate: primary.firstMetDate ?? undefined,
        isStub: false,
      });
      createdProfile = true;
    } else {
      profileId = existing._id;

      // Appending to someone who already exists must not overwrite what is
      // already known about them. A later note that simply doesn't repeat a
      // detail is not a statement that the detail was wrong — so fields are
      // only filled in when empty, and tags accumulate.
      const patch: Partial<Doc<"profiles">> = {};

      if (existing.isStub) {
        // They were created from a passing mention and now have a note of their
        // own, so they are a real profile from here on.
        patch.isStub = false;
        // The one field promotion overwrites rather than fills, and only
        // because the table requires it: a stub had to be inserted with some
        // entityType before anybody had said what this person is, so the value
        // sitting there is a guess made from somebody else's note. A note about
        // them is a direct statement and outranks it.
        //
        // Nothing else needs an exception. A stub carries no relationship, no
        // tags and no dates — a mention no longer claims any of those — so the
        // ordinary fill-when-empty rules below are already right for it.
        patch.entityType = primary.entityType;
      }

      if (
        existing.relationshipContext === undefined &&
        relationshipContext !== null
      ) {
        patch.relationshipContext = relationshipContext;
      }
      if (existing.firstMetDate === undefined && primary.firstMetDate !== null) {
        patch.firstMetDate = primary.firstMetDate;
      }

      const merged = mergeTags(existing.tags, primary.tags);
      if (merged.length !== existing.tags.length) {
        patch.tags = merged;
      }

      if (Object.keys(patch).length > 0) {
        await ctx.db.patch("profiles", profileId, patch);
      }
    }

    // Mentions become real rows so that "who was at that dinner" is answerable
    // later, but they are marked `isStub` until they get a note of their own —
    // the difference between someone the user recorded and someone who merely
    // came up. The link itself is written after the note exists, since it needs
    // the note's id.
    const links: { profileId: Id<"profiles">; quote: string }[] = [];
    const seen = new Set<string>([matchKey(primaryName)]);
    let createdMentionCount = 0;

    for (const mention of args.draft.mentions) {
      const name = mention.name.trim();
      const key = matchKey(name);
      // Skip the unnamed, the repeated, and anyone who is really the primary —
      // a note must never list its own subject as a mention of itself.
      if (name === "" || seen.has(key)) {
        continue;
      }
      seen.add(key);

      const quote = mention.quote.trim();

      const found = byName.get(key);
      if (found !== undefined) {
        links.push({ profileId: found._id, quote });
        continue;
      }

      // Name, kind and nothing else. Whatever the note implied about how the
      // speaker knows this person was never shown on the review screen, so
      // storing it would put an unconfirmed claim on their profile — and the
      // link's quote already records how they came up, in the note's own words.
      const stubId = await ctx.db.insert("profiles", {
        userId: user._id,
        name,
        entityType: mention.entityType,
        tags: [],
        isStub: true,
      });
      links.push({ profileId: stubId, quote });
      createdMentionCount += 1;

      // So a second mention of the same new person in this same note resolves
      // to the row just created instead of inserting them twice.
      const inserted = await ctx.db.get("profiles", stubId);
      if (inserted !== null) {
        byName.set(key, inserted);
      }
    }

    const noteId = await ctx.db.insert("notes", {
      userId: user._id,
      profileId,
      text,
      // Empty rather than absent would claim "extraction ran and found nothing",
      // which is a different thing from a note that never had an extraction.
      keyFacts: keyFacts.length > 0 ? keyFacts : undefined,
      source: args.source,
      // The moment of capture. `createdAt` exists separately from
      // `_creationTime` so a note can later be backdated to when the
      // conversation actually happened; nothing does that yet.
      createdAt: Date.now(),
    });

    // After the note, because each link points at it. `userId` is stamped on
    // the link as well as on both ends: Convex has no foreign keys, so a read
    // filtering by owner must be able to do so without first loading the note.
    for (const link of links) {
      await ctx.db.insert("noteMentions", {
        userId: user._id,
        noteId,
        profileId: link.profileId,
        quote: link.quote,
      });
    }

    return { profileId, noteId, createdProfile, createdMentionCount };
  },
});

/**
 * How long a single fact may run.
 *
 * `MAX_DRAFT_CHARS` bounded a whole draft on the way in, but that ceiling lived
 * on the capture path and this is a second public door into the same rows. A
 * fact is a short sentence; anything past this is somebody pasting a document
 * into a field, which costs them storage and costs every later read.
 */
const MAX_FACT_CHARS = 500;

/**
 * One saved note, for the screen that edits it.
 *
 * The note's id arrives from a route the way `profiles.withNotes`'s does, so it
 * gets the same treatment: normalised, fetched, and proven to belong to the
 * caller before any field of it is returned. One `null` covers "no such note"
 * and "not yours", so a guessed id cannot be used to learn which of the two it
 * was.
 */
export const byId = query({
  args: { noteId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      note: schema.doc("notes"),
      /** Whose timeline this note sits on, for the screen's title. */
      profileName: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    const noteId = ctx.db.normalizeId("notes", args.noteId);
    if (noteId === null) {
      return null;
    }

    const note = await ctx.db.get("notes", noteId);
    if (note === null || note.userId !== user._id) {
      return null;
    }

    // Checked in its own right rather than trusted because the note pointed at
    // it: Convex has no foreign keys, so "a note's profile has the same owner"
    // is an invariant this code keeps, not one the database enforces.
    const profile = await ctx.db.get("profiles", note.profileId);
    const profileName =
      profile !== null && profile.userId === user._id ? profile.name : "";

    return { note, profileName };
  },
});

/**
 * Correcting a note that is already saved.
 *
 * This is the missing half of the confirm step. Extraction can attribute a fact
 * to the wrong person — measured on 2026-08-31, "어머니가 많이 힘들어하신다"
 * came back as "어머니 때문에 힘들어한다", moving the hardship onto the person
 * the note was filed under — and recognition mishears a syllable that changes a
 * sentence's grammar. Both are caught by a person reading the review screen,
 * and until now both were permanent the moment they were saved: the review
 * screen is reachable exactly once, before the write.
 *
 * Text and facts only. The note's subject, its date and its source are not
 * editable here: moving a note to another person is a different operation with
 * its own consequences for the mention links, and rewriting when something
 * happened is a feature the schema is ready for but nothing asks for yet.
 */
export const updateNote = mutation({
  args: {
    noteId: v.string(),
    text: v.string(),
    keyFacts: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    const noteId = ctx.db.normalizeId("notes", args.noteId);
    if (noteId === null) {
      throw new ConvexError("Andy couldn't find that note.");
    }

    const note = await ctx.db.get("notes", noteId);
    if (note === null || note.userId !== user._id) {
      // Same message either way, for the same reason `byId` returns one `null`.
      throw new ConvexError("Andy couldn't find that note.");
    }

    const text = args.text.trim();
    if (text === "") {
      // Emptying a note is deleting it, and deleting should be asked for
      // deliberately rather than reached by clearing a field.
      throw new ConvexError(
        "A note needs something in it. Delete it instead if it's not worth keeping.",
      );
    }
    if (text.length > MAX_TRANSCRIPT_CHARS) {
      throw new ConvexError(
        "That note is longer than Andy can take in one go. Try splitting it into two.",
      );
    }

    // A fact blanked out is a fact removed — the same rule the capture path
    // applies, repeated here because this is its own public entry point rather
    // than a step in that one.
    const keyFacts = args.keyFacts
      .map((fact) => fact.trim())
      .filter((fact) => fact !== "");
    if (keyFacts.some((fact) => fact.length > MAX_FACT_CHARS)) {
      throw new ConvexError("That's longer than a fact. Try splitting it up.");
    }

    await ctx.db.patch("notes", noteId, {
      text,
      // Absent rather than an empty array, matching what `saveCapture` writes:
      // an empty array would claim extraction ran and found nothing, which is a
      // different thing from a note that never had facts.
      keyFacts: keyFacts.length > 0 ? keyFacts : undefined,
      // `embedding` is deliberately left alone rather than cleared. Day 4 owns
      // that pipeline; clearing it here would silently drop this note out of
      // search, and writing one is not this mutation's job. Recorded so the
      // pipeline can decide what a stale vector should mean.
    });

    return null;
  },
});

/**
 * Deleting a note, and the links that only existed to describe it.
 *
 * A note is not a leaf: every person it mentioned has a row in `noteMentions`
 * pointing at it, and Convex has no foreign keys or cascading deletes, so
 * removing the note alone would leave links pointing at nothing. Those links
 * are what `profiles.withNotes` reads to build both "who came up in this note"
 * and "where this person was mentioned", so a dangling one is not inert — it is
 * a row on somebody's profile that can no longer be opened.
 *
 * Stub profiles left with nothing referencing them go too. A stub is a row the
 * user never asked for: it exists because a note named someone in passing, and
 * once that note is gone it has no notes of its own, no mentions, and no way to
 * be reached from any screen — an invisible row holding a real person's name.
 * `isStub` earns its place here, as the only record of which profiles were
 * created by inference rather than chosen.
 *
 * A profile the user did choose is never touched, even when this was its last
 * note. Deleting a person is a bigger decision than deleting a note, and it is
 * theirs to make.
 */
export const remove = mutation({
  args: { noteId: v.string() },
  returns: v.object({
    /** Whose timeline this note left, so the screen knows where to go. */
    profileId: v.id("profiles"),
    /** Auto-created people the note was the last reason to keep. */
    removedStubCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    const noteId = ctx.db.normalizeId("notes", args.noteId);
    if (noteId === null) {
      throw new ConvexError("Andy couldn't find that note.");
    }

    const note = await ctx.db.get("notes", noteId);
    if (note === null || note.userId !== user._id) {
      throw new ConvexError("Andy couldn't find that note.");
    }

    // Pinned on both `userId` and `noteId`, so this cannot reach another
    // user's links even if one somehow carried this note's id.
    const links = await ctx.db
      .query("noteMentions")
      .withIndex("by_user_and_note", (q) =>
        q.eq("userId", user._id).eq("noteId", noteId),
      )
      .collect();

    const mentioned = new Set(links.map((link) => link.profileId));

    for (const link of links) {
      await ctx.db.delete("noteMentions", link._id);
    }
    await ctx.db.delete("notes", noteId);

    // After both deletions, so the counts below see the world as it now is
    // rather than as it was a moment ago.
    let removedStubCount = 0;
    for (const profileId of mentioned) {
      const profile = await ctx.db.get("profiles", profileId);
      if (profile === null || profile.userId !== user._id || !profile.isStub) {
        continue;
      }

      const ownNotes = await ctx.db
        .query("notes")
        .withIndex("by_user_and_profile_and_createdAt", (q) =>
          q.eq("userId", user._id).eq("profileId", profileId),
        )
        .take(1);
      if (ownNotes.length > 0) {
        continue;
      }

      const remaining = await ctx.db
        .query("noteMentions")
        .withIndex("by_user_and_profile", (q) =>
          q.eq("userId", user._id).eq("profileId", profileId),
        )
        .take(1);
      if (remaining.length > 0) {
        continue;
      }

      await ctx.db.delete("profiles", profileId);
      removedStubCount += 1;
    }

    return { profileId: note.profileId, removedStubCount };
  },
});
