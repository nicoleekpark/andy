/**
 * Whether a follow-up can be drafted for somebody, and what to say when it
 * cannot.
 *
 * Shared by the screen and the action on purpose. The screen needs it to decide
 * whether to offer the button at all — a button that fails on five of eleven
 * people is not an affordance — and the action needs it because it is public
 * and has to be right for any caller, including one whose screen was rendered
 * before the last note was deleted. Two copies would agree on the day they were
 * written and not after; `promptBoundary.ts` and `embeddingModel.ts` are here
 * for the same reason.
 *
 * **This file is imported by the app as well as by the backend**, which is new
 * for this repo — `embeddingModel.ts` is imported by `schema.ts`, but nothing
 * under `convex/` was reaching the screen before. It is safe because there is
 * nothing here but pure functions over plain values: no `ctx`, no database, no
 * environment, nothing Node-only, no secret. That is a condition rather than an
 * observation. A file that stops meeting it stops being importable from the
 * client, and the import is the thing that would have to move, not the rule.
 *
 * The wording lives here rather than at either end because the interesting case
 * is one where a true sentence is hard to write. Andy invents a person the
 * moment a note mentions them, so 민호 can have a profile, a timeline with a
 * note visible on it, and nothing this feature is allowed to use — the note is
 * *Judy's*, in Judy's words, and what Judy said about 민호's mother must never
 * be mailed to 민호. "Record a note first" is what that used to say, in front
 * of a screen showing a note. Both halves were true and the sentence was not.
 */

import { rememberedFacts } from "./embeddingModel";

/** Everything the decision turns on, from whichever end is asking. */
export type FollowUpScope = {
  name: string;
  entityType: "person" | "animal";
  /** Notes *about* them — the timeline. Mentions are not these. */
  ownNoteCount: number;
  /** How many of those carry at least one fact the user endorsed. */
  factNoteCount: number;
  /** Whether anyone else's note names them. */
  hasMentions: boolean;
};

/**
 * `null` when a draft can be written; otherwise the sentence to show.
 *
 * Every branch ends in something the reader can act on, because each of these
 * is reachable by ordinary use rather than by misuse.
 */
export function followUpRefusal(scope: FollowUpScope): string | null {
  if (scope.entityType !== "person") {
    // Not shown anywhere — the screen never offers the button on an animal, and
    // this exists so the public action agrees. A follow-up to a foster cat
    // would send its health notes on a trip they have no reason to take.
    return "Andy only drafts follow-ups to people.";
  }

  if (scope.ownNoteCount === 0) {
    return scope.hasMentions
      ? // The case that started this. They are on screen *because* somebody
        // else's note names them, so "nothing is written down" reads as a lie.
        `${scope.name} only comes up in notes about other people. A follow-up is written from notes about them — record one first.`
      : `There's nothing written down about ${scope.name} yet — record a note first.`;
  }

  if (scope.factNoteCount === 0) {
    // Notes exist and none of them carries an endorsed fact. Their raw text is
    // the unreviewed wording, which is exactly what carries other people in it,
    // so this feature does not fall back to it the way search does.
    return `None of the notes about ${scope.name} have anything under "What to remember" yet — that's what a follow-up is written from.`;
  }

  return null;
}

/** The same count the action does, so the screen cannot disagree about it. */
export function countFactNotes(notes: { keyFacts?: string[] }[]): number {
  return notes.filter((note) => rememberedFacts(note.keyFacts).length > 0)
    .length;
}
