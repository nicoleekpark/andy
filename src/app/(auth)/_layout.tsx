import { Redirect, Stack } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useConvexAuth } from "convex/react";
import { colors } from "@/constants/theme";

/**
 * Keeps a signed-in user out of the sign-in screen — otherwise a stale deep
 * link or a back gesture could strand them on it while already authenticated.
 */
export default function AuthLayout() {
  const { isLoading, isAuthenticated } = useConvexAuth();

  // Same paper ground as (app)'s loading branch — returning null here would
  // flash white on the other side of the mirror, which is the exact thing the
  // (app) branch exists to avoid.
  if (isLoading) {
    return <View style={styles.loading} />;
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

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: colors.paper },
});
