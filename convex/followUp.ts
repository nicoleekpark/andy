import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalQuery } from "./_generated/server";
import { MAX_EMAIL_NOTES } from "./emailPrompt";
import type { EmailDraft, EmailNote } from "./emailPrompt";
import { rememberedFacts } from "./embeddingModel";
import { getAuthenticatedUser } from "./users";

/**
 * A follow-up email, drafted from what you already wrote down.
 *
 * `PROJECT_SCOPE.md` is specific about the shape: "generate a draft from stored
 * notes, hand off via `mailto:` deep link (no inbox read, no OAuth)". So there
 * is no mailbox here, no Google verification to wait on, and no recipient —
 * Mail opens with the subject and body filled in and the To line empty, because
 * this app does not read Contacts and V1 does not store an address.
 *
 * That is a smaller feature than it sounds and a deliberately cheap one: the
 * expensive half of "email integration" is the OAuth scope review that
 * `PROJECT_SCOPE.md`'s Reality Check 5 says can take weeks and is outside
 * anyone's control.
 */

/**
 * This person's recent notes, and only this person's.
 *
 * **Only notes about them, and only the facts they carry.**
 *
 * The first half was never enough on its own, and thinking it was is the
 * mistake this comment used to record. A third party's business does not live
 * in a separate note — it lives *inside* the primary's own note, which is why
 * `noteMentions.quote` is by construction a substring of `notes.text`
 * (`schema.ts`). So "we never gather mentions" is true and does not protect
 * anybody: the divorce 민호 is going through is in 지선's note, in her words.
 *
 * What protects them is the second half. A note with no facts contributes
 * nothing the user reviewed and endorsed, and its raw text is exactly the
 * unreviewed wording that carries other people in it — so it is not sent at
 * all. The facts branch already withheld the raw record for that reason; the
 * factless branch used to send precisely that, in the case where the risk is
 * highest, because a note with no facts never went through a review screen.
 *
 * Everything gathered here is read by somebody who is not the user. That is
 * true of nothing else in this app, and it is why this is stricter than search.
 *
 * Ownership is checked on the profile and again on every note, for the reason
 * `CLAUDE.md` gives: Convex has no referential integrity, so a `profileId` is a
 * claim rather than a guarantee.
 */
export const notesForFollowUp = internalQuery({
  args: { profileId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      personName: v.string(),
      notes: v.array(
        v.object({
          recordedOn: v.string(),
          facts: v.array(v.string()),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    const profileId = ctx.db.normalizeId("profiles", args.profileId);
    if (profileId === null) return null;
    const profile = await ctx.db.get("profiles", profileId);
    // One `null` for "no such person" and "not yours", the same as every other
    // route-id read in this codebase.
    if (profile === null || profile.userId !== user._id) return null;

    const notes = await ctx.db
      .query("notes")
      .withIndex("by_user_and_profile_and_createdAt", (q) =>
        q.eq("userId", user._id).eq("profileId", profileId),
      )
      .order("desc")
      .take(MAX_EMAIL_NOTES);

    return {
      personName: profile.name,
      notes: notes
        .map((note) => ({
          recordedOn: new Date(note.createdAt).toISOString().slice(0, 10),
          facts: rememberedFacts(note.keyFacts),
        }))
        // A note with nothing endorsed on it is dropped rather than falling
        // back to its raw text. If that empties the set, the caller's existing
        // "nothing written down about them yet" refusal is already the right
        // thing to say.
        .filter((note) => note.facts.length > 0),
    };
  },
});

/**
 * Draft it.
 *
 * An action because it calls Claude. Identity is resolved before the model is,
 * so a signed-out caller cannot spend anything — the same ordering, and the
 * same reason, as `extraction.ts` and `search.ts`.
 */
export const draft = action({
  args: { profileId: v.string(), today: v.string() },
  returns: v.object({
    personName: v.string(),
    subject: v.string(),
    body: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ personName: string; subject: string; body: string }> => {
    const scope: {
      personName: string;
      notes: EmailNote[];
    } | null = await ctx.runQuery(internal.followUp.notesForFollowUp, {
      profileId: args.profileId,
    });

    if (scope === null) {
      throw new ConvexError("Andy couldn't find that person.");
    }
    if (scope.notes.length === 0) {
      // Nothing to follow up on, and no reason to pay Claude to discover that.
      // The screen says so rather than opening an empty message.
      throw new ConvexError(
        "There's nothing written down about them yet — record a note first.",
      );
    }

    const written: EmailDraft = await ctx.runAction(internal.email.write, {
      personName: scope.personName,
      today: args.today,
      notes: scope.notes,
    });

    return {
      personName: scope.personName,
      subject: written.subject,
      body: written.body,
    };
  },
});
