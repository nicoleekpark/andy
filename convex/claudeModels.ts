/**
 * Every Claude model this app calls, written once.
 *
 * The model ids are tokens in the same sense as `src/constants/theme.ts`'s
 * colours: a feature names the tier it wants, never the id string. Each feature
 * still keeps its own constant (`EXTRACTION_MODEL`, `ANSWER_MODEL`,
 * `EMAIL_MODEL`) because each is its own decision — answers could move up a
 * tier without extraction following. What lives here is only the spelling, so
 * that moving a tier to a newer version is one line rather than a hunt.
 *
 * Not in `claude.ts`: that file is `"use node"`, and the prompt modules that
 * pick a model are also imported by the plain-script measurement harness.
 */
export const CLAUDE_MODELS = {
  haiku: "claude-haiku-4-5",
} as const;

export type ClaudeModel = (typeof CLAUDE_MODELS)[keyof typeof CLAUDE_MODELS];
