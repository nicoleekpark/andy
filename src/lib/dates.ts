/**
 * Dates as Andy shows them, in one place.
 *
 * `en-CA` formats as YYYY-MM-DD while resolving in the device's own timezone,
 * which is what both uses below need. Written out ten times across five
 * screens, a change of format — "2 Oct" instead of "2026-10-02" — was ten
 * edits and an easy miss. Now it is one (REFACTOR.md → A).
 */

/** A saved moment (milliseconds since the epoch) as a date: 2026-10-02. */
export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-CA");
}

/**
 * The user's own calendar date, not the server's — "today" in a note means
 * their today. YYYY-MM-DD, the shape the extraction prompt expects.
 */
export function localToday(): string {
  return new Date().toLocaleDateString("en-CA");
}
