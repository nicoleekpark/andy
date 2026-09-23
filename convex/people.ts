import { v } from "convex/values";
import { query } from "./_generated/server";
import { namesOf } from "./naming";
import { bestMatch, byNameThenRank, searchKey } from "./peopleSearch";
import { getAuthenticatedUser } from "./users";

/**
 * Finding a person by name, and everywhere that name comes up.
 *
 * Two things in one answer because they are one question. Typing "judy" means
 * "show me Judy", and the honest answer is both the people called that *and*
 * the places somebody else's note mentions one — `CLAUDE.md` calls
 * cross-profile mention search a Must-have, and a mention is exactly where a
 * person hides who has no profile of their own worth opening.
 *
 * Never jumps. Even one match is a list to tap, and that is the same rule the
 * briefing card follows when it refuses to choose between two Judys: this app
 * does not decide who you meant. It also happens to be more useful — "there is
 * only one Judy" is information.
 *
 * Ranking and folding live in `peopleSearch.ts`, which explains at length why
 * the comparison here is deliberately looser than the calendar's.
 */

/** Enough of the list to be useful, small enough to read once. */
const MAX_PEOPLE = 20;
const MAX_MENTIONS = 30;

export const search = query({
  args: { query: v.string() },
  returns: v.object({
    people: v.array(
      v.object({
        profileId: v.id("profiles"),
        name: v.string(),
        /** The name that matched — an alias, when that is what you typed. */
        matchedName: v.string(),
        entityType: v.union(v.literal("person"), v.literal("animal")),
        relationshipContext: v.optional(v.string()),
        noteCount: v.number(),
        /**
         * How many of somebody else's notes name them.
         *
         * Carried so a row can tell two very different people apart at a
         * glance: somebody you have written about, and somebody who exists
         * only because a note said their name. The second kind is where a
         * mistake hides — "Park's housewarming" heard as a person called
         * "Parks" — and until a row said so, the invented person looked
         * exactly like the real one.
         */
        mentionCount: v.number(),
        lastNoteAt: v.union(v.number(), v.null()),
      }),
    ),
    /** Somebody else's note that names one of them, newest first. */
    mentions: v.array(
      v.object({
        noteId: v.id("notes"),
        /** Whose note it is — the person the note is filed under. */
        aboutProfileId: v.id("profiles"),
        aboutName: v.string(),
        /** The person mentioned, if their profile still exists. */
        profileId: v.union(v.id("profiles"), v.null()),
        /** The name the link recorded, which outlives the profile. */
        name: v.string(),
        quote: v.string(),
        createdAt: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    const needle = searchKey(args.query);
    if (needle === "") return { people: [], mentions: [] };

    const owned = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Counted from one read rather than per candidate — the same trade
    // `resolveNames` and `matchEvents` make, revisited by pagination when a
    // person has thousands of notes.
    const stats = new Map<string, { noteCount: number; lastNoteAt: number }>();
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const note of notes) {
      const seen = stats.get(note.profileId);
      stats.set(note.profileId, {
        noteCount: (seen?.noteCount ?? 0) + 1,
        lastNoteAt: Math.max(seen?.lastNoteAt ?? 0, note.createdAt),
      });
    }

    // Read once, before the people are built, so each row can carry its own
    // count. Also the list the mentions section is built from below.
    const links = await ctx.db
      .query("noteMentions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const mentionCounts = new Map<string, number>();
    for (const link of links) {
      mentionCounts.set(
        link.profileId,
        (mentionCounts.get(link.profileId) ?? 0) + 1,
      );
    }

    const ranked = [];
    for (const profile of owned) {
      // `namesOf` is the rule — a profile answers to its name *and* its
      // aliases, the same set every other name lookup in this codebase uses.
      const [name, ...aliases] = namesOf(profile);
      const match = bestMatch(needle, [
        { name: name ?? profile.name, isAlias: false },
        ...aliases.map((alias) => ({ name: alias, isAlias: true })),
      ]);
      if (match === null) continue;

      const seen = stats.get(profile._id);
      ranked.push({
        rank: match.rank,
        profileId: profile._id,
        name: profile.name,
        matchedName: match.matchedName,
        entityType: profile.entityType,
        relationshipContext: profile.relationshipContext,
        noteCount: seen?.noteCount ?? 0,
        mentionCount: mentionCounts.get(profile._id) ?? 0,
        lastNoteAt: seen?.lastNoteAt ?? null,
      });
    }
    ranked.sort(byNameThenRank);
    // `rank` decided the order and is not the caller's business — a screen
    // that could read it would eventually branch on it, and the tiers are an
    // implementation detail of this file.
    const people = ranked
      .slice(0, MAX_PEOPLE)
      .map(({ rank: _rank, ...person }) => person);

    // Mentions of any of those people, plus mentions whose recorded name
    // matches even though the profile is gone. The second half is the point of
    // `noteMentions.name` existing: deleting somebody must not erase them from
    // the notes of everyone who mentioned them, so their name still shows and
    // simply stops opening anything.
    const matchedIds = new Set(people.map((person) => person.profileId));
    const byNote = new Map(notes.map((note) => [note._id as string, note]));
    const names = new Map(owned.map((p) => [p._id as string, p.name]));

    const mentions = [];
    for (const link of links) {
      const source = byNote.get(link.noteId);
      if (source === undefined) continue;
      const stillExists = names.has(link.profileId);
      // A note *about* Judy is already in `people` above — this list is the
      // other direction, where she comes up inside somebody else's.
      if (matchedIds.has(source.profileId)) continue;
      if (
        !matchedIds.has(link.profileId) &&
        !searchKey(link.name).includes(needle)
      ) {
        continue;
      }
      mentions.push({
        noteId: link.noteId,
        aboutProfileId: source.profileId,
        aboutName: names.get(source.profileId) ?? "",
        profileId: stillExists ? link.profileId : null,
        name: stillExists
          ? (names.get(link.profileId) ?? link.name)
          : link.name,
        quote: link.quote,
        createdAt: source.createdAt,
      });
    }
    mentions.sort((a, b) => b.createdAt - a.createdAt);

    return { people, mentions: mentions.slice(0, MAX_MENTIONS) };
  },
});
