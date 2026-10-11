import { useSyncExternalStore } from "react";
import { calendarSettingStore, onForgetOnThisPhone } from "./on-phone";

/**
 * The person's own say over the calendar briefing, kept on this phone
 * (`docs/design/decisions/calendar-connection.md`, Brief → "three switches").
 *
 * **Off** is one value whichever door it came through — Not now, Mute until I
 * turn it back on, Turn off in Andy — with one way back, Connect calendar.
 * **Muted** lasts until a stored instant: the local midnight at the moment of
 * muting (R8), so daylight saving and travel do not move it. No file means on.
 */
export type CalendarSetting =
  | { mode: "on" }
  | { mode: "muted"; until: number }
  | { mode: "off" };

const ON: CalendarSetting = { mode: "on" };

function read(): CalendarSetting {
  try {
    const raw = calendarSettingStore.read();
    if (raw === null) return ON;
    const parsed = JSON.parse(raw) as Partial<{ mode: string; until: number }>;
    if (parsed.mode === "off") return { mode: "off" };
    if (parsed.mode === "muted" && typeof parsed.until === "number") {
      return { mode: "muted", until: parsed.until };
    }
    return ON;
  } catch {
    // An unreadable setting is the default, not a reason to lose the feature.
    return ON;
  }
}

let current: CalendarSetting | undefined;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

// A sign-out removes the file; the next account must not inherit the value
// held here.
onForgetOnThisPhone(() => {
  current = undefined;
  notify();
});

export function calendarSetting(): CalendarSetting {
  if (current === undefined) current = read();
  return current;
}

export function setCalendarSetting(next: CalendarSetting): void {
  current = next;
  try {
    if (next.mode === "on") calendarSettingStore.remove();
    else calendarSettingStore.write(JSON.stringify(next));
  } catch {
    // Held for this session; the next start reads whatever was last saved.
  }
  notify();
}

/** The next local midnight after `now`, from the calendar date — not +24h. */
export function nextLocalMidnight(now: number): number {
  const day = new Date(now);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
}

/** Mute for today (R8): until the next local midnight, computed now. */
export function muteForToday(now = Date.now()): void {
  setCalendarSetting({ mode: "muted", until: nextLocalMidnight(now) });
}

/**
 * The setting as it applies at `now`: a mute whose instant has passed is on
 * again (R8 — lifted at the first refresh after it, not at the stroke).
 */
export function settingAt(setting: CalendarSetting, now: number): CalendarSetting {
  return setting.mode === "muted" && setting.until <= now ? ON : setting;
}

export function useCalendarSetting(): CalendarSetting {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    calendarSetting,
  );
}
