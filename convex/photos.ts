import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { getAuthenticatedUser } from "./users";

/**
 * A photo on a profile.
 *
 * `photoStorageId` has been in the schema since day 1 and nothing has ever
 * written it. `profiles.remove` already deletes the file when a person is
 * deleted, so the cascade this feature needs was built before the feature was —
 * which is the only reason a stored file cannot outlive its profile here.
 *
 * Convex file storage rather than a base64 column: an image does not belong in
 * a document that has a 1MB ceiling and is rewritten on every save, and the
 * business-card path already learned that lesson the expensive way (day 2,
 * issue 25 — an unedited 12MP frame killed the request before it reached the
 * handler).
 */

/**
 * The ceiling on a stored photo.
 *
 * The client crops to a square at quality 0.7, which lands well under this —
 * but those are *client* hints and nothing makes a caller use the app. Checked
 * in `attach` because that is where bytes stop being a stray upload and start
 * being something this deployment keeps.
 */
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

/**
 * Where to send the bytes.
 *
 * Authenticated, because an unauthenticated upload URL is a free file host. It
 * carries no profile id: the URL only accepts bytes and hands back a
 * `storageId`, and deciding *whose* profile that belongs to happens in
 * `attach`, where the caller is checked against the row.
 */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await getAuthenticatedUser(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

/**
 * Put an uploaded file on a person, and clean up whatever it replaced.
 *
 * Replacing is the common case — somebody picks a better photo — and Convex has
 * no cascading delete, so the old file has to be removed by hand or the user
 * pays for it for ever with nothing on any screen pointing at it. That is the
 * same rule `CLAUDE.md` states for profiles and notes, applied to the one kind
 * of row that lives outside the tables entirely.
 */
export const attach = mutation({
  args: { profileId: v.string(), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    const profileId = ctx.db.normalizeId("profiles", args.profileId);
    if (profileId === null) {
      throw new ConvexError("Andy couldn't find that person.");
    }
    const profile = await ctx.db.get("profiles", profileId);
    if (profile === null || profile.userId !== user._id) {
      // Same message either way — a caller must not learn that a row they
      // cannot read exists.
      throw new ConvexError("Andy couldn't find that person.");
    }

    // The file has to be checked, not only the profile.
    //
    // `v.id("_storage")` is a format check and nothing more: Convex records no
    // uploader, so a signed-in caller who has a storage id can hand it to this
    // mutation and the ownership check above passes — it is their own profile.
    // `security-reviewer` demonstrated the whole path: attach somebody else's
    // file, read their photo through `withNotes`, then call `remove` and
    // destroy the original. Their row keeps the id and their photo is gone.
    //
    // So: a file already spoken for by any profile, anywhere, cannot be taken.
    const claimed = await ctx.db
      .query("profiles")
      .withIndex("by_photo", (q) => q.eq("photoStorageId", args.storageId))
      .first();
    if (claimed !== null && claimed._id !== profileId) {
      throw new ConvexError("Andy couldn't use that photo.");
    }

    // And it has to be a sane size. The crop and quality settings are client
    // hints; this is the only place the deployment gets a say.
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (metadata === null) {
      throw new ConvexError("That photo didn't finish uploading. Try again.");
    }
    if (metadata.size > MAX_PHOTO_BYTES) {
      // Refused and left where it is. A `ctx.storage.delete` here would read
      // like cleanup and do nothing: a mutation that throws rolls back its own
      // writes, storage deletes included, so the file is back the moment the
      // error is raised. It cannot be scheduled out either — `runAfter` is a
      // write and rolls back with everything else.
      //
      // Which is survivable, because this refusal is not what would strand a
      // file. The client crops to a square at quality 0.7 and lands far under
      // the cap, and somebody abusing the upload URL directly never reaches
      // this mutation at all. Unreferenced files are a real thing and want a
      // sweep, not a delete bolted to the one path that hardly produces them —
      // see the day report.
      throw new ConvexError("That photo is too large. Try a smaller one.");
    }

    // `contentType` is deliberately *not* checked, though the first version of
    // this did. Two reasons, and the second is the one that matters:
    //
    //  - It is not a guard. `contentType` is whatever the uploader put in the
    //    Content-Type header of their own PUT to the upload URL, so anyone
    //    willing to send a zip is willing to label it `image/jpeg`. It refuses
    //    honest mistakes and nothing else, while reading like a check.
    //  - It can refuse real photos. A client that omits the header leaves it
    //    null on the deployment, and every attach fails with a message about
    //    size that has nothing to do with what went wrong.
    //
    // And nothing here could have caught either: convex-test's `storage.store`
    // records `size` and `sha256` only, so `contentType` is always null under
    // test whatever Blob you hand it — a check on it is green in the suite and
    // refuses everything on the deployment. `size` is measured by the backend,
    // cannot be lied about, and is the thing actually worth bounding.

    const replaced = profile.photoStorageId;
    await ctx.db.patch("profiles", profileId, { photoStorageId: args.storageId });
    // After the patch, not before. If the delete ran first and the patch then
    // failed, the profile would point at a file that no longer exists.
    if (replaced !== undefined && replaced !== args.storageId) {
      await ctx.storage.delete(replaced);
    }
    return null;
  },
});

/**
 * Take the photo off, and take the file with it.
 *
 * Clearing the field alone would leave the bytes in storage for ever, reachable
 * by nothing and billed all the same.
 */
export const remove = mutation({
  args: { profileId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    const profileId = ctx.db.normalizeId("profiles", args.profileId);
    if (profileId === null) {
      throw new ConvexError("Andy couldn't find that person.");
    }
    const profile = await ctx.db.get("profiles", profileId);
    if (profile === null || profile.userId !== user._id) {
      throw new ConvexError("Andy couldn't find that person.");
    }
    if (profile.photoStorageId === undefined) return null;

    const storageId = profile.photoStorageId;
    await ctx.db.patch("profiles", profileId, { photoStorageId: undefined });
    await ctx.storage.delete(storageId);
    return null;
  },
});
