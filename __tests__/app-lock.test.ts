jest.mock("../src/lib/native", () => ({ hasNativeModule: jest.fn(() => true) }));

jest.mock("expo-local-authentication", () => ({
  getEnrolledLevelAsync: jest.fn(),
  supportedAuthenticationTypesAsync: jest.fn(),
  authenticateAsync: jest.fn(),
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
}));

import * as LocalAuthentication from "expo-local-authentication";
import { hasNativeModule } from "../src/lib/native";
import { lockAvailability, unlock } from "../src/lib/app-lock";

/**
 * `src/lib/app-lock.ts` — the local (device-only) half of the app lock.
 * `src/lib/use-app-lock.ts` has its own suite for the state machine built
 * on top of this; these tests are about what the module itself reports for
 * a given device state, and about not letting a device with nothing to gate
 * behind get stuck.
 */

beforeEach(() => {
  (hasNativeModule as jest.Mock).mockReturnValue(true);
  (LocalAuthentication.getEnrolledLevelAsync as jest.Mock).mockResolvedValue(
    LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG,
  );
  (LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock).mockResolvedValue([
    LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
  ]);
  (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({ success: true });
});

afterEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// lockAvailability
// ---------------------------------------------------------------------------

test("should say unavailable when the native module isn't in this binary", async () => {
  (hasNativeModule as jest.Mock).mockReturnValue(false);

  await expect(lockAvailability()).resolves.toEqual({ state: "unavailable" });
  expect(LocalAuthentication.getEnrolledLevelAsync).not.toHaveBeenCalled();
});

test("should say not-enrolled when nothing at all is set up — no passcode, no biometrics", async () => {
  (LocalAuthentication.getEnrolledLevelAsync as jest.Mock).mockResolvedValue(
    LocalAuthentication.SecurityLevel.NONE,
  );

  await expect(lockAvailability()).resolves.toEqual({ state: "not-enrolled" });
});

test("should report Face ID by kind when facial recognition is supported", async () => {
  (LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock).mockResolvedValue([
    LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
  ]);

  await expect(lockAvailability()).resolves.toEqual({ state: "ready", kind: "face" });
});

test("should report Touch ID by kind when only fingerprint is supported", async () => {
  (LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock).mockResolvedValue([
    LocalAuthentication.AuthenticationType.FINGERPRINT,
  ]);

  await expect(lockAvailability()).resolves.toEqual({ state: "ready", kind: "fingerprint" });
});

/**
 * The bug `security-reviewer` found on 2026-09-24: checking `isEnrolledAsync`
 * (biometrics-only) instead of `getEnrolledLevelAsync` meant a real iPhone
 * with a passcode set but no Face ID/Touch ID enrolled read as "nothing to
 * gate behind" and got no lock at all — silently, even though `unlock`'s
 * own `authenticateAsync` call would have worked fine via the passcode.
 * `SecurityLevel.SECRET` (a passcode, no biometrics) must stay "ready", not
 * fall through to "not-enrolled".
 */
test("should stay ready on SECRET (passcode set, no biometrics enrolled) — must not fail open", async () => {
  (LocalAuthentication.getEnrolledLevelAsync as jest.Mock).mockResolvedValue(
    LocalAuthentication.SecurityLevel.SECRET,
  );
  (LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock).mockResolvedValue([]);

  await expect(lockAvailability()).resolves.toEqual({ state: "ready", kind: "device" });
});

test("should fall back to device passcode copy when neither biometric type is reported", async () => {
  // Enrolled (a passcode is set) but no biometric type — Face ID/Touch ID off,
  // a passcode-only unlock is still the correct gate.
  (LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock).mockResolvedValue([]);

  await expect(lockAvailability()).resolves.toEqual({ state: "ready", kind: "device" });
});

test("should fail open (unavailable) rather than throw when the device answers with an error", async () => {
  (LocalAuthentication.getEnrolledLevelAsync as jest.Mock).mockRejectedValue(new Error("boom"));

  await expect(lockAvailability()).resolves.toEqual({ state: "unavailable" });
});

// ---------------------------------------------------------------------------
// unlock
// ---------------------------------------------------------------------------

test("should report success when authentication succeeds", async () => {
  (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({ success: true });

  await expect(unlock("Unlock Andy")).resolves.toEqual({ success: true });
  expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledWith({
    promptMessage: "Unlock Andy",
  });
});

test.each([
  ["user_cancel", true],
  ["system_cancel", true],
  ["app_cancel", true],
  ["user_fallback", true],
  ["authentication_failed", false],
  ["lockout", false],
  ["not_available", false],
])("should mark %s as cancelled=%s, not surface it as a wrong attempt", async (error, cancelled) => {
  (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
    success: false,
    error,
  });

  await expect(unlock("Unlock Andy")).resolves.toEqual({ success: false, cancelled });
});

test("should not leave a device fallback disabled — the OS passcode escape has to stay reachable", async () => {
  await unlock("Unlock Andy");

  const [options] = (LocalAuthentication.authenticateAsync as jest.Mock).mock.calls[0];
  expect(options.disableDeviceFallback).not.toBe(true);
});

test("should report failure rather than throw when the native call itself rejects", async () => {
  (LocalAuthentication.authenticateAsync as jest.Mock).mockRejectedValue(new Error("boom"));

  await expect(unlock("Unlock Andy")).resolves.toEqual({ success: false, cancelled: false });
});
