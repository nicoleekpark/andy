import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/**
 * Removing people Andy invented and nothing refers to any more.
 *
 * Shared by the two things that can strand them: deleting a note, and deleting
 * a whole person along with their notes. Convex has no cascading delete, so
 * every path that removes a row has to think about what pointed at it, and two
 * copies of this reasoning would agree right up until one of them was fixed.
 *
 * An `autoCreated` profile exists because a note named somebody in passing.
 * Once nothing names them, they have no notes, no mentions, and no screen that
 * can reach them — an invisible row holding a real person's name. A profile the
 * user chose is left alone however empty it becomes: deciding to stop keeping
 * somebody is theirs to make, not a side effect of tidying a note.
 */
export async function removeOrphanedAutoCreated(
  ctx: MutationCtx,
  userId: Id<"users">,
  candidates: Iterable<Id<"profiles">>,
): Promise<number> {
  let removed = 0;

  for (const profileId of candidates) {
    const profile = await ctx.db.get("profiles", profileId);
    // Ownership re-checked here rather than trusted from the caller: this
    // deletes rows, and it is reached from two places that each arrived at the
    // id a different way.
    if (
      profile === null ||
      profile.userId !== userId ||
      profile.autoCreated !== true
    ) {
      continue;
    }

    const ownNotes = await ctx.db
      .query("notes")
      .withIndex("by_user_and_profile_and_createdAt", (q) =>
        q.eq("userId", userId).eq("profileId", profileId),
      )
      .take(1);
    if (ownNotes.length > 0) {
      continue;
    }

    const stillMentioned = await ctx.db
      .query("noteMentions")
      .withIndex("by_user_and_profile", (q) =>
        q.eq("userId", userId).eq("profileId", profileId),
      )
      .take(1);
    if (stillMentioned.length > 0) {
      continue;
    }

    // The photo goes with them. `profiles.remove` already did this; this path
    // did not, and it is reachable through ordinary use: a mention link is
    // tappable, nothing stops a photo being added to the person behind it, and
    // deleting the note that invented them comes through here.
    //
    // Left out, the file survives with no row pointing at it and no route in
    // the app to remove it — a photograph of a real person, retained
    // indefinitely, that its subject and the user both have no way to delete.
    // That is a different kind of failure from the storage bill.
    if (profile.photoStorageId !== undefined) {
      await ctx.storage.delete(profile.photoStorageId);
    }
    await ctx.db.delete("profiles", profileId);
    removed += 1;
  }

  return removed;
}
