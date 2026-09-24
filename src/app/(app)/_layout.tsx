import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { Redirect, Stack } from "expo-router";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { Connecting } from "@/components/connecting";
import { LockScreen } from "@/components/lock-screen";
import { colors } from "@/constants/theme";
import { useAppLock } from "@/lib/use-app-lock";

/**
 * The gate for everything that reads user data.
 *
 * It keys on Convex's auth state, not Clerk's. "Signed in to Clerk" is not the
 * same as "Convex accepts this token" — if the JWT template or issuer is
 * misconfigured, Clerk reports a session while every Convex query quietly
 * returns nothing. Gating on Convex means that state can't get past this screen.
 */
export default function AppLayout() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const ensureUser = useMutation(api.users.ensureUser);
  // `isAuthenticated`, not unconditionally: `useAppLock`'s effect fires
  // whether or not this component's *render output* was the lock screen,
  // and a signed-out visitor must never see a biometric prompt for a
  // session that doesn't exist yet.
  const lock = useAppLock(isAuthenticated);

  // Bootstrapping here rather than in a sign-in callback: a user who is signed
  // in but has no users row — interrupted first launch, cleared data — repairs
  // themselves on next open instead of being locked out. ensureUser is
  // idempotent, so running it on every authenticated mount is safe.
  useEffect(() => {
    if (isAuthenticated) {
      // Swallowed on purpose: a failure here is recoverable on the next open,
      // and there is nothing useful to show the user mid-launch. Without the
      // catch it would be an unhandled rejection instead.
      ensureUser({}).catch(() => {});
    }
  }, [isAuthenticated, ensureUser]);

  // Restoring the session from the keychain takes a moment. Rendering the
  // signed-out branch during it would flash the sign-in screen on every launch.
  //
  // Known cost of gating on Convex rather than Clerk: offline, isLoading never
  // resolves, because the flag only flips once the server confirms the token.
  // A signed-in user offline sits here rather than reaching the app. That fails
  // closed, which is the right direction — but it is why <Connecting /> escalates
  // to an explanation and a way out instead of spinning indefinitely.
  if (isLoading) {
    return <Connecting />;
  }

  if (!isAuthenticated) {
    return <Redirect href="/sign-in" />;
  }

  // A device with Face ID / Touch ID / a passcode gates the notes behind it,
  // re-checked on every return to the foreground — see `useAppLock`. A device
  // with none of those (or under jest, where the native module isn't in the
  // binary) fails open: `lock.state.phase` goes straight to "unlocked" for it,
  // since there would be nothing to unlock.
  //
  // "checking" gates too, not just "locked" — it is the state between a
  // return to the foreground and `lockAvailability`/`authenticateAsync`
  // resolving. Falling through to <Stack> during it would render one frame
  // of real content before the prompt appears, which is exactly the leak
  // this whole feature exists to close.
  if (lock.state.phase !== "unlocked") {
    return lock.state.phase === "locked" ? (
      <LockScreen
        kind={lock.state.kind}
        authenticating={lock.state.authenticating}
        onUnlock={lock.retry}
      />
    ) : (
      <View style={styles.checking} />
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.paper },
        headerTintColor: colors.ink,
        contentStyle: { backgroundColor: colors.paper },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Andy" }} />
      <Stack.Screen name="capture" options={{ title: "New note" }} />
      <Stack.Screen name="search" options={{ title: "Search" }} />
      <Stack.Screen name="settings" options={{ title: "Settings" }} />
      {/* Titled from the note's own profile once it loads, so this is only the
          placeholder shown for the moment before the query lands. */}
      <Stack.Screen name="note/[id]" options={{ title: "Note" }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  // Same paper ground the splash/connecting screens use, so the brief gap
  // while `useAppLock` decides reads as one surface rather than a flash.
  checking: { flex: 1, backgroundColor: colors.paper },
});
