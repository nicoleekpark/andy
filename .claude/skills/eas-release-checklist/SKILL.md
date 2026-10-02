---
name: eas-release-checklist
description: Use before running any EAS build or submit command, or when the user says they want to submit to the App Store / TestFlight. Walks through the pre-submission checklist for this Expo + Convex app.
---

# EAS Release Checklist

Run through in order. Don't run `eas submit` until every box is actually checked — not assumed.

1. **Invoke the `app-store-reviewer` subagent** to check permission strings and privacy config. Do not proceed past this step with any ⚠️ open. A ❓ unverified is not a pass: check that item by hand against Apple's current guidelines and record what you found before going on.
2. **Convex production deploy** — `npm run deploy:backend` (`convex deploy`); confirm the prompt names `agile-dogfish-759`, and that the EAS `production` env's `EXPO_PUBLIC_CONVEX_URL` points at it, not at dev (`ENVIRONMENTS.md` §7).
3. **`app.json` / `eas.json`** — bundle identifier correct, build number incremented, version string bumped, icon and splash screen present at required resolutions.
4. **Secrets** — confirm `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `CLERK_SECRET_KEY` and any other server secrets live only in the Convex Production deployment's env vars, never in `app.json`, `eas.json`, `.env.local`, or anything `EXPO_PUBLIC_*` (`ENVIRONMENTS.md` §2, §4). Check names only.
5. **Build**: `npm run build:ios:testflight` (`eas build --profile production --platform ios`)
6. **Internal test pass**: install via TestFlight and, on a physical device, walk the V1 flow once end-to-end — voice capture → extraction → recall answered over its sources → calendar briefing notification — then run every row of `QA.md`. Simulator-only testing is not sufficient here: the microphone, calendar access, and local notifications do not behave the same in the simulator. Also do the three things `app-store-reviewer` can only read the code for: deny each permission and confirm the feature says so and offers a way forward; confirm the consent screen appears before the first note is sent to a third-party AI; delete the account from inside the app and confirm the data is gone (`npm run db`).

   The widget and the Siri Shortcut are cut from V1 (`PROJECT_SCOPE.md`, "The V1 scope cut"). When they are built, they join this walk-through.

7. **Submit**: `eas submit --platform ios`
8. **App Store Connect**: fill in App Privacy questionnaire to match what `app-store-reviewer` confirmed the app actually collects — don't under- or over-declare.

If any step surfaces a new permission or data-collection change, re-run the `app-store-reviewer` subagent before continuing.
