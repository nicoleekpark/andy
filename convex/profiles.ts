import { v } from "convex/values";
import { query } from "./_generated/server";
import schema from "./schema";
import { getAuthenticatedUser } from "./users";

/**
 * Reading a profile and its timeline.
 *
 * This is the first place an id arrives *from the client* — the route param in
 * `/profile/[id]`. `saveCapture` deliberately never accepts one, resolving
 * people by name against the caller's own rows instead, so there was nothing to
 * check. Here there is: an id in a URL is a guess anyone can edit, so the row it
 * names has to be proven to belong to the caller before a single field of it is
 * returned. This is one of the two join sites this project has flagged as where
 * ownership leaks in practice.
 */
export const withNotes = query({
  // A plain string, not `v.id("profiles")`: the value comes out of a URL, where
  // a typo is ordinary. `v.id` would reject it with a validation error before
  // the handler ever ran, and the screen would show a crash instead of "we
  // couldn't find them".
  args: { profileId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      profile: schema.doc("profiles"),
      notes: v.array(schema.doc("notes")),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    const profileId = ctx.db.normalizeId("profiles", args.profileId);
    if (profileId === null) {
      return null;
    }

    const profile = await ctx.db.get("profiles", profileId);
    // One `null` for "no such profile" and for "not yours". Distinguishing them
    // would let anyone with a valid id discover whether it exists.
    if (profile === null || profile.userId !== user._id) {
      return null;
    }

    // Both `userId` and `profileId` are pinned, so this check stands on its own
    // rather than leaning on the ownership check above — a note would have to
    // fail both to be returned. Worth keeping that way: Convex has no foreign
    // keys, so "a note's userId always matches its profile's owner" is an
    // invariant every future write path has to keep, not something the database
    // enforces.
    //
    // Ordered by the index rather than sorted afterwards, and reversed so the
    // newest note is first — the timeline reads down into the past.
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_user_and_profile_and_createdAt", (q) =>
        q.eq("userId", user._id).eq("profileId", profileId),
      )
      .order("desc")
      .collect();

    return { profile, notes };
  },
});
