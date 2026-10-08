import type { Doc, Id } from "./_generated/dataModel";
import { rememberedFacts } from "./embeddingModel";
import { compareNamesForList, namesOf } from "./naming";
import { bestMatch, byNameThenRank, searchKey } from "./peopleSearch";

/**
 * What the reading screens show, built from one account's rows.
 *
 * The same functions serve both sides of the connection: the queries
 * (`profiles.people`, `profiles.withNotes`, `notes.byId`, `people.search`)
 * build their answers with them on the server, and the app builds the same
 * answers from the copy kept on the phone when there is no connection
 * (`src/lib/offline-copy.tsx`, decided 2026-10-07). One definition, so a
 * screen offline can never drift from the same screen online.
 *
 * Pure: no database, no server imports. Every argument is already the
 * caller's own rows — ownership is the query's job, before it gets here.
 */

/** A note without its search vector: 1,536 numbers no screen reads. */
export type NoteRow = Omit<Doc<"notes">, "embedding">;

/** Drop the search vector before a note leaves the server. */
export function withoutEmbedding(note: Doc<"notes">): NoteRow {
  const { embedding: _embedding, ...rest } = note;
  return rest;
}

/**
 * Newest first, and the same order whoever hands the rows in: on an equal
 * `createdAt` (two notes saved from the phone together, say) the one created
 * later comes first — the order the narrow index used to guarantee. Without
 * the second key the server and the phone's copy, which collect rows in
 * different orders, could show the same two notes in opposite order.
 */
export function newestFirst(
  a: { createdAt: number; _creationTime?: number },
  b: { createdAt: number; _creationTime?: number },
): number {
  return b.createdAt - a.createdAt || (b._creationTime ?? 0) - (a._creationTime ?? 0);
}

/** How many "mentioned in" rows a profile shows before "and N more". */
export const MENTIONED_IN_SHOWN = 5;

/** `profiles.people`: home's list. */
export function peopleView(profiles: Doc<"profiles">[], notes: NoteRow[]) {
  const byProfile = new Map<
    string,
    {
      lastNoteAt: number;
      noteCount: number;
      latestFact: string | null;
      latestFactAt: number;
    }
  >();
  for (const note of notes) {
    const seen = byProfile.get(note.profileId);
    // Through the same filter search and Ask Andy use, so a whitespace-only
    // fact is no more a line here than it is a fact there.
    const fact = rememberedFacts(note.keyFacts)[0];
    // Latest by `createdAt`, which is when the note was *said*: a note kept
    // offline and saved later is backdated to that moment (`noteDate` in
    // notes.ts), so a later save of an older note does not take over the
    // line under someone's name. `>=` on an exact tie (the same millisecond)
    // lets the later-read note win, which is arbitrary and harmless.
    const newer =
      fact !== undefined && note.createdAt >= (seen?.latestFactAt ?? -Infinity);
    byProfile.set(note.profileId, {
      lastNoteAt: Math.max(seen?.lastNoteAt ?? 0, note.createdAt),
      noteCount: (seen?.noteCount ?? 0) + 1,
      latestFact: newer ? fact : (seen?.latestFact ?? null),
      latestFactAt: newer ? note.createdAt : (seen?.latestFactAt ?? -Infinity),
    });
  }

  return profiles
    .flatMap((profile) => {
      const stats = byProfile.get(profile._id);
      return stats === undefined
        ? []
        : [
            {
              profile,
              lastNoteAt: stats.lastNoteAt,
              noteCount: stats.noteCount,
              latestFact: stats.latestFact,
            },
          ];
    })
    .sort((a, b) => compareNamesForList(a.profile.name, b.profile.name));
}

/**
 * `profiles.withNotes`: one person's page. `null` when they are not among
 * these rows. `photoUrl` comes from the caller — a signed storage URL on the
 * server, nothing offline.
 */
export function withNotesView(
  profileId: string,
  profiles: Doc<"profiles">[],
  notes: NoteRow[],
  links: Doc<"noteMentions">[],
  photoUrl: string | null,
) {
  const profile = profiles.find((p) => p._id === profileId);
  if (profile === undefined) return null;

  const names = new Map<string, string>();
  for (const owned of profiles) names.set(owned._id, owned.name);

  const mine = notes
    .filter((note) => note.profileId === profile._id)
    .sort(newestFirst);
  const noteById = new Map(notes.map((note) => [note._id as string, note]));
  const mineById = new Set(mine.map((note) => note._id as string));

  const byNote = new Map<
    string,
    { profileId: Id<"profiles">; name: string; quote: string; exists: boolean }[]
  >();
  const mentionedIn = [];

  for (const link of links) {
    if (link.profileId === profile._id) {
      const source = noteById.get(link.noteId);
      if (source !== undefined && source.profileId !== profile._id) {
        mentionedIn.push({
          noteId: link.noteId,
          createdAt: source.createdAt,
          _creationTime: source._creationTime,
          quote: link.quote,
          aboutProfileId: source.profileId,
          aboutName: names.get(source.profileId) ?? "",
        });
      }
    }
    if (mineById.has(link.noteId)) {
      const list = byNote.get(link.noteId) ?? [];
      // The person as they are now, when they still exist — renamed since
      // the note was written, the link should say who they are today. The
      // recorded name only when they are gone, and then not as a link.
      const current = names.get(link.profileId);
      list.push({
        profileId: link.profileId,
        name: current ?? link.name,
        quote: link.quote,
        exists: current !== undefined,
      });
      byNote.set(link.noteId, list);
    }
  }

  mentionedIn.sort(newestFirst);

  return {
    profile,
    photoUrl,
    notes: mine.map((note) => ({
      note,
      mentions: byNote.get(note._id) ?? [],
    })),
    mentionedIn: mentionedIn
      .slice(0, MENTIONED_IN_SHOWN)
      .map(({ _creationTime: _c, ...entry }) => entry),
    mentionedInTotal: mentionedIn.length,
  };
}

/** `notes.byId`: one note, and whose timeline it is on. */
export function noteView(noteId: string, profiles: Doc<"profiles">[], notes: NoteRow[]) {
  const note = notes.find((n) => n._id === noteId);
  if (note === undefined) return null;
  const profile = profiles.find((p) => p._id === note.profileId);
  return { note, profileName: profile?.name ?? "" };
}

/** Fewer letters than this match too much to mean anything: "a" is in everyone. */
export const MIN_WORD_CHARS = 2;
/** How much of the matching sentence a result shows. */
const SNIPPET_CHARS = 90;

/**
 * Where a word appears in what you kept about someone — the sentence it is in,
 * shortened — or `null`. Folded the way names are (`searchKey`), so "dog
 * lover" finds "Dog-lover" and case never matters.
 */
export function wordMatch(needle: string, texts: (string | undefined)[]): string | null {
  for (const text of texts) {
    if (text === undefined || text.trim() === "") continue;
    if (!searchKey(text).includes(needle)) continue;
    const sentence =
      text
        .split(/(?<=[.!?。！？])\s*|\n+/)
        .find((part) => searchKey(part).includes(needle)) ?? text;
    const trimmed = sentence.trim();
    return trimmed.length > SNIPPET_CHARS ? `${trimmed.slice(0, SNIPPET_CHARS - 1)}…` : trimmed;
  }
  return null;
}

/** Enough of the list to be useful, small enough to read once. */
export const MAX_PEOPLE = 20;
export const MAX_MENTIONS = 30;

/** `people.search`: finding someone by name, and the notes they came up in. */
export function searchView(
  query: string,
  profiles: Doc<"profiles">[],
  notes: NoteRow[],
  links: Doc<"noteMentions">[],
) {
  const needle = searchKey(query);
  if (needle === "") return { people: [], mentions: [] };

  // Counted from one read rather than per candidate — the same trade
  // `resolveNames` and `matchEvents` make, revisited by pagination when a
  // person has thousands of notes.
  const stats = new Map<string, { noteCount: number; lastNoteAt: number }>();
  for (const note of notes) {
    const seen = stats.get(note.profileId);
    stats.set(note.profileId, {
      noteCount: (seen?.noteCount ?? 0) + 1,
      lastNoteAt: Math.max(seen?.lastNoteAt ?? 0, note.createdAt),
    });
  }

  const mentionCounts = new Map<string, number>();
  for (const link of links) {
    mentionCounts.set(link.profileId, (mentionCounts.get(link.profileId) ?? 0) + 1);
  }

  // Everything kept about each person, for finding them by a word in it
  // (decided 2026-10-08): newest note first, so the line shown is the latest.
  const notesOf = new Map<string, NoteRow[]>();
  for (const note of [...notes].sort(newestFirst)) {
    const list = notesOf.get(note.profileId) ?? [];
    list.push(note);
    notesOf.set(note.profileId, list);
  }

  const nameMatched = profiles.some((profile) => {
    const [name, ...aliases] = namesOf(profile);
    return (
      bestMatch(needle, [
        { name: name ?? profile.name, isAlias: false },
        ...aliases.map((alias) => ({ name: alias, isAlias: true })),
      ]) !== null
    );
  });

  const ranked = [];
  const byWord = [];
  for (const profile of profiles) {
    // `namesOf` is the rule — a profile answers to its name *and* its
    // aliases, the same set every other name lookup in this codebase uses.
    const [name, ...aliases] = namesOf(profile);
    const match = bestMatch(needle, [
      { name: name ?? profile.name, isAlias: false },
      ...aliases.map((alias) => ({ name: alias, isAlias: true })),
    ]);
    const seen = stats.get(profile._id);
    const row = {
      profileId: profile._id,
      name: profile.name,
      entityType: profile.entityType,
      relationshipContext: profile.relationshipContext,
      noteCount: seen?.noteCount ?? 0,
      mentionCount: mentionCounts.get(profile._id) ?? 0,
      lastNoteAt: seen?.lastNoteAt ?? null,
    };

    if (match === null) {
      // Not by name: by a word in what you kept about them — how you know
      // them, their tags, what to remember, and the notes' own words. No
      // model involved, so it works offline exactly as online.
      if (needle.length < MIN_WORD_CHARS) continue;
      const theirs = notesOf.get(profile._id) ?? [];
      const found = wordMatch(needle, [
        profile.relationshipContext,
        ...profile.tags,
        ...theirs.flatMap((note) => rememberedFacts(note.keyFacts)),
        // A note's own words echo other people's names ("met Judy today"),
        // so they count only when nobody answers to the word by name — a
        // name in someone's note belongs under "Came up in", not here.
        ...(nameMatched ? [] : theirs.map((note) => note.text)),
      ]);
      if (found !== null) byWord.push({ ...row, matchedName: profile.name, matchedIn: found });
      continue;
    }

    ranked.push({
      rank: match.rank,
      ...row,
      matchedName: match.matchedName,
      matchedIn: undefined as string | undefined,
    });
  }
  ranked.sort(byNameThenRank);
  // `rank` decided the order and is not the caller's business — a screen
  // that could read it would eventually branch on it, and the tiers are an
  // implementation detail of `peopleSearch.ts`.
  // People found by name first — that is what most searches are — then
  // anyone else found by a word in what you kept about them, alphabetically.
  // A name never hides someone else's word match: a dog called Max does not
  // hide Marcus tagged "max effort".
  byWord.sort((a, b) => compareNamesForList(a.name, b.name));
  const people = [...ranked.map(({ rank: _rank, ...person }) => person), ...byWord].slice(
    0,
    MAX_PEOPLE,
  );

  // Mentions of any of those people, plus mentions whose recorded name
  // matches even though the profile is gone. The second half is the point of
  // `noteMentions.name` existing: deleting somebody must not erase them from
  // the notes of everyone who mentioned them, so their name still shows and
  // simply stops opening anything.
  const matchedIds = new Set(people.map((person) => person.profileId as string));
  const byNote = new Map(notes.map((note) => [note._id as string, note]));
  const names = new Map(profiles.map((p) => [p._id as string, p.name]));

  const mentions = [];
  for (const link of links) {
    const source = byNote.get(link.noteId);
    if (source === undefined) continue;
    const stillExists = names.has(link.profileId);
    // A note *about* Judy is already in `people` above — this list is the
    // other direction, where she comes up inside somebody else's.
    if (matchedIds.has(source.profileId)) continue;
    if (!matchedIds.has(link.profileId) && !searchKey(link.name).includes(needle)) {
      continue;
    }
    mentions.push({
      _creationTime: source._creationTime,
      noteId: link.noteId,
      aboutProfileId: source.profileId,
      aboutName: names.get(source.profileId) ?? "",
      profileId: stillExists ? link.profileId : null,
      name: stillExists ? (names.get(link.profileId) ?? link.name) : link.name,
      quote: link.quote,
      createdAt: source.createdAt,
    });
  }
  mentions.sort(newestFirst);

  return {
    people,
    mentions: mentions.slice(0, MAX_MENTIONS).map(({ _creationTime: _c, ...entry }) => entry),
  };
}
