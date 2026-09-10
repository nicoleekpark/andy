"use node";

import { ConvexError, v } from "convex/values";
import { internalAction } from "./_generated/server";
import { askClaude } from "./claude";
import {
  ANSWER_MAX_TOKENS,
  ANSWER_MODEL,
  ANSWER_SCHEMA,
  ANSWER_SYSTEM_PROMPT,
  answerValidator,
  buildAnswerMessage,
} from "./answerPrompt";
import type { Answer } from "./answerPrompt";

/**
 * The second half of Ask Andy: prose over the notes recall found.
 *
 * `"use node"` because it goes through the Anthropic SDK, which is also why it
 * exports only an action — a query or mutation in a `"use node"` file is
 * rejected by Convex. `search.ts` reaches it with `ctx.runAction`.
 *
 * **Internal, and it takes note *content* rather than note ids.** That is the
 * shape that keeps this file out of the ownership story entirely: it never
 * touches the database, so there is nothing here to scope to an owner and no
 * way to ask it for somebody else's notes. `search.hydrate` has already decided
 * what the caller may read, and this only sees what came back from that.
 *
 * It is also why the answer cannot outrun its sources. The model is given
 * exactly the notes the screen will show, so an answer that cites note 3 cites
 * something the reader can tap.
 */
export const write = internalAction({
  args: {
    question: v.string(),
    notes: v.array(
      v.object({
        index: v.number(),
        aboutName: v.string(),
        createdAt: v.string(),
        keyFacts: v.optional(v.array(v.string())),
        text: v.string(),
      }),
    ),
  },
  returns: answerValidator,
  handler: async (_ctx, args): Promise<Answer> => {
    const result = (await askClaude({
      model: ANSWER_MODEL,
      maxTokens: ANSWER_MAX_TOKENS,
      schema: ANSWER_SCHEMA,
      system: ANSWER_SYSTEM_PROMPT,
      // The question and the notes go in the message rather than the system
      // prompt, so the system prompt stays byte-identical across calls and
      // stays cacheable — the same reasoning `extraction.ts` records.
      content: [
        { type: "text", text: buildAnswerMessage(args.question, args.notes) },
      ],
      label: "Ask Andy",
    })) as Partial<Answer>;

    // `returns` validates on the way out, which is after this handler has
    // already indexed into the result — so a response missing `usedNotes`
    // becomes a raw TypeError and a generic client message rather than
    // something anyone can act on. Structured outputs make it unlikely; the
    // guard costs two lines.
    if (typeof result.answer !== "string" || !Array.isArray(result.usedNotes)) {
      console.error("Ask Andy returned a body of the wrong shape.");
      throw new ConvexError(
        "Andy couldn't put that into words. Try asking it differently.",
      );
    }

    // A model asked for note indexes can return one that was never sent —
    // rarely, but the consequence is a citation pointing at nothing, which is
    // worse than a missing citation because it looks like evidence. Only
    // indexes that were actually offered survive.
    const offered = new Set(args.notes.map((note) => note.index));
    return {
      answer: result.answer,
      usedNotes: result.usedNotes.filter((index) => offered.has(index)),
    };
  },
});
