import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, disabledOpacity, fonts, radius, size, space, textOpacity, textSize } from "@/constants/theme";

/**
 * `ai-permission-sheet`: what Andy sends, to whom and why, and the person's
 * answer (`docs/design/decisions/pre-submission-privacy.md`, option A). Asked
 * before anything is sent, as App Review 5.1.2(i) requires — never after.
 *
 * A sheet rather than a screen in the stack: it is a question, answered in
 * place, and Not now leaves the person exactly where they were. Swiping it
 * away is Not now. Shown only while Andy is unlocked (`AiGoAheadProvider`).
 */
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
          Before Andy reads your notes
        </Text>
        <Text style={styles.body}>
          To turn what you say, write or photograph into notes, and to find them again when you
          ask, Andy sends the words — and photos you choose — to two services:{" "}
          <Text style={styles.strong}>Anthropic (Claude)</Text> reads them, and{" "}
          <Text style={styles.strong}>OpenAI</Text> makes them searchable.
        </Text>
        <Text style={styles.body}>They use them only to do this for you, and don&apos;t train on them.</Text>
        <Text style={styles.body}>
          Calendar names never leave this phone. Andy never sends anything to the people you write
          about.
        </Text>

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
          Not now: notes you keep stay on this phone and in your account, but Andy won&apos;t read
          them, answer questions or draft follow-ups until you allow it. You can change this in
          Settings.
        </Text>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.paper },
  content: { padding: space.xl, paddingTop: space.xxxl, gap: space.lg },
  title: { color: colors.ink, fontFamily: fonts.display, fontSize: textSize.xxl },
  body: { color: colors.ink, fontSize: textSize.base },
  strong: { fontWeight: "600" },
  error: { color: colors.alert, fontSize: textSize.base },
  actions: { gap: space.sm, marginTop: space.sm },
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
