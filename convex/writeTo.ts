import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalQuery } from "./_generated/server";
import { requireAiAllowed } from "./aiPermission";
import { NOTES_SCANNED } from "./emailPrompt";
import type { EmailNote } from "./emailPrompt";
import { rememberedFacts } from "./embeddingModel";
import { getAuthenticatedUser } from "./users";
import {
  MAX_ASKS_AFTER_FIRST,
  MAX_WRITE_TO_CHARS,
  MAX_INSTRUCTION_CHARS,
  MAX_WRITE_TO_NOTES,
  writeToAnswerValidator,
} from "./writeToPrompt";
import type { WriteToAnswer } from "./writeToPrompt";

/**
 * Write to {name} (`docs/design/decisions/draft-editing.md` → Final design).
 *
 * The server half only: what may be sent, and nothing kept. Versions, the
 * chat history and the text all live in the open sheet on the phone; this
 * action is handed what the sheet holds, sends it, and returns the answer.
 */

/**
 * The person, and the saved details of their newest notes — and only those.
 *
 * Notes are read by the person's own timeline index, so a note where they only
 * came up (it belongs to somebody else's timeline) is never read, and someone
 * Andy made from a mention has no notes here at all. Only a note's saved
 * details go, never its wording: the wording is the unreviewed kind that
 * carries other people in it (`followUp.ts`, `notesForFollowUp`, says why).
 *
 * Ownership is checked on the profile, and the notes are read by the caller's
 * own `userId`, for the reason `CLAUDE.md` gives: a `profileId` is a claim.
 */
export const notesForWriteTo = internalQuery({
  args: { profileId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      personName: v.string(),
      entityType: v.union(v.literal("person"), v.literal("animal")),
      notes: v.array(v.object({ recordedOn: v.string(), facts: v.array(v.string()) })),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const profileId = ctx.db.normalizeId("profiles", args.profileId);
    if (profileId === null) return null;
    const profile = await ctx.db.get("profiles", profileId);
    if (profile === null || profile.userId !== user._id) return null;

    const notes = await ctx.db
      .query("notes")
      .withIndex("by_user_and_profile_and_createdAt", (q) =>
        q.eq("userId", user._id).eq("profileId", profileId),
      )
      .order("desc")
      .take(NOTES_SCANNED);

    // The newest few that have something saved on them; all of them when
    // there are that few or fewer (owner).
    const chosen = notes
      .map((note) => ({ createdAt: note.createdAt, facts: rememberedFacts(note.keyFacts) }))
      .filter((note) => note.facts.length > 0)
      .slice(0, MAX_WRITE_TO_NOTES);

    return {
      personName: profile.name,
      entityType: profile.entityType,
      notes: chosen.map((note) => ({
        recordedOn: new Date(note.createdAt).toISOString().slice(0, 10),
        facts: note.facts,
      })),
    };
  },
});

/** Over a limit: said in the words the sheet uses (draft-editing.md → Strings). */
const TOO_LONG = "That's too long for Andy to read at once.";
const NOTHING_NEW = "Edit the text above, or tell Andy what to change.";
const TOO_MANY_ASKS = "That's the most Andy can do in one go. Copy it, or close and start again.";

/**
 * Ask Andy.
 *
 * - First ask: `request` (box A) only.
 * - Every later ask: `request` again, `earlierInstructions` (every chat line
 *   sent so far in this sheet), `current` (box B as it is), `lastAnswer` only
 *   when box B differs from it, and `instruction` (the new chat line), if any.
 *
 * Checked in this order, each before anything is spent: the AI go-ahead,
 * lengths, something new to ask, then who may be written to.
 */
export const write = action({
  args: {
    profileId: v.string(),
    /** The phone's own date, `YYYY-MM-DD`. */
    today: v.string(),
    request: v.string(),
    earlierInstructions: v.array(v.string()),
    lastAnswer: v.optional(v.string()),
    current: v.optional(v.string()),
    instruction: v.optional(v.string()),
  },
  returns: writeToAnswerValidator,
  handler: async (ctx, args): Promise<WriteToAnswer> => {
    // Before reading anything: this person's notes go to Anthropic.
    await requireAiAllowed(ctx);

    // The phone's own date, and nothing else: every other field has a cap, and
    // this one would otherwise carry any length of text to Anthropic. A date in
    // another shape would also quietly switch off the "old news" rule.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.today) || Number.isNaN(Date.parse(args.today))) {
      throw new ConvexError("Andy couldn't write that just now. Your text is still here. Try again.");
    }

    const request = args.request.trim();
    const instruction = args.instruction?.trim() ?? "";
    const current = args.current?.trim();
    const lastAnswer = args.lastAnswer?.trim();

    if (
      request.length > MAX_WRITE_TO_CHARS ||
      (current?.length ?? 0) > MAX_WRITE_TO_CHARS ||
      (lastAnswer?.length ?? 0) > MAX_WRITE_TO_CHARS
    ) {
      throw new ConvexError(TOO_LONG);
    }
    if (
      instruction.length > MAX_INSTRUCTION_CHARS ||
      args.earlierInstructions.some((said) => said.trim().length > MAX_INSTRUCTION_CHARS)
    ) {
      throw new ConvexError(TOO_LONG);
    }

    // The 10-ask cap is counted on the phone; this only stops a request that
    // carries more chat lines than ten asks could have produced.
    if (args.earlierInstructions.length > MAX_ASKS_AFTER_FIRST) {
      throw new ConvexError(TOO_MANY_ASKS);
    }

    if (current === undefined) {
      // The first ask: box A is all there is.
      if (request === "" || lastAnswer !== undefined) {
        throw new ConvexError("Write something first.");
      }
    } else {
      // A later ask is something new only if the text changed or there is a
      // new line for Andy. The phone greys the arrow; this refuses the same
      // request handed over anyway, before it is paid for.
      const edited = lastAnswer !== undefined && lastAnswer !== current;
      if (current === "" || (!edited && instruction === "")) {
        throw new ConvexError(NOTHING_NEW);
      }
    }

    const scope: {
      personName: string;
      entityType: "person" | "animal";
      notes: EmailNote[];
    } | null = await ctx.runQuery(internal.writeTo.notesForWriteTo, {
      profileId: args.profileId,
    });
    if (scope === null) {
      throw new ConvexError("Andy couldn't find that person.");
    }
    // People only: V1 has no animals to write to (decided day 10).
    if (scope.entityType !== "person") {
      throw new ConvexError("Andy only writes to people.");
    }

    return await ctx.runAction(internal.writeToClaude.compose, {
      personName: scope.personName,
      today: args.today,
      notes: scope.notes,
      request,
      earlierInstructions: args.earlierInstructions
        .map((said) => said.trim())
        .filter((said) => said !== ""),
      ...(current === undefined ? {} : { current }),
      // `buildWriteToMessage` leaves it out when it equals `current`.
      ...(lastAnswer === undefined ? {} : { lastAnswer }),
      ...(instruction === "" ? {} : { instruction }),
    });
  },
});
