import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { matchEventsIn } from "@convex/calendarMatch";
import { useReadingCopy } from "./offline-copy";
import { applyPicks, tidyPicks, useBriefingPicksVersion } from "./briefing-picks";
import {
  nextLocalMidnight,
  settingAt,
  useCalendarSetting,
  type CalendarSetting,
} from "./calendar-setting";
import {
  askForCalendar,
  calendarAccess,
  readUpcoming,
  type CalendarAccess,
} from "./calendar";
import {
  askForNotifications,
  briefable,
  cancelBriefings,
  NUDGE_DELAY_MINUTES,
  notificationAccess,
  scheduleBriefings,
  type NotificationAccess,
} from "./notifications";

/**
 * The next meeting today that is about somebody you keep notes on.
 *
 * Three things happen in order, all on the phone: the permission is checked,
 * the events are read, and they are matched against the people in the phone's
 * own copy (`useReadingCopy`, with the same `matchEventsIn` the server used).
 * **The calendar never leaves the phone** — no title or attendee name is sent
 * anywhere (`docs/design/decisions/calendar-connection.md` #5). Matched on
 * the same cadence as before — on foreground, and once when the copy first
 * arrives — not on every change to the copy: each match re-reads the calendar
 * and reschedules every reminder, and the copy changes with any note edited
 * anywhere.
 *
 * Refreshed when the app comes back to the foreground, which is the one moment
 * a calendar reliably changes without the app knowing: `CLAUDE.md` already
 * requires that cadence for the notification cap, and a briefing that is an
 * hour stale is a briefing about a meeting you have already had.
 */

const WINDOW_HOURS = 12;

/**
 * How long after a meeting's start the card refreshes: a second, so the clock
 * has unambiguously passed the start and the meeting reads as begun.
 */
const START_GRACE_MS = 1000;

/**
 * Why the card is not there, said to whoever is running a development build.
 *
 * Every failure below is swallowed on purpose: a briefing that cannot be built
 * is not worth a banner on home, and the person using the app should just see
 * no card. But swallowing it *everywhere* meant nobody could see it either.
 * On 2026-09-26 the card vanished the moment calendar access was allowed, and
 * finding out why took a temporary `console.warn` pasted into this file,
 * because the one thing the failure said was nothing (PR #50).
 *
 * `__DEV__` is false in a release build, so what ships is still silence. The
 * same `__DEV__` line `profile/[id]` draws for a failed photo upload, though
 * that screen appends the cause to its message, since it has one to show.
 */
function sayWhyInDevelopment(what: string, thrown: unknown) {
  if (__DEV__) console.warn(`Briefing: ${what}`, thrown);
}

export type BriefingState =
  | { state: "loading" }
  | { state: "unavailable" }
  | { state: "ask"; asking: boolean }
  | { state: "denied" }
  | { state: "empty" }
  /**
   * Switched off — remotely (`featureFlags`) or by the person (Not now, Mute
   * until I turn it back on, Turn off in Andy): nothing is shown, nothing is
   * read, and this app's reminders are cancelled.
   */
  | { state: "off" }
  /**
   * Muted for today: no card, and no reminder for a meeting that starts
   * before the stored midnight (R9) — but the calendar is still read, so
   * tomorrow's early reminders are still scheduled.
   */
  | { state: "muted" }
  /**
   * Nobody in Andy yet: no card in any state (R2). With nobody to match
   * against it could only ask for access it cannot use yet.
   */
  | { state: "nobody" }
  | {
      state: "ready";
      briefing: {
        title: string;
        startsAt: number;
        people: {
          profileId: string;
          name: string;
          noteCount: number;
          /** Answered on the card: which shared name this person was picked for. */
          pickedFor?: string;
        }[];
        /** Shared names not answered yet — who could be meant, for the card to ask. */
        ambiguous: { name: string; key: string; count: number; profileIds: string[] }[];
        /** Shared names answered "Neither of them" (R-P6). */
        declined: { name: string; key: string }[];
      };
    };

/**
 * Whether the phone will actually say anything, and whether it can be asked.
 *
 * Separate from the calendar permission on purpose. Reading the calendar and
 * being interrupted by it are two different things to agree to, and
 * `CLAUDE.md` asks for each at the point of use — so the alert is offered from
 * a card that is already showing a real meeting, where "remind me before this"
 * means something, rather than bundled into the first prompt where it is one
 * more thing to say yes to blindly.
 */
export type AlertState = "unavailable" | "off" | "blocked" | "on";

export function useBriefing(
  /**
   * The remote switch (`useFeature("calendarBriefing")`). Off: the calendar
   * is not read, the card says nothing, and reminders already on the phone
   * are cancelled — a switch that left them would still buzz for days.
   */
  enabled = true,
): {
  briefing: BriefingState;
  ask: () => Promise<void>;
  alerts: AlertState;
  askForAlerts: () => Promise<void>;
} {
  const copy = useReadingCopy();
  const setting = useCalendarSetting();
  /** Answering which person a shared name means refreshes at once (R-P5). */
  const picksVersion = useBriefingPicksVersion();
  /** The setting as of now, read when a refresh runs. */
  const settingNow = useRef<CalendarSetting>(setting);
  const off = !enabled || setting.mode === "off";
  /** The newest copy, read when a refresh runs rather than tying the refresh to it. */
  const copyNow = useRef(copy);
  const hasCopy = copy !== null;
  const [state, setState] = useState<BriefingState>({ state: "loading" });
  const [alerts, setAlerts] = useState<AlertState>("unavailable");
  /** A latch, not a second copy of state — each ask is a system prompt. */
  const asking = useRef(false);
  const askingAlerts = useRef(false);
  /**
   * One refresh at a time.
   *
   * `run` fires on mount and on every foreground, and nothing stopped two of
   * them overlapping — a quick app switch, pulling notification centre down,
   * dismissing a permission sheet. Each one cancels this app's pending
   * briefings and schedules the whole set again, so two interleaved leave
   * **duplicate pairs** for the same meeting until the next foreground happens
   * to tidy them. Two buzzes ten minutes before one coffee.
   */
  const refreshing = useRef(false);
  /**
   * A refresh asked for while one was running — after a mute, a pick, the
   * copy arriving. Run once that one finishes, not dropped: the one running
   * started before the change, and its answer is thrown away (`live`), so
   * dropping this left the card on its old state until the next foreground.
   */
  const refreshAfter = useRef<(() => Promise<void>) | null>(null);
  /** Which effect's refresh is running, to tell a change from a repeat. */
  const runningRefresh = useRef<(() => Promise<void>) | null>(null);
  /**
   * The switch, as of now rather than as of the render a `load` began in, and
   * the reminders being written at this moment. Switching off mid-refresh has
   * to win: a `load` that started while on must not schedule after the switch
   * flipped, and the cancel has to wait for a schedule already under way — or
   * its reminders land after the cancel and buzz for a feature that is off.
   * Switching off in a hurry is exactly when that would happen.
   */
  const enabledNow = useRef(enabled);
  const scheduling = useRef<Promise<unknown>>(Promise.resolve());
  /**
   * Whether this component is still on screen.
   *
   * The effect had its own local flag and `ask` had nothing, so backing out of
   * the permission sheet — which is a whole app switch, and the easiest moment
   * to leave this screen — landed a `setState` on an unmounted component.
   * React 18 no longer warns about that, which is exactly why it needed
   * writing down rather than waiting to be noticed.
   *
   * **No test witnesses the `ask` half of this**, and that is recorded rather
   * than papered over: removing the check leaves the suite green, because in
   * React 18 a `setState` on an unmounted component does nothing observable at
   * all — not a warning, not a render, not a leak. It is kept for the same
   * reason the effect has it, and it becomes witnessable the day that changes
   * or the day this hook holds state that outlives a remount.
   */
  const mounted = useRef(true);

  /**
   * Cancel this app's reminders once any schedule already under way has
   * landed — otherwise its reminders arrive after the cancel and survive it.
   */
  const cancelAfterScheduling = useCallback(() => {
    scheduling.current = scheduling.current
      .then(() => cancelBriefings())
      .catch((thrown: unknown) =>
        sayWhyInDevelopment("could not cancel the alerts", thrown),
      );
  }, []);

  const load = useCallback(
    async (access: CalendarAccess): Promise<BriefingState> => {
      // Nothing to match against yet — a first session, before the server
      // has answered once. The effect runs again when the copy arrives.
      const known = copyNow.current;
      if (known === null) return { state: "loading" };
      if (!known.profiles.some((profile) => !profile.autoCreated)) {
        // Including after the last person was deleted: a reminder already on
        // the phone is about somebody no longer here.
        cancelAfterScheduling();
        return { state: "nobody" };
      }

      if (access.state !== "granted") {
        if (access.state === "denied") {
          // Access taken away in iPhone Settings: reminders already on the
          // phone must not keep buzzing about meetings Andy can no longer see
          // (R14).
          cancelAfterScheduling();
        }
        return access.state === "unavailable"
          ? { state: "unavailable" }
          : access.state === "denied"
            ? { state: "denied" }
            : { state: "ask", asking: false };
      }

      const now = Date.now();
      const applied = settingAt(settingNow.current, now);
      const mutedUntil = applied.mode === "muted" ? applied.until : null;
      // Reminders look further ahead than the card (R13): to the end of the
      // next local day, so an 08:00 meeting is reminded at 07:50 even when
      // Andy was last opened the afternoon before. The card stays on the next
      // twelve hours.
      // And a little behind: from as far back as a nudge can still be due.
      // Every refresh cancels this app's reminders and schedules them again
      // from this read, and EventKit only returns a meeting still running at
      // `from` — so a read starting now left out one that ended five minutes
      // ago, and opening Andy then took away its "How was …?" for good
      // (device QA #39). The card is unaffected: it shows only what has not
      // started.
      const events = await readUpcoming(
        new Date(now - NUDGE_DELAY_MINUTES * 60_000),
        new Date(nextLocalMidnight(nextLocalMidnight(now))),
      );
      if (events.length === 0) {
        // A meeting deleted from the calendar takes its reminder with it.
        cancelAfterScheduling();
        return mutedUntil === null ? { state: "empty" } : { state: "muted" };
      }

      // The person's own answers to "which Priya?" (R-P3), pruned against the
      // copy first (R-P7): a person deleted anywhere takes their answers with
      // them, and nothing but this read can find that out.
      const picks = tidyPicks(
        known.ownerId,
        known.profiles,
        new Set(events.map((event) => event.eventId)),
        now,
      );
      const noteCounts = new Map<string, number>();
      for (const note of known.notes) {
        noteCounts.set(note.profileId, (noteCounts.get(note.profileId) ?? 0) + 1);
      }
      const personFor = (profileId: string) => {
        const profile = known.profiles.find((p) => p._id === profileId);
        return profile === undefined
          ? undefined
          : { profileId, name: profile.name, noteCount: noteCounts.get(profileId) ?? 0 };
      };
      const matched = matchEventsIn(known.profiles, known.notes, events).map((event) =>
        applyPicks(
          {
            ...event,
            people: event.people.map((person) => ({
              profileId: person.profileId,
              name: person.name,
              noteCount: person.noteCount,
            })),
          },
          picks,
          personFor,
        ),
      );

      // Scheduled from the same answer the card is drawn from — a picked
      // Priya included, an unanswered one not (R-P5) — so what the
      // phone will say and what the screen says cannot disagree. Silent to the
      // person on failure: a briefing that could not be scheduled is not a reason to
      // take the card down, and the reason is almost always "notifications
      // are off", which the card already offers to fix.
      if (enabledNow.current) {
        scheduling.current = scheduleBriefings(
          briefable(
            matched
              // Muted for today: decided by when the meeting *starts* (R9) —
              // no reminder and no nudge for one that starts before midnight.
              .filter((event) => mutedUntil === null || event.startsAt >= mutedUntil)
              .map((event) => ({
                eventId: event.eventId,
                title: event.title,
                startsAt: event.startsAt,
                endsAt: event.endsAt,
                attendeeNames: [],
                people: event.people,
              })),
          ),
          Date.now(),
        ).catch((thrown: unknown) =>
          sayWhyInDevelopment("could not schedule the alerts", thrown),
        );
      }

      if (mutedUntil !== null) return { state: "muted" };

      // The *next* one that is about somebody, not the next one at all. A
      // standup at 09:00 is not a briefing, and showing it would push the
      // meeting this feature exists for off the top of the screen. Only from
      // the card's own twelve hours, though the read went further — and only
      // one that has not started: a meeting leaves the card when it begins
      // (owner's decision, 2026-10-11, device QA #12). The nudge after it is
      // the reminder's job, not the card's.
      const cardUntil = now + WINDOW_HOURS * 3600_000;
      const briefing = matched.find(
        (event) =>
          event.startsAt > now &&
          event.startsAt < cardUntil &&
          (event.people.length > 0 ||
            event.ambiguous.length > 0 ||
            // "Neither of them" stays on the card until it starts, so the
            // answer can be undone where it was given (R-P6).
            event.declined.length > 0),
      );
      return briefing === undefined
        ? { state: "empty" }
        : {
            state: "ready",
            briefing: {
              title: briefing.title,
              startsAt: briefing.startsAt,
              people: briefing.people,
              ambiguous: briefing.ambiguous,
              declined: briefing.declined,
            },
          };
    },
    [cancelAfterScheduling],
  );

  const refresh = useCallback(async (): Promise<BriefingState> => {
    try {
      return await load(await calendarAccess());
    } catch (thrown) {
      sayWhyInDevelopment("could not be built", thrown);
      // A briefing that cannot be built is not an error worth a banner on the
      // home screen — the rest of the app works and the card simply is not
      // there.
      return { state: "unavailable" };
    }
  }, [load]);

  // Declared before the effect below, so it has run by the time a refresh
  // reads the copy.
  useEffect(() => {
    copyNow.current = copy;
  }, [copy]);
  useEffect(() => {
    settingNow.current = setting;
  }, [setting]);

  useEffect(() => {
    // Cancelled on unmount rather than left to resolve into a dead component.
    // The read is three awaits deep — permission, device, backend — and home
    // is the screen a person leaves fastest.
    mounted.current = true;
    enabledNow.current = !off;
    if (off) {
      cancelAfterScheduling();
      return () => {
        mounted.current = false;
      };
    }
    /**
     * The moment the meeting on the card starts, the card moves on — with the
     * app open too, not only on the next foreground (device QA #12).
     */
    let atStart: ReturnType<typeof setTimeout> | undefined;
    /**
     * This effect's own liveness, not the shared `mounted`: a refresh still
     * in flight when the briefing is switched off or muted would otherwise
     * see the next effect's `mounted = true`, set its stale answer and start
     * a timer nothing clears — bringing the card back after it was turned
     * off (review of #134).
     */
    let live = true;
    const run = async (): Promise<void> => {
      if (refreshing.current) {
        // A second foreground while this same effect's refresh runs is the
        // same question twice — dropped. One running from before a change
        // is about to be thrown away, so this one goes next.
        if (runningRefresh.current !== run) refreshAfter.current = run;
        return;
      }
      refreshing.current = true;
      runningRefresh.current = run;
      try {
        const next = await refresh();
        if (!live) return;
        setState(next);
        clearTimeout(atStart);
        if (next.state === "ready") {
          atStart = setTimeout(
            () => void run(),
            Math.max(0, next.briefing.startsAt - Date.now()) + START_GRACE_MS,
          );
        }
        const permission = await notificationAccess();
        if (live) setAlerts(alertStateOf(permission.state));
      } finally {
        refreshing.current = false;
        const next = refreshAfter.current;
        refreshAfter.current = null;
        if (next !== null) void next();
      }
    };

    void run();
    const subscription = AppState.addEventListener("change", (phase) => {
      // Foregrounding is the one moment a calendar reliably changes without
      // the app knowing. `CLAUDE.md` already requires this cadence for the
      // notification cap; a briefing an hour stale is about a meeting that has
      // already happened.
      if (phase === "active") void run();
    });
    return () => {
      live = false;
      if (refreshAfter.current === run) refreshAfter.current = null;
      mounted.current = false;
      clearTimeout(atStart);
      subscription.remove();
    };
    // `hasCopy`, not `copy`: run again when the copy first arrives, not on
    // every edit to it.
    // `setting` too: muting or turning it back on refreshes at once, so the
    // reminders follow before the dialog has closed (R10, R20). `picksVersion`
    // likewise: a Priya picked at 10:45 still gets her 10:50 reminder (R-P5).
  }, [off, refresh, hasCopy, setting, picksVersion, cancelAfterScheduling]);

  const askForAlerts = useCallback(async () => {
    if (askingAlerts.current) return;
    askingAlerts.current = true;
    try {
      const permission = await askForNotifications();
      if (mounted.current) setAlerts(alertStateOf(permission.state));
    } catch {
      if (mounted.current) setAlerts("unavailable");
    } finally {
      askingAlerts.current = false;
    }
  }, []);

  const ask = useCallback(async () => {
    if (asking.current) return;
    asking.current = true;
    setState({ state: "ask", asking: true });
    try {
      const next = await load(await askForCalendar());
      if (mounted.current) setState(next);
    } catch (thrown) {
      sayWhyInDevelopment("could not be built after asking", thrown);
      if (mounted.current) setState({ state: "unavailable" });
    } finally {
      asking.current = false;
    }
  }, [load]);

  return {
    briefing: off ? { state: "off" } : state,
    ask,
    alerts,
    askForAlerts,
  };
}

function alertStateOf(state: NotificationAccess["state"]): AlertState {
  // `undetermined` and `denied` are two different sentences on screen: one is
  // a button that will work, the other is a button that iOS will never honour.
  if (state === "granted") return "on";
  if (state === "undetermined") return "off";
  if (state === "denied") return "blocked";
  return "unavailable";
}
