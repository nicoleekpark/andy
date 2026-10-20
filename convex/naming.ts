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
  const given = givenName(profile.name);
  const names = [profile.name, ...(profile.aliases ?? [])];
  // Derived, never stored (owner, 2026-10-19, device QA B5-8): "Barbara
  // Apple" answers to "Barbara" because of her name, not because a row says
  // so — so renaming her to "Barbary Appley" moves it with her, and there is
  // no copy for anyone to delete as a duplicate. Added only when it is not
  // already one of her names.
  return given !== null && !names.some((name) => matchKey(name) === matchKey(given))
    ? [...names, given]
    : names;
}

/** Words that come before a name rather than being one. */
const HONORIFICS = new Set(["mr", "mrs", "ms", "mx", "miss", "dr", "prof", "sir", "madam"]);

/**
 * The first name inside a full one — "Barbara" from "Barbara Apple" — or
 * `null` when there is none to take.
 *
 * The first word only, never the last (owner, 2026-10-19): a surname is too
 * often an ordinary word ("Apple", "Young", "Park") to match on by itself, in
 * a calendar title above all; a person known by their surname gets it as an
 * alias by hand. Nothing for a one-word name — which is every Korean name
 * written without a space, so 지선 and 지선희 stay two names apart, the rule
 * the calendar matcher has kept since day 7. Not an honorific ("Dr. Kim" is
 * not Dr) and not an initial ("J. Smith" is not J).
 */
export function givenName(name: string): string | null {
  const lettersOf = (word: string) => word.replace(/[^\p{L}]/gu, "").toLocaleLowerCase();
  // Past any honorifics in front ("Sir John Smith" → John), and only when a
  // further word follows: "Dr. Kim" is a surname with a title, not a first name.
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word !== "");
  let at = 0;
  while (at < words.length && HONORIFICS.has(lettersOf(words[at] ?? ""))) at += 1;
  const first = words[at];
  if (first === undefined || at + 1 >= words.length) return null;
  if (lettersOf(first).length < 2) return null;
  return first;
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
 * How many other names one person can carry — the same ceiling tags have, and
 * for the same reason: past it, it is a filing system, not a person. Shared
 * so editing a profile and saving a note cannot disagree about it.
 */
export const MAX_ALIASES = 24;

/**
 * What a note could teach Andy about a kept person's name, when the note
 * called them something they do not already answer to (device QA B5-8, part
 * 2, option A): `"rename"` when what was said is a longer form of the name they
 * are filed under — "Barbara Apple" for a kept "Barbara" — and `"alias"` for
 * anything else they were chosen for — "Barbara Apple" for a kept "Barbara
 * Apple Smith". `null` when there is nothing to learn.
 *
 * One function, because the screen that offers the change and the mutation
 * that makes it have to agree on which change it is: the server re-derives it
 * rather than trusting what the screen sent, so a stale screen cannot rename
 * somebody in a way nobody saw offered.
 *
 * Never automatic — the caller only ever asks. Saying "Barbara Apple" once is
 * not proof that is her name: a mishearing is just as likely.
 */
export function nameUpdateFor(
  kept: { name: string; aliases?: string[] },
  spoken: string,
): "rename" | "alias" | null {
  const said = spoken.trim();
  if (said === "") return null;
  if (namesOf(kept).some((name) => matchKey(name) === matchKey(said))) return null;
  return namesOverlap(kept.name, said) &&
    nameWords(said).length > nameWords(kept.name).length
    ? "rename"
    : "alias";
}

/**
 * The name and aliases a person has after `nameUpdateFor`'s change is made.
 *
 * A rename keeps the old name as an alias — notes and calendar titles written
 * with it must keep reaching her — unless she already answers to it without
 * one: "Barbara" renamed to "Barbara Apple" still answers to "Barbara" through
 * `givenName`, and a stored copy would be the duplicate B5-8 set out to avoid.
 */
export function withNameUpdate(
  kept: { name: string; aliases?: string[] },
  spoken: string,
  update: "rename" | "alias",
): { name: string; aliases: string[] } {
  const said = spoken.trim();
  const aliases = kept.aliases ?? [];
  if (update === "alias") {
    return { name: kept.name, aliases: cleanAliases(kept.name, [...aliases, said]) };
  }
  const covered = namesOf({ name: said, aliases }).some(
    (name) => matchKey(name) === matchKey(kept.name),
  );
  return {
    name: said,
    aliases: cleanAliases(said, covered ? aliases : [...aliases, kept.name]),
  };
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

/**
 * Which group a character sorts in: a space before a letter, so "Adam Aron"
 * comes before "Adamo"; Latin letters, then Hangul; anything else last.
 */
function sortGroup(char: string): number {
  if (char === " ") return 0;
  if (/[a-z]/.test(char)) return 1;
  if (/[가-힣]/.test(char)) return 2;
  return 3;
}

/**
 * Lower-cased, with punctuation out ("O'Brien" sorts as "obrien"). Decomposing
 * first makes an accent a separate mark, so the same pass drops it ("Émile"
 * sorts with E). Hangul decomposes too, into jamo, and is put back together
 * at the end so a syllable is recognised as Hangul.
 */
function sortKey(name: string): string {
  return name
    .normalize("NFD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .normalize("NFC");
}

/**
 * The order people are listed in: A to Z, then 가 to 힣, compared one
 * character at a time (decided 2026-09-29). A name mixing both scripts is
 * placed by its characters in order: "Aaron" < "Adam Aron" < "Adam 한솔" <
 * "Azizi", because at the sixth character a Latin letter comes before Hangul.
 * A pure Hangul name follows every Latin one.
 *
 * Not `localeCompare`: its script order depends on the device's locale, and
 * this list has to read the same on every phone.
 */
export function compareNamesForList(a: string, b: string): number {
  const left = [...sortKey(a)];
  const right = [...sortKey(b)];
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const l = left[i]!;
    const r = right[i]!;
    if (l === r) continue;
    const byGroup = sortGroup(l) - sortGroup(r);
    if (byGroup !== 0) return byGroup;
    return l < r ? -1 : 1;
  }
  return left.length - right.length;
}

/**
 * The letter a name is filed under in home's A–Z index: its first letter,
 * from the same key the list sorts by — so "Émile" is under E and "O'Brien"
 * under O — and `#` for anything that is not A–Z, Korean included (decided
 * 2026-10-11; V1 launches English-only). Because it comes from the sort key,
 * every name under a letter sits together in the sorted list, and `#` comes
 * last, after Z, exactly where the list puts those names.
 */
export function listLetterOf(name: string): string {
  const first = [...sortKey(name)][0];
  return first !== undefined && /[a-z]/.test(first) ? first.toUpperCase() : "#";
}
