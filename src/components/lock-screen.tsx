import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@/constants/theme";

/**
 * What `(app)/_layout.tsx` shows in place of the real app while
 * `useAppLock`'s prompt hasn't succeeded yet. Same paper ground and retry
 * shape as `<Connecting />` — a locked app and a disconnected one both read
 * as "not yet in", not as an error.
 *
 * Says nothing about who is inside — no name, no note count, no "Welcome
 * back, X" — since the entire point of this screen is that whoever is
 * holding the phone hasn't proven that's them yet.
 */

const COPY: Record<"face" | "fingerprint" | "device", string> = {
  face: "Unlock with Face ID to see your notes.",
  fingerprint: "Unlock with Touch ID to see your notes.",
  device: "Unlock with your passcode to see your notes.",
};

export function LockScreen({
  kind,
  authenticating,
  onUnlock,
}: {
  kind: "face" | "fingerprint" | "device";
  /**
   * True while the OS's own prompt is already on screen. The button still
   * renders — hiding it would shift the layout the moment the prompt
   * dismisses — but a tap does nothing, matching `useAppLock`'s own guard
   * against a second `authenticateAsync` while one is in flight.
   */
  authenticating: boolean;
  onUnlock: () => void;
}) {
  return (
    <View style={[styles.screen, styles.centred]}>
      <Text style={styles.headline}>Andy is locked.</Text>
      <Text style={styles.quiet}>{COPY[kind]}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Unlock"
        accessibilityState={{ disabled: authenticating }}
        disabled={authenticating}
        onPress={onUnlock}
        style={[styles.unlock, authenticating && styles.unlockDisabled]}
      >
        <Text style={styles.unlockLabel}>Unlock</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  centred: {
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },

  headline: { color: colors.ink, fontSize: 17, textAlign: "center" },
  quiet: {
    color: colors.ink,
    fontSize: 15,
    opacity: 0.6,
    lineHeight: 22,
    textAlign: "center",
  },

  unlock: {
    backgroundColor: colors.moss,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  unlockDisabled: { opacity: 0.5 },
  unlockLabel: { color: colors.paper, fontSize: 15, fontWeight: "600" },
});
