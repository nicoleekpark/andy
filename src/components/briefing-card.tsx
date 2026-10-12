import { router } from "expo-router";
import { useEffect, useRef, useState, type Ref } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius, space, textOpacity, textSize } from "../constants/theme";
import { NONE } from "../lib/briefing-picks";
import { describePerson } from "../lib/describe-person";
import type { Briefing, BriefingPerson } from "../lib/use-briefing";

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
          /** Every meeting coming up that is about somebody, in order (R-C1, R-C2). */
          briefings: Briefing[];
          /** The card's clock: a meeting starting at or before it has left (R-C5). */
          now: number;
          /**
           * Whether the phone will say anything ten minutes before this.
           *
           * Offered here rather than at the first prompt, and that is the point:
           * "remind me before this" means something in front of a real meeting
           * and nothing in a stack of permission sheets on first launch.
           */
          alerts: "unavailable" | "off" | "blocked" | "on";
          onEnableAlerts: () => void;
          /**
           * Which person a shared name means — a candidate's id, or `NONE`.
           * One tap, saved at once, no dialog: it is one tap to undo (R-P4).
           */
          onAnswer: (eventId: string, nameKey: string, profileId: string) => void;
          /** "Not this Priya?" / Change: back to the question (R-P10). */
          onUnanswer: (eventId: string, nameKey: string) => void;
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
          <NothingComingUp />
        </>
      ) : null}

      {props.state === "ready" ? (
        <>
          <Meetings
            briefings={props.briefings}
            now={props.now}
            onAnswer={props.onAnswer}
            onUnanswer={props.onUnanswer}
          />

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

        </>
      ) : null}
    </View>
  );
}

/** `briefing-card--empty`'s words — also what the carousel shows once every meeting has started. */
function NothingComingUp({ headingRef }: { headingRef?: Ref<Text> }) {
  return (
    <>
      <Text ref={headingRef} style={styles.heading} accessibilityRole="header">
        Nothing coming up
      </Text>
      <Text style={styles.body}>
        No meetings in the next twelve hours with anyone you&apos;ve written about.
      </Text>
    </>
  );
}

/** A page's identity (R-C3): two occurrences of a recurring event share an id. */
function pageKeyOf(briefing: Briefing): string {
  return `${briefing.eventId}@${briefing.startsAt}`;
}

/**
 * `briefing-card--carousel`: one meeting at a time, the next one first, the
 * rest a tap away (`briefing-card-people.md`, Option A). Never moves by itself
 * (R-C7); pages change only when asked, with no animation to reduce.
 */
function Meetings({
  briefings,
  now,
  onAnswer,
  onUnanswer,
}: {
  briefings: Briefing[];
  now: number;
  onAnswer: (eventId: string, nameKey: string, profileId: string) => void;
  onUnanswer: (eventId: string, nameKey: string) => void;
}) {
  /** The page asked for. Kept across refreshes while that meeting is still there (R-C6). */
  const [shown, setShown] = useState<string | null>(null);
  // A meeting leaves when it starts (R-C1) — except the page on screen while
  // its "which Priya?" is still unanswered: that waits until it is answered,
  // so nothing is pulled from under a finger mid-choice (R-C5).
  // On screen means the page asked for, or — before any was — the first,
  // which is the earliest (the list is in time order).
  const onScreen = shown ?? (briefings[0] === undefined ? null : pageKeyOf(briefings[0]));
  const visible = briefings.filter(
    (briefing) =>
      briefing.startsAt > now ||
      (pageKeyOf(briefing) === onScreen && briefing.ambiguous.length > 0),
  );
  const at = Math.max(
    0,
    visible.findIndex((briefing) => pageKeyOf(briefing) === shown),
  );
  const page = visible[at];
  const pageKey = page === undefined ? null : pageKeyOf(page);

  // When the page on screen leaves, VoiceOver goes to the heading of whatever
  // took its place — the next page, or "Nothing coming up" after the last —
  // rather than into nothing (R-C8). A ref on each heading, not on a wrapper:
  // the wrapper of a page that left is gone by the time this runs.
  const heading = useRef<Text>(null);
  const lastShown = useRef<string | null>(null);
  useEffect(() => {
    const before = lastShown.current;
    lastShown.current = pageKey;
    if (before !== null && before !== pageKey && !visible.some((b) => pageKeyOf(b) === before)) {
      if (heading.current !== null) {
        AccessibilityInfo.sendAccessibilityEvent(heading.current, "focus");
      }
    }
  });

  if (page === undefined) return <NothingComingUp headingRef={heading} />;
  const position = visible.length > 1 ? { at: at + 1, of: visible.length } : null;

  return (
    <>
      <View>
        <MeetingPage
          headingRef={heading}
          briefing={page}
          position={position}
          onAnswer={(nameKey, profileId) => onAnswer(page.eventId, nameKey, profileId)}
          onUnanswer={(nameKey) => onUnanswer(page.eventId, nameKey)}
        />
      </View>
      {position !== null ? (
        <View style={styles.pager} testID="briefing-card-pager">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous meeting"
            disabled={at === 0}
            onPress={() => setShown(pageKeyOf(visible[at - 1]!))}
            style={[styles.pageButton, at === 0 && styles.disabled]}
            testID="briefing-card-previous-button"
          >
            <Text style={styles.pageGlyph}>‹</Text>
          </Pressable>
          <Text style={styles.position} testID="briefing-card-page-position">
            {position.at} of {position.of}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next meeting"
            disabled={at === visible.length - 1}
            onPress={() => setShown(pageKeyOf(visible[at + 1]!))}
            style={[styles.pageButton, at === visible.length - 1 && styles.disabled]}
            testID="briefing-card-next-button"
          >
            <Text style={styles.pageGlyph}>›</Text>
          </Pressable>
        </View>
      ) : null}
    </>
  );
}

/** `briefing-card-page`: one meeting — when, what, and who. */
function MeetingPage({
  headingRef,
  briefing,
  position,
  onAnswer,
  onUnanswer,
}: {
  headingRef: Ref<Text>;
  briefing: Briefing;
  position: { at: number; of: number } | null;
  onAnswer: (nameKey: string, profileId: string) => void;
  onUnanswer: (nameKey: string) => void;
}) {
  const time = atTime(briefing.startsAt);
  return (
    <View testID="briefing-card-page">
      {/* Read as part of the heading below, which says it once with its place. */}
      <Text
        style={styles.when}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {time}
      </Text>
      <Text
        ref={headingRef}
        style={styles.heading}
        numberOfLines={2}
        accessibilityRole="header"
        accessibilityLabel={
          position === null
            ? `${time}, ${briefing.title}`
            : `Meeting ${position.at} of ${position.of}, ${time}, ${briefing.title}`
        }
      >
        {briefing.title}
      </Text>
      {briefing.people.map(({ pickedFor, ...person }) => (
        <View key={person.profileId}>
          <PersonLink person={person} />
          {pickedFor !== undefined ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Choose a different ${pickedFor.name} for this event`}
              onPress={() => onUnanswer(pickedFor.key)}
              style={styles.change}
              testID="briefing-card-pick-change-button"
            >
              <Text style={styles.changeLabelSmall}>Not this {pickedFor.name}?</Text>
            </Pressable>
          ) : null}
        </View>
      ))}

      {briefing.ambiguous.map((name) => (
        // Asked rather than guessed, and nothing is pre-selected: picking
        // the one with more notes would be the app pretending to know
        // (R-P10). Every candidate shows how you know them, so the right
        // one can be recognised rather than recalled.
        <View key={name.key} style={styles.pick} testID="briefing-card-pick">
          <Text style={styles.pickLabel}>Which {name.name} is this?</Text>
          <Text style={styles.note}>
            You&apos;ve written about {name.count} people called {name.name}. Andy
            will remember your answer for this event, every time it repeats.
            It stays on this phone.
          </Text>
          {name.candidates.map((candidate, index) => (
            <Pressable
              key={candidate.profileId}
              accessibilityRole="button"
              accessibilityLabel={`${candidate.name}, ${describePerson(candidate)}`}
              accessibilityHint={`Remembers this ${name.name} for this event.`}
              onPress={() => onAnswer(name.key, candidate.profileId)}
              style={[
                styles.choice,
                index < name.candidates.length - 1 && styles.choiceDivided,
              ]}
              testID="briefing-card-pick-choice"
            >
              <Text style={styles.choiceName}>{candidate.name}</Text>
              <Text style={styles.personMeta}>{describePerson(candidate)}</Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Neither of them"
            accessibilityHint={`Remembers that this ${name.name} is someone you haven't written about.`}
            onPress={() => onAnswer(name.key, NONE)}
            style={styles.plain}
            testID="briefing-card-pick-neither"
          >
            <Text style={styles.plainLabel}>Neither of them</Text>
          </Pressable>
        </View>
      ))}

      {briefing.declined.map((name) => (
        // Kept on the card until the meeting starts, so the answer can be
        // undone where it was given (R-P6).
        <View key={name.key} style={styles.noneLine} testID="briefing-card-pick-none-line">
          <Text style={styles.noneText}>
            Not a {name.name} you&apos;ve written about.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Change who ${name.name} is for this event`}
            onPress={() => onUnanswer(name.key)}
            style={styles.inlineChange}
          >
            <Text style={styles.changeLabel}>Change</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

/** `briefing-card-person-link`: opens the person, with how much is written. */
function PersonLink({ person }: { person: BriefingPerson }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${person.name}`}
      onPress={() => router.push(`/profile/${person.profileId}`)}
      style={styles.person}
      testID="briefing-card-person-link"
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
  /** `briefing-card-pick`: set off from the meeting by a divider (decoration). */
  pick: {
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  pickLabel: { color: colors.ink, fontSize: textSize.base, fontWeight: "600" },
  choice: { minHeight: TARGET, justifyContent: "center", paddingVertical: space.sm },
  /** Between candidates only — not under the last, above Neither. */
  choiceDivided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  choiceName: { color: colors.ink, fontSize: textSize.base },
  change: { minHeight: TARGET, justifyContent: "center", alignSelf: "flex-start" },
  /** Change, in the none-line's own sentence size. */
  changeLabel: { color: colors.moss, fontSize: textSize.base },
  /** Not this Priya?, under the person — a size down, as the mock has it. */
  changeLabelSmall: { color: colors.moss, fontSize: textSize.sm },
  inlineChange: { minHeight: TARGET, justifyContent: "center" },
  /** The sentence and its Change on one line, wrapping when the text is large. */
  noneLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: space.sm,
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  noneText: { color: colors.ink, fontSize: textSize.base },
  /** `briefing-card-pager`: once per card, under the page, never under each one (R-C4). */
  pager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.md,
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  /**
   * Previous / next: 44pt, and their ring is their only edge, so it is `edge`
   * (3:1), not `line` — a control's outline is not decoration.
   */
  pageButton: {
    width: TARGET,
    height: TARGET,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.edge,
    alignItems: "center",
    justifyContent: "center",
  },
  pageGlyph: { color: colors.ink, fontSize: textSize.xxl },
  /** `briefing-card-page-position`: "2 of 3", as text — not dots (R-C8). */
  position: {
    color: colors.ink,
    fontFamily: fonts.utility,
    fontSize: textSize.sm,
    opacity: textOpacity.secondary,
  },
});
