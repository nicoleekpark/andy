import { Redirect, Stack } from "expo-router";
import { useAuth } from "@clerk/expo";
import { useConvexAuth } from "convex/react";
import { Connecting } from "@/components/connecting";
import { colors } from "@/constants/theme";

/**
 * Keeps a signed-in user out of the sign-in screen — otherwise a stale deep
 * link or a back gesture could strand them on it while already authenticated.
 */
export default function AuthLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const { isAuthenticated } = useConvexAuth();

  // The same component as (app)'s loading branch — returning null here would
  // flash white on the other side of the mirror.
  if (!isLoaded) {
    return <Connecting />;
  }

  // Out of here only when *both* agree: Clerk says signed in and the server has
  // accepted it. (app) sends someone back here only on Clerk's "signed out", so
  // requiring Clerk's "signed in" here means the two gates can never send a
  // person back and forth — they disagree for a moment during every sign-out.
  // Signed in but not yet accepted stays on the sign-in screen, which says
  // "Finishing sign-in…" and offers a way out if it never finishes.
  if (isSignedIn && isAuthenticated) {
    return <Redirect href="/" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.paper },
      }}
    />
  );
}
