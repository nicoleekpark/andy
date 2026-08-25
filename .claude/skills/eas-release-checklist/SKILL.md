---
name: eas-release-checklist
description: Use before running any EAS build or submit command, or when the user says they want to submit to the App Store / TestFlight. Walks through the pre-submission checklist for this Expo + Convex app.
---

# EAS Release Checklist

Run through in order. Don't run `eas submit` until every box is actually checked — not assumed.

1. **Invoke the `app-store-reviewer` subagent** to check permission strings and privacy config. Do not proceed past this step with any ⚠️ open.
2. **Convex production deploy** — `npx convex deploy` to production (not just dev), confirm `EXPO_PUBLIC_CONVEX_URL` in the build points at the production deployment, not dev.
3. **`app.json` / `eas.json`** — bundle identifier correct, build number incremented, version string bumped, icon and splash screen present at required resolutions.
4. **Secrets** — confirm `ANTHROPIC_API_KEY` and any other server secrets live only in the Convex dashboard, never in `app.json`, `eas.json`, or committed `.env` files.
5. **Build**: `eas build --platform ios --profile production`
6. **Internal test pass**: install via TestFlight, actually walk through voice capture → extraction → search → Siri Shortcut → widget once end-to-end on a physical device before submitting. Simulator-only testing is not sufficient here (CallKit/Siri/widgets don't fully behave the same in simulator).
7. **Submit**: `eas submit --platform ios`
8. **App Store Connect**: fill in App Privacy questionnaire to match what `app-store-reviewer` confirmed the app actually collects — don't under- or over-declare.

If any step surfaces a new permission or data-collection change, re-run the `app-store-reviewer` subagent before continuing.
