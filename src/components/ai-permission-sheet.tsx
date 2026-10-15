import { SymbolView, type SFSymbol } from "expo-symbols";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  colors,
  disabledOpacity,
  fonts,
  radius,
  size,
  space,
  textOpacity,
  textSize,
} from "@/constants/theme";

/**
 * `ai-permission-sheet`: what Andy sends, to whom and why, and the person's
 * answer (`docs/design/decisions/pre-submission-privacy.md`, option A). Asked
 * before anything is sent, as App Review 5.1.2(i) requires — never after, and
 * never by itself: only when the person reaches for something that reads.
 *
 * Drawn the way Apple asks before Siri sends anything to ChatGPT: a few rows,
 * one idea each, then one way forward and a plain Not now. Swiping it away is
 * Not now. Shown only while Andy is unlocked (`AiGoAheadProvider`).
 */

/** One idea per row: what Andy does, who receives it, what stays here. */
const ROWS: { symbol: SFSymbol; title: string; body: string }[] = [
  {
    symbol: "doc.text.magnifyingglass",
    title: "Reads what you write",
    body: "Pulls out who it's about and what to remember, and finds it again when you ask.",
  },
  {
    symbol: "arrow.left.arrow.right",
    title: "Anthropic and OpenAI",
    body: "Read it only to do this for you. They don't train on it, and delete it within 30 days.",
  },
  {
    symbol: "lock",
    title: "Stays yours",
    body: "Calendar names never leave this phone. Andy never sends anything to the people you write about.",
  },
];

export function AiPermissionSheet({
  saving,
  error,
  onAllow,
  onNotNow,
}: {
  saving: boolean;
  error: string | null;
  onAllow: () => void;
  onNotNow: () => void;
}) {
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onNotNow}>
      <ScrollView style={styles.fill} contentContainerStyle={styles.content} testID="ai-permission-sheet">
        <Text style={styles.title} accessibilityRole="header" testID="ai-permission-sheet-title">
          Let Andy read your notes?
        </Text>

        {ROWS.map((row) => (
          <View key={row.title} style={styles.row} accessible>
            <SymbolView
              name={row.symbol}
              size={size.icon}
              tintColor={colors.ink}
              style={styles.symbol}
              // Decorative: the title and line beside it say it all, so a
              // build without symbols needs no word in its place.
              fallback={null}
            />
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{row.title}</Text>
              <Text style={styles.rowBody}>{row.body}</Text>
            </View>
          </View>
        ))}

        {error !== null ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Allow"
            accessibilityState={{ busy: saving }}
            disabled={saving}
            onPress={onAllow}
            style={[styles.allow, saving && styles.disabled]}
            testID="ai-permission-allow"
          >
            <Text style={styles.allowLabel}>{saving ? "Saving…" : "Allow"}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Not now"
            disabled={saving}
            onPress={onNotNow}
            style={styles.notNow}
            testID="ai-permission-not-now"
          >
            <Text style={styles.notNowLabel}>Not now</Text>
          </Pressable>
        </View>
        <Text style={styles.footnote} testID="ai-permission-sheet-footnote">
          Not now: you can still write notes and save them as you wrote them. Andy won&apos;t ask
          again unless you reach for something it reads. You can change this in Settings.
        </Text>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.paper },
  content: { padding: space.xl, paddingTop: space.xxxl, gap: space.xl },
  title: { color: colors.ink, fontFamily: fonts.display, fontSize: textSize.xxl },
  row: { flexDirection: "row", gap: space.lg, alignItems: "flex-start" },
  symbol: { width: size.icon, height: size.icon, marginTop: space.xs },
  rowText: { flex: 1, gap: space.xs },
  rowTitle: { color: colors.ink, fontSize: textSize.base, fontWeight: "600" },
  rowBody: { color: colors.ink, fontSize: textSize.base },
  error: { color: colors.alert, fontSize: textSize.base },
  actions: { gap: space.sm },
  allow: {
    minHeight: size.touch,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.moss,
  },
  allowLabel: { color: colors.paper, fontSize: textSize.base, fontWeight: "600" },
  notNow: { minHeight: size.touch, justifyContent: "center", alignItems: "center" },
  notNowLabel: { color: colors.moss, fontSize: textSize.base },
  footnote: { color: colors.ink, fontSize: textSize.sm, opacity: textOpacity.quiet },
  disabled: { opacity: disabledOpacity },
});
