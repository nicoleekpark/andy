import { useAuth } from "@clerk/expo";
import { useAction } from "convex/react";
import { useCallback, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AiSection } from "@/components/ai-section";
import { Secondary, sectionStyles } from "@/components/section-buttons";
import { PRIVACY_POLICY_URL } from "@/constants/links";
import { CalendarSection } from "@/components/calendar-section";
import { useConfirm } from "@/components/confirm-dialog";
import { api } from "@convex/_generated/api";
import { ScreenPlaceholder } from "@/components/screen-placeholder";
import { colors, radius, space, textSize } from "@/constants/theme";
import { userMessage } from "@/lib/user-message";
import { useOutbox } from "@/lib/outbox";
import { usePending } from "@/lib/pending-changes";
import { forgetOnThisPhone } from "@/lib/on-phone";

export default function SettingsScreen() {
  const confirm = useConfirm();
  const { signOut } = useAuth();
  const deleteMyAccount = useAction(api.account.deleteMyAccount);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A latch, not state: two taps can land before `deleting` re-renders.
  const running = useRef(false);

  const deleteAccount = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setDeleting(true);
    setError(null);
    try {
      await deleteMyAccount({});
      // The account is gone; the session that named it goes with it, and so
      // do any notes it kept on this phone.
      forgetOnThisPhone();
      await signOut();
    } catch (thrown) {
      setError(
        userMessage(thrown, "Andy couldn't delete your account. Check your connection and try again."),
      );
    } finally {
      running.current = false;
      setDeleting(false);
    }
  }, [deleteMyAccount, signOut]);

  /**
   * Signing out removes notes kept on this phone while offline (`forgetOnThisPhone`)
   * — they belong to whoever wrote them, and the next person to sign in must
   * not inherit them.
   * Asked first when any are still waiting, because those words exist nowhere
   * else yet.
   */
  const { notes: waiting } = useOutbox();
  const { changes } = usePending();
  const confirmSignOut = useCallback(() => {
    const signOutAndForget = () => {
      forgetOnThisPhone();
      void signOut();
    };
    if (waiting.length === 0 && changes.length === 0) {
      signOutAndForget();
      return;
    }
    // What would be lost, in the order a person thinks of it.
    const lost = [
      waiting.length === 0
        ? null
        : `${waiting.length === 1 ? "1 note" : `${waiting.length} notes`} Andy hasn't read yet`,
      changes.length === 0
        ? null
        : `${changes.length === 1 ? "1 change" : `${changes.length} changes`} made offline and not synced`,
    ].filter((part): part is string => part !== null);
    confirm(
      "Sign out?",
      `This phone has ${lost.join(" and ")}. Signing out deletes ${
        waiting.length + changes.length === 1 ? "it" : "them"
      }.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out", onPress: signOutAndForget },
      ],
    );
  }, [confirm, waiting.length, changes.length, signOut]);

  /**
   * App Store Guideline 5.1.1(v): deletion has to be in the app, not a support
   * email. It asks once, and says plainly what goes, because nothing comes back.
   */
  const confirmDelete = useCallback(() => {
    confirm(
      "Delete your account?",
      "Everyone you keep in Andy, every note and every photo will be deleted, and your sign-in with it. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete account", style: "destructive", onPress: () => void deleteAccount() },
      ],
    );
  }, [confirm, deleteAccount]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenPlaceholder title="Settings" note="Manage your account." />

      <CalendarSection />

      <AiSection />

      {/*
        Always here, switch or no switch: App Review 5.1.1(i) wants the policy
        reachable inside the app, not only from the store listing.
      */}
      <View style={sectionStyles.section}>
        <Secondary
          label="Privacy policy"
          role="link"
          onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
          testID="settings-privacy-link"
        />
      </View>

      <Pressable
        style={styles.signOut}
        onPress={confirmSignOut}
        disabled={deleting}
        accessibilityRole="button"
      >
        <Text style={styles.signOutLabel}>Sign out</Text>
      </Pressable>

      <Pressable
        style={styles.delete}
        onPress={confirmDelete}
        disabled={deleting}
        accessibilityRole="button"
        accessibilityLabel="Delete account"
      >
        <Text style={styles.deleteLabel}>
          {deleting ? "Deleting your account…" : "Delete account"}
        </Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  // Grows with Dynamic Type and the Calendar section: the screen scrolls.
  content: { paddingBottom: space.xxl },
  signOut: {
    margin: space.xl,
    marginBottom: space.md,
    paddingVertical: space.md,
    // The same shape as the Sign out on the sign-in screen.
    borderRadius: radius.control,
    borderWidth: 1,
    // Its only edge, so `edge` (3:1), not `line` (1.67:1) — WCAG 1.4.11.
    borderColor: colors.edge,
    alignItems: "center",
  },
  signOutLabel: { color: colors.moss, fontSize: textSize.lg },
  // STYLE.md: `alert` for errors and the destructive controls that have earned
  // the same weight. Deleting the whole account is the heaviest of them.
  delete: { marginHorizontal: space.xl, paddingVertical: space.md, alignItems: "center" },
  deleteLabel: { color: colors.alert, fontSize: textSize.lg },
  error: {
    color: colors.alert,
    marginHorizontal: space.xl,
    marginTop: space.sm,
    fontSize: textSize.md,
    textAlign: "center",
  },
});
