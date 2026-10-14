import { namesFoundIn } from "@convex/calendarNames";
import { matchKey } from "@convex/naming";

/**
 * The people already kept whose name appears in what was written — offered as
 * suggestions for "About" when Andy is not reading (Save as written). Not AI:
 * a plain comparison against names and aliases the person already has, so it
 * can only ever suggest somebody they keep, never invent one.
 *
 * A suggestion, never a choice: a name that is also a word ("May", "Grace")
 * can match by accident, so the person always taps it themselves.
 *
 * Which names a text says is the calendar's question too, and it is answered
 * once, in `namesFoundIn`: whole names only ("Mayor" is not May, "이민호" is
 * not 민호), Korean particles allowed ("지수가", "민호네"), and a name inside a
 * longer one also found is not a second name ("Priya Shah" is not "Priya").
 */
const SHORTEST = 2;

export function namesInText(
  text: string,
  people: { name: string; aliases?: string[] }[],
  max = 3,
): string[] {
  // Every spelling, folded, to the name it belongs to — one per name, however
  // many people share it: which one is asked afterwards, as it always is.
  const nameOf = new Map<string, string>();
  for (const person of people) {
    for (const spelling of [person.name, ...(person.aliases ?? [])]) {
      const key = matchKey(spelling);
      if (key.length >= SHORTEST && !nameOf.has(key)) nameOf.set(key, person.name);
    }
  }
  const folded = matchKey(text);
  const firstAt = (key: string) => folded.indexOf(key);
  const shown = new Set<string>();
  return namesFoundIn(folded, [...nameOf.keys()])
    .sort((a, b) => firstAt(a) - firstAt(b))
    .flatMap((key) => {
      const name = nameOf.get(key) ?? key;
      const once = matchKey(name);
      if (shown.has(once)) return [];
      shown.add(once);
      return [name];
    })
    .slice(0, max);
}
