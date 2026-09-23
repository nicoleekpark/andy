import { matchKey } from "./naming";

/**
 * Looking a person up by typing part of their name.
 *
 * **This is the opposite rule from the calendar matcher, on purpose**, and the
 * difference is who is choosing. `convex/calendarNames.ts` keeps comparison
 * exact because *the app* picks with nobody watching, and a wrong pick means a
 * briefing about the wrong friend arriving on somebody's phone. Here the person
 * types the query, sees a list, and taps one — a loose extra candidate costs a
 * glance, while a missing one means the app cannot find somebody it is holding.
 * Loose is safe exactly when a human is the one deciding.
 *
 * Both files must keep their own rule. Unifying them would have to break one,
 * and the one it would break is the silent one.
 *
 * The measurement behind the shape: `profiles` carries a `search_name` full-text
 * index, declared on day 1 and never used, and day 7 measured it against the
 * deployment rather than assuming:
 *
 *     query     search index              fold + substring
 *     judy      Judy Park, Judy O'Neill   Judy O'Neill, Judy Park
 *     judy o    …plus Judy Park           Judy O'Neill only
 *     o'neill   both O'Neills             both
 *     oneill    (none)                    both
 *     선희       (none)                    지선희
 *
 * It tokenises, so `oneill` is not a prefix of `o` or of `neill`, and `선희` is
 * not a prefix of `지선희` — a script with no spaces has no mid-word prefix for
 * it to find, which disqualifies the index for a bilingual app. One person's own
 * people number in the tens; folding them and matching substrings is both
 * simpler and strictly better here. The index earns its keep at a scale this
 * table does not reach.
 */

/**
 * A name reduced to what a search should ignore.
 *
 * `matchKey` already lowercases and trims — reused rather than re-implemented,
 * so "the same name" keeps one definition. This goes one step further and drops
 * everything that is not a letter or a number, which is the step that makes
 * `oneill` find `O'Neill` and `judy oneill` find `Judy O'Neill`.
 */
export function searchKey(name: string): string {
  return matchKey(name).replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * How well a name answers a query. Lower is better.
 *
 * The tiers, and why they are ordered this way: somebody who *is* called what
 * you typed comes before somebody whose name merely starts that way, who comes
 * before somebody it appears inside. A name beats an alias at every tier
 * because the name is what the person is filed under — an alias matching
 * exactly is still a nickname, and showing it above an exact name would be the
 * list disagreeing with the profile screen.
 */
export const NO_MATCH = Number.POSITIVE_INFINITY;

export function rankName(
  query: string,
  name: string,
  isAlias: boolean,
): number {
  if (query === "" || name === "") return NO_MATCH;
  const tier =
    name === query
      ? 0
      : name.startsWith(query)
        ? 2
        : name.includes(query)
          ? 4
          : NO_MATCH;
  return tier === NO_MATCH ? NO_MATCH : tier + (isAlias ? 1 : 0);
}

/**
 * The best any of a person's names can do, and which one did it.
 *
 * Every name they answer to is tried, because that is what `namesOf` is for:
 * a profile filed as "Sarah Chen" with an alias "Chenny" has to be findable by
 * both, and which one matched is worth showing — a result that says "Chenny"
 * when you typed that explains itself, and one that silently shows "Sarah Chen"
 * makes you wonder why she is in the list.
 */
export function bestMatch(
  query: string,
  names: { name: string; isAlias: boolean }[],
): { rank: number; matchedName: string } | null {
  let best: { rank: number; matchedName: string } | null = null;
  for (const candidate of names) {
    const rank = rankName(query, searchKey(candidate.name), candidate.isAlias);
    if (rank === NO_MATCH) continue;
    if (best === null || rank < best.rank) {
      best = { rank, matchedName: candidate.name };
    }
  }
  return best;
}

/**
 * Order two results that are equally good a match.
 *
 * Alphabetical, by the name they are filed under, in the caller's own locale —
 * `localeCompare` is what puts 가나다 in the order a Korean reader expects and
 * a plain `<` does not. A stable rule matters more than which rule: a list that
 * reshuffles between two equally-good matches looks like it is thinking.
 */
export function byNameThenRank(
  a: { rank: number; name: string },
  b: { rank: number; name: string },
): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  return a.name.localeCompare(b.name);
}
