import type { Doc } from "./_generated/dataModel";
import { namesFoundIn } from "./calendarNames";
import { matchKey, namesOf } from "./naming";

/**
 * Which of the people someone writes about each calendar event is with.
 *
 * A pure function over rows, so it runs in two places with one definition:
 * on the phone, against the copy it already keeps (`src/lib/use-briefing.ts`,
 * so the calendar never leaves the phone — `docs/design/decisions/
 * calendar-connection.md` #5), and in `calendar.matchEvents` for app builds
 * that still ask the server. A copy of this logic in each place would agree
 * on the day it was written and not after.
 */

/**
 * How much of a title is searched.
 *
 * Truncated rather than refused, because one odd event must not cost the whole
 * day's briefing — a description pasted into a title field is somebody's real
 * calendar, not misuse. Names live at the start of a title in every form this
 * has been seen in ("Coffee with Marcus", "지선이랑 점심"), so the cut is
 * generous enough that it should never reach a name.
 */
export const MAX_TITLE_CHARS = 500;

export type CalendarEvent = {
  /** EventKit's own identifier. */
  eventId: string;
  title: string;
  startsAt: number;
  endsAt: number;
  /** Names from the attendee list, already separated by the device. */
  attendeeNames: string[];
};

type Profile = Pick<Doc<"profiles">, "_id" | "name" | "aliases" | "entityType">;
type Note = Pick<Doc<"notes">, "profileId" | "createdAt">;

export function matchEventsIn(
  profiles: Profile[],
  notes: Note[],
  events: CalendarEvent[],
) {
  // Every name every profile answers to, folded once. Same construction as
  // `profiles.resolveNames`, for the reason that file gives: a screen asking
  // about a different set of names than the resolver acts on is how a note
  // gets filed against somebody nobody offered.
  const byName = new Map<string, Profile[]>();
  for (const profile of profiles) {
    for (const key of new Set(namesOf(profile).map(matchKey))) {
      byName.set(key, [...(byName.get(key) ?? []), profile]);
    }
  }
  const knownNames = [...byName.keys()];

  // Counted once, not per match — the same trade as `resolveNames`.
  const stats = new Map<string, { noteCount: number; lastNoteAt: number }>();
  for (const note of notes) {
    const seen = stats.get(note.profileId);
    stats.set(note.profileId, {
      noteCount: (seen?.noteCount ?? 0) + 1,
      lastNoteAt: Math.max(seen?.lastNoteAt ?? 0, note.createdAt),
    });
  }

  return events.map((event) => {
    // Attendees first, and their order is kept: a name on the invitation is
    // a stronger claim about who is coming than a word in the title.
    const hits: { key: string; via: "attendee" | "title" }[] = [];
    const seenKeys = new Set<string>();

    for (const raw of event.attendeeNames) {
      const key = matchKey(raw);
      // No separate empty check. `byName` cannot hold `""`: both write paths
      // refuse a blank name (`profiles.updateProfile`, `notes.saveCapture`)
      // and `cleanAliases` drops a blank alias, so an empty attendee name
      // falls out at `byName.has` like any other stranger. A second check
      // here read as caution and was unreachable — mutation testing removed
      // it and nothing went red, which is the whole tell.
      if (seenKeys.has(key) || !byName.has(key)) continue;
      seenKeys.add(key);
      hits.push({ key, via: "attendee" });
    }
    for (const key of namesFoundIn(
      matchKey(event.title.slice(0, MAX_TITLE_CHARS)),
      knownNames,
    )) {
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      hits.push({ key, via: "title" });
    }

    // Who the invitation itself names, resolved to one person each. Only
    // these settle a title's name below: the attendee list is the event
    // saying who is coming, while a second name in the title may be a second
    // person ("Priya Shah / Priya").
    const invited = new Set<string>();
    for (const hit of hits) {
      const matches = byName.get(hit.key) ?? [];
      if (hit.via === "attendee" && matches.length === 1 && matches[0]) {
        invited.add(matches[0]._id);
      }
    }

    const people = [];
    const ambiguous = [];
    const shown = new Set<string>();
    for (const hit of hits) {
      const matches = byName.get(hit.key) ?? [];
      if (matches.length > 1) {
        // The invitation already said which one (device QA #11): Priya Shah
        // is on the attendee list and answers to "Priya", so the title's
        // "Priya" is her. Not a guess between two people — the event chose.
        if (hit.via === "title" && matches.some((p) => invited.has(p._id))) {
          continue;
        }
        // In the order `review`'s picker lists them (`candidatesForSpokenName`
        // sorts each tier by name), so the same two people appear in the same
        // order on both screens. The first supplies the spelling: they all
        // answer to this name, so any of them is right, and which one is shown
        // cannot imply anything about which one you are meeting.
        const candidates = [...matches].sort((x, y) => x.name.localeCompare(y.name));
        ambiguous.push({
          name: candidates[0]?.name ?? hit.key,
          key: hit.key,
          count: candidates.length,
          profileIds: candidates.map((p) => p._id),
        });
        continue;
      }
      const profile = matches[0];
      // Once per meeting, however many of their names the event uses
      // ("PS / Priya Shah").
      if (profile === undefined || shown.has(profile._id)) continue;
      shown.add(profile._id);
      const seen = stats.get(profile._id);
      people.push({
        profileId: profile._id,
        name: profile.name,
        entityType: profile.entityType,
        matchedAs: hit.key,
        via: hit.via,
        noteCount: seen?.noteCount ?? 0,
        lastNoteAt: seen?.lastNoteAt ?? null,
      });
    }

    return {
      eventId: event.eventId,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      people,
      ambiguous,
    };
  });
}
