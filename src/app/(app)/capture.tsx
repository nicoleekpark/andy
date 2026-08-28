import { CaptureScreen } from "@/components/capture-screen";

/**
 * Capture reached from home, before anyone has been chosen.
 *
 * PROJECT_SCOPE.md's screen list only names the profile-scoped route, but its
 * User Flow starts the main capture path with "Tap record → speak" from home,
 * where by definition you do not yet know who the note is about. Added
 * deliberately after checking, rather than bending the profile route around a
 * placeholder id.
 */
export default function CaptureRoute() {
  return <CaptureScreen />;
}
