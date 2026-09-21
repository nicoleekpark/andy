import { hasNativeModule } from "./native";

/**
 * Reading the next few hours of the device's calendar.
 *
 * EventKit rather than a Google Calendar integration, and that is
 * `PROJECT_SCOPE.md`'s Reality Check 8 rather than a shortcut: the iOS Calendar
 * app already syncs Google and most CalDAV accounts, so one permission and one
 * API cover all of them. A second OAuth integration would be redundant work
 * that also has to be reviewed by somebody else's compliance team.
 *
 * Nothing here writes. Andy has no reason to put anything in a calendar, and
 * `app.json` asks for read access only — the write-only variant of the
 * permission is deliberately not requested, and `expo-calendar`'s config plugin
 * is deliberately not used because it declares Reminders usage strings this app
 * never touches.
 *
 * The module is loaded at the point of use, never at the top of a file. Day 6
 * learned this the expensive way: a native module's JavaScript throws when it
 * is *evaluated*, not when it is called, so a static import in a file a screen
 * imports takes the whole screen down on any build that predates the module.
 * A dev client here is rebuilt on EAS and takes minutes, so being one module
 * behind is an ordinary state rather than a broken machine.
 */

export type UpcomingEvent = {
  eventId: string;
  title: string;
  startsAt: number;
  endsAt: number;
  attendeeNames: string[];
};

export type CalendarAccess =
  /** The module is not in this build. Nothing to ask for, nothing to show. */
  | { state: "unavailable" }
  | { state: "undetermined" }
  | { state: "denied" }
  | { state: "granted" };

type CalendarModule = typeof import("expo-calendar");

let loaded: CalendarModule | null | undefined;

function calendarModule(): CalendarModule | null {
  if (loaded !== undefined) return loaded;
  let next: CalendarModule | null;
  try {
    // `require`, not `await import`: only this form hands back the same object
    // a test's spy sits on. Day 6 spent five red tests on that difference.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    next = require("expo-calendar");
  } catch {
    next = null;
  }
  loaded = next;
  return next;
}

/**
 * What the app is allowed to read, without asking for anything.
 *
 * Separate from `askForCalendar` because the two are different moments: this
 * one runs on render, and a screen that requested permission just because it
 * appeared would be exactly the app-wide prompt `CLAUDE.md` forbids.
 */
export async function calendarAccess(): Promise<CalendarAccess> {
  if (!hasNativeModule("ExpoCalendar")) return { state: "unavailable" };
  const calendar = calendarModule();
  if (calendar === null) return { state: "unavailable" };

  try {
    const permission = await calendar.getCalendarPermissions();
    if (permission.granted) return { state: "granted" };
    // `canAskAgain` is the difference between a button that will work and a
    // button that silently does nothing because iOS will never show the sheet
    // again. The screen needs to say different things in those two cases.
    return permission.canAskAgain
      ? { state: "undetermined" }
      : { state: "denied" };
  } catch {
    return { state: "unavailable" };
  }
}

/** Ask, at the moment the person asked for the thing that needs it. */
export async function askForCalendar(): Promise<CalendarAccess> {
  const calendar = calendarModule();
  if (calendar === null) return { state: "unavailable" };

  try {
    const permission = await calendar.requestCalendarPermissions();
    if (permission.granted) return { state: "granted" };
    return permission.canAskAgain
      ? { state: "undetermined" }
      : { state: "denied" };
  } catch {
    return { state: "unavailable" };
  }
}

/**
 * Events starting between `from` and `to`, across every calendar on the device.
 *
 * Every calendar, because the user chose which accounts to sync into iOS and
 * choosing again inside this app would be a second, worse settings screen.
 *
 * All-day events are dropped. "Anna's birthday" sitting on today would put a
 * briefing at the top of the screen all day about a meeting that is not
 * happening, and the thing this feature is for is the twenty minutes before you
 * walk into a room.
 */
export async function readUpcoming(
  from: Date,
  to: Date,
): Promise<UpcomingEvent[]> {
  const calendar = calendarModule();
  if (calendar === null) return [];

  const calendars = await calendar.getCalendars();
  if (calendars.length === 0) return [];

  const events = await calendar.listEvents(calendars, from, to);

  const worth = [];
  for (const event of events) {
    if (event.allDay) continue;

    const startsAt = new Date(event.startDate).getTime();
    const endsAt = new Date(event.endDate).getTime();
    // A date EventKit could not parse is not a meeting anybody can be briefed
    // for, and `NaN` would sort into the middle of the list and render as
    // "Invalid Date".
    if (Number.isNaN(startsAt) || Number.isNaN(endsAt)) continue;

    worth.push({ event, startsAt, endsAt });
  }

  // Guest lists read together rather than one meeting at a time. Each is a
  // separate hop into EventKit, and a day with a dozen meetings would
  // otherwise wait for twelve of them in a row before the card could appear.
  const upcoming: UpcomingEvent[] = await Promise.all(
    worth.map(async ({ event, startsAt, endsAt }) => ({
      eventId: event.id,
      title: event.title ?? "",
      startsAt,
      endsAt,
      attendeeNames: await attendeeNamesOf(event),
    })),
  );

  upcoming.sort((a, b) => a.startsAt - b.startsAt);
  return upcoming;
}

/**
 * The names on the invitation, if the calendar keeps any.
 *
 * Failure is an empty list rather than an error. Plenty of calendars carry no
 * attendee list at all — a personal calendar, a subscribed one, an event typed
 * straight into the phone — and "Coffee with Marcus" is still a briefing worth
 * showing. Losing the whole event because its guest list could not be read
 * would throw away the common case to be strict about the rare one.
 */
async function attendeeNamesOf(event: {
  getAttendees?: () => Promise<{ name?: string | null }[]>;
}): Promise<string[]> {
  if (event.getAttendees === undefined) return [];
  try {
    const attendees = await event.getAttendees();
    return attendees
      .map((attendee) => attendee.name ?? "")
      .filter((name) => name.trim() !== "");
  } catch {
    return [];
  }
}
