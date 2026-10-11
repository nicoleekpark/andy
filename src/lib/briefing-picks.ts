import { useSyncExternalStore } from "react";
import { matchKey, namesOf } from "@convex/naming";
import { briefingPicksStore, onForgetOnThisPhone } from "./on-phone";

/**
 * Which person a shared name on a calendar event means — answered once on the
 * briefing card, kept on this phone (`docs/design/decisions/
 * briefing-card-people.md`, R-P1–R-P8).
 *
 * Keyed by **(EventKit event id, the folded name)**: every occurrence of a
 * recurring event shares one id, so one answer covers the series, and a title
 * that later gains a second name keeps the answer for the first. If iOS gives
 * the event a new id the answer is lost and asked again — never guessed.
 *
 * **Never sent anywhere.** An event id written to the server would carry the
 * calendar off the phone (`calendar-connection.md` decision 5), which is why
 * `calendarLinks` is not used. Tagged with the account it belongs to, and gone
 * on sign-out and deletion (`forgetOnThisPhone`).
 */

export type Pick = {
  eventId: string;
  /** The name as `matchKey` folds it — the `key` on `ambiguous`. */
  nameKey: string;
  /** The person meant, or "none": a person of that name not in Andy (R-P6). */
  profileId: string;
  pickedAt: number;
  /** The last read this event was seen in, written at most once a day (R-P7). */
  lastSeenAt: number;
};

/** "Neither of them": the meeting is with somebody nobody has written about. */
export const NONE = "none";

/** An answer for an event not seen in this long is dropped (R-P7). */
export const FORGET_AFTER_MS = 90 * 24 * 3600_000;
/** At most this many answers; past it the longest-unseen goes first (R-P7). */
export const MAX_PICKS = 500;
const DAY_MS = 24 * 3600_000;

type OnDisk = { ownerId: string; picks: Pick[] };

function isPick(value: unknown): value is Pick {
  const v = value as Partial<Pick> | null;
  return (
    typeof v === "object" &&
    v !== null &&
    typeof v.eventId === "string" &&
    typeof v.nameKey === "string" &&
    typeof v.profileId === "string" &&
    typeof v.pickedAt === "number" &&
    typeof v.lastSeenAt === "number"
  );
}

function read(): OnDisk | null {
  try {
    const raw = briefingPicksStore.read();
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<OnDisk>;
    if (typeof parsed.ownerId !== "string" || !Array.isArray(parsed.picks)) return null;
    return { ownerId: parsed.ownerId, picks: parsed.picks.filter(isPick) };
  } catch {
    // An unreadable file is no answers, which only means asking again.
    return null;
  }
}

let current: OnDisk | null | undefined;
const listeners = new Set<() => void>();
/** Bumped on every change, so a hook can depend on "the answers changed". */
let version = 0;

function notify() {
  version += 1;
  for (const listener of listeners) listener();
}

function save(next: OnDisk, { quietly = false } = {}) {
  current = next;
  try {
    briefingPicksStore.write(JSON.stringify(next));
  } catch {
    // Held for this session; the worst case is being asked again next time.
  }
  if (!quietly) notify();
}

// A sign-out removes the file; the next account must not inherit what is
// held here.
onForgetOnThisPhone(() => {
  current = undefined;
  notify();
});

/** This account's answers. Another account's file reads as none. */
export function picksOf(ownerId: string): Pick[] {
  if (current === undefined) current = read();
  return current !== null && current.ownerId === ownerId ? current.picks : [];
}

/** Answer which person `nameKey` means on `eventId` — one tap, saved at once (R-P4). */
export function pick(
  ownerId: string,
  eventId: string,
  nameKey: string,
  profileId: string,
  now = Date.now(),
): void {
  const others = picksOf(ownerId).filter(
    (p) => !(p.eventId === eventId && p.nameKey === nameKey),
  );
  save({
    ownerId,
    picks: [...others, { eventId, nameKey, profileId, pickedAt: now, lastSeenAt: now }],
  });
}

/** "Not this Priya?" / Change: back to unanswered (R-P10 — no default left behind). */
export function unpick(ownerId: string, eventId: string, nameKey: string): void {
  const picks = picksOf(ownerId);
  const kept = picks.filter((p) => !(p.eventId === eventId && p.nameKey === nameKey));
  if (kept.length !== picks.length) save({ ownerId, picks: kept });
}

/** A change to the answers, for a refresh to follow (R-P5: picking reschedules). */
export function useBriefingPicksVersion(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
  );
}

type Profile = { _id: string; name: string; aliases?: string[] };

/**
 * The answers worth keeping (R-P7), pruned on every refresh because nothing
 * else can reach this file — a person deleted on another phone never tells
 * this one.
 *
 * Dropped: an answer whose person is not in the copy any more or no longer
 * answers to the name (renamed, alias removed), and one for an event unseen in
 * `FORGET_AFTER_MS`. Kept to `MAX_PICKS`, longest-unseen first out. Events in
 * `seenEventIds` have `lastSeenAt` moved to `now`, at most once a day.
 */
export function prunePicks(
  picks: Pick[],
  profiles: Profile[],
  seenEventIds: ReadonlySet<string>,
  now: number,
): Pick[] {
  const byId = new Map(profiles.map((p) => [p._id, p]));
  const answersTo = (profileId: string, nameKey: string) => {
    const profile = byId.get(profileId);
    return profile !== undefined && namesOf(profile).some((n) => matchKey(n) === nameKey);
  };
  return picks
    .filter((p) => p.profileId === NONE || answersTo(p.profileId, p.nameKey))
    .map((p) =>
      seenEventIds.has(p.eventId) && now - p.lastSeenAt >= DAY_MS
        ? { ...p, lastSeenAt: now }
        : p,
    )
    .filter((p) => now - p.lastSeenAt < FORGET_AFTER_MS)
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
    .slice(0, MAX_PICKS);
}

/** Prune this account's answers and write them back only if anything changed. */
export function tidyPicks(
  ownerId: string,
  profiles: Profile[],
  seenEventIds: ReadonlySet<string>,
  now = Date.now(),
): Pick[] {
  const before = picksOf(ownerId);
  const after = prunePicks(before, profiles, seenEventIds, now);
  const same =
    after.length === before.length &&
    after.every((p) => before.some((b) => b === p));
  // Quietly: tidying happens inside a refresh and changes nothing that
  // refresh is not already showing. Telling the hook would start a second
  // refresh for no reason.
  if (!same) save({ ownerId, picks: after }, { quietly: true });
  return after;
}

type Person = { profileId: string; name: string; noteCount: number };
type Ambiguous = { name: string; key: string; count: number; profileIds: string[] };

/**
 * One matched event with its answers applied (R-P3): an answered name becomes
 * that person (`pickedFor` says which name, so the card can offer "Not this
 * Priya?"), "none" becomes `declined`, and only unanswered names stay
 * `ambiguous`. An answer counts only while its person is still one of that
 * name's candidates.
 */
export function applyPicks<P extends Person, E extends { eventId: string; people: P[]; ambiguous: Ambiguous[] }>(
  event: E,
  picks: Pick[],
  personFor: (profileId: string) => P | undefined,
): Omit<E, "people" | "ambiguous"> & {
  people: (P & { pickedFor?: string })[];
  ambiguous: Ambiguous[];
  declined: { name: string; key: string }[];
} {
  const people: (P & { pickedFor?: string })[] = [...event.people];
  const ambiguous: Ambiguous[] = [];
  const declined: { name: string; key: string }[] = [];
  for (const entry of event.ambiguous) {
    const answer = picks.find((p) => p.eventId === event.eventId && p.nameKey === entry.key);
    if (answer?.profileId === NONE) {
      declined.push({ name: entry.name, key: entry.key });
      continue;
    }
    const person =
      answer !== undefined && entry.profileIds.includes(answer.profileId)
        ? personFor(answer.profileId)
        : undefined;
    if (person === undefined) {
      ambiguous.push(entry);
      continue;
    }
    // Once per meeting, as matching does (M3): the person may already be on it
    // under another name.
    if (!people.some((p) => p.profileId === person.profileId)) {
      people.push({ ...person, pickedFor: entry.key });
    }
  }
  return { ...event, people, ambiguous, declined };
}
