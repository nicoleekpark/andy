import { useConvex } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { api } from "@convex/_generated/api";
import {
  askForCalendar,
  calendarAccess,
  readUpcoming,
  type CalendarAccess,
} from "./calendar";

/**
 * The next meeting today that is about somebody you keep notes on.
 *
 * Three things have to happen in order and none of them can be a React query:
 * the permission is checked on the device, the events are read from the device,
 * and only then can the backend say who they are about. So this is a hook that
 * calls the Convex query imperatively through `useConvex` rather than
 * `useQuery` — `useQuery` would have to fire before the events exist, and would
 * re-fire on every render with a new array.
 *
 * Refreshed when the app comes back to the foreground, which is the one moment
 * a calendar reliably changes without the app knowing: `CLAUDE.md` already
 * requires that cadence for the notification cap, and a briefing that is an
 * hour stale is a briefing about a meeting you have already had.
 */

const WINDOW_HOURS = 12;

export type BriefingState =
  | { state: "loading" }
  | { state: "unavailable" }
  | { state: "ask"; asking: boolean }
  | { state: "denied" }
  | { state: "empty" }
  | {
      state: "ready";
      briefing: {
        title: string;
        startsAt: number;
        people: { profileId: string; name: string; noteCount: number }[];
        ambiguous: { matchedAs: string; count: number }[];
      };
    };

export function useBriefing(): {
  briefing: BriefingState;
  ask: () => Promise<void>;
} {
  const convex = useConvex();
  const [state, setState] = useState<BriefingState>({ state: "loading" });
  /** A latch, not a second copy of state — each ask is a system prompt. */
  const asking = useRef(false);
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

  const load = useCallback(
    async (access: CalendarAccess): Promise<BriefingState> => {
      if (access.state !== "granted") {
        return access.state === "unavailable"
          ? { state: "unavailable" }
          : access.state === "denied"
            ? { state: "denied" }
            : { state: "ask", asking: false };
      }

      const now = new Date();
      const events = await readUpcoming(
        now,
        new Date(now.getTime() + WINDOW_HOURS * 3600_000),
      );
      if (events.length === 0) return { state: "empty" };

      const matched = await convex.query(api.calendar.matchEvents, { events });

      // The *next* one that is about somebody, not the next one at all. A
      // standup at 09:00 is not a briefing, and showing it would push the
      // meeting this feature exists for off the top of the screen.
      const briefing = matched.find(
        (event) => event.people.length > 0 || event.ambiguous.length > 0,
      );
      return briefing === undefined
        ? { state: "empty" }
        : {
            state: "ready",
            briefing: {
              title: briefing.title,
              startsAt: briefing.startsAt,
              people: briefing.people.map((person) => ({
                profileId: person.profileId,
                name: person.name,
                noteCount: person.noteCount,
              })),
              ambiguous: briefing.ambiguous,
            },
          };
    },
    [convex],
  );

  const refresh = useCallback(async (): Promise<BriefingState> => {
    try {
      return await load(await calendarAccess());
    } catch {
      // A briefing that cannot be built is not an error worth a banner on the
      // home screen — the rest of the app works and the card simply is not
      // there.
      return { state: "unavailable" };
    }
  }, [load]);

  useEffect(() => {
    // Cancelled on unmount rather than left to resolve into a dead component.
    // The read is three awaits deep — permission, device, backend — and home
    // is the screen a person leaves fastest.
    mounted.current = true;
    const run = async () => {
      const next = await refresh();
      if (mounted.current) setState(next);
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
      mounted.current = false;
      subscription.remove();
    };
  }, [refresh]);

  const ask = useCallback(async () => {
    if (asking.current) return;
    asking.current = true;
    setState({ state: "ask", asking: true });
    try {
      const next = await load(await askForCalendar());
      if (mounted.current) setState(next);
    } catch {
      if (mounted.current) setState({ state: "unavailable" });
    } finally {
      asking.current = false;
    }
  }, [load]);

  return { briefing: state, ask };
}
