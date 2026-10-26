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
  | "calendarBriefing"
  /**
   * The follow-up's format and tone choice (`follow-up-tones.md`). Off: the
   * sheet writes today's email, with no picker and no chips.
   */
  | "followUpTones"
  /**
   * Write to (`follow-up-redesign.md`): the profile's follow-up button becomes
   * "Write to {name}" and opens Reach out — notes ticked, own words, tone —
   * before anything is written. Off: the follow-up sheet as before.
   */
  | "writeTo"
  /**
   * Asking for the go-ahead before anything reaches an AI service
   * (`convex/aiPermission.ts`). Switched off in production until a build that
   * asks is on every phone; the server reads the same row.
   */
  | "aiPermission";

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
  return useFeatureState(feature) ?? true;
}

/**
 * The same answer, but `undefined` until the server has given one — for
 * something that must not *start* on a guess, like a question put to the
 * person the moment the app opens.
 */
export function useFeatureState(feature: Feature): boolean | undefined {
  const off: unknown = useQuery(api.featureFlags.switchedOff, {});
  // Anything but a list of keys is "not told".
  if (!Array.isArray(off)) return undefined;
  return !off.includes(feature);
}
