import { listLetterOf } from "@convex/naming";

/**
 * home's A–Z index (device QA #7, decided 2026-10-11): letter headings and an
 * index down the right, like Contacts — but only once the list is long enough
 * that scrolling to a name is slow. A short list stays as it was: one calm
 * column with nothing to navigate.
 */

/** From this many people, home shows letter headings and the index. */
export const INDEX_FROM = 20;

/** Every letter the index shows, in order — whether or not anyone is under it. */
export const INDEX_LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"] as const;

export type Section<T> = { letter: string; data: T[] };

/**
 * The list cut into sections by `listLetterOf`, in the order it is given (the
 * list's own sort, which already keeps each letter's names together). Below
 * `INDEX_FROM` it is one section with no letter, and `indexed` is false.
 */
export function sectionsOf<T>(
  rows: readonly T[],
  nameOf: (row: T) => string,
): { indexed: boolean; sections: Section<T>[] } {
  if (rows.length === 0) return { indexed: false, sections: [] };
  if (rows.length < INDEX_FROM) return { indexed: false, sections: [{ letter: "", data: [...rows] }] };
  const sections: Section<T>[] = [];
  for (const row of rows) {
    const letter = listLetterOf(nameOf(row));
    const last = sections[sections.length - 1];
    if (last?.letter === letter) last.data.push(row);
    else sections.push({ letter, data: [row] });
  }
  return { indexed: true, sections };
}

/**
 * Which section a tap on `letter` goes to: its own, or — when nobody is under
 * it — the next one down that has somebody, the way Contacts does it. Past the
 * last letter with anyone, the last section.
 */
export function sectionFor(letter: string, sections: readonly { letter: string }[]): number {
  const at = INDEX_LETTERS.indexOf(letter as (typeof INDEX_LETTERS)[number]);
  const found = sections.findIndex(
    (section) => INDEX_LETTERS.indexOf(section.letter as (typeof INDEX_LETTERS)[number]) >= at,
  );
  return found === -1 ? sections.length - 1 : found;
}
