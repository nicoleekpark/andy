import { copiedStore, fingerprintOf } from "@/lib/on-phone";
import { hasNativeModule } from "./native";

/**
 * Put text on the clipboard, or say it could not.
 *
 * Imported when it is used rather than at the top of the file, and that is the
 * whole point of this function. `expo-clipboard` is a native module, so its
 * JavaScript throws **on evaluation** when the binary it needs is not in the
 * app — and a static import made that throw during this module's own
 * evaluation, which the profile screen imports (it lived in the draft sheet then), which left the route with no
 * default export at all:
 *
 *     ERROR  [Error: Cannot find native module 'ExpoClipboard']
 *     WARN   Route "./(app)/profile/[id]/index.tsx" is missing the required
 *            default export.
 *
 * A dev client is rebuilt on EAS and takes minutes, so being one module behind
 * is an ordinary state here rather than a broken machine — and the cost of it
 * must be one button, not a person's whole profile. In a shipped build the
 * module is always present and this never fails.
 *
 * Asked before it is loaded, via `hasNativeModule`. Catching the throw kept
 * the app up, which was the point, and Expo still printed
 * `Cannot find native module 'ExpoClipboard'` with a full stack on every
 * press — a handled failure reported as though nothing had handled it.
 */
export async function putOnClipboard(text: string): Promise<boolean> {
  if (!hasNativeModule("ExpoClipboard")) return false;
  try {
    // `require`, not `await import`. Metro resolves both lazily, but only this
    // one hands back the very object a `import * as Clipboard` elsewhere is
    // holding — the promise form returns an interop wrapper, which is enough
    // to make a test's spy sit on a different function than the one called.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const clipboard = require("expo-clipboard") as typeof import("expo-clipboard");
    await clipboard.setStringAsync(text);
    // Its fingerprint, not the text, so a sign-out can clear the clipboard
    // only while it still holds this (`forgetOnThisPhone`).
    try {
      copiedStore.write(JSON.stringify({ fingerprint: fingerprintOf(text) }));
    } catch {
      // The copy worked; only the clean-up on sign-out is lost.
    }
    return true;
  } catch {
    return false;
  }
}
