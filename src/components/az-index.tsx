import { useState } from "react";
import { StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import { colors, fonts, space, textSize } from "../constants/theme";
import { INDEX_LETTERS } from "../lib/name-index";

/**
 * `home-index`: A–Z then # down the right of home, like Contacts (device QA
 * #7). Tap a letter, or drag along the strip, and the list jumps there.
 *
 * Every letter is shown whether or not anyone is under it, so the strip never
 * changes shape under a moving thumb; a letter with nobody goes to the next
 * one that has somebody (`sectionFor`).
 *
 * **To VoiceOver it is one adjustable control**, not 27 tiny buttons: swipe up
 * or down to move a letter, and the list follows. The letters are smaller
 * than 44pt, which WCAG 2.5.8 allows here because the list itself is the
 * full-size way to reach every name; the index is a shortcut on top of it.
 */
export function AzIndex({
  available,
  onJump,
}: {
  /** The letters somebody is filed under, for VoiceOver's steps. */
  available: readonly string[];
  /** Go to `letter` (or the next one with anybody). */
  onJump: (letter: string) => void;
}) {
  const [height, setHeight] = useState(0);
  const [current, setCurrent] = useState<string | null>(null);

  const go = (letter: string) => {
    setCurrent(letter);
    onJump(letter);
  };

  /** The letter under a finger at `y` within the strip. */
  const letterAt = (event: GestureResponderEvent) => {
    if (height === 0) return undefined;
    const slot = Math.floor((event.nativeEvent.locationY / height) * INDEX_LETTERS.length);
    return INDEX_LETTERS[Math.min(INDEX_LETTERS.length - 1, Math.max(0, slot))];
  };

  const follow = (event: GestureResponderEvent) => {
    const letter = letterAt(event);
    if (letter !== undefined && letter !== current) go(letter);
  };

  /** VoiceOver's swipe up/down: the next or previous letter that has anybody. */
  const step = (by: 1 | -1) => {
    const at = current === null ? (by === 1 ? -1 : available.length) : available.indexOf(current);
    const next = available[at + by];
    if (next !== undefined) go(next);
  };

  return (
    <View
      style={styles.strip}
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={follow}
      onResponderMove={follow}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Jump to a letter"
      accessibilityValue={{ text: current ?? available[0] ?? "" }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(event) =>
        step(event.nativeEvent.actionName === "increment" ? 1 : -1)
      }
      testID="home-index"
    >
      {INDEX_LETTERS.map((letter) => (
        <Text key={letter} style={styles.letter} maxFontSizeMultiplier={1.2}>
          {letter}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: space.xs,
  },
  letter: {
    color: colors.moss,
    fontFamily: fonts.utility,
    fontSize: textSize.xs,
    lineHeight: textSize.lg,
  },
});
