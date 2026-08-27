import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { useSignInWithApple } from "@clerk/expo/apple";
import { colors } from "@/constants/theme";

/**
 * Apple is the only way in for V1. Adding a second social login would oblige
 * Sign in with Apple anyway (App Store guideline 4.8), which buys nothing on an
 * iOS-only release — see README's Tech Stack Decisions.
 *
 * The button is Apple's own component rather than a styled one of ours: Apple
 * specifies its wording, proportions and colours, and a custom lookalike is a
 * review risk. Everything around it follows STYLE.md.
 */
export default function SignInScreen() {
  const { startAppleAuthenticationFlow } = useSignInWithApple();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setError(null);
    setBusy(true);
    try {
      const { createdSessionId, setActive } =
        await startAppleAuthenticationFlow();

      if (createdSessionId && setActive) {
        // No navigation here on purpose: activating the session flips
        // useConvexAuth, and (auth)/_layout redirects out of this group.
        await setActive({ session: createdSessionId });
      }
      // A null session is deliberately silent. Clerk's hook catches
      // ERR_REQUEST_CANCELED itself and resolves with createdSessionId: null
      // rather than throwing, so this is the branch a user who dismissed the
      // Apple sheet actually lands in — and dismissing it is a choice, not a
      // failure to apologise for. The return value can't distinguish that from
      // the flow simply not being ready, and neither warrants an error.
    } catch (err) {
      // Defensive only: Clerk swallows the cancel code before it reaches here.
      // Kept so a future version that stops swallowing it can't regress into
      // showing an error for a dismissed sheet.
      if ((err as { code?: string })?.code === "ERR_REQUEST_CANCELED") {
        return;
      }
      setError("Couldn't reach Apple. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.intro}>
        <Text style={styles.title}>Andy</Text>
        <Text style={styles.body}>
          Remember the people you meet — what they do, what you talked about,
          what to follow up on.
        </Text>
      </View>

      <View style={styles.actions}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={
            AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
          }
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={10}
          style={[styles.appleButton, busy && styles.appleButtonBusy]}
          onPress={() => {
            if (!busy) {
              void signIn();
            }
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
    padding: 32,
    justifyContent: "space-between",
  },
  intro: { flex: 1, justifyContent: "center", gap: 12 },
  title: { color: colors.ink, fontSize: 32 },
  body: { color: colors.ink, fontSize: 16, opacity: 0.75 },
  actions: { gap: 12, paddingBottom: 24 },
  error: { color: colors.alert, fontSize: 14 },
  appleButton: { height: 50 },
  appleButtonBusy: { opacity: 0.5 },
});
