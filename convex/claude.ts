"use node";

import Anthropic from "@anthropic-ai/sdk";
import { ConvexError } from "convex/values";

/**
 * The one Claude call in this codebase, and the one place its failures are
 * translated into something a person can read.
 *
 * Pulled out of `extraction.ts` when a second caller appeared, which is the
 * point at which this project makes a helper rather than before — day 2 wrote
 * that rule down about a different helper and it holds here. Duplicating the
 * error ladder would have been worse than the extraction: two copies drift, and
 * the drift shows up as one feature explaining a rate limit properly while
 * another says something vague.
 *
 * `"use node"` even though it defines no Convex function. Convex treats every
 * single-dot file under `convex/` as a module entry point, so without the
 * directive the bundler tries to place the Anthropic SDK in the V8 runtime and
 * warns about it. Exporting no query or mutation is what makes the directive
 * legal here — that is the rule it enforces.
 */

// `process.env` is real in the Node runtime this is bundled into. Declared
// module-locally rather than via `@types/node`, which would hand `Buffer` and
// `process` to every V8-runtime file in this directory too.
declare const process: { env: Record<string, string | undefined> };

/** Options a caller must supply. Exported so callers can name the shape. */
export type ClaudeRequest = {
  model: string;
  maxTokens: number;
  system: string;
  schema: Record<string, unknown>;
  content: Anthropic.ContentBlockParam[];
  /** Named in log lines so a failure says which feature it came from. */
  label: string;
};

/**
 * Make the call, translate its failures, parse its JSON.
 *
 * Every feature that talks to Claude goes through here — extraction from a
 * transcript, extraction from a business card, and Ask Andy's written answer —
 * so none of them can quietly grow a different story for a rate limit or a
 * refusal.
 *
 * Returns `unknown`: the caller's `returns` validator is what pins the shape.
 */
export async function askClaude(options: ClaudeRequest): Promise<unknown> {
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
      model: options.model,
      max_tokens: options.maxTokens,
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
      `${options.label} hit max_tokens (${options.maxTokens}) — output was truncated and is not valid JSON.`,
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
