"use node";

import { ConvexError, v } from "convex/values";
import { internalAction } from "./_generated/server";
import { askClaude } from "./claude";
import {
  MAX_WRITE_TO_CHARS,
  WRITE_TO_MAX_TOKENS,
  WRITE_TO_MODEL,
  WRITE_TO_SCHEMA,
  WRITE_TO_SYSTEM_PROMPT,
  buildWriteToMessage,
  formatOf,
  writeToAnswerValidator,
} from "./writeToPrompt";
import type { WriteToAnswer, WriteToTone } from "./writeToPrompt";

/**
 * Writing it.
 *
 * `"use node"` for the Anthropic SDK, so it exports only an action. Internal,
 * and it takes content rather than a profile id — the shape `email.ts` and
 * `answer.ts` use: it never touches the database, so there is nothing here to
 * scope to an owner. `writeTo.ts` has already decided what the caller may send.
 *
 * Nothing is stored and nothing the person wrote is logged: the only log lines
 * are fixed strings.
 */
export const compose = internalAction({
  args: {
    personName: v.string(),
    today: v.string(),
    notes: v.array(v.object({ recordedOn: v.string(), facts: v.array(v.string()) })),
    request: v.string(),
    earlierInstructions: v.array(v.string()),
    lastAnswer: v.optional(v.string()),
    current: v.optional(v.string()),
    instruction: v.optional(v.string()),
  },
  returns: writeToAnswerValidator,
  handler: async (_ctx, args): Promise<WriteToAnswer> => {
    const result = (await askClaude({
      model: WRITE_TO_MODEL,
      maxTokens: WRITE_TO_MAX_TOKENS,
      schema: WRITE_TO_SCHEMA,
      system: WRITE_TO_SYSTEM_PROMPT,
      content: [{ type: "text", text: buildWriteToMessage(args) }],
      label: "Write to",
    })) as { text?: unknown; tone?: unknown };

    // `returns` validates after the handler has read the result, so a wrong
    // shape would surface as a raw TypeError; say something a person can act on.
    const text = typeof result.text === "string" ? result.text.trim() : "";
    if (text === "") {
      console.error("Write to returned no text.");
      throw new ConvexError("Andy couldn't write that just now. Your text is still here. Try again.");
    }

    // The tone is the model's label, kept only if it is one of the three; the
    // format is read from the text itself, so the two can never disagree.
    const tones: readonly WriteToTone[] = ["friendly", "professional", "brief"];
    const tone = tones.find((known) => known === result.tone) ?? "friendly";
    // Refused rather than cut: a cut answer reads as finished, and the next ask
    // would refuse it as too long anyway.
    if (text.length > MAX_WRITE_TO_CHARS) {
      console.error("Write to returned more than the draft limit.");
      throw new ConvexError("Andy couldn't write that just now. Your text is still here. Try again.");
    }
    return { text, tone, format: formatOf(text) };
  },
});
