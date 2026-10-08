import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

/**
 * Features that can be switched off remotely (INFRA.md #6), by the key their
 * row carries in the `featureFlags` table. To switch one off: in the Convex
 * dashboard, insert `{ key, enabled: false, note: "why" }` — the app hears it
 * live. Delete the row (or set `enabled: true`) to turn it back on.
 */
export type Feature =
  /** The calendar briefing card, reading the calendar, and its reminders. */
  "calendarBriefing";

/**
 * Whether a feature is on.
 *
 * **On until the server says otherwise** — while the answer is loading, and
 * with no connection at all. A switch that turned features off whenever it
 * could not be read would take the briefing away from everybody offline, the
 * one situation it was never meant for. The cost is a moment, at launch, in
 * which a switched-off feature can still start; whatever it started has to
 * stop when the answer lands (`useBriefing` cancels its reminders).
 */
export function useFeature(feature: Feature): boolean {
  const off: unknown = useQuery(api.featureFlags.switchedOff, {});
  // Anything but a list of keys is "not told": on.
  return !(Array.isArray(off) && off.includes(feature));
}
