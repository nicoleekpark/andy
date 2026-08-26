import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";

/**
 * The single place every other function resolves "who is calling".
 *
 * Convex has no row-level security, so this identity is the only thing standing
 * between one user's notes and another's. Never accept a userId as a function
 * argument — always derive it here (convex/_generated/ai/guidelines.md).
 */
export async function getAuthenticatedUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new ConvexError("You're signed out. Sign in to continue.");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();

  if (user === null) {
    throw new ConvexError("Your account isn't set up yet. Sign in again.");
  }

  return user;
}

/**
 * Find-or-create the caller's user row. Called once after sign-in.
 *
 * `.unique()` throws if a duplicate `tokenIdentifier` ever exists: Convex does
 * not enforce index uniqueness, and two rows for one person would silently
 * split their data in half across every `by_user` query. Loud beats silent.
 */
export const ensureUser = mutation({
  args: {},
  returns: v.id("users"),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new ConvexError("You're signed out. Sign in to continue.");
    }

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (existing !== null) {
      // Keep the display fields in step with Clerk without rewriting the row
      // on every sign-in.
      if (existing.name !== identity.name || existing.email !== identity.email) {
        await ctx.db.patch("users", existing._id, {
          name: identity.name,
          email: identity.email,
        });
      }
      return existing._id;
    }

    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name: identity.name,
      email: identity.email,
    });
  },
});

/**
 * The caller's user row, or null when signed out or not yet bootstrapped.
 * Returns null rather than throwing so the UI can render a signed-out state
 * instead of an error.
 */
export const current = query({
  args: {},
  returns: v.union(v.null(), schema.doc("users")),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      return null;
    }

    return await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
  },
});
