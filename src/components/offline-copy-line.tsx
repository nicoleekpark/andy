import { StyleSheet, Text } from "react-native";
import { colors, space } from "@/constants/theme";
import { formatMoment } from "@/lib/dates";

/**
 * Said whenever a screen is showing the phone's copy rather than the server's
 * answer (`src/lib/offline-copy.tsx`), so an old detail is never mistaken for
 * the latest. Nothing when the screen is live.
 */
export function OfflineCopyLine({ takenAt }: { takenAt: number | null }) {
  if (takenAt === null) return null;
  return (
    <Text testID="offline-copy-line" style={styles.line}>
      Offline — showing what Andy had at {formatMoment(takenAt)}.
    </Text>
  );
}

const styles = StyleSheet.create({
  line: {
    color: colors.ink,
    fontSize: 13,
    opacity: 0.55,
    lineHeight: 19,
    marginBottom: space.md,
  },
});
