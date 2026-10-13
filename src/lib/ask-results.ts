/**
 * The notes the answer did not use that are still worth a look: only those that
 * matched the question at least as closely as the weakest note it did use
 * (device QA #38).
 *
 * The score floor in `convex/search.ts` is deliberately low — it can only spot
 * noise, because a real cross-lingual match and an unrelated note score in the
 * same band — so up to a dozen near-misses come back. Listing all of them read
 * as "nine notes, all unrelated". A note that matched *less* well than every
 * note the answer relied on cannot be one it missed, so it is left out; a note
 * that matched as well or better might be, and stays behind the fold.
 * Nothing used: nothing to compare against, and nothing is folded.
 */
export function othersWorthShowing<T extends { used: boolean; score: number }>(results: T[]): T[] {
  const usedScores = results.filter((result) => result.used).map((result) => result.score);
  if (usedScores.length === 0) return [];
  const weakestUsed = Math.min(...usedScores);
  return results.filter((result) => !result.used && result.score >= weakestUsed);
}
