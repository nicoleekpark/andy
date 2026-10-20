import { SymbolView } from "expo-symbols";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, size, space, textSize } from "@/constants/theme";

/**
 * One line of a list you can take lines out of — an alias, a tag — drawn the
 * way Apple Contacts does it (device QA B5-9, owner chose option A from the
 * *Removing a Line* mockup): a red ⊖ in front; tapping it slides out a red
 * **Delete**, and that second tap removes the line. Two taps, so a line is
 * never lost to a stray touch while scrolling. Nothing is saved until Save.
 *
 * `alert` red is STYLE.md's colour for removing something — the one
 * non-error that has earned it — so ⊖ and Delete use it; nothing else does.
 */
export function RemovableLine({
  what,
  armed,
  onArm,
  onRemove,
  children,
}: {
  /** What the line is, for VoiceOver: "the name Babs", "the tag book club". */
  what: string;
  /** ⊖ has been tapped: Delete is showing. */
  armed: boolean;
  onArm: () => void;
  onRemove: () => void;
  /** The line's own field. */
  children: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove ${what}`}
        accessibilityState={{ expanded: armed }}
        onPress={onArm}
        style={styles.minus}
        hitSlop={space.xs}
        testID="removable-line-minus"
      >
        <SymbolView
          name="minus.circle.fill"
          size={size.icon}
          tintColor={colors.alert}
          style={armed ? styles.turned : undefined}
          fallback={<Text style={styles.minusWord}>Remove</Text>}
        />
      </Pressable>
      <View style={styles.field}>{children}</View>
      {armed ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${what}`}
          onPress={onRemove}
          style={styles.delete}
          testID="removable-line-delete"
        >
          <Text style={styles.deleteLabel}>Delete</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** ⊕ and the words — the row that adds one more line. */
export function AddLine({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.add}>
      <SymbolView
        name="plus.circle.fill"
        size={size.icon}
        tintColor={colors.moss}
        fallback={<Text style={styles.addWord}>+</Text>}
      />
      <Text style={styles.addWord}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  minus: { minWidth: size.touch, minHeight: size.touch, alignItems: "center", justifyContent: "center" },
  // A quarter turn, as Contacts turns its ⊖ once Delete is showing.
  turned: { transform: [{ rotate: "90deg" }] },
  minusWord: { color: colors.alert, fontSize: textSize.base },
  field: { flex: 1 },
  delete: {
    minHeight: size.touch,
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.control,
    backgroundColor: colors.alert,
  },
  deleteLabel: { color: colors.paper, fontSize: textSize.base, fontWeight: "600" },
  add: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: size.touch },
  addWord: { color: colors.moss, fontSize: textSize.base },
});
