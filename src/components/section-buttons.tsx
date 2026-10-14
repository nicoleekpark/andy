import { Pressable, StyleSheet, Text } from "react-native";
import { colors, radius, size, space, textOpacity, textSize } from "@/constants/theme";

/**
 * The three button weights of a `settings` section, as
 * `docs/design/decisions/calendar-connection.md` names them: a `moss` pill for
 * the one way forward, `moss` text for a reversible choice, quiet `ink` text
 * for the rare way out. Shared by every section so they stay one design.
 */

/** The one way forward: a filled `moss` pill. */
export function Pill({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.pill}>
      <Text style={styles.pillLabel}>{label}</Text>
    </Pressable>
  );
}

/** A reversible choice: `moss` text. */
export function Secondary({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.textButton}>
      <Text style={styles.secondaryLabel}>{label}</Text>
    </Pressable>
  );
}

/** The rare way out: quiet `ink` text. */
export function Quiet({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.textButton}>
      <Text style={styles.quietLabel}>{label}</Text>
    </Pressable>
  );
}

/** A section's frame, header label and status line — the Calendar section's. */
export const sectionStyles = StyleSheet.create({
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
});

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    minHeight: size.touch,
    justifyContent: "center",
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.moss,
  },
  pillLabel: { color: colors.paper, fontSize: textSize.base },
  textButton: { alignSelf: "flex-start", minHeight: size.touch, justifyContent: "center" },
  secondaryLabel: { color: colors.moss, fontSize: textSize.base },
  quietLabel: { color: colors.ink, fontSize: textSize.base, opacity: textOpacity.quiet },
});
