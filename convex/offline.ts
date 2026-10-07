import { v } from "convex/values";
import { query } from "./_generated/server";
import { withoutEmbedding } from "./offlineViews";
import schema from "./schema";
import { getAuthenticatedUser } from "./users";

/**
 * Everything the reading screens need, for one account, in one answer — kept
 * on the phone so people and notes can still be read with no connection
 * (`src/lib/offline-copy.tsx`; decided 2026-10-07).
 *
 * Raw rows rather than finished screens: the app builds each screen from them
 * with the same functions the queries use (`offlineViews.ts`), so there is one
 * definition of what a page shows. Every row comes through `by_user` for the
 * caller, and notes leave without their search vector.
 *
 * Read-only by design: changing things offline is a later decision.
 */
export const snapshot = query({
  args: {},
  returns: v.object({
    profiles: v.array(schema.doc("profiles")),
    notes: v.array(
      v.object({
        _id: v.id("notes"),
        _creationTime: v.number(),
        userId: v.id("users"),
        profileId: v.id("profiles"),
        text: v.string(),
        keyFacts: v.optional(v.array(v.string())),
        source: v.union(
          v.literal("voice"),
          v.literal("manual"),
          v.literal("business_card"),
          v.literal("calendar_nudge"),
        ),
        createdAt: v.number(),
      }),
    ),
    links: v.array(schema.doc("noteMentions")),
  }),
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    const [profiles, notes, links] = await Promise.all([
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
    return { profiles, notes: notes.map(withoutEmbedding), links };
  },
});
