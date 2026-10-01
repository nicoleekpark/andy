import { createContext, useContext, useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LaunchThread } from "@/components/launch-thread";
import { colors, space } from "@/constants/theme";

/**
 * Rebuild the Convex session from inside it.
 *
 * The button and the thing it restarts are two ends of one mechanism, so they
 * are written down together. `src/app/_layout.tsx` supplies the implementation:
 * it bumps a counter that is part of `ConvexSession`'s key, so calling this
 * remounts the client — a new socket and a fresh token fetch, which is the only
 * client-side action that can actually shift a stuck connection. Nothing else
 * here is a real retry: Convex's own reconnect loop is already running, and
 * "try again" that only restarts a timer would be a button that lies.
 *
 * The default is a no-op so this component can be rendered (and tested) outside
 * that provider without a crash — the screen still explains itself, it just
 * loses the shortcut.
 */
export const RetryConnectionContext = createContext<() => void>(() => {});

export function useRetryConnection(): () => void {
  return useContext(RetryConnectionContext);
}

/**
 * How long the screen stays silent, then how long before it admits something is
 * wrong.
 *
 * A normal launch resolves inside the first step, so the common case shows
 * nothing at all — an indicator that flashes for 300ms is worse than no
 * indicator, because the eye registers the flicker without reading it.
 */
const QUIET_MS = 1_500;
const SLOW_MS = 8_000;
const FAILED_MS = 20_000;

type Phase = "quiet" | "connecting" | "slow" | "failed";

const STEPS: readonly { after: number; phase: Phase }[] = [
  { after: QUIET_MS, phase: "connecting" },
  { after: SLOW_MS, phase: "slow" },
  { after: FAILED_MS, phase: "failed" },
];

function useConnectionPhase(): Phase {
  const [phase, setPhase] = useState<Phase>("quiet");

  // Absolute delays from mount rather than a chain of timers, so a delayed
  // render or a busy JS thread can't accumulate drift across three steps.
  useEffect(() => {
    const timers = STEPS.map((step) =>
      setTimeout(() => setPhase(step.phase), step.after),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return phase;
}

/**
 * What both auth gates show while Convex has not yet confirmed the token.
 *
 * This screen has two jobs that pull against each other. For the 300ms it
 * usually lasts it should be invisible; at twenty seconds it has to say what
 * went wrong and what to do. One indicator cannot serve both, so the answer is
 * time: nothing, then a spinner, then words.
 *
 * The failure state is not hypothetical. `useConvexAuth().isLoading` only flips
 * once the server confirms the token, so a signed-in user with no connection
 * waits here forever — the known cost of gating on Convex rather than Clerk,
 * recorded on day 1 and hit again in development on day 3, where a blank
 * paper-coloured screen was indistinguishable from a crash.
 *
 * The wait is the icon's thread (decided 2026-09-30/10-01, reversing the
 * platform spinner). The still loop shows from the first frame, in exactly the
 * spot the launch screen's image occupies, so the hand-over from the launch
 * screen is not a cut to blank paper — which is the part almost every launch
 * sees, since a normal one resolves inside the quiet window. Only if Andy is
 * still connecting after it does the thread start passing through.
 *
 * The spinner had three things going for it, and each is answered here rather
 * than dropped: it followed Reduce Motion for free (LaunchThread checks it and
 * stays still); it spent none of the Briefing card's signature (brass is the
 * thread before sign-in, STYLE.md); and it belonged to the phone, which the
 * system face and the words under it still do. Three bouncing dots stay
 * rejected: messaging apps taught them to mean someone is typing.
 */
export function Connecting() {
  const phase = useConnectionPhase();
  const retry = useRetryConnection();

  if (phase === "quiet") {
    return (
      <View style={[styles.screen, styles.centred]}>
        <View style={styles.anchor}>
          <LaunchThread moving={false} />
        </View>
      </View>
    );
  }

  if (phase === "failed") {
    return (
      <View style={[styles.screen, styles.centred]}>
        {/* Stated, not alarmed. STYLE.md reserves `alert` for errors the user
            can be wrong about; a connection that dropped is a state of the
            world, and colouring it red would read as blame. */}
        <Text style={styles.headline}>Andy can&apos;t reach the server.</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Try again"
          onPress={retry}
          style={styles.retry}
        >
          <Text style={styles.retryLabel}>Try again</Text>
        </Pressable>
        {/* Second, because it is the fallback. Leading with "close the app"
            while a working button sits below it would send people the long way
            round. */}
        <Text style={styles.quiet}>
          If that doesn&apos;t help, close the app completely and open it again.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.screen, styles.centred]}>
      {/* The words hang off the thread's own bottom edge rather than the
          screen's centre: centred as a group, the thread would jump up the
          moment words appear, away from where the launch image left it. */}
      <View style={styles.anchor}>
        {/* The thread stops at `failed` on purpose — that screen has no
            thread. Left moving it would keep promising that waiting is
            enough, which by then is untrue. */}
        <LaunchThread moving />
        <View style={styles.below}>
          {phase === "slow" ? (
            // Two lines, two jobs: what is happening, then what to do.
            <>
              <Text style={styles.quiet}>Still connecting.</Text>
              <Text style={styles.quiet}>Check your internet connection.</Text>
            </>
          ) : (
            <Text style={styles.quiet}>Connecting…</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Same paper ground as the splash screen, so launching reads as one surface
  // rather than a cut between two.
  screen: { flex: 1, backgroundColor: colors.paper },
  centred: {
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },

  headline: { color: colors.ink, fontSize: 17, textAlign: "center" },
  // Full width, so the words below can be as wide as the screen while the
  // thread inside stays centred.
  anchor: { alignSelf: "stretch", alignItems: "center" },
  below: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: space.xxl,
    gap: space.xs,
  },
  quiet: {
    color: colors.ink,
    fontSize: 15,
    opacity: 0.6,
    lineHeight: 22,
    textAlign: "center",
  },

  retry: {
    backgroundColor: colors.moss,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  retryLabel: { color: colors.paper, fontSize: 15, fontWeight: "600" },
});
