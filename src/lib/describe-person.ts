import { formatDate } from "./dates";

/**
 * What separates two people who share a name: how you know them, how much is
 * recorded, and when you last added to it.
 *
 * One definition for every place that asks "which one?" — `review`'s
 * `name-choice` and the `briefing-card`'s pick — so the same two Priyas read
 * the same way on both screens (`briefing-card-people.md` R-P10). Each caller
 * also repeats it in an accessibility label, and two copies would drift; the
 * screen-reader version is the one nobody notices going stale.
 */
export function describePerson(candidate: {
  relationshipContext?: string;
  entityType: "person" | "animal";
  noteCount: number;
  lastNoteAt: number | null;
}): string {
  return [
    candidate.relationshipContext,
    candidate.entityType === "animal" ? "animal" : null,
    `${candidate.noteCount} ${candidate.noteCount === 1 ? "note" : "notes"}`,
    candidate.lastNoteAt === null
      ? "never written about"
      : `last ${formatDate(candidate.lastNoteAt)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}
