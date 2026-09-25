import { hasNativeModule } from "./native";

/**
 * Passcode/biometric app lock — a Must-have from `PROJECT_SCOPE.md`.
 *
 * The notes this app holds are things a person wrote about somebody else
 * without asking them, plus pet health data. Clerk's own token cache keeps
 * the session readable from the Keychain from the first unlock after boot
 * onward (`AFTER_FIRST_UNLOCK`, the library default — decided 2026-09-24 to
 * keep rather than override, see the memory note on that decision), so a
 * phone that was unlocked once and then lost stays signed in to Andy. This
 * is the gate that closes that window: re-authenticate with the device's own
 * Face ID / Touch ID / passcode before the app's content is shown at all.
 *
 * Same lazy-`require` + `hasNativeModule` shape as `notifications.ts`, for
 * the same reason: importing a native module eagerly throws under jest
 * (nothing is in the binary), and catching that throw at the call site
 * presents a handled failure as a crash. `require`, not `await import` —
 * only this form hands back the object a test's spy sits on (day 6).
 */

type LocalAuthenticationModule = typeof import("expo-local-authentication");

let loaded: LocalAuthenticationModule | null | undefined;

function localAuthenticationModule(): LocalAuthenticationModule | null {
  if (loaded !== undefined) return loaded;
  let next: LocalAuthenticationModule | null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    next = require("expo-local-authentication");
  } catch {
    next = null;
  }
  loaded = next;
  return next;
}

export type LockAvailability =
  /** No native module (jest, or a build predating this package). */
  | { state: "unavailable" }
  /** Nothing at all is set up to authenticate with — no passcode, no biometrics. */
  | { state: "not-enrolled" }
  /** Ready to authenticate. `kind` is for copy only ("Face ID" vs "Touch ID"). */
  | { state: "ready"; kind: "face" | "fingerprint" | "device" };

/**
 * What the device can actually do, checked proactively rather than only
 * learned from `authenticateAsync`'s error string — so the lock screen can
 * say "set up Face ID in Settings" instead of a generic failure, and so a
 * device with no lock capability at all can be told apart from one where
 * biometrics merely failed once.
 *
 * `getEnrolledLevelAsync`, not `hasHardwareAsync`/`isEnrolledAsync` — found
 * by `security-reviewer` (2026-09-24). Those two only ever probe biometrics
 * (`LAPolicy.deviceOwnerAuthenticationWithBiometrics` on iOS), but `unlock`
 * below calls `authenticateAsync` with the default policy, which also
 * accepts the plain device passcode. Checking biometric-only enrollment here
 * meant a real iPhone with a passcode set but no Face ID/Touch ID enrolled
 * — not a rare case: Face ID turned off, MDM-disabled biometrics, a
 * passcode-only device — read as "nothing to gate behind" and got no lock
 * at all, silently, defeating the entire feature for that population.
 * `getEnrolledLevelAsync` matches the policy `unlock` actually uses: a bare
 * passcode is `SecurityLevel.SECRET`, not `NONE`.
 *
 * `"not-enrolled"` is the only "nothing to gate behind" case now — the
 * caller's job, not this function's, is deciding whether that fails open
 * (skip the lock) or is treated as a setup problem to surface. This app
 * fails open: see `useAppLock`.
 */
export async function lockAvailability(): Promise<LockAvailability> {
  if (!hasNativeModule("ExpoLocalAuthentication")) {
    return { state: "unavailable" };
  }
  const auth = localAuthenticationModule();
  if (auth === null) return { state: "unavailable" };

  try {
    const level = await auth.getEnrolledLevelAsync();
    if (level === auth.SecurityLevel.NONE) {
      return { state: "not-enrolled" };
    }

    // Cosmetic edge case (`security-reviewer`, 2026-09-24): this reads
    // hardware presence, not enrollment — a device with Face ID hardware
    // that's turned off/unenrolled (level `SECRET`, not `BIOMETRIC_*`) can
    // still report the type here, so the copy might say "Face ID" while the
    // OS actually presents passcode entry. `unlock()`'s real gating is
    // unaffected either way; only the label could be briefly wrong.
    const types = await auth.supportedAuthenticationTypesAsync();
    const kind = types.includes(auth.AuthenticationType.FACIAL_RECOGNITION)
      ? "face"
      : types.includes(auth.AuthenticationType.FINGERPRINT)
        ? "fingerprint"
        : "device";
    return { state: "ready", kind };
  } catch {
    // A device that throws answering these questions is not one to gate
    // behind — the same fail-open direction as "unavailable".
    return { state: "unavailable" };
  }
}

export type UnlockResult =
  | { success: true }
  /** The person cancelled on purpose — not a failure to report. */
  | { success: false; cancelled: true }
  /** Wrong finger, wrong face, wrong passcode, or the system refused. */
  | { success: false; cancelled: false };

const CANCEL_ERRORS = new Set([
  "user_cancel",
  "system_cancel",
  "app_cancel",
  "user_fallback",
]);

/**
 * Prompt once. Device-passcode fallback is automatic and built into the OS
 * prompt when `disableDeviceFallback` is left `false` (the default) — a
 * person whose Face ID is temporarily unreadable (a mask, a bad angle) is
 * not locked out of their own notes for it.
 */
export async function unlock(promptMessage: string): Promise<UnlockResult> {
  const auth = localAuthenticationModule();
  if (auth === null) return { success: false, cancelled: false };

  try {
    const result = await auth.authenticateAsync({ promptMessage });
    if (result.success) return { success: true };
    return { success: false, cancelled: CANCEL_ERRORS.has(result.error) };
  } catch {
    return { success: false, cancelled: false };
  }
}
