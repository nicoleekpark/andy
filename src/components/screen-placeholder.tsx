import { StyleSheet, Text, View } from "react-native";
import { colors } from "@/constants/theme";

/**
 * Structural stand-in for a screen that hasn't been built yet. Each use is
 * replaced by the real screen in the slice that owns that feature, so this
 * file should shrink to nothing and then be deleted.
 */
export function ScreenPlaceholder({
  title,
  note,
  debugValue,
}: {
  title: string;
  note: string;
  /**
   * A raw route param, shown only so the skeleton proves the param arrived.
   * Kept visually separate from `note` so nobody carries the habit of printing
   * an id where a person's name belongs into a real screen.
   */
  debugValue?: string;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.note}>{note}</Text>
      {debugValue ? <Text style={styles.debug}>{debugValue}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
    padding: 24,
    gap: 8,
    justifyContent: "center",
  },
  title: { color: colors.ink, fontSize: 20 },
  note: { color: colors.ink, fontSize: 15, opacity: 0.7 },
  debug: { color: colors.ink, fontSize: 12, opacity: 0.4 },
});
