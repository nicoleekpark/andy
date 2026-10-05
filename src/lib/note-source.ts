import type { Doc } from "@convex/_generated/dataModel";

/**
 * What a note's own words are called, given the door the note came through.
 *
 * "What you said" is simply untrue on a note captured from a business card —
 * nobody said it, it was read off a card — and being able to check a fact
 * against its source is the entire reason the words stay reachable. A label
 * that misnames the source defeats the control it opens. A voice note and a
 * calendar nudge are both spoken into the app, so they share a label; anything
 * added later lands on that same default until it earns wording of its own,
 * which is the safe direction to be wrong in.
 *
 * Written out on three screens before this, matching only because nobody had
 * changed one (REFACTOR.md → A).
 *
 * `draft` is the capture review, before anything is saved: the card is still
 * in front of the user, so it *says*; once saved, it *said*. A person's own
 * words read the same either way.
 */
export function sourceLabel(
  source: Doc<"notes">["source"],
  { draft = false }: { draft?: boolean } = {},
): string {
  switch (source) {
    case "business_card":
      return draft ? "What the card says" : "What the card said";
    case "manual":
      return "What you wrote";
    default:
      return "What you said";
  }
}
