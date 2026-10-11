import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { getAuthenticatedUser } from "./users";

/**
 * Where the Sign in with Apple refresh token lives (`schema.appleTokens`).
 * Internal only: the app never reads it, and only `appleSignIn.ts` writes it.
 * Split from that file because it is `"use node"`, which may hold actions only.
 */

/** Keep the newest token for the signed-in person, replacing any older one. */
export const keep = internalMutation({
  args: { refreshToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const existing = await ctx.db
      .query("appleTokens")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(10);
    for (const row of existing) await ctx.db.delete("appleTokens", row._id);
    await ctx.db.insert("appleTokens", {
      userId: user._id,
      refreshToken: args.refreshToken,
      keptAt: Date.now(),
    });
    return null;
  },
});

/**
 * The signed-in person's token, or null — including once the account rows are
 * gone, so a retried deletion does not fail here.
 */
export const forCurrentUser = internalQuery({
  args: {},
  returns: v.union(v.string(), v.null()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (user === null) return null;
    const row = await ctx.db
      .query("appleTokens")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    return row?.refreshToken ?? null;
  },
});
