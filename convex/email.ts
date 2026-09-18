"use node";

import { ConvexError, v } from "convex/values";
import { internalAction } from "./_generated/server";
import { askClaude } from "./claude";
import {
  EMAIL_MAX_TOKENS,
  EMAIL_MODEL,
  EMAIL_SCHEMA,
  EMAIL_SYSTEM_PROMPT,
  MAX_EMAIL_BODY_CHARS,
  MAX_EMAIL_SUBJECT_CHARS,
  buildEmailMessage,
  emailDraftValidator,
} from "./emailPrompt";
import type { EmailDraft } from "./emailPrompt";

/**
 * Writing the follow-up email.
 *
 * `"use node"` for the Anthropic SDK, so it exports only an action.
 *
 * Internal, and it takes note **content** rather than a profile id — the same
 * shape `answer.ts` uses and for the same reason. It never touches the
 * database, so there is nothing here to scope to an owner and no way to ask it
 * for somebody else's notes. `followUp.ts` has already decided what the caller
 * may read; this only sees what came back from that.
 */
export const write = internalAction({
  args: {
    personName: v.string(),
    today: v.string(),
    notes: v.array(
      v.object({
        recordedOn: v.string(),
        facts: v.array(v.string()),
        rawRecord: v.optional(v.string()),
      }),
    ),
  },
  returns: emailDraftValidator,
  handler: async (_ctx, args): Promise<EmailDraft> => {
    const result = (await askClaude({
      model: EMAIL_MODEL,
      maxTokens: EMAIL_MAX_TOKENS,
      schema: EMAIL_SCHEMA,
      system: EMAIL_SYSTEM_PROMPT,
      content: [
        {
          type: "text",
          text: buildEmailMessage(args.personName, args.today, args.notes),
        },
      ],
      label: "Follow-up email",
    })) as Partial<EmailDraft>;

    // `returns` validates after the handler has already read the result, so a
    // response missing a field becomes a raw TypeError and a generic client
    // message rather than something anyone can act on.
    if (typeof result.subject !== "string" || typeof result.body !== "string") {
      console.error("Follow-up email returned a body of the wrong shape.");
      throw new ConvexError(
        "Andy couldn't put that into words. Try again in a moment.",
      );
    }

    return {
      // Capped for the same reason the body is:  is 1024, so
      // a misbehaving response can put thousands of characters here and
      // reintroduce the silent truncation the body cap exists to prevent.
      subject: result.subject.trim().slice(0, MAX_EMAIL_SUBJECT_CHARS),
      // Cut here rather than trusting the prompt. This goes to Mail through a
      // `mailto:` URL, and an over-long URL is not refused — it is silently
      // truncated somewhere between the app, the OS and Mail, which would drop
      // the end of a sentence with nothing to show that anything was lost.
      body: result.body.trim().slice(0, MAX_EMAIL_BODY_CHARS),
    };
  },
});
