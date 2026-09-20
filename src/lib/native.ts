import { requireOptionalNativeModule } from "expo-modules-core";

/**
 * Whether a native module is in the binary this JavaScript is running on.
 *
 * Its own file so it can be replaced in tests. `requireOptionalNativeModule`
 * is the API for asking without throwing, and under jest it answers `null` for
 * everything — there is no binary — so a test of any *available* path would
 * take the unavailable branch. Mocking `expo-modules-core` itself is not an
 * option either: jest-expo has already mocked it, and replacing that mock
 * breaks the native-module stubs every other suite depends on. A one-function
 * module of our own is the seam.
 *
 * This exists because catching the throw was not enough. It kept the app up,
 * which was the point, and Expo still reported `Cannot find native module` with
 * a full stack on every press — a handled failure presented as a crash, which
 * is how an afternoon goes into a bug that was working as designed.
 */
export function hasNativeModule(name: string): boolean {
  return requireOptionalNativeModule(name) !== null;
}
