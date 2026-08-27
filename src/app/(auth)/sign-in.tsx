import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { useSignInWithApple } from "@clerk/expo/apple";
import { useAuth } from "@clerk/expo";
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

/**
 * How long to treat "signed in to Clerk but not yet to Convex" as the normal
 * gap between activating a session and the server confirming its token, before
 * offering a way out. Reaching this screen at all already means Convex has not
 * authenticated us, so the only question is whether it is still working on it.
 */
export const STUCK_AFTER_MS = 6000;

export default function SignInScreen() {
  const { startAppleAuthenticationFlow } = useSignInWithApple();
  const { isSignedIn, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stuck, setStuck] = useState(false);

  // Being signed in to Clerk while still on this screen means Convex would not
  // take the token — a misconfigured JWT template does exactly this. Without a
  // way out the account is unusable: the gate blocks every route, and sign-out
  // lives behind it, so the only remedy left is deleting the app.
  // The flag is set by the timer and cleared in cleanup, never in the effect
  // body — the React Compiler lint rule rejects a synchronous setState there,
  // and cleanup is the more correct place anyway: it also resets when Clerk
  // signs the user out by some path other than the button below, so signing
  // back in gets a fresh waiting period instead of an instant warning.
  useEffect(() => {
    if (!isSignedIn) {
      return;
    }
    const timer = setTimeout(() => setStuck(true), STUCK_AFTER_MS);
    return () => {
      clearTimeout(timer);
      setStuck(false);
    };
  }, [isSignedIn]);

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
        {isSignedIn ? (
          stuck ? (
            <>
              <Text style={styles.stuck}>
                You&apos;re signed in with Apple, but Andy can&apos;t reach your
                account. Sign out and try again.
              </Text>
              <Pressable
                style={styles.signOut}
                onPress={() => {
                  // Only clear on success. A failing signOut is a *correlated*
                  // failure here — the reason for being stuck is usually a
                  // network or config problem — and clearing optimistically
                  // would hide the button while leaving isSignedIn true, which
                  // strands the user on "Finishing sign-in…" with no way back.
                  void signOut().catch(() => {});
                }}
                accessibilityRole="button"
              >
                <Text style={styles.signOutLabel}>Sign out</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.waiting}>Finishing sign-in…</Text>
          )
        ) : (
          <>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={
                AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
              }
              buttonStyle={
                AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={10}
              style={[styles.appleButton, busy && styles.appleButtonBusy]}
              onPress={() => {
                if (!busy) {
                  void signIn();
                }
              }}
            />
          </>
        )}
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
  stuck: { color: colors.alert, fontSize: 14 },
  waiting: { color: colors.ink, fontSize: 14, opacity: 0.5 },
  appleButton: { height: 50 },
  appleButtonBusy: { opacity: 0.5 },
  signOut: {
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
  },
  signOutLabel: { color: colors.moss, fontSize: 16 },
});
