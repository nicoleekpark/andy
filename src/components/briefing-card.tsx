import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius, space, textOpacity, textSize } from "../constants/theme";

/**
 * The Briefing card — who you are about to meet, and what you wrote about them.
 *
 * `STYLE.md` calls this "the single place that looks different from everything
 * else" and spends the app's one visual risk here: a `brass` left-edge stripe,
 * and nothing else in the app allowed to borrow it. `brass` appears in exactly
 * this file. (It once also had a dashed "torn edge" on top; React Native cannot
 * draw that. The meeting time was `brass` too until 2026-10-11 — brass text on
 * paper is 2.28:1, under WCAG AA, so it is `ink` now and the stripe carries the
 * signature alone.)
 *
 * It sits at the top of home rather than on a screen of its own because the
 * thing it is for is the ten minutes before you walk into a room, and a
 * briefing you have to navigate to is a briefing you read afterwards.
 *
 * Every visible state carries the X (`briefing-card-mute-button`), which asks
 * how long to mute (`docs/design/decisions/calendar-connection.md`, Option A).
 */

export type BriefingPerson = {
  profileId: string;
  name: string;
  noteCount: number;
};

export type Briefing = {
  title: string;
  startsAt: number;
  people: BriefingPerson[];
  /** Names the event uses that more than one person answers to. */
  ambiguous: { name: string; count: number }[];
};

type Props =
  /** The module is not in this build — say nothing rather than offer nothing. */
  | { state: "unavailable" }
  | ((
      | {
          /** Not asked yet. The card is the invitation, and the tap is the consent. */
          state: "ask";
          onAsk: () => void;
          asking: boolean;
          /** Off, at once and without a dialog (R4) — connecting is then in `settings`. */
          onNotNow: () => void;
        }
      | {
          /** Asked and refused, and iOS will not ask again. */
          state: "denied";
          onOpenSettings: () => void;
        }
      | { state: "empty" }
      | {
          state: "ready";
          briefing: Briefing;
          /**
           * Whether the phone will say anything ten minutes before this.
           *
           * Offered here rather than at the first prompt, and that is the point:
           * "remind me before this" means something in front of a real meeting
           * and nothing in a stack of permission sheets on first launch.
           */
          alerts: "unavailable" | "off" | "blocked" | "on";
          onEnableAlerts: () => void;
        }
    ) & {
      /** The X: asks "Mute for today / until I turn it back on" (R3, R7). */
      onMute: () => void;
    });

/** 09:30, in the device's own idea of what that looks like. */
function atTime(startsAt: number): string {
  return new Date(startsAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function BriefingCard(props: Props) {
  if (props.state === "unavailable") return null;

  return (
    <View style={styles.card} testID="briefing-card">
      {/* The stripe, and the only place it is allowed. */}
      <View style={styles.stripe} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mute the briefing"
        onPress={props.onMute}
        style={styles.mute}
        testID="briefing-card-mute-button"
      >
        <Text style={styles.muteGlyph}>✕</Text>
      </Pressable>

      {props.state === "ask" ? (
        <>
          <Text style={styles.heading}>Before you walk in</Text>
          <Text style={styles.body}>
            Andy can read your calendar and show what you wrote about whoever
            you&apos;re meeting next. It reads on this phone — your calendar
            never leaves it, and nothing is added to it.
          </Text>
          {/*
            Said before the iOS sheet, because since iOS 17 the only access
            that can read events is called "Full Access", and the sheet's own
            wording cannot be changed.
          */}
          <Text style={styles.note}>
            iPhone will ask for full access. It&apos;s the only kind that lets
            an app read events.
          </Text>
          <View style={styles.buttons}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Connect calendar"
              onPress={props.onAsk}
              disabled={props.asking}
              style={[styles.pill, props.asking && styles.disabled]}
            >
              <Text style={styles.pillLabel}>
                {props.asking ? "Asking…" : "Connect calendar"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Not now"
              onPress={props.onNotNow}
              disabled={props.asking}
              style={styles.plain}
            >
              <Text style={styles.plainLabel}>Not now</Text>
            </Pressable>
          </View>
          <Text style={styles.note}>You can connect later in Settings.</Text>
        </>
      ) : null}

      {props.state === "denied" ? (
        <>
          <Text style={styles.heading}>Before you walk in</Text>
          <Text style={styles.body}>
            Calendar access is off, so Andy can&apos;t see who you&apos;re
            meeting. To turn it on, choose Full Access under Calendars.
          </Text>
          {/*
            iOS will not show its sheet a second time, so the way forward is
            Andy's own page in iPhone Settings — "iPhone Settings", because
            Andy has a Settings screen of its own and the bare word sends
            people there.
          */}
          <View style={styles.buttons}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open iPhone Settings"
              onPress={props.onOpenSettings}
              style={styles.pill}
            >
              <Text style={styles.pillLabel}>Open iPhone Settings</Text>
            </Pressable>
          </View>
        </>
      ) : null}

      {props.state === "empty" ? (
        <>
          {/*
            Not "today". The window is the next twelve hours, which after
            about nine in the evening is mostly tomorrow — and a clear evening
            in front of a 7am meeting would have read as "nothing on today"
            while the thing this card exists for was twelve hours away.
          */}
          <Text style={styles.heading}>Nothing coming up</Text>
          <Text style={styles.body}>
            No meetings in the next twelve hours with anyone you&apos;ve
            written about.
          </Text>
        </>
      ) : null}

      {props.state === "ready" ? (
        <>
          <Text style={styles.when}>{atTime(props.briefing.startsAt)}</Text>
          <Text style={styles.heading} numberOfLines={2}>
            {props.briefing.title}
          </Text>

          {props.briefing.people.map((person) => (
            <Pressable
              key={person.profileId}
              accessibilityRole="button"
              accessibilityLabel={`Open ${person.name}`}
              onPress={() => router.push(`/profile/${person.profileId}`)}
              style={styles.person}
            >
              <Text style={styles.personName}>{person.name}</Text>
              <Text style={styles.personMeta}>
                {person.noteCount === 0
                  ? "nothing remembered yet"
                  : person.noteCount === 1
                    ? "1 note"
                    : `${person.noteCount} notes`}
              </Text>
            </Pressable>
          ))}

          {props.alerts === "off" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remind me before meetings"
              onPress={props.onEnableAlerts}
              style={styles.reminder}
            >
              <Text style={styles.reminderLabel}>
                Remind me 10 minutes before ›
              </Text>
            </Pressable>
          ) : null}

          {props.alerts === "blocked" ? (
            // No button: iOS will not show the sheet again. The `settings`
            // Calendar section offers Open iPhone Settings for this.
            <Text style={styles.body}>
              Notifications are off, so Andy can&apos;t remind you before this.
              Turn them on in iPhone Settings › Andy.
            </Text>
          ) : null}

          {props.briefing.ambiguous.map((name) => (
            // Said rather than guessed. Two people answer to this name and the
            // app does not know which one you are meeting — picking the one
            // with more notes would be it pretending to know.
            <Text key={name.name} style={styles.body}>
              You&apos;ve written about {name.count} people called “{name.name}”,
              so Andy can&apos;t tell which one this is.
            </Text>
          ))}
        </>
      ) : null}
    </View>
  );
}

/** A tap target: 44pt, the WCAG/HIG minimum. No spacing token is 44. */
const TARGET = 44;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.paper,
    marginHorizontal: space.xl,
    marginBottom: space.xl,
    paddingLeft: space.xl,
    paddingRight: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.lg,
    overflow: "hidden",
  },
  /**
   * The signature. `brass` lives here and nowhere else in the app — spreading
   * it is the one thing `STYLE.md` says would stop it being a signature. A
   * stripe, not text: it carries no words, so its 2.28:1 on paper is
   * decoration under WCAG, not a failure.
   */
  stripe: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: colors.brass,
  },
  mute: {
    position: "absolute",
    top: 0,
    right: 0,
    width: TARGET,
    height: TARGET,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  muteGlyph: {
    color: colors.ink,
    fontSize: textSize.lg,
    opacity: textOpacity.quiet,
  },
  when: {
    color: colors.ink,
    fontFamily: fonts.utility,
    fontSize: textSize.sm,
    opacity: textOpacity.secondary,
    marginBottom: space.xs,
    marginRight: TARGET,
  },
  heading: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: textSize.xxl,
    // Clear of the X.
    marginRight: TARGET,
  },
  body: {
    color: colors.ink,
    fontSize: textSize.md,
    opacity: textOpacity.quiet,
    marginTop: space.sm,
  },
  note: {
    color: colors.ink,
    fontSize: textSize.sm,
    opacity: textOpacity.quiet,
    marginTop: space.sm,
  },
  buttons: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.lg,
    marginTop: space.md,
  },
  pill: {
    minHeight: TARGET,
    justifyContent: "center",
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.moss,
  },
  pillLabel: { color: colors.paper, fontSize: textSize.base },
  plain: { minHeight: TARGET, justifyContent: "center", paddingHorizontal: space.xs },
  plainLabel: { color: colors.ink, fontSize: textSize.base, opacity: textOpacity.quiet },
  // A disabled control: exempt from contrast, and visibly unavailable.
  disabled: { opacity: 0.5 },
  person: {
    marginTop: space.md,
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.sm,
  },
  personName: { color: colors.moss, fontSize: textSize.lg },
  personMeta: {
    color: colors.ink,
    fontFamily: fonts.utility,
    fontSize: textSize.xs,
    opacity: textOpacity.quiet,
  },
  reminder: {
    minHeight: TARGET,
    justifyContent: "center",
    alignSelf: "flex-start",
    marginTop: space.xs,
  },
  reminderLabel: { color: colors.moss, fontSize: textSize.md },
});
