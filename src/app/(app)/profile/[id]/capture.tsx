import { useLocalSearchParams } from "expo-router";
import { CaptureScreen } from "@/components/capture-screen";

/**
 * Capture reached from a person's profile. PROJECT_SCOPE.md calls this route
 * "pre-scoped to this profile" — the id is passed down, but scoping is not
 * built yet: extraction still works out who a note is about from what was said.
 */
export default function ProfileCaptureRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <CaptureScreen profileId={id} />;
}
