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
