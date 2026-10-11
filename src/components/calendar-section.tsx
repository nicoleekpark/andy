import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, space, textOpacity, textSize } from "@/constants/theme";
import { askForCalendar, calendarAccess, type CalendarAccess } from "@/lib/calendar";
import { setCalendarSetting, useCalendarSetting } from "@/lib/calendar-setting";
import { useFeature } from "@/lib/feature-flags";
import {
  askForNotifications,
  notificationAccess,
  type NotificationAccess,
} from "@/lib/notifications";

/**
 * `settings` → Calendar (`calendar-section`): the one place every calendar
 * choice can be seen and changed, whatever the card on home last showed
 * (`docs/design/decisions/calendar-connection.md`, Option A — every control
 * for the current state shown at once, no switch, no disclosure).
 *
 * Three button weights, as the design names them: a `moss` pill for the one
 * way forward, `moss` text for a reversible choice, quiet `ink` text for the
 * rare way out ("remove completely"). It all works offline (R22): the setting,
 * both permissions and the matching are on the phone.
 */

/** A tap target: 44pt, the WCAG/HIG minimum. No spacing token is 44. */
const TARGET = 44;

type Permissions = {
  calendar: CalendarAccess["state"];
  alerts: NotificationAccess["state"];
  /** When these were read — for telling whether a mute has lifted. */
  at: number;
};

export function CalendarSection() {
  const enabled = useFeature("calendarBriefing");
  const setting = useCalendarSetting();
  const [permissions, setPermissions] = useState<Permissions | null>(null);
  /** Bumped after asking iOS for something, so the answer is read again. */
  const [asked, setAsked] = useState(0);

  // Read now, and again whenever Andy comes back — the way back from iPhone
  // Settings, where both permissions are changed — and after any change here.
  useEffect(() => {
    let alive = true;
    const read = async () => {
      const [calendar, alerts] = await Promise.all([calendarAccess(), notificationAccess()]);
      if (alive) {
        setPermissions({ calendar: calendar.state, alerts: alerts.state, at: Date.now() });
      }
    };
    void read();
    const subscription = AppState.addEventListener("change", (phase) => {
      if (phase === "active") void read();
    });
    return () => {
      alive = false;
      subscription.remove();
    };
  }, [setting, asked]);

  /** Connect calendar (R20): straight back on if iOS already allows it. */
  const connect = useCallback(async () => {
    const access =
      permissions?.calendar === "granted" ? { state: "granted" as const } : await askForCalendar();
    if (access.state === "granted") setCalendarSetting({ mode: "on" });
    setAsked((n) => n + 1);
  }, [permissions]);

  const askForReminders = useCallback(async () => {
    await askForNotifications();
    setAsked((n) => n + 1);
  }, []);

  const openIphoneSettings = useCallback(() => void Linking.openSettings(), []);

  // Not shown when switched off remotely or when the build has no calendar
  // module (R18) — and not before the permissions have been read, so it never
  // flashes the wrong state.
  if (!enabled || permissions === null || permissions.calendar === "unavailable") return null;

  const muted = setting.mode === "muted" && setting.until > permissions.at;
  // A mute whose moment has passed is on again, not off.
  const on = setting.mode !== "off";

  return (
    <View style={styles.section} testID="calendar-section">
      <Text style={styles.label} accessibilityRole="header">
        Calendar
      </Text>

      {permissions.calendar === "undetermined" ? (
        <>
          <Text style={styles.status}>
            Before a meeting, Andy shows what you wrote about whoever you&apos;re
            meeting. It reads your calendar on this phone — nothing leaves it,
            and nothing is added.
          </Text>
          <Pill label="Connect calendar" onPress={() => void connect()} />
        </>
      ) : permissions.calendar === "denied" ? (
        <>
          <Text style={styles.status}>
            Calendar access is off for Andy. To turn it on, choose Full Access
            under Calendars.
          </Text>
          <Pill label="Open iPhone Settings" onPress={openIphoneSettings} />
        </>
      ) : (
        <>
          {muted ? (
            <View style={styles.mutedLine}>
              <Text style={styles.status}>Muted until tomorrow · </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Turn back on"
                onPress={() => setCalendarSetting({ mode: "on" })}
                style={styles.inline}
              >
                <Text style={styles.secondaryLabel}>Turn back on</Text>
              </Pressable>
            </View>
          ) : null}

          {on ? (
            <>
              <Text style={styles.status}>On — Andy reads your calendar on this phone.</Text>
              <Secondary
                label="Turn off in Andy"
                onPress={() => setCalendarSetting({ mode: "off" })}
              />
            </>
          ) : (
            <>
              <Text style={styles.status}>
                Off — Andy isn&apos;t reading your calendar, and no reminders are set.
              </Text>
              <Pill label="Connect calendar" onPress={() => void connect()} />
            </>
          )}

          {/* An iOS app cannot give its own permission back (R21). */}
          <Text style={styles.removeLine}>
            To take away access completely, turn off Calendars for Andy in
            iPhone Settings.
          </Text>
          <Quiet label="Open iPhone Settings" onPress={openIphoneSettings} />

          {on && permissions.alerts !== "unavailable" ? (
            <View style={styles.reminders} testID="reminders-row">
              {permissions.alerts === "undetermined" ? (
                <>
                  <Text style={styles.status}>
                    Andy can remind you 10 minutes before a meeting, and ask
                    afterwards what&apos;s new.
                  </Text>
                  <Secondary
                    label="Remind me 10 minutes before"
                    onPress={() => void askForReminders()}
                  />
                </>
              ) : permissions.alerts === "granted" ? (
                <Text style={styles.status}>
                  Reminders on — 10 minutes before, and a nudge after. They show
                  a name, never what you wrote.
                </Text>
              ) : (
                <>
                  <Text style={styles.status}>Notifications are off for Andy.</Text>
                  <Quiet label="Open iPhone Settings" onPress={openIphoneSettings} />
                </>
              )}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

/** The one way forward: a filled `moss` pill. */
function Pill({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.pill}>
      <Text style={styles.pillLabel}>{label}</Text>
    </Pressable>
  );
}

/** A reversible choice: `moss` text. */
function Secondary({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.textButton}>
      <Text style={styles.secondaryLabel}>{label}</Text>
    </Pressable>
  );
}

/** The rare way out: quiet `ink` text. */
function Quiet({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.textButton}>
      <Text style={styles.quietLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: {
    marginHorizontal: space.xl,
    paddingVertical: space.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    gap: space.sm,
  },
  label: {
    color: colors.ink,
    fontSize: textSize.sm,
    opacity: textOpacity.quiet,
    textTransform: "uppercase",
  },
  status: { color: colors.ink, fontSize: textSize.base },
  mutedLine: { flexDirection: "row", flexWrap: "wrap", alignItems: "center" },
  inline: { minHeight: TARGET, justifyContent: "center" },
  removeLine: {
    color: colors.ink,
    fontSize: textSize.sm,
    opacity: textOpacity.quiet,
    marginTop: space.sm,
  },
  pill: {
    alignSelf: "flex-start",
    minHeight: TARGET,
    justifyContent: "center",
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.moss,
  },
  pillLabel: { color: colors.paper, fontSize: textSize.base },
  textButton: { alignSelf: "flex-start", minHeight: TARGET, justifyContent: "center" },
  secondaryLabel: { color: colors.moss, fontSize: textSize.base },
  quietLabel: { color: colors.ink, fontSize: textSize.base, opacity: textOpacity.quiet },
  reminders: {
    marginTop: space.lg,
    paddingTop: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    gap: space.sm,
  },
});
