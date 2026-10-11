import { useCallback } from "react";
import { Linking } from "react-native";
import { useConfirm } from "@/components/confirm-dialog";
import { muteForToday, setCalendarSetting } from "./calendar-setting";

/**
 * What the `briefing-card`'s own buttons do (`docs/design/decisions/
 * calendar-connection.md`, Option A). Kept out of the card so the card stays a
 * drawing of a state, and out of home so it can be tested on its own.
 */
export function useBriefingActions(): {
  /** The X (R7): Mute for today / Mute until I turn it back on / Cancel. */
  askToMute: (connected: boolean) => void;
  /** Not now (R4): off at once, no dialog — connecting is then in `settings`. */
  notNow: () => void;
  /** Refused (R5): Andy's own page in iPhone Settings. */
  openIphoneSettings: () => void;
} {
  const confirm = useConfirm();

  const askToMute = useCallback(
    (connected: boolean) =>
      confirm(
        "Mute the briefing?",
        // Before connecting there are no reminders yet, so none are promised.
        connected
          ? 'The card leaves home and meeting reminders stay quiet. "For today" ends at midnight, so tomorrow\'s reminders still come.'
          : "The card leaves home. You can connect your calendar any time in Settings.",
        [
          { text: "Mute for today", onPress: () => muteForToday() },
          // Off: one value, whichever door it came through (Brief → three switches).
          {
            text: "Mute until I turn it back on",
            onPress: () => setCalendarSetting({ mode: "off" }),
          },
          { text: "Cancel", style: "cancel" },
        ],
      ),
    [confirm],
  );

  const notNow = useCallback(() => setCalendarSetting({ mode: "off" }), []);
  const openIphoneSettings = useCallback(() => void Linking.openSettings(), []);

  return { askToMute, notNow, openIphoneSettings };
}
