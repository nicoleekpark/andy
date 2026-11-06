"use node";

import { ConvexError, v } from "convex/values";
import { internalAction } from "./_generated/server";
import { askClaude } from "./claude";
import {
  MAX_KEEP_EXACTLY_CHARS,
  MAX_KEEP_EXACTLY_ITEMS,
  MAX_WRITE_TO_CHARS,
  WRITE_TO_MAX_TOKENS,
  WRITE_TO_MODEL,
  WRITE_TO_SCHEMA,
  WRITE_TO_SYSTEM_PROMPT,
  buildWriteToMessage,
  detailsToKeep,
  formatOf,
  writeToAnswerValidator,
} from "./writeToPrompt";
import type { WriteToAnswer, WriteToInput, WriteToTone } from "./writeToPrompt";

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
    const first = await ask(args);

    // Key details are checked in code, not only asked for (Final design;
    // owner, 2026-11-04): on a later ask, every day, date, time, number and
    // link in box B must still be there. Not on the first ask — box A mixes
    // the message with instructions like "two sentences" — and not for a
    // kind of detail the new chat line names itself, because then changing
    // one is what the person asked for (`detailsToKeep`).
    if (args.current === undefined) return first;
    const instruction = args.instruction ?? "";
    const missing = detailsToKeep(args.current, first.text, instruction);
    if (missing.length === 0) return first;

    // Once more, told exactly what to keep. Whatever comes back is returned
    // as is, naming what is still missing so the sheet can say "Check: …":
    // the person sees it and can fix it in the box. If the second try fails,
    // the first answer is still a usable one, so it is the one given.
    console.error("Write to dropped a key detail; asking once more.");
    let second: WriteToAnswer;
    try {
      second = await ask({ ...args, keepExactly: missing });
    } catch {
      console.error("Write to's second try failed; returning the first answer.");
      return withDropped(first, missing);
    }
    return withDropped(second, detailsToKeep(args.current, second.text, instruction));
  },
});

/** The answer, carrying the details it lost, if any (a few, each short). */
function withDropped(answer: WriteToAnswer, dropped: string[]): WriteToAnswer {
  if (dropped.length === 0) return answer;
  const capped = dropped.slice(0, MAX_KEEP_EXACTLY_ITEMS);
  return { ...answer, droppedDetails: capped.map((detail) => detail.slice(0, MAX_KEEP_EXACTLY_CHARS)) };
}

/** One call to Claude, shaped into an answer or refused. */
async function ask(input: WriteToInput): Promise<WriteToAnswer> {
  const result = (await askClaude({
    model: WRITE_TO_MODEL,
    maxTokens: WRITE_TO_MAX_TOKENS,
    schema: WRITE_TO_SCHEMA,
    system: WRITE_TO_SYSTEM_PROMPT,
    content: [{ type: "text", text: buildWriteToMessage(input) }],
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
}
