import { useMutation, useQuery } from "convex/react";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { api } from "@convex/_generated/api";
import { useConfirm } from "@/components/confirm-dialog";
import { Pill, Quiet, sectionStyles } from "@/components/section-buttons";
import { colors, textSize } from "@/constants/theme";
import { useFeatureState } from "@/lib/feature-flags";
import { userMessage } from "@/lib/user-message";

/**
 * `settings` → What Andy sends (`ai-section`): the go-ahead given or withheld
 * on the first-launch sheet (`ai-permission-sheet`), seen and changed here
 * (`docs/design/decisions/pre-submission-privacy.md`, option A). The server
 * keeps the answer, so it is the same on every phone.
 *
 * Hidden with the `aiPermission` switch off: there is nothing to give or
 * withhold while the server is not asking.
 */
export function AiSection() {
  const asking = useFeatureState("aiPermission");
  const user = useQuery(api.users.current, {});
  const allow = useMutation(api.aiPermission.allow);
  const withdraw = useMutation(api.aiPermission.withdraw);
  const confirm = useConfirm();
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (change: () => Promise<null>) => {
    setError(null);
    try {
      await change();
    } catch (thrown) {
      setError(userMessage(thrown, "Andy couldn't save that. Check your connection and try again."));
    }
  }, []);

  const confirmStop = useCallback(() => {
    confirm(
      "Stop sending?",
      "Andy won't read new notes, answer questions or draft follow-ups until you allow it again. Everything you've kept stays.",
      [
        { text: "Keep sending", style: "cancel" },
        { text: "Stop sending", onPress: () => void run(() => withdraw({})) },
      ],
    );
  }, [confirm, run, withdraw]);

  if (asking !== true || user === undefined || user === null) return null;
  const allowed = user.aiAllowedAt !== undefined;

  return (
    <View style={sectionStyles.section} testID="ai-section">
      <Text style={sectionStyles.label} accessibilityRole="header">
        What Andy sends
      </Text>
      <Text style={sectionStyles.status}>
        To read your notes and find them again, Andy sends what you write, and photos you choose,
        to Anthropic (Claude) and OpenAI — only to do this for you. They don&apos;t train on it.
      </Text>
      {allowed ? (
        <>
          <Text style={sectionStyles.status}>You&apos;ve allowed this.</Text>
          <Quiet label="Stop sending" onPress={confirmStop} />
        </>
      ) : (
        <>
          <Text style={sectionStyles.status}>
            Not allowed — Andy won&apos;t read notes, answer questions or draft follow-ups.
          </Text>
          <Pill label="Allow" onPress={() => void run(() => allow({}))} />
        </>
      )}
      {error !== null ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.alert, fontSize: textSize.base },
});
