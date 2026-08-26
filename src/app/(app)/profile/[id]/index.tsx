import { Stack, useLocalSearchParams } from "expo-router";
import { ScreenPlaceholder } from "@/components/screen-placeholder";

export default function ProfileScreen() {
  // useLocalSearchParams, not useGlobalSearchParams: this only re-renders while
  // the screen is focused, instead of on every global URL change.
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <>
      <Stack.Screen options={{ title: "Profile" }} />
      <ScreenPlaceholder
        title="Profile"
        note="Everything you've noted about this person, newest first."
        debugValue={`id: ${id}`}
      />
    </>
  );
}
