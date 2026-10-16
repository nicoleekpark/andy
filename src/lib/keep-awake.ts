import { useEffect, useId } from "react";

/**
 * Keep the screen on while something is live — recording, or Andy reading
 * what was just said (device QA B5-1, `docs/qa/findings.md`). The phone
 * auto-locked mid-recording, iOS stopped the speech recogniser, and the
 * recording was cut off. Released the moment it is not live, so a phone left
 * on the review screen still sleeps as usual.
 *
 * Loaded lazily and failing quietly, like `notifications.ts`: a build without
 * the native module records as before rather than crashing, and keeping the
 * screen on is a help, never a precondition.
 */
type KeepAwake = typeof import("expo-keep-awake");

function keepAwake(): KeepAwake | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-keep-awake") as KeepAwake;
  } catch {
    return null;
  }
}

export function useKeepAwakeWhile(live: boolean, tag: string): void {
  // One tag per mounted screen. iOS keeps tags in a set, not a count: two
  // screens sharing one would let the first to finish switch the screen off
  // under the other — a nudge opening a second capture over a recording does
  // exactly that (code review, B5-1). The library's own hook does the same.
  const own = `${tag}-${useId()}`;
  useEffect(() => {
    if (!live) return;
    const module = keepAwake();
    if (module === null) return;
    module.activateKeepAwakeAsync(own).catch(() => {});
    return () => {
      module.deactivateKeepAwake(own).catch(() => {});
    };
  }, [live, own]);
}
