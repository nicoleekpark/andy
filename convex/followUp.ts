import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { MAX_EMAIL_NOTES, followUpStyleValidator } from "./emailPrompt";
import type { EmailNote, FollowUpDraft } from "./emailPrompt";
import { rememberedFacts } from "./embeddingModel";
import { countFactNotes, followUpRefusal } from "./followUpScope";
import { getAuthenticatedUser } from "./users";
import { requireAiAllowed } from "./aiPermission";

/**
 * A follow-up email, drafted from what you already wrote down.
 *
 * `PROJECT_SCOPE.md` is specific about the shape: "generate a draft from stored
 * notes, hand off via `mailto:` deep link (no inbox read, no OAuth)". The
 * no-mailbox, no-OAuth half of that still holds and is the point; the `mailto:`
 * half was dropped, because it assumed the message was going to be an email. A
 * follow-up gets sent by text, or KakaoTalk, or pasted into whatever the two
 * people actually use. The draft is shown in the app and copied from there.
 *
 * So there is no mailbox here, no Google verification to wait on, and no
 * recipient — this app does not read Contacts and V1 stores no address.
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
      entityType: v.union(v.literal("person"), v.literal("animal")),
      /** Notes about them, before the factless ones are dropped. */
      ownNoteCount: v.number(),
      /** Whether anybody else's note names them. */
      hasMentions: v.boolean(),
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

    // Read separately from the notes above, and only far enough to answer
    // "does anybody else's note name them". The distinction matters because a
    // person Andy invented has a timeline on screen made entirely of these, and
    // telling them nothing is written down while they are looking at a note is
    // how this was reported.
    const mentions = await ctx.db
      .query("noteMentions")
      .withIndex("by_user_and_profile", (q) =>
        q.eq("userId", user._id).eq("profileId", profileId),
      )
      .take(1);

    return {
      personName: profile.name,
      entityType: profile.entityType,
      ownNoteCount: notes.length,
      hasMentions: mentions.length > 0,
      notes: notes
        .map((note) => ({
          recordedOn: new Date(note.createdAt).toISOString().slice(0, 10),
          facts: rememberedFacts(note.keyFacts),
        }))
        // A note with nothing endorsed on it is dropped rather than falling
        // back to its raw text — its raw wording is the unreviewed kind, which
        // is exactly what carries other people in it.
        .filter((note) => note.facts.length > 0),
    };
  },
});

/**
 * Remember the format and tone just used for this person, so the next draft
 * opens the same way (`follow-up-tones.md`, Final choice: kept on the server,
 * on the person's record). Owner-checked like every write; a person who is
 * gone, or not the caller's, is left alone.
 */
export const rememberStyle = internalMutation({
  args: { profileId: v.string(), style: followUpStyleValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const profileId = ctx.db.normalizeId("profiles", args.profileId);
    if (profileId === null) return null;
    const profile = await ctx.db.get("profiles", profileId);
    if (profile === null || profile.userId !== user._id) return null;
    const now = profile.followUpStyle;
    if (now?.format === args.style.format && now?.tone === args.style.tone) return null;
    await ctx.db.patch("profiles", profileId, { followUpStyle: args.style });
    return null;
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
  args: {
    profileId: v.string(),
    today: v.string(),
    /** Format and tone; absent with the `followUpTones` switch off. */
    style: v.optional(followUpStyleValidator),
  },
  returns: v.object({
    personName: v.string(),
    /** Only for an email; a message has none. */
    subject: v.optional(v.string()),
    body: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ personName: string; subject?: string; body: string }> => {
    // Before reading anything: this person's notes go to Anthropic.
    await requireAiAllowed(ctx);
    const scope: {
      personName: string;
      entityType: "person" | "animal";
      ownNoteCount: number;
      hasMentions: boolean;
      notes: EmailNote[];
    } | null = await ctx.runQuery(internal.followUp.notesForFollowUp, {
      profileId: args.profileId,
    });

    if (scope === null) {
      throw new ConvexError("Andy couldn't find that person.");
    }

    // Decided by the same function the screen uses to decide whether to offer
    // the button, so the two cannot drift into disagreeing about who can be
    // written to. Reached anyway despite the screen's check: this action is
    // public, and a screen rendered before the last note was deleted is a
    // caller with a stale answer rather than a misbehaving one.
    //
    // Nothing to follow up on, and no reason to pay Claude to discover that.
    const refusal = followUpRefusal({
      name: scope.personName,
      entityType: scope.entityType,
      ownNoteCount: scope.ownNoteCount,
      factNoteCount: countFactNotes(
        scope.notes.map((note) => ({ keyFacts: note.facts })),
      ),
      hasMentions: scope.hasMentions,
    });
    if (refusal !== null) {
      throw new ConvexError(refusal);
    }

    const written: FollowUpDraft = await ctx.runAction(internal.email.write, {
      personName: scope.personName,
      today: args.today,
      notes: scope.notes,
      style: args.style,
    });

    // Only once a draft was written: a style that failed is not the one used.
    if (args.style !== undefined) {
      try {
        await ctx.runMutation(internal.followUp.rememberStyle, {
          profileId: args.profileId,
          style: args.style,
        });
      } catch {
        // The draft is written and paid for; failing to remember the style
        // only means the next one opens as it would have anyway.
      }
    }

    return {
      personName: scope.personName,
      ...(written.subject === undefined ? {} : { subject: written.subject }),
      body: written.body,
    };
  },
});
