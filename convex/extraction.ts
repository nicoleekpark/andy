"use node";

import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { requireAiAllowed } from "./aiPermission";
import {
  CARD_SCHEMA,
  CARD_SYSTEM_PROMPT,
  EXTRACTION_MODEL,
  EXTRACTION_SCHEMA,
  MAX_IMAGE_CHARS,
  MAX_TOKENS,
  MAX_NAME_CHARS,
  MAX_TRANSCRIPT_CHARS,
  PHOTO_SCHEMA,
  PHOTO_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
  buildUserMessage,
  cardDraftValidator,
  draftValidator,
  normalizeCardName,
  peopleOnly,
  photoWordsValidator,
} from "./extractionPrompt";
import type { CardDraft, Draft, PhotoWords } from "./extractionPrompt";
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


// Every function here spends money and sends what a person wrote to
// Anthropic, so none of them run for a stranger, nor for someone who has not
// said yes to that (`requireAiAllowed`, which refuses signed-out callers too).

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
    await requireAiAllowed(ctx);

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

    const draft = (await askClaude({
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
    return peopleOnly(draft);
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
/** The photo arguments both picture doors take, and the checks they share. */
const imageArgs = {
  /** The photo, base64-encoded. Never a URL: we do not fetch what we are told to. */
  imageBase64: v.string(),
  mediaType: v.union(
    v.literal("image/jpeg"),
    v.literal("image/png"),
    v.literal("image/webp"),
    v.literal("image/gif"),
  ),
};

function checkImage(imageBase64: string) {
  if (imageBase64 === "") {
    throw new ConvexError("That photo didn't come through. Try again.");
  }
  if (imageBase64.length > MAX_IMAGE_CHARS) {
    throw new ConvexError(
      "That photo is too large for Andy to read. Try taking it again, closer in.",
    );
  }
}

/**
 * A photo — a card, a page of notes, a screenshot — turned into words for the
 * person to check (`capture-doors.md`, Final choice: the Photo screens).
 *
 * Words, not a draft: what was written is shown first and corrected, then read
 * by `fromTranscript` like any note. `about` is whose card or page it plainly
 * is, shown in its own field; never trusted further than a name the person can
 * change.
 */
export const fromPhoto = action({
  args: imageArgs,
  returns: photoWordsValidator,
  handler: async (ctx, args): Promise<PhotoWords> => {
    await requireAiAllowed(ctx);
    checkImage(args.imageBase64);

    const words = (await askClaude({
      model: EXTRACTION_MODEL,
      maxTokens: MAX_TOKENS,
      system: PHOTO_SYSTEM_PROMPT,
      schema: PHOTO_SCHEMA,
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: args.mediaType, data: args.imageBase64 },
        },
        { type: "text", text: "Write down the words on this photo." },
      ],
      label: "Photo reading",
    })) as PhotoWords;

    const text = typeof words?.text === "string" ? words.text.trim() : "";
    // A name is a name: one line, a sane length, a card's capitals undone.
    // Anything else is dropped rather than trusted — the field is then empty
    // ("who?") and the words stay whole.
    const raw = typeof words?.about === "string" ? words.about.trim() : "";
    const about =
      raw === "" || raw.length > MAX_NAME_CHARS || /[\r\n]/.test(raw)
        ? null
        : normalizeCardName(raw);
    return { about, text };
  },
});

export const fromBusinessCard = action({
  args: imageArgs,
  returns: cardDraftValidator,
  handler: async (ctx, args) => {
    await requireAiAllowed(ctx);
    checkImage(args.imageBase64);

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

    const recased = {
      ...card.draft,
      primary: { ...primary, name: normalizeCardName(primary.name) },
    };
    return { ...card, draft: peopleOnly(recased) };
  },
});
