import { Stack } from "expo-router";
import { colors } from "@/constants/theme";

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.paper },
        headerTintColor: colors.ink,
        contentStyle: { backgroundColor: colors.paper },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Andy" }} />
      <Stack.Screen name="search" options={{ title: "Search" }} />
      <Stack.Screen name="settings" options={{ title: "Settings" }} />
    </Stack>
  );
}
