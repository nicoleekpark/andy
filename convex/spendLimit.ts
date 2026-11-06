/**
 * What a person reads when a provider's spend limit or credit has run out —
 * one sentence for Anthropic (`claude.ts`) and OpenAI (`embeddings.ts`), so the
 * two cannot drift. Nothing they did, and nothing a retry fixes until the owner
 * raises the limit in that provider's console (no build or deploy).
 */
export const SHORT_BREAK = "Andy is taking a short break. Try again in a little while.";
