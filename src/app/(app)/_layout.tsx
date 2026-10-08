import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Redirect, Stack, router } from "expo-router";
import { useAuth } from "@clerk/expo";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { Connecting } from "@/components/connecting";
import { LockScreen } from "@/components/lock-screen";
import { colors } from "@/constants/theme";
import { LockedContext } from "@/lib/lock-context";
import { OutboxProvider } from "@/lib/outbox";
import { OfflineCopyProvider } from "@/lib/offline-copy";
import { PendingProvider } from "@/lib/pending-changes";
import { useOffline } from "@/lib/connection";
import { forgetOnThisPhone, outboxStore } from "@/lib/on-phone";
import { useAppLock } from "@/lib/use-app-lock";
import { onNudgeOpened } from "@/lib/notifications";

/**
 * The gate for everything that reads user data.
 *
 * Two questions, asked of two different parties:
 *
 * - **Who is signed in** is Clerk's answer, and only Clerk's "signed out" sends
 *   anyone to sign-in. Clerk can answer offline (its resource cache — see
 *   `src/app/_layout.tsx`); Convex cannot.
 * - **Whether the server has accepted that session** is Convex's answer, and
 *   nothing that reads user data shows until it has said yes once — unless
 *   Andy is offline, when there is no one to ask and the screens show only the
 *   phone's own copy (see `offline` below). "Signed in to
 *   Clerk" is not the same as "Convex accepts this token" — a misconfigured JWT
 *   template leaves Clerk reporting a session while every query returns nothing
 *   — so that state waits on <Connecting />, which offers sign-out once it gives
 *   up, rather than getting through.
 *
 * This used to gate on Convex alone and send anything unconfirmed to sign-in.
 * Offline, Convex's token refresh fails and reports "not authenticated", so a
 * signed-in person who lost their connection mid-use was thrown out to the
 * sign-in screen and lost whatever they were doing (device QA, 2026-10-06; the
 * path traced through convex 1.46.0's authentication_manager.js).
 */
/**
 * How long a session let in offline waits, once the connection is back, for
 * the server to confirm it — the same twenty seconds <Connecting /> takes to
 * give up.
 */
export const RECONNECT_GRACE_MS = 20_000;

export default function AppLayout() {
  const { isLoaded: clerkLoaded, isSignedIn, userId, signOut } = useAuth();
  const { isAuthenticated } = useConvexAuth();

  // Once the server has accepted this session, a later "not authenticated" is
  // a dropped connection, not a different person: identity changes remount this
  // whole tree (`ConvexScopedToIdentity` keys on the Clerk user id), and signing
  // out is caught by the Clerk check below. So the screens stay up, keeping
  // their state, instead of being swapped for a waiting screen. Set during
  // render rather than in an effect, so there is never a frame that unmounts
  // them first.
  const [confirmed, setConfirmed] = useState(false);
  if (isAuthenticated && !confirmed) {
    setConfirmed(true);
  }
  // Opened with no connection at all (decided 2026-10-07: a convention hall
  // with no signal): Clerk's saved session is all there is, and the server
  // cannot be asked. It is enough to let a person in — Face ID still stands
  // in front of everything, and offline the screens show only the copy this
  // account already kept on the phone (`offline-copy.tsx`). A *connected*
  // socket whose session the server refuses is not offline, so a broken token
  // still waits on <Connecting /> with Sign out.
  const offline = useOffline();
  // Let in offline, then the connection comes back: the socket opens a moment
  // before the server confirms the session, and without a grace period that
  // moment would drop the person to <Connecting /> — unmounting what they
  // were doing and asking for Face ID again (code-reviewer, 2026-10-07). So a
  // session let in offline stays in while the server is given
  // `RECONNECT_GRACE_MS` to say yes. Not for good: a session the server never
  // accepts (revoked, a broken token) still ends on <Connecting /> with Sign out.
  const [admittedOffline, setAdmittedOffline] = useState(false);
  if (offline && isSignedIn === true && !admittedOffline) {
    setAdmittedOffline(true);
  }
  const [graceOver, setGraceOver] = useState(false);
  if (offline && graceOver) {
    setGraceOver(false);
  }
  useEffect(() => {
    if (!admittedOffline || offline || isAuthenticated) return;
    const timer = setTimeout(() => setGraceOver(true), RECONNECT_GRACE_MS);
    return () => clearTimeout(timer);
  }, [admittedOffline, offline, isAuthenticated]);
  const inApp =
    isSignedIn === true &&
    (isAuthenticated || confirmed || offline || (admittedOffline && !graceOver));

  const ensureUser = useMutation(api.users.ensureUser);
  // `inApp`, not unconditionally: `useAppLock`'s effect fires whether or not
  // this component's *render output* was the lock screen, and a signed-out
  // visitor must never see a biometric prompt for a session that doesn't exist
  // yet.
  const lock = useAppLock(inApp);

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

  // The nudge after a meeting ("How was Marcus?") opens that person's capture
  // screen — the briefing flow's last step (PROJECT_SCOPE.md). Only once the
  // app is unlocked: subscribed while it is, so a tap that arrived behind the
  // lock screen is picked up the moment Face ID succeeds, and never shows a
  // person's page to whoever is holding a locked phone. A person deleted since
  // the nudge was scheduled lands on the capture screen's own "doesn't have
  // anyone by that link".
  const unlocked = inApp && lock.state.phase === "unlocked";
  useEffect(() => {
    if (!unlocked) return;
    return onNudgeOpened((profileId) => router.push(`/profile/${profileId}/capture`));
  }, [unlocked]);

  // Restoring the session takes a moment. Rendering the signed-out branch
  // during it would flash the sign-in screen on every launch.
  if (!clerkLoaded) {
    return <Connecting />;
  }

  if (!isSignedIn) {
    return <Redirect href="/sign-in" />;
  }

  // Signed in, not yet accepted by the server: still connecting, or offline
  // since launch. Fails closed — nothing of the user's shows — and <Connecting />
  // escalates to an explanation, a retry and a way out.
  if (!inApp) {
    return (
      <Connecting
        onSignOut={() => {
          // A sign-out the person chose: what Andy keeps on this phone goes with it.
          forgetOnThisPhone();
          void signOut().catch(() => {});
        }}
      />
    );
  }

  // A device with Face ID / Touch ID / a passcode gates the notes behind it,
  // re-checked on every return to the foreground — see `useAppLock`. A device
  // with none of those (or under jest, where the native module isn't in the
  // binary) fails open: `lock.state.phase` goes straight to "unlocked" for it,
  // since there would be nothing to unlock.
  //
  // "checking" covers too, not just "locked" — it is the state between a
  // return to the foreground and `lockAvailability`/`authenticateAsync`
  // resolving. Uncovering during it would show real content before the
  // prompt appears, which is exactly the leak this whole feature exists to
  // close.
  //
  // The lock is drawn *over* the <Stack>, never in place of it. Returning the
  // lock screen instead unmounted every screen, so a trip to another app threw
  // away a half-checked note or a typed question and landed on home (device QA,
  // 2026-10-06). Underneath the cover the app is hidden from VoiceOver and
  // takes no touches; native modals, which sit above any overlay, hide
  // themselves through `LockedContext`.
  const covered = lock.state.phase !== "unlocked";

  return (
    <LockedContext.Provider value={covered}>
      <OutboxProvider ownerId={userId!} store={outboxStore}>
      <PendingProvider ownerId={userId!}>
      <OfflineCopyProvider ownerId={userId!}>
        <View style={styles.fill}>
          <View
            style={styles.fill}
            pointerEvents={covered ? "none" : "auto"}
            accessibilityElementsHidden={covered}
            importantForAccessibility={covered ? "no-hide-descendants" : "auto"}
          >
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: colors.paper },
                headerTintColor: colors.ink,
                contentStyle: { backgroundColor: colors.paper },
              }}
            >
              <Stack.Screen name="index" options={{ title: "Andy" }} />
              <Stack.Screen name="capture" options={{ title: "New note" }} />
              <Stack.Screen name="search" options={{ title: "Ask Andy" }} />
              <Stack.Screen name="settings" options={{ title: "Settings" }} />
              {/* Titled from the note's own profile once it loads, so this is only the
                placeholder shown for the moment before the query lands. */}
              <Stack.Screen name="note/[id]" options={{ title: "Note" }} />
            </Stack>
          </View>

          {lock.state.phase === "locked" ? (
            <View style={styles.cover}>
              <LockScreen
                kind={lock.state.kind}
                authenticating={lock.state.authenticating}
                onUnlock={lock.retry}
              />
            </View>
          ) : covered ? (
            <View style={styles.cover} testID="lock-cover" />
          ) : null}
        </View>
      </OfflineCopyProvider>
      </PendingProvider>
      </OutboxProvider>
    </LockedContext.Provider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // Opaque, on top of everything, and the same paper ground the
  // splash/connecting screens use, so the brief gap while `useAppLock`
  // decides reads as one surface rather than a flash.
  cover: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.paper,
  },
});
