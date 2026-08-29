import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
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

/**
 * Names are matched case-insensitively and trimmed, but always *stored* as the
 * user said them. Korean names are unaffected by the case fold; "sarah chen"
 * matching an existing "Sarah Chen" is the point.
 */
function matchKey(name: string): string {
  return name.trim().toLocaleLowerCase();
}

/**
 * Merge tag lists without letting case create duplicates: "Cats" and "cats" are
 * one tag, and the first spelling seen is the one kept, so what the user
 * actually wrote survives. Names are already compared this way — tags were the
 * one place still comparing raw strings.
 */
function mergeTags(existing: string[], incoming: string[]): string[] {
  const bySpelling = new Map<string, string>();
  for (const tag of [...existing, ...incoming]) {
    const trimmed = tag.trim();
    if (trimmed === "") {
      continue;
    }
    const key = trimmed.toLocaleLowerCase();
    if (!bySpelling.has(key)) {
      bySpelling.set(key, trimmed);
    }
  }
  return [...bySpelling.values()];
}

/**
 * A ceiling on how many people one note may introduce. Each new mention is a
 * row written inside this transaction, and the draft arrives from the client,
 * so without a bound a malformed or hostile draft could try to write thousands
 * of profiles in a single mutation. A real voice note names a handful.
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
