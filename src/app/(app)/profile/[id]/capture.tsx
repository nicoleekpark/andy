import { useLocalSearchParams } from "expo-router";
import { CaptureScreen } from "@/components/capture-screen";

/**
 * Capture reached from a person's profile — `PROJECT_SCOPE.md`'s "pre-scoped to
 * this profile".
 *
 * The scoping is real: `CaptureScreen` reads the profile, hands its name to
 * extraction as `aboutName`, and everyone else in the note becomes a mention.
 * This comment used to say it was not built, which was wrong and mattered —
 * the exemption that keeps the review screen from asking about the subject
 * rests on it. Recording here *is* the answer to "which one of them is this".
 */
export default function ProfileCaptureRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <CaptureScreen profileId={id} />;
}
