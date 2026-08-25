---
name: expo-native-extension-setup
description: Use when adding any iOS native extension target — home screen widgets (Day 8) or the Share Extension (V1.1). Both share the same App Group + config plugin + prebuild pattern, so this skill encodes it once instead of re-deriving it each time.
---

# Expo Native Extension Setup

Native extension targets (widgets, share extensions, watch companion apps) are the least "just works" part of this stack — budget real time and expect to actually test on a physical device, not just the simulator.

1. **Confirm this actually needs a new native target.** Widgets and Share Extensions do. A simple deep link from a notification does not — don't reach for this skill unless a genuinely separate extension process is required.
2. **App Group first.** Both the main app and the extension need to share data (e.g. a quick-record trigger, or shared auth/session state) via an App Group entitlement — set this up before writing any extension UI, since everything else depends on it being correct.
3. **Config plugin, not manual Xcode edits.** Use the project's existing native-target config plugin approach (Apple Targets–style) so the extension target is generated during `prebuild`, not hand-maintained in Xcode — keeps it reproducible for CI/EAS builds.
4. **No hot reload for the native side.** Changes to the extension's native code require `npx expo prebuild -p ios --clean` and a fresh Xcode build each time — don't expect Metro fast refresh here. Budget for slower iteration loops than the React Native side.
5. **Test on a physical device before considering it done.** Widget/extension behavior (refresh timing, App Group access, interactive buttons) doesn't always match simulator behavior.
6. **Reuse, don't re-derive.** If this is the second time through this skill (widget → Share Extension), diff against what worked the first time before troubleshooting from scratch — the App Group and config plugin setup should look nearly identical.
