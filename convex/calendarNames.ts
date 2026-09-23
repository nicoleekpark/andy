/**
 * Finding the people you already keep inside a calendar event's own words.
 *
 * `PROJECT_SCOPE.md` calls this "fuzzy-match attendee/title names to profiles",
 * and the direction that phrase invites is the wrong one. Loosening how two
 * names are compared is the one thing this codebase must not do: `CLAUDE.md`'s
 * rule is that two people may share a name and one person may answer to
 * several, so a comparison that matches *approximately* files a note — or here,
 * a briefing — against somebody nobody offered. `matchKey` stays exact.
 *
 * The problem is inverted instead. A title is not a name and never parses like
 * one ("Coffee with Marcus", "Marcus / Nicole 1:1", "지선이랑 점심", "Standup"),
 * so rather than extracting names from a title and looking them up, this asks
 * which of the names the user *already keeps* appear in the title. Nothing is
 * guessed, nothing new is considered a name, and the set of things that can
 * match is exactly the set of people they have written down.
 *
 * What is left is where a name may begin and end, and that is a real question
 * in two scripts at once.
 */

/**
 * Korean particles that attach directly to a name with no space.
 *
 * "지선이랑", "지선과", "지선님" are all 지선. Without this the only safe rule
 * for Hangul is "the name must be followed by a boundary", and a calendar full
 * of "지선이랑 점심" would match nobody — the common way to write a name in
 * Korean would be the one way that fails.
 *
 * Bounded on purpose. Allowing *any* trailing Hangul would make 지선 match
 * inside 지선희, which is a different person, and this project refuses to tell
 * somebody their friend does not exist by merging them with a stranger.
 * Longest first, so "에게" is tried before "에".
 */
const PARTICLES = [
  "에게서",
  "한테서",
  "이랑",
  "에게",
  "한테",
  "하고",
  "까지",
  "부터",
  "이가",
  "이는",
  "이를",
  "이와",
  "이도",
  "님과",
  "님은",
  "님이",
  "씨와",
  "씨는",
  "씨가",
  "과",
  "와",
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "도",
  "만",
  "의",
  "랑",
  "님",
  "씨",
  "네",
  "에",
];

/** Letters and digits of any script, plus the marks that sit inside a word. */
const WORDY = /[\p{L}\p{N}\p{M}]/u;

function isWordy(character: string | undefined): boolean {
  return character !== undefined && WORDY.test(character);
}

/**
 * Does `name` occur in `text` as a name rather than as part of a longer word?
 *
 * Both are already folded by `matchKey`. The rule on each side:
 *
 *  - **Before** the match, a boundary. "Al" must not match inside "Alignment",
 *    and it must not match the second half of "Marshal" either.
 *  - **After** the match, a boundary — or one particle and then a boundary.
 *    "지선이랑" is 지선; "지선희" is not.
 *
 * The particle rule is not restricted to Hangul names, and that restriction is
 * what mutation testing removed without a single test noticing. It was there on
 * the theory that only Korean names take particles, which is backwards: the
 * particle belongs to the *sentence*, not to the name, and somebody writing
 * their calendar in Korean writes "Judy랑 점심" exactly as readily as
 * "지선이랑 점심". The restriction excluded that and protected nothing — a
 * Latin word followed by Hangul is already a boundary either way.
 */
function occursAsName(text: string, name: string): boolean {
  if (name === "") return false;

  let from = 0;
  for (;;) {
    const at = text.indexOf(name, from);
    if (at === -1) return false;
    from = at + 1;

    if (isWordy(text[at - 1])) continue;

    const end = at + name.length;
    const next = text[end];
    if (!isWordy(next)) return true;

    const rest = text.slice(end);
    for (const particle of PARTICLES) {
      if (rest.startsWith(particle) && !isWordy(rest[particle.length])) {
        return true;
      }
    }
  }
}

/**
 * Which of `knownNames` appear in `text`, in the spelling they were given.
 *
 * Deduplicated, because `knownNames` can legitimately repeat: two people may
 * share a name, so two profiles folded by `matchKey` produce the same key, and
 * a title naming them once would otherwise report the name twice. Who those two
 * people are is the caller's problem to surface — this function's job is which
 * names the title says, and it says each one once.
 *
 * Returned in the order they were given rather than the order they appear:
 * the caller's order is the one it can explain, and an event title's word
 * order means nothing about who the meeting is with.
 *
 * Both arguments are expected pre-folded by `matchKey` — this file deliberately
 * does not fold anything itself, so there is no second definition of what
 * "the same name" means.
 */
export function namesFoundIn(text: string, knownNames: string[]): string[] {
  const found: string[] = [];
  for (const name of knownNames) {
    if (occursAsName(text, name) && !found.includes(name)) {
      found.push(name);
    }
  }
  return found;
}
