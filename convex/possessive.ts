/**
 * "Park's housewarming party" becoming a person called Parks.
 *
 * The failure, in full, because every step of it was working as designed:
 *
 *  1. A voice note said "I met at Park's housewarming party".
 *  2. The recogniser wrote `parks` — it does not reliably place apostrophes.
 *  3. Extraction read `Parks` as somebody's name, which is the right reading
 *     of the text it was given.
 *  4. `matchKey` is exact, so `parks` is not `park`, and the note's owner
 *     already keeps a Park.
 *  5. So Andy invented a second person, one letter from a real one, silently.
 *
 * Step 4 is a non-negotiable rule — two people may share a name and the app
 * must not merge them — so the thing to fix is step 5. The app already knows
 * how to say "several people answer to this name, which did you mean"; it
 * simply never asked here, because a possessive form answers to *nobody* and
 * a zero-candidate name is created rather than queried.
 *
 * This file finds the one relationship worth asking about. It is deliberately
 * not an edit-distance: "Marc" and "Mark" are two people, "Jon" and "Jan" are
 * two people, and a rule that asked about those would ask constantly and be
 * ignored. A possessive is different — it is not a different name, it is the
 * same name with grammar attached, and it is the form a recogniser mangles.
 *
 * Both languages this app ships in, because the same note that produced
 * "Parks" had already produced the Korean version: "민호네 집들이" — Minho's
 * housewarming — where 네 does the same job as `'s`.
 */

/** English: `'s`, `’s`, `s'`, and the bare `s` a recogniser leaves behind. */
const ENGLISH = ["'s", "’s", "s'", "s’", "s"];

/**
 * Korean: the particles that turn a name into "that person's".
 *
 * `네` is the one that produced the real failure — 민호네 is Minho's place or
 * household. `의` is the written possessive. Neither is part of a name.
 */
const KOREAN = ["네", "의"];

/**
 * Names this one might be a possessive of, longest suffix first.
 *
 * Returns candidates, not an answer: whether any of them is somebody the user
 * actually keeps is the caller's question, and whether *this* is that person
 * is the user's. Parks is a real surname, so a Parks and a Park can both
 * exist — which is exactly why this produces a question rather than a merge.
 */
export function possessiveBases(name: string): string[] {
  const trimmed = name.trim();
  const bases: string[] = [];

  for (const suffix of [...ENGLISH, ...KOREAN]) {
    if (!trimmed.toLocaleLowerCase().endsWith(suffix.toLocaleLowerCase())) {
      continue;
    }
    const base = trimmed.slice(0, trimmed.length - suffix.length).trim();
    // Two characters, or the rule starts proposing that "As" means "A" and
    // every single-letter initial in a calendar becomes a question.
    if (base.length < 2) continue;
    if (!bases.includes(base)) bases.push(base);
  }

  return bases;
}

/**
 * The name to file somebody under when a possessive is all we were given.
 *
 * `Parks` might be a person — Parks is a surname, and only the speaker knows.
 * `Prisley's` is not: an apostrophe-possessive is grammar, never a name, and
 * nobody has ever been filed under one on purpose. So the written form is
 * stripped and the bare-`s` form is left exactly as it is.
 *
 * This is the half the possessive *question* cannot cover. That question only
 * appears when the base matches somebody already kept — "is Parks your Park?"
 * — and "Priya and I went to MET to see Prisley's show" names nobody the user
 * keeps, so there is nothing to ask and a person called `Prisley's` was
 * created instead. Asking "is Prisley's somebody new?" would be a question
 * with one answer.
 */
export function nameToFileUnder(name: string): string {
  const trimmed = name.trim();

  // `Prisley's` is Prisley. `Jones'` is Jones, not Jone — a plural possessive
  // keeps its s, and taking two characters off both is how "Jones" became
  // "Jone" the first time this was written.
  for (const [suffix, cut] of [
    ["'s", 2],
    ["\u2019s", 2],
    ["'", 1],
    ["\u2019", 1],
  ] as const) {
    if (!trimmed.endsWith(suffix)) continue;
    const base = trimmed.slice(0, trimmed.length - cut).trim();
    if (base.length >= 2) return base;
  }

  return trimmed;
}
