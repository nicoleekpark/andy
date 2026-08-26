import { Stack } from "expo-router";

/**
 * Auth gating lands here in the next slice: an (auth) group alongside (app),
 * and a redirect between them. For now there is only one group.
 */
export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="(app)" options={{ headerShown: false }} />
    </Stack>
  );
}
