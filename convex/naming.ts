/**
 * How people's names and tags are compared.
 *
 * Extracted because two files now depend on agreeing: `notes.saveCapture`
 * resolves a spoken name to an existing profile, and `profiles.updateProfile`
 * has to refuse a rename that would produce a second profile the first would
 * then match. Two copies of "the same name" is exactly the kind of duplication
 * that stays identical right up until one of them is fixed.
 */

/**
 * Names are matched case-insensitively and trimmed, but always *stored* as the
 * user wrote them. Korean names are unaffected by the case fold; "sarah chen"
 * matching an existing "Sarah Chen" is the point.
 */
export function matchKey(name: string): string {
  return name.trim().toLocaleLowerCase();
}

/**
 * Merge tag lists without letting case create duplicates: "Cats" and "cats" are
 * one tag, and the first spelling seen is the one kept, so what the user
 * actually wrote survives.
 */
export function mergeTags(existing: string[], incoming: string[]): string[] {
  const bySpelling = new Map<string, string>();
  for (const tag of [...existing, ...incoming]) {
    const trimmed = tag.trim();
    if (trimmed === "") {
      continue;
    }
    const key = trimmed.toLocaleLowerCase();
    if (!bySpelling.has(key)) {
      bySpelling.set(key, trimmed);
    }
  }
  return [...bySpelling.values()];
}

/**
 * Every name a profile answers to: the one it is filed under, then its aliases.
 *
 * One function because three places have to agree on it — resolving a spoken
 * name to a person, telling the capture screen which names are ambiguous, and
 * checking that a chosen candidate really goes by the name it was chosen for.
 * If they disagreed, a note would be filed against somebody the screen never
 * offered.
 */
export function namesOf(profile: {
  name: string;
  aliases?: string[];
}): string[] {
  return [profile.name, ...(profile.aliases ?? [])];
}

/**
 * Tidy a list of alternative names: trimmed, deduplicated case-insensitively,
 * and never repeating the name the profile is already filed under — an alias
 * identical to the name is a row that can only ever be noise.
 */
export function cleanAliases(name: string, aliases: string[]): string[] {
  const key = matchKey(name);
  return mergeTags([], aliases).filter((alias) => matchKey(alias) !== key);
}

/**
 * A name reduced to the words in it, folded and cleaned of empty gaps from
 * repeated whitespace.
 */
function nameWords(name: string): string[] {
  return matchKey(name)
    .split(/\s+/)
    .filter((word) => word !== "");
}

/**
 * Whether two names could be the same person because one is how you would
 * naturally refer to the other — "Nicole" for "Nicole Park", "Maisie" for
 * "Maisie H".
 *
 * Reported live, against real data: a user keeps three people, "Maisie",
 * "Maisie H" and "Maisie Park". Saying "Maisie" resolved only against a
 * profile *literally* named "Maisie" — matching nobody at all when there
 * wasn't one, or silently landing on the wrong Maisie when there was — and
 * "Maisie H" and "Maisie Park" were never even offered as candidates. The
 * developer's own case for why that is wrong: people refer to "Nicole Park"
 * as "Nicole" constantly, and every one of those mentions has to reach her.
 *
 * A whole-word prefix relationship, not a substring one — "Maisie" relates to
 * "Maisie Park" because `["maisie"]` is a prefix of `["maisie","park"]`, but
 * "H" does not relate to "Maisie H", and "arcus" does not relate to "Marcus".
 * A person is addressed by their names, never by a fragment cut out of the
 * middle of one — that was day 7's "Al" must not match "Alignment review",
 * carried over rather than relearned.
 *
 * The word boundary is also what keeps this from repeating the failure it
 * fixes. 지선 and 지선희 are two people, and a Korean name is usually one word
 * with no space in it — so as single, unequal tokens, they still relate to
 * nothing but themselves. Splitting on whitespace is what makes "Nicole" and
 * "Nicole Park" close while leaving 지선 and 지선희 exactly as far apart as
 * the day 7 calendar matcher — and the `CLAUDE.md` rule underneath it —
 * requires them to stay.
 */
export function namesOverlap(a: string, b: string): boolean {
  const left = nameWords(a);
  const right = nameWords(b);
  if (left.length === 0 || right.length === 0) return false;
  const [shorter, longer] =
    left.length <= right.length ? [left, right] : [right, left];
  return shorter.every((word, index) => longer[index] === word);
}

/**
 * Everyone a spoken name could mean, among the people already kept.
 *
 * Exact matches first, then the ones reached only through the overlap above —
 * both by every name and alias, per `namesOf` — because an exact match is the
 * stronger claim and the picker shows candidates in this order. Within a tier,
 * alphabetical by the name the picker actually reads, in the caller's own
 * locale: a list that reshuffles between two runs on the same data looks like
 * it is thinking.
 *
 * Deliberately not deduplicating "exact" out of "overlap" by short-circuiting
 * the search — a profile could be reached both ways (an alias matching
 * exactly, the name only overlapping) and belongs in the stronger tier either
 * way, which is why this checks every one of `namesOf` rather than stopping at
 * the first match.
 */
export function candidatesForSpokenName<
  T extends { name: string; aliases?: string[] },
>(owned: readonly T[], spokenName: string): T[] {
  const exact: T[] = [];
  const overlap: T[] = [];
  for (const profile of owned) {
    const known = namesOf(profile);
    if (known.some((name) => matchKey(name) === matchKey(spokenName))) {
      exact.push(profile);
    } else if (known.some((name) => namesOverlap(spokenName, name))) {
      overlap.push(profile);
    }
  }
  const byName = (x: T, y: T) => x.name.localeCompare(y.name);
  return [...exact.sort(byName), ...overlap.sort(byName)];
}
