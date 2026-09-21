import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../constants/theme";

/**
 * The Briefing card — who you are about to meet, and what you wrote about them.
 *
 * `STYLE.md` calls this "the single place that looks different from everything
 * else" and spends the app's one visual risk here: a `brass` left-edge stripe,
 * a soft dashed top border that reads as a torn note edge, and nothing else in
 * the app allowed to borrow any of it. `brass` appears in exactly this file.
 *
 * It sits at the top of home rather than on a screen of its own because the
 * thing it is for is the twenty minutes before you walk into a room, and a
 * briefing you have to navigate to is a briefing you read afterwards.
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
  /** Not asked yet. The card is the invitation, and the tap is the consent. */
  | { state: "ask"; onAsk: () => void; asking: boolean }
  /** Asked and refused, and iOS will not ask again. */
  | { state: "denied" }
  | { state: "empty" }
  | { state: "ready"; briefing: Briefing };

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
      {/*
        The stripe and the torn edge, and the only place either is allowed.
        Drawn as siblings rather than as borders on the card so the dashes stop
        where the stripe begins, which is what makes it read as a torn sheet
        rather than as a box with a dotted line on top.
      */}
      <View style={styles.stripe} />
      <View style={styles.torn} />

      {props.state === "ask" ? (
        <>
          <Text style={styles.heading}>Before you walk in</Text>
          <Text style={styles.body}>
            Andy can read today&apos;s events and show what you already wrote
            about whoever you are meeting. Nothing is added to your calendar.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Let Andy read my calendar"
            onPress={props.onAsk}
            disabled={props.asking}
            style={[styles.action, props.asking && styles.disabled]}
          >
            <Text style={styles.actionLabel}>
              {props.asking ? "Asking…" : "Read my calendar"}
            </Text>
          </Pressable>
        </>
      ) : null}

      {props.state === "denied" ? (
        <>
          <Text style={styles.heading}>Before you walk in</Text>
          {/*
            No button. iOS will not show the sheet a second time, so one here
            would do nothing at all when pressed — worse than not being there,
            because it looks like the app is broken rather than like a choice
            that was made.
          */}
          <Text style={styles.body}>
            Calendar access is off, so Andy can&apos;t see who you are meeting.
            Turn it on in Settings › Andy › Calendars.
          </Text>
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
            No meetings in the next twelve hours with anyone you keep notes
            about.
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
                  ? "nothing written down yet"
                  : person.noteCount === 1
                    ? "1 note"
                    : `${person.noteCount} notes`}
              </Text>
            </Pressable>
          ))}

          {props.briefing.ambiguous.map((name) => (
            // Said rather than guessed. Two people answer to this name and the
            // app does not know which one you are meeting — picking the one
            // with more notes would be it pretending to know.
            <Text key={name.name} style={styles.body}>
              You keep {name.count} people called “{name.name}”, so Andy
              can&apos;t tell which one this is.
            </Text>
          ))}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.paper,
    marginHorizontal: 24,
    marginBottom: 20,
    paddingLeft: 20,
    paddingRight: 16,
    paddingTop: 18,
    paddingBottom: 16,
    overflow: "hidden",
  },
  /**
   * The signature. `brass` lives here and nowhere else in the app — spreading
   * it is the one thing `STYLE.md` says would stop it being a signature.
   */
  stripe: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: colors.brass,
  },
  /** The torn edge. Starts after the stripe so the two read as one object. */
  torn: {
    position: "absolute",
    left: 3,
    right: 0,
    top: 0,
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderTopColor: colors.line,
  },
  when: {
    color: colors.brass,
    fontFamily: fonts.utility,
    fontSize: 13,
    marginBottom: 4,
  },
  heading: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 18,
    lineHeight: 24,
  },
  body: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.7,
    marginTop: 8,
  },
  person: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
  },
  personName: { color: colors.moss, fontSize: 16 },
  personMeta: { color: colors.ink, fontFamily: fonts.utility, fontSize: 12, opacity: 0.55 },
  action: {
    marginTop: 14,
    alignSelf: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: colors.moss,
  },
  actionLabel: { color: colors.paper, fontSize: 15 },
  disabled: { opacity: 0.5 },
});
