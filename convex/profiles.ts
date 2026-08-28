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

/**
 * The people you have actually recorded, most recently written about first.
 *
 * Someone who only ever appeared inside a note about somebody else is left out.
 * They are a real row — that is what makes "who was at that dinner" answerable
 * later — but the home screen is a list of people you keep, and after fifty
 * notes it would otherwise fill with names you heard once and never chose.
 *
 * Membership is derived from the notes rather than read off `profiles.isStub`.
 * The recency ordering needs every note anyway, so the answer is already in
 * hand: storing the same fact twice only creates something that can go stale
 * (a note deleted later would leave the flag lying). Worth remembering when
 * deciding whether that column earns its place at all.
 */
export const recent = query({
  args: {},
  returns: v.array(
    v.object({
      profile: schema.doc("profiles"),
      lastNoteAt: v.number(),
      noteCount: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);

    // Every note this user owns, in one read. Fine while a person has hundreds
    // rather than tens of thousands; when that stops being true the fix is a
    // paginated home, not a denormalised counter.
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const byProfile = new Map<string, { lastNoteAt: number; noteCount: number }>();
    for (const note of notes) {
      const seen = byProfile.get(note.profileId);
      byProfile.set(note.profileId, {
        lastNoteAt: Math.max(seen?.lastNoteAt ?? 0, note.createdAt),
        noteCount: (seen?.noteCount ?? 0) + 1,
      });
    }

    const profiles = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    return profiles
      .flatMap((profile) => {
        const stats = byProfile.get(profile._id);
        return stats === undefined ? [] : [{ profile, ...stats }];
      })
      .sort((a, b) => b.lastNoteAt - a.lastNoteAt);
  },
});

