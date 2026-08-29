"use node";

import Anthropic from "@anthropic-ai/sdk";
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
  MAX_TRANSCRIPT_CHARS,
  SYSTEM_PROMPT,
  buildUserMessage,
  cardDraftValidator,
  draftValidator,
  normalizeCardName,
} from "./extractionPrompt";
import type { CardDraft, Draft } from "./extractionPrompt";

// `process.env` is real here because this file runs in the Node runtime. It is
// declared module-locally, exactly as auth.config.ts does, rather than reached
// for globally: `/// <reference types="node" />` would pull @types/node into the
// whole *program*, handing `Buffer` and `process` to every V8-runtime query in
// this directory as well. (Note that Convex's own types already leak Node
// globals in via node_modules/convex/dist/cjs-types/bundler/fs.d.ts, so tsc
// cannot be relied on to catch Node APIs in a default-runtime file — this
// declaration documents intent, it is not the thing enforcing it.)
declare const process: { env: Record<string, string | undefined> };

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
 * The one place a Claude call is made, its failures translated, and its JSON
 * parsed. Both doors into extraction — a spoken transcript and a photographed
 * business card — go through here, so neither can quietly grow a different
 * story for a rate limit or a refusal.
 *
 * Returns `unknown`: the caller's `returns` validator is what pins the shape.
 */
async function askClaude(options: {
  system: string;
  schema: Record<string, unknown>;
  content: Anthropic.ContentBlockParam[];
  /** Named in log lines so a failure says which door it came through. */
  label: string;
}): Promise<unknown> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // A configuration fault, not a user fault. Loud in the logs, vague to the
    // client: the client can do nothing about it and shouldn't learn our
    // deployment's shape from an error string.
    console.error(
      "ANTHROPIC_API_KEY is not set on this Convex deployment. " +
        "Set it with: npx convex env set ANTHROPIC_API_KEY sk-ant-...",
    );
    throw new ConvexError(
      "Andy can't reach Claude right now. This one's on us — try again shortly.",
    );
  }

  const client = new Anthropic({ apiKey });

  let response;
  try {
    response = await client.messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: MAX_TOKENS,
      system: options.system,
      output_config: { format: { type: "json_schema", schema: options.schema } },
      messages: [{ role: "user", content: options.content }],
    });
  } catch (error) {
    // Typed SDK errors, most specific first. Each maps to something the user
    // can act on — or to an honest "not your fault" when they can't.
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("Anthropic rejected the API key:", error.message);
      throw new ConvexError(
        "Andy can't reach Claude right now. This one's on us — try again shortly.",
      );
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new ConvexError(
        "Andy is thinking about too many things at once. Try again in a moment.",
      );
    }
    if (error instanceof Anthropic.APIConnectionError) {
      // This is Convex's outbound connection failing, not the caller's — they
      // plainly have a working connection, or this action would not be
      // running. Telling them to check their wifi would send them to fix
      // something that isn't broken.
      throw new ConvexError(
        "Andy couldn't reach Claude right now. Try again in a moment.",
      );
    }
    console.error(`${options.label} failed:`, error);
    throw new ConvexError(
      "Andy couldn't make sense of that one. Try again, or type it in instead.",
    );
  }

  if (response.stop_reason === "refusal") {
    // Safety classifiers declined. The response carries no usable content when
    // that happens, and reading it as JSON would throw a confusing parse error
    // instead of this.
    throw new ConvexError(
      "Andy couldn't process that one. Try again, or type it in instead.",
    );
  }

  if (response.stop_reason === "max_tokens") {
    console.error(
      `${options.label} hit max_tokens (${MAX_TOKENS}) — output was truncated and is not valid JSON.`,
    );
    throw new ConvexError(
      "That one was long and Andy lost the thread. Try splitting it into two.",
    );
  }

  // `content` is a discriminated union; narrow before reading `.text`.
  const textBlock = response.content.find((block) => block.type === "text");
  if (textBlock === undefined) {
    // Block *types* only. A card's content blocks would carry a third party's
    // name, email and phone straight into the deployment logs, and the type
    // list is what actually diagnoses this.
    console.error(
      `${options.label} returned no text block. Block types:`,
      response.content.map((block) => block.type).join(", "),
    );
    throw new ConvexError(
      "Andy couldn't make sense of that one. Try again, or type it in instead.",
    );
  }

  try {
    // Structured outputs guarantee the shape and the caller's `returns`
    // validator re-checks it, so a drift between the two fails loudly at the
    // Convex boundary rather than reaching the UI.
    return JSON.parse(textBlock.text);
  } catch (error) {
    console.error(`${options.label} returned unparseable JSON:`, error);
    throw new ConvexError(
      "Andy couldn't make sense of that one. Try again, or type it in instead.",
    );
  }
}

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

    return (await askClaude({
      system: SYSTEM_PROMPT,
      schema: EXTRACTION_SCHEMA,
      // Today's date and the transcript go in the message, not the system
      // prompt, so the system prompt stays byte-identical across calls — a date
      // in the prefix would invalidate the cache on every request.
      content: [{ type: "text", text: buildUserMessage(text, args.today) }],
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
