"use node";

import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import {
  CARD_SCHEMA,
  CARD_SYSTEM_PROMPT,
  EXTRACTION_MODEL,
  EXTRACTION_SCHEMA,
  MAX_IMAGE_CHARS,
  MAX_TOKENS,
  MAX_NAME_CHARS,
  MAX_TRANSCRIPT_CHARS,
  SYSTEM_PROMPT,
  buildUserMessage,
  cardDraftValidator,
  draftValidator,
  normalizeCardName,
} from "./extractionPrompt";
import type { CardDraft, Draft } from "./extractionPrompt";
import { askClaude } from "./claude";


/**
 * Claude extraction — the one place a captured input becomes a structured draft.
 *
 * PROJECT_SCOPE.md's Entry-Input Channels table is explicit that every channel
 * (record button, widget, business card, later SMS/email) is "just a different
 * front door into the _same_ capture → extract → store pipeline". So this file
 * deliberately knows nothing about *how* the text was produced: on-device
 * speech recognition, a hosted transcriber, a share sheet, or typing. That is
 * what keeps the Day 2 transcription decision reversible — swapping the
 * transcriber touches the capture screen, never this action.
 *
 * This file is Node-runtime (`"use node"`) because it bundles a third-party
 * SDK. It therefore exports ONLY an action: putting a query or mutation in a
 * `"use node"` file is rejected by Convex (see `_generated/ai/guidelines.md`).
 */

/**
 * Turn a transcript (or any captured text) into a draft for the user to confirm.
 *
 * Public, because the capture screen calls it directly and shows the result for
 * editing before anything is written. It deliberately writes nothing: the user
 * flow in PROJECT_SCOPE.md is "see extracted draft → confirm/edit → save", so
 * saving is a separate, later step and a rejected draft leaves no trace.
 *
 * Auth is checked even though nothing is read or written, because this spends
 * money on a paid API. Without the check, this action is a public endpoint that
 * anyone on the internet can bill to this deployment's Anthropic key.
 */


/**
 * Every function here spends money, so none of them run for a stranger.
 *
 * Typed as the real `ActionCtx` rather than a structural stand-in: a shape this
 * loose would accept a future stub that satisfies the type without being wired
 * to anything, and pass an auth check that checks nothing.
 */
async function requireSignedIn(ctx: ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new ConvexError("You're signed out. Sign in to continue.");
  }
}

export const fromTranscript = action({
  args: {
    text: v.string(),
    // Supplied by the caller so a note captured just before midnight resolves
    // "today" in the user's own timezone, not the server's.
    today: v.string(),
    /**
     * Who the note is about, when the user already decided that before
     * speaking — recording from a profile's own page rather than from home.
     *
     * A name rather than an id, matching `notes.saveCapture`: this action
     * never touches the database, so an id would be a value it could not
     * check and does not need. It reaches the model as a line above the
     * transcript, and the review screen still shows the resulting name for
     * the user to change.
     */
    aboutName: v.optional(v.string()),
  },
  returns: draftValidator,
  handler: async (ctx, args) => {
    await requireSignedIn(ctx);

    const text = args.text.trim();
    if (text === "") {
      throw new ConvexError("There's nothing to save yet — try recording again.");
    }

    // A spoken note has no legitimate reason to run to tens of thousands of
    // characters. Without a ceiling, an authenticated caller can loop this
    // action with huge inputs and run up the Anthropic bill — the one real
    // abuse vector a public, paid-API action introduces. CLAUDE.md rules out
    // REST-style rate-limiting infrastructure for V1, and this needs none:
    // it is an argument check, in the same place every other one lives.
    if (text.length > MAX_TRANSCRIPT_CHARS) {
      throw new ConvexError(
        "That note is longer than Andy can take in one go. Try splitting it into two.",
      );
    }

    // The same reasoning as the transcript ceiling above, for the same reason:
    // this is a client-supplied string that goes straight to a paid API. The
    // screen only ever sends a profile name, but the action is reachable
    // without it. A name that does not fit on a profile screen does not need
    // to fit here either.
    if ((args.aboutName ?? "").length > MAX_NAME_CHARS) {
      throw new ConvexError(
        "Andy couldn't tell who that note was about. Try recording it again.",
      );
    }

    return (await askClaude({
      model: EXTRACTION_MODEL,
      maxTokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      schema: EXTRACTION_SCHEMA,
      // Today's date and the transcript go in the message, not the system
      // prompt, so the system prompt stays byte-identical across calls — a date
      // in the prefix would invalidate the cache on every request.
      content: [
        { type: "text", text: buildUserMessage(text, args.today, args.aboutName) },
      ],
      label: "Extraction",
    })) as Draft;
  },
});

/**
 * A photographed business card, through the same pipeline.
 *
 * Returns the identical draft a voice note produces, so the review screen and
 * the save path need no idea which door this came through — plus the card's own
 * text, which becomes the note body and carries the email and phone number the
 * `profiles` table has no column for.
 */
export const fromBusinessCard = action({
  args: {
    /** The photo, base64-encoded. Never a URL: we do not fetch what we are told to. */
    imageBase64: v.string(),
    mediaType: v.union(
      v.literal("image/jpeg"),
      v.literal("image/png"),
      v.literal("image/webp"),
      v.literal("image/gif"),
    ),
  },
  returns: cardDraftValidator,
  handler: async (ctx, args) => {
    await requireSignedIn(ctx);

    if (args.imageBase64 === "") {
      throw new ConvexError("That photo didn't come through. Try again.");
    }
    if (args.imageBase64.length > MAX_IMAGE_CHARS) {
      throw new ConvexError(
        "That photo is too large for Andy to read. Try taking it again, closer in.",
      );
    }

    const card = (await askClaude({
      model: EXTRACTION_MODEL,
      maxTokens: MAX_TOKENS,
      system: CARD_SYSTEM_PROMPT,
      schema: CARD_SCHEMA,
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: args.mediaType,
            data: args.imageBase64,
          },
        },
        { type: "text", text: "Read this business card." },
      ],
      label: "Card extraction",
    })) as CardDraft;

    // The prompt asks Claude to read `JOE KING` as the name Joe King rather than
    // as the card's typography, and it usually does — but not every time, and a
    // name that slips through is not a display glitch: it is written to
    // `profiles.name`, where the next card for the same person no longer matches
    // it. Normalising here rather than on the review screen means the save path,
    // the screen and any future door all get the same answer. Only the name:
    // a job title set in capitals is what the card actually says.
    //
    // Guarded rather than dereferenced blindly. Structured outputs make a
    // malformed body very unlikely, but reading through it would turn that into
    // a TypeError, and the `returns` validator below gives a far better
    // description of what was wrong than a crash inside this function.
    const primary = card?.draft?.primary;
    if (typeof primary?.name !== "string") {
      return card;
    }

    return {
      ...card,
      draft: {
        ...card.draft,
        primary: { ...primary, name: normalizeCardName(primary.name) },
      },
    };
  },
});
