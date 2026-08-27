"use node";

import Anthropic from "@anthropic-ai/sdk";
import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import {
  EXTRACTION_MODEL,
  EXTRACTION_SCHEMA,
  MAX_TOKENS,
  MAX_TRANSCRIPT_CHARS,
  SYSTEM_PROMPT,
  buildUserMessage,
} from "./extractionPrompt";

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
export const fromTranscript = action({
  args: {
    text: v.string(),
    // Supplied by the caller so a note captured just before midnight resolves
    // "today" in the user's own timezone, not the server's.
    today: v.string(),
  },
  returns: v.object({
    primary: v.object({
      name: v.string(),
      entityType: v.union(v.literal("person"), v.literal("animal")),
      relationshipContext: v.union(v.string(), v.null()),
      tags: v.array(v.string()),
      firstMetDate: v.union(v.string(), v.null()),
      keyFacts: v.array(v.string()),
    }),
    mentions: v.array(
      v.object({
        name: v.string(),
        entityType: v.union(v.literal("person"), v.literal("animal")),
        relationshipContext: v.union(v.string(), v.null()),
        context: v.string(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new ConvexError("You're signed out. Sign in to continue.");
    }

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
        system: SYSTEM_PROMPT,
        output_config: {
          format: { type: "json_schema", schema: EXTRACTION_SCHEMA },
        },
        messages: [
          {
            role: "user",
            // Today's date and the transcript go in the message, not the system
            // prompt, so the system prompt stays byte-identical across calls —
            // a date in the prefix would invalidate the cache on every request.
            content: buildUserMessage(text, args.today),
          },
        ],
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
      console.error("Extraction failed:", error);
      throw new ConvexError(
        "Andy couldn't make sense of that one. Try again, or type it in instead.",
      );
    }

    if (response.stop_reason === "refusal") {
      // Safety classifiers declined. The transcript is the user's own speech,
      // so this should be vanishingly rare — but the response carries no usable
      // content when it happens, and reading it as JSON would throw a confusing
      // parse error instead of this.
      throw new ConvexError(
        "Andy couldn't process that note. Try rephrasing it, or type it in instead.",
      );
    }

    if (response.stop_reason === "max_tokens") {
      console.error(
        `Extraction hit max_tokens (${MAX_TOKENS}) — output was truncated and is not valid JSON.`,
      );
      throw new ConvexError(
        "That note was a long one and Andy lost the thread. Try splitting it into two.",
      );
    }

    // `content` is a discriminated union; narrow before reading `.text`.
    const textBlock = response.content.find((block) => block.type === "text");
    if (textBlock === undefined) {
      console.error(
        "Extraction returned no text block:",
        JSON.stringify(response.content),
      );
      throw new ConvexError(
        "Andy couldn't make sense of that one. Try again, or type it in instead.",
      );
    }

    try {
      // Guaranteed to match EXTRACTION_SCHEMA by structured outputs, and checked
      // again by this action's `returns` validator on the way out — so a drift
      // between the two schemas fails loudly here rather than reaching the UI.
      return JSON.parse(textBlock.text);
    } catch (error) {
      console.error("Extraction returned unparseable JSON:", error);
      throw new ConvexError(
        "Andy couldn't make sense of that one. Try again, or type it in instead.",
      );
    }
  },
});
