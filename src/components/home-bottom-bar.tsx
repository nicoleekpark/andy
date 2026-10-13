import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useRef, useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, size, space, textOpacity, textSize } from "@/constants/theme";

/**
 * Home's bottom bar (`home-actions.md`, Final choice: S1, V-NOTCHED).
 *
 * An opaque paper bar with a hairline at the very bottom of home, holding the
 * search field; the round Record sits across the bar's top edge like a
 * shutter. The field filters home's list in place — free, instant and
 * offline — and never asks Claude on its own (R3): asking is a separate,
 * labelled row, "Ask Andy: “…”", that hands what was typed to Ask (R9).
 *
 * While the field is in use Record steps aside (R8), and Cancel or clearing
 * the field brings it back. The query lives in the screen's memory only, never
 * on disk (R10).
 */
export function HomeBottomBar({
  query,
  onQuery,
  online,
  showField,
  onRecord,
}: {
  query: string;
  onQuery: (text: string) => void;
  online: boolean;
  /** No one kept yet: nothing to find, so only Record (R11). */
  showField: boolean;
  onRecord: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const keyboard = useKeyboardHeight();
  const insets = useSafeAreaInsets();
  const field = useRef<TextInput>(null);
  const trimmed = query.trim();
  const inUse = focused || trimmed !== "";

  return (
    <View
      testID="home-bottom-bar"
      // Clear of the home indicator at rest; on top of the keyboard while typing.
      style={[
        styles.bar,
        { paddingBottom: keyboard > 0 ? keyboard + space.sm : Math.max(insets.bottom, space.lg) },
      ]}
    >
      {/*
        Drawn bottom-up (`column-reverse`), so the order VoiceOver reads —
        the order written here — is field, Ask, Record, while the eye sees
        Record on top: list → field → Record, as home-actions.md asks.
      */}
      {showField ? (
        <View style={styles.fieldRow}>
          <View style={styles.field}>
            <SymbolView
              name="magnifyingglass"
              size={textSize.md}
              tintColor={colors.placeholder}
              fallback={null}
            />
            <TextInput
              ref={field}
              value={query}
              onChangeText={onQuery}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Find a name or a word"
              placeholderTextColor={colors.placeholder}
              accessibilityLabel="Find a name or a word"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              style={styles.input}
              testID="home-search-field"
            />
            {query !== "" ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear"
                onPress={() => onQuery("")}
                style={styles.clear}
                testID="home-search-clear"
              >
                <SymbolView
                  name="xmark.circle.fill"
                  size={textSize.lg}
                  tintColor={colors.placeholder}
                  fallback={<Text style={styles.clearWord}>Clear</Text>}
                />
              </Pressable>
            ) : null}
          </View>
          {inUse ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={() => {
                onQuery("");
                field.current?.blur();
                Keyboard.dismiss();
              }}
              style={styles.cancel}
              testID="home-search-cancel"
            >
              <Text style={styles.cancelLabel}>Cancel</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {showField && inUse ? (
        online ? (
          <Pressable
            accessibilityRole="button"
            // The words on screen, so Voice Control can say them (WCAG 2.5.3).
            accessibilityLabel={trimmed === "" ? "Ask Andy in your own words" : `Ask Andy: ${trimmed}`}
            onPress={() =>
              router.push(trimmed === "" ? "/search" : { pathname: "/search", params: { q: trimmed } })
            }
            style={styles.askRow}
            testID="home-ask-row"
          >
            <Text style={styles.askLabel} numberOfLines={2}>
              {trimmed === "" ? "Ask Andy in your own words" : `Ask Andy: “${trimmed}”`}
            </Text>
          </Pressable>
        ) : (
          // R5: unavailable, and said in words, never a dead control.
          <Text style={styles.askOffline} testID="home-ask-offline">
            Asking needs a connection. Names and words still work.
          </Text>
        )
      ) : null}
      {inUse ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Record"
          onPress={onRecord}
          style={styles.record}
          testID="record-button"
        >
          <Text style={styles.recordLabel}>Record</Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * How much of the screen the keyboard covers, so the bar can sit on top of it
 * (R8). The bar is the last thing on home and home runs to the bottom of the
 * window, so the keyboard's height is exactly how far it has to rise.
 */
function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const shown = Keyboard.addListener("keyboardWillShow", (event) =>
      setHeight(event.endCoordinates.height),
    );
    const hidden = Keyboard.addListener("keyboardWillHide", () => setHeight(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  return height;
}

const styles = StyleSheet.create({
  // Full width under the screen's side padding, opaque, with the hairline
  // that makes Record read as sitting *on* its edge.
  bar: {
    marginHorizontal: -space.xl,
    marginBottom: -space.xl,
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    backgroundColor: colors.paper,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    alignItems: "center",
    gap: space.sm,
    flexDirection: "column-reverse",
  },
  // Half above the hairline, half below: the shutter read. A circle at rest;
  // at the largest text sizes the word widens it into a short stadium rather
  // than being capped (home-actions.md, S1 round).
  record: {
    minWidth: size.round,
    minHeight: size.round,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.moss,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -(size.round / 2) - space.sm,
  },
  recordLabel: { color: colors.paper, fontSize: textSize.md, fontWeight: "600" },
  askRow: { alignSelf: "stretch", minHeight: size.touch, justifyContent: "center" },
  askLabel: { color: colors.moss, fontSize: textSize.base },
  askOffline: {
    alignSelf: "stretch",
    color: colors.ink,
    fontSize: textSize.md,
    opacity: textOpacity.quiet,
  },
  fieldRow: { flexDirection: "row", alignItems: "center", alignSelf: "stretch", gap: space.md },
  // Outlined, never filled: search is the quieter of the two (R2). Its only
  // edge, so `edge` (3:1), not `line`.
  field: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: size.touch,
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderColor: colors.edge,
    borderRadius: radius.pill,
  },
  input: { flex: 1, color: colors.ink, fontSize: textSize.base, paddingVertical: space.sm },
  clearWord: { color: colors.ink, fontSize: textSize.sm },
  // A 16pt mark inside a 44pt target (WCAG 2.5.8), not one grown by hitSlop.
  clear: { minWidth: size.touch, minHeight: size.touch, alignItems: "center", justifyContent: "center" },
  cancel: { minHeight: size.touch, justifyContent: "center" },
  cancelLabel: { color: colors.moss, fontSize: textSize.base },
});
