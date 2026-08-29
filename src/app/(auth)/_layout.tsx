import { Redirect, Stack } from "expo-router";
import { useConvexAuth } from "convex/react";
import { Connecting } from "@/components/connecting";
import { colors } from "@/constants/theme";

/**
 * Keeps a signed-in user out of the sign-in screen — otherwise a stale deep
 * link or a back gesture could strand them on it while already authenticated.
 */
export default function AuthLayout() {
  const { isLoading, isAuthenticated } = useConvexAuth();

  // The same component as (app)'s loading branch — returning null here would
  // flash white on the other side of the mirror, which is the exact thing that
  // branch exists to avoid, and a caller stuck offline needs the same way out
  // whichever side of the gate they are on.
  if (isLoading) {
    return <Connecting />;
  }

  if (isAuthenticated) {
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
