import { Stack, useLocalSearchParams } from "expo-router";
import { ScreenPlaceholder } from "@/components/screen-placeholder";

export default function CaptureScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <>
      <Stack.Screen options={{ title: "New note" }} />
      <ScreenPlaceholder
        title="New note"
        note="Say or type what's new. Andy sorts out the details."
        debugValue={`id: ${id}`}
      />
    </>
  );
}
