import { hasNativeModule } from "./native";
import type { UpcomingEvent } from "./calendar";

/**
 * The briefing alert and the nudge after it.
 *
 * Both are **local** notifications, scheduled on the device — `PROJECT_SCOPE.md`
 * says "schedule a local pre-meeting notification … and a post-meeting nudge",
 * and local is what makes that possible without a push service, a server that
 * knows your calendar, or anybody's device token.
 *
 * The device is also the record. `calendarLinks` has carried
 * `briefingNotificationId` and `nudgeNotificationId` since day 1 and neither is
 * written here, because a notification lives on one phone and a Convex table
 * does not: two devices signed into one account would each schedule their own,
 * and a table claiming to know which is pending would be wrong on at least one
 * of them. `getAllScheduledNotificationsAsync` is always right about the phone
 * it is asked on, and reconciling against it costs one call.
 *
 * Everything here is scheduled fresh from the calendar each time. Nothing is
 * carried over, so nothing can drift.
 */

/**
 * How many meetings get a briefing/nudge pair.
 *
 * `CLAUDE.md` is explicit: **iOS allows at most 64 pending notifications per
 * app**, and past that it silently drops the oldest — not an error, just a
 * briefing that never arrives. Each meeting costs two, so twenty is forty,
 * leaving room for whatever else this app schedules later. The rule says
 * "the next ~20-25 upcoming matched events"; twenty is the cautious end of it.
 */
const MAX_BRIEFED_MEETINGS = 20;

/** How long before a meeting the briefing arrives. */
const BRIEFING_LEAD_MINUTES = 20;

/** How long after it ends the nudge arrives. */
const NUDGE_DELAY_MINUTES = 15;

/**
 * Only ours are cancelled.
 *
 * Every notification this app schedules carries this in its `data`, so
 * reconciling can clear the app's own pending briefings without touching
 * anything scheduled by a future feature that does not know about this one.
 */
const KIND = "andy.briefing";

export type BriefingSubject = {
  eventId: string;
  title: string;
  startsAt: number;
  endsAt: number;
  /** Who it is about — the nudge opens their capture screen. */
  people: { profileId: string; name: string }[];
};

type NotificationsModule = typeof import("expo-notifications");

let loaded: NotificationsModule | null | undefined;

function notificationsModule(): NotificationsModule | null {
  if (loaded !== undefined) return loaded;
  let next: NotificationsModule | null;
  try {
    // `require`, not `await import` — only this form hands back the object a
    // test's spy sits on. Day 6 spent five red tests on the difference.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    next = require("expo-notifications");
  } catch {
    next = null;
  }
  loaded = next;
  return next;
}

export type NotificationAccess =
  | { state: "unavailable" }
  | { state: "undetermined" }
  | { state: "denied" }
  | { state: "granted" };

function readPermission(permission: {
  granted: boolean;
  canAskAgain: boolean;
}): NotificationAccess {
  if (permission.granted) return { state: "granted" };
  return permission.canAskAgain
    ? { state: "undetermined" }
    : { state: "denied" };
}

/** What we are allowed to do, without asking for anything. */
export async function notificationAccess(): Promise<NotificationAccess> {
  if (!hasNativeModule("ExpoNotificationPermissionsModule")) {
    return { state: "unavailable" };
  }
  const notifications = notificationsModule();
  if (notifications === null) return { state: "unavailable" };
  try {
    return readPermission(await notifications.getPermissionsAsync());
  } catch {
    return { state: "unavailable" };
  }
}

/** Ask, at the moment somebody asks for the thing that needs it. */
export async function askForNotifications(): Promise<NotificationAccess> {
  const notifications = notificationsModule();
  if (notifications === null) return { state: "unavailable" };
  try {
    return readPermission(await notifications.requestPermissionsAsync());
  } catch {
    return { state: "unavailable" };
  }
}

/** The text a person reads on a lock screen, before a meeting. */
export function briefingText(subject: BriefingSubject): {
  title: string;
  body: string;
} {
  const names = subject.people.map((person) => person.name);
  return {
    title: names.length === 0 ? subject.title : names.join(", "),
    // The meeting's own title, not a digest of the notes. A lock screen is
    // read by whoever is holding the phone, and whoever is holding the phone
    // is not always its owner — "Judy's mother is in hospital" on a lock
    // screen is the app leaking somebody's private business to a room.
    // Tapping opens the briefing, where it is only the owner reading.
    body: names.length === 0 ? "Coming up" : subject.title,
  };
}

/** And after it. */
/**
 * And after it.
 *
 * Names the first person only, where the briefing names everybody. That is a
 * decision rather than an oversight: the briefing answers "who is this with",
 * which is all of them, and the nudge opens **one** capture screen, which can
 * only be scoped to one person. Asking "how was Judy, Marcus?" and then
 * filing the answer under Judy alone would be the notification promising
 * something the screen behind it does not do.
 */
export function nudgeText(subject: BriefingSubject): {
  title: string;
  body: string;
} {
  const first = subject.people[0]?.name;
  return {
    title: first === undefined ? "Anything to remember?" : `How was ${first}?`,
    body: "Tap to add what you want to remember.",
  };
}

/**
 * Put the briefings and nudges for these meetings on the phone.
 *
 * Cancels this app's own pending ones first and schedules the whole set again.
 * Reconciling — working out which are still right, which moved, which meeting
 * was deleted — is more state than it is worth for at most forty items, and
 * every path through it is a way for a briefing to be silently missing.
 *
 * Returns how many pairs were scheduled, so a caller can say so and a test can
 * check the cap held.
 */
export async function scheduleBriefings(
  subjects: BriefingSubject[],
  now: number,
): Promise<number> {
  const notifications = notificationsModule();
  if (notifications === null) return 0;

  await cancelOurs(notifications);

  let scheduled = 0;
  for (const subject of subjects) {
    if (scheduled >= MAX_BRIEFED_MEETINGS) break;

    const briefingAt = subject.startsAt - BRIEFING_LEAD_MINUTES * 60_000;
    const nudgeAt = subject.endsAt + NUDGE_DELAY_MINUTES * 60_000;
    // A time already past is not a reminder. iOS fires a date trigger in the
    // past immediately, so without this the app would buzz on launch about a
    // meeting that started an hour ago.
    if (briefingAt <= now && nudgeAt <= now) continue;

    const target = subject.people[0]?.profileId;
    if (briefingAt > now) {
      await notifications.scheduleNotificationAsync({
        content: {
          ...briefingText(subject),
          data: { kind: KIND, eventId: subject.eventId, profileId: target },
        },
        trigger: {
          type: notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(briefingAt),
        },
      });
    }
    if (nudgeAt > now) {
      await notifications.scheduleNotificationAsync({
        content: {
          ...nudgeText(subject),
          data: {
            kind: KIND,
            eventId: subject.eventId,
            profileId: target,
            capture: true,
          },
        },
        trigger: {
          type: notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(nudgeAt),
        },
      });
    }
    scheduled += 1;
  }

  return scheduled;
}

/** Clear this app's pending briefings and nudges, and nothing else's. */
export async function cancelBriefings(): Promise<void> {
  const notifications = notificationsModule();
  if (notifications === null) return;
  await cancelOurs(notifications);
}

async function cancelOurs(notifications: NotificationsModule): Promise<void> {
  const pending = await notifications.getAllScheduledNotificationsAsync();
  // Together, not one at a time. Each is a hop across the native bridge and
  // this runs on every foreground; forty of them in a row is forty round
  // trips the card is not waiting for but the phone is doing anyway.
  await Promise.all(
    pending
      // `cancelAllScheduledNotificationsAsync` would be one call and would
      // also throw away anything a later feature scheduled. Ours are marked.
      .filter(
        (request) =>
          (request.content.data as { kind?: string } | undefined)?.kind ===
          KIND,
      )
      .map((request) =>
        notifications.cancelScheduledNotificationAsync(request.identifier),
      ),
  );
}

/**
 * The meetings worth a briefing, from what the calendar and the backend said.
 *
 * A meeting nobody is matched to gets nothing: a notification that says "you
 * have a meeting" is what the calendar app is already for, and this one is
 * supposed to be about a person.
 */
export function briefable(
  events: (UpcomingEvent & {
    people: { profileId: string; name: string }[];
  })[],
): BriefingSubject[] {
  return events
    .filter((event) => event.people.length > 0)
    .map((event) => ({
      eventId: event.eventId,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      people: event.people,
    }));
}
