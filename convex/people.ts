import { v } from "convex/values";
import { query } from "./_generated/server";
import { searchView, withoutEmbedding } from "./offlineViews";
import { searchKey } from "./peopleSearch";
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
        /**
         * When they were found by a word in what you kept about them rather
         * than by name: the sentence it is in, so the row says why they are
         * here ("Fosters two greyhounds"). Absent for a match by name.
         */
        matchedIn: v.optional(v.string()),
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

    if (searchKey(args.query) === "") return { people: [], mentions: [] };

    const [owned, notes, links] = await Promise.all([
      ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("notes")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("noteMentions")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect(),
    ]);
    // Matched and ranked by the function the phone's offline copy uses too,
    // so finding someone by name works the same with no connection.
    return searchView(args.query, owned, notes.map(withoutEmbedding), links);
  },
});
