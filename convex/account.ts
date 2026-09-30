import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation } from "./_generated/server";

/**
 * Deleting your own account, from inside the app.
 *
 * App Store Guideline 5.1.1(v): an app that lets you sign in has to let you
 * delete the account in the app, not only sign out (found missing by
 * `app-store-reviewer`, 2026-09-30). This is the whole of it: every row the
 * caller owns, every file those rows point at, the user row, and then the
 * sign-in account itself.
 *
 * Convex has no cascading delete (CLAUDE.md), so the tables are walked by hand.
 * The list below is every table that carries a `userId`; a new one added to
 * the schema has to be added here, and `account.test.ts` fails when it is not.
 */

/** Documents deleted per transaction. Well inside Convex's write limits. */
const BATCH = 200;

/**
 * Children before parents, so a half-finished run never leaves a row pointing
 * at something already gone: mentions and links name notes and profiles, notes
 * name profiles.
 */
export const OWNED_TABLES = [
  "noteMentions",
  "calendarLinks",
  "metrics",
  "notes",
  "profiles",
] as const;

/**
 * One batch of the caller's data. `done` once there is nothing left, at which
 * point the user row itself goes too.
 *
 * The caller is resolved from the auth that the action passes through, never
 * from an argument: this deletes rows, and an id taken as an argument would let
 * anyone who could call it name somebody else.
 */
export const deleteBatch = internalMutation({
  args: {},
  returns: v.object({ done: v.boolean() }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new ConvexError("You're signed out. Sign in to continue.");
    }
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    // Already gone: a retry after the data was deleted and the sign-in was
    // not. Refusing here, as `getAuthenticatedUser` would, is what would make
    // that retry impossible.
    if (user === null) {
      return { done: true };
    }

    for (const table of OWNED_TABLES) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .take(BATCH);
      if (rows.length === 0) continue;

      for (const row of rows) {
        // A profile photo lives in storage, outside every table. Deleting the
        // row alone would leave a file nobody can reach and everybody pays for.
        if (table === "profiles" && "photoStorageId" in row && row.photoStorageId !== undefined) {
          await ctx.storage.delete(row.photoStorageId);
        }
        await ctx.db.delete(table, row._id);
      }
      // One table's batch per transaction, then back to the action for more.
      return { done: false };
    }

    await ctx.db.delete("users", user._id);
    return { done: true };
  },
});

/** Batches before giving up; at `BATCH` each, far beyond any real account. */
const MAX_BATCHES = 1000;

export const deleteMyAccount = action({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new ConvexError("You're signed out. Sign in to continue.");
    }

    // Checked before anything is touched. Without it the data would go and
    // the sign-in would stay: an account that looks deleted and isn't.
    const secretKey = clerkSecretKey();

    // Data first, sign-in account last. If the data half fails, you can still
    // sign in and try again; if the account went first, whatever was left
    // behind would belong to nobody who could ever reach it.
    for (let i = 0; i < MAX_BATCHES; i++) {
      const { done } = await ctx.runMutation(internal.account.deleteBatch, {});
      if (done) {
        await deleteSignInAccount(identity.subject, secretKey);
        return null;
      }
    }
    throw new ConvexError(
      "Andy couldn't finish deleting your account. Try again, and nothing already removed will come back.",
    );
  },
});

function clerkSecretKey(): string {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) {
    // A configuration fault, not the person's: loud in the logs, plain to
    // them, the same split `claude.ts` makes for a missing Anthropic key.
    console.error(
      "CLERK_SECRET_KEY is not set on this Convex deployment. " +
        "Set it with: npx convex env set CLERK_SECRET_KEY sk_...",
    );
    throw new ConvexError(
      "Andy can't delete accounts right now. Nothing was deleted. Try again shortly.",
    );
  }
  return key;
}

/**
 * The Clerk user behind this sign-in, through Clerk's Backend API.
 *
 * Plain `fetch` rather than `@clerk/backend`: Clerk documents this exact call
 * as the REST endpoint its SDK wraps (verified 2026-09-30,
 * clerk.com/docs/reference/backend/user/delete-user). A 404 counts as done:
 * a retry after a half-finished run finds the account already gone, and that
 * is the outcome being asked for.
 *
 * Not done here, and required by Apple for Sign in with Apple: revoking the
 * Apple tokens. Clerk does not do it, and does not document handing the
 * backend what it needs for the native flow. Tracked as its own slice.
 */
async function deleteSignInAccount(clerkUserId: string, secretKey: string): Promise<void> {
  const response = await fetch(
    `https://api.clerk.com/v1/users/${encodeURIComponent(clerkUserId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${secretKey}` } },
  );
  if (response.ok || response.status === 404) return;

  console.error(`Clerk user deletion failed: ${response.status} ${await response.text()}`);
  throw new ConvexError(
    "Your notes and people are deleted, but Andy couldn't finish removing your sign-in. Try again.",
  );
}
