import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalQuery,
  mutation,
  type ActionCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getAuthenticatedUser } from "./users";

/**
 * The person's go-ahead before anything they wrote reaches an AI service
 * (`docs/design/decisions/pre-submission-privacy.md`, A; App Review Guideline
 * 5.1.2(i): "obtain explicit permission before" sharing personal data with
 * third-party AI).
 *
 * Kept on the server, on the user row, so it holds on every phone the account
 * is signed in on and goes with the account. The server is the guard, not the
 * screen: every action that sends a person's words to Anthropic or OpenAI
 * asks `requireAiAllowed` first, and the scheduled embedding job skips the
 * notes of anyone who has not said yes. A screen-only check is a check a
 * stale or modified client walks past.
 */

/**
 * The feature-flag key (INFRA.md #6). Switched off, nothing here refuses
 * anything — which is how production runs until a build that can ask is on
 * every tester's phone. Builds 4 and 5 have no screen to ask with, so
 * enforcing under them would stop every note being read.
 */
export const AI_PERMISSION_FLAG = "aiPermission";

/** What a caller without the go-ahead is told. Said by the app's own screen first. */
export const AI_NOT_ALLOWED =
  "Andy needs your go-ahead before it reads anything. You can give it in Settings.";

/** Notes re-embedded per scheduled job when the go-ahead is (re)given. */
const CATCH_UP_PAGE = 100;

async function enforced(ctx: QueryCtx): Promise<boolean> {
  const flag = await ctx.db
    .query("featureFlags")
    .withIndex("by_key", (q) => q.eq("key", AI_PERMISSION_FLAG))
    .first();
  // No row means on, the same rule as every other switch.
  return flag === null || flag.enabled;
}

/** Whether this person's words may be sent to an AI service now. */
export async function mayUseAi(ctx: QueryCtx, user: Doc<"users">): Promise<boolean> {
  return user.aiAllowedAt !== undefined || !(await enforced(ctx));
}

/**
 * The caller may use AI. Signed out is refused with the usual words. With the
 * switch off this asks nothing more than the old `requireSignedIn` did, so
 * builds 4 and 5 cannot tell the difference; with it on, the caller's own
 * user row must carry the go-ahead.
 */
export const callerMayUseAi = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new ConvexError("You're signed out. Sign in to continue.");
    }
    if (!(await enforced(ctx))) return true;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    return user !== null && user.aiAllowedAt !== undefined;
  },
});

/**
 * Refuse before any paid call is made. Signed-out callers are refused too,
 * by `getAuthenticatedUser`, with the usual words.
 */
export async function requireAiAllowed(ctx: ActionCtx): Promise<void> {
  const allowed: boolean = await ctx.runQuery(internal.aiPermission.callerMayUseAi, {});
  if (!allowed) {
    throw new ConvexError(AI_NOT_ALLOWED);
  }
}

/**
 * Yes. Notes edited while the answer was no were not re-embedded (their search
 * ranks by what they used to say), so a no-to-yes change re-embeds everything
 * this person has. Embeddings cost a fraction of a cent per hundred notes;
 * tracking which notes changed in the meantime would cost a field per note.
 */
export const allow = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    if (user.aiAllowedAt !== undefined) return null;
    await ctx.db.patch("users", user._id, { aiAllowedAt: Date.now(), aiDeclinedAt: undefined });
    await ctx.scheduler.runAfter(0, internal.aiPermission.catchUp, {
      userId: user._id,
      cursor: null,
    });
    return null;
  },
});

/**
 * No longer. New calls stop; notes already read stay as they are — withdrawing
 * is not deleting, and deleting is a separate thing the person can do.
 */
export const withdraw = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    if (user.aiAllowedAt === undefined) return null;
    // Stopping is a no, remembered like Not now.
    await ctx.db.patch("users", user._id, { aiAllowedAt: undefined, aiDeclinedAt: Date.now() });
    return null;
  },
});

/**
 * Not now. Remembered so the app stops offering the question by itself: from
 * here on the person writes and saves as written, and is asked only when they
 * reach for something that needs reading. A no to someone who already said
 * yes changes nothing — that is `withdraw`, which asks first.
 */
export const decline = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    if (user.aiAllowedAt !== undefined || user.aiDeclinedAt !== undefined) return null;
    await ctx.db.patch("users", user._id, { aiDeclinedAt: Date.now() });
    return null;
  },
});

/** One page of one person's note ids, for the catch-up below. */
export const ownNoteIdsPage = internalQuery({
  args: { userId: v.id("users"), cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    noteIds: v.array(v.id("notes")),
    cursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("notes")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .paginate({ numItems: CATCH_UP_PAGE, cursor: args.cursor });
    return {
      noteIds: page.page.map((note) => note._id),
      cursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/**
 * Re-embed one person's notes a page at a time, each page its own job, so a
 * long history never runs into one action's limits. Internal: the user id
 * comes from `allow`, which derived it from the caller.
 */
export const catchUp = internalAction({
  args: { userId: v.id("users"), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page: { noteIds: Id<"notes">[]; cursor: string; isDone: boolean } =
      await ctx.runQuery(internal.aiPermission.ownNoteIdsPage, args);
    if (page.noteIds.length > 0) {
      await ctx.scheduler.runAfter(0, internal.embeddings.embedNotes, {
        noteIds: page.noteIds,
      });
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.aiPermission.catchUp, {
        userId: args.userId,
        cursor: page.cursor,
      });
    }
    return null;
  },
});
