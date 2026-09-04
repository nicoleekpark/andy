# INFRA.md — Platform Safety Nets

These 7 items came from comparing this project's agent/skill setup against real industry practice. `CLAUDE.md` and the skills encode discipline Claude Code is expected to follow — these make some of that discipline **impossible to bypass**, whether the bypass is Claude Code forgetting a step or a human pushing straight to `main` by habit. Set up once per repo (most are files that travel with the repo; branch protection is a GitHub setting and does not).

## 1. CI — `.github/workflows/ci.yml`

Already created. Runs `npm run lint` and `npm run test` on every push to `main` and every PR. This is the platform-enforced version of what `small-commit-flow` already does locally — it exists so a step skipped locally (or a push that bypassed the skill entirely) still gets caught before merge.

## 2. Branch protection — a GitHub _setting_, not a file

`CLAUDE.md`'s Branching Policy ("never commit directly to `main`") is currently just an instruction Claude Code is trusted to follow. This step makes GitHub itself refuse a direct push.

**Via the web UI** (safest first time): repo → Settings → Branches → Add branch ruleset → target `main` → enable:

- Require a pull request before merging
- Require status checks to pass before merging → select the `lint-and-test` job from CI
- Do not allow bypassing the above settings (include yourself, if the option exists — otherwise it's easy to forget and push directly out of habit)

**Via `gh` CLI**, once you know the repo has CI passing at least once already (so the check name exists to reference):

```bash
gh api repos/{owner}/{repo}/rulesets --method POST -f name="main-protection" -f target="branch" \
  -f "enforcement=active" -f "conditions[ref_name][include][]=~DEFAULT_BRANCH" \
  -f "rules[][type]=pull_request" -f "rules[][type]=required_status_checks"
```

The exact payload shape for rulesets has changed across GitHub API versions — have `docs-verifier` confirm the current field names before running this rather than trusting the snippet above verbatim.

## 3. Sentry (crash/error monitoring) — ⏸ Deferred, not set up yet

Skipped for now by choice, not forgotten. Keeping the research here so it doesn't need re-doing later — do this whenever it's actually time.

Official current package is **`@sentry/react-native`** — the older `sentry-expo` package is deprecated, don't install it if a search result or old tutorial suggests it.

1. Create a free account/project at sentry.io (free tier: 5,000 errors/month — plenty for pre-launch).
2. `npx expo install @sentry/react-native`
3. Add the config plugin to `app.json`:
   ```json
   {
     "expo": {
       "plugins": [
         [
           "@sentry/react-native/expo",
           {
             "url": "https://sentry.io/",
             "project": "___PROJECT_SLUG___",
             "organization": "___ORG_SLUG___"
           }
         ]
       ]
     }
   }
   ```
4. `Sentry.init({ dsn: "___DSN___" })` once, at the app's entry point.
5. **`SENTRY_AUTH_TOKEN`** (used for source-map upload during EAS builds) is a secret — set it as an EAS secret (`eas secret:create`) and, if used in CI too, a GitHub Actions secret. Never in `app.json` directly. `security-reviewer`'s existing hardcoded-secrets check already covers this pattern; no change needed there beyond knowing this token exists.
6. `app-store-reviewer`: Sentry collects device/crash data — make sure the App Privacy questionnaire declares this (crash data, diagnostics) alongside whatever the app already collects.
7. There's an official Sentry-maintained Claude Code skill for this exact setup (`npx skills add https://github.com/getsentry/sentry-agent-skills --skill sentry-react-native-sdk`) — if installed, `docs-verifier` should prefer it over general web search for anything Sentry-specific, same reasoning as the Expo/Convex official-skill preference already in place.

## 4. Dependabot

Already created at `.github/dependabot.yml`. Free, built into GitHub, opens a PR automatically when a dependency has a known vulnerability or a new version. These PRs still go through the normal Branching Policy (review before merge) — don't auto-merge Dependabot PRs just because they're automated.

## 5. PR preview builds — ⏸ Deferred, workflow removed

`.github/workflows/preview.yml` existed and was deleted on 2026-09-04 after it
failed on its first run. Keeping the research so it doesn't need re-doing.

It ran `eas update --auto`, which publishes a JS bundle over the air. The
failure was `An Expo user account is required` — no `EXPO_TOKEN` secret — but
adding the token would not have fixed it, because **this app has no way to
receive an OTA update**: `expo-updates` is not installed, and `app.json` has
no `updates` block and no `runtimeVersion`. The workflow was publishing to an
address where nobody lives. (Whether `eas update` would also have failed for
the missing `runtimeVersion` was not tested — it does not change the outcome.)

Reviving it is not one package install. `expo-updates` is a native module, so
it needs a fresh `eas build` before it does anything at all, plus a
`runtimeVersion` policy (which builds a given update is compatible with),
channel configuration so preview and production updates don't mix, and a read
of Apple's rules on what an OTA update is allowed to change — an update that
alters the app's purpose is a guideline violation, not just a bad idea.

**Trigger:** wanting a real on-device preview per PR badly enough to pay for
the above. Until then, verification is `npm run build:ios` + `npm run
ios:install`, which is a real build of the real app.

- **Native changes** (a new native module, a new Expo config plugin, anything touching `app.json`'s native config — e.g. the Share Extension itself): OTA update does **not** cover this. These need an actual `eas build` and a physical/simulator install to verify, same as this project's existing "simulator isn't sufficient for CallKit/Siri/widgets" rule in `eas-release-checklist`. Don't trust a green PR-preview-OTA check as proof a native-touching PR works — which is the second reason the OTA workflow was not worth keeping green: it could never have covered the changes most likely to break.

## 6. Feature flags / remote kill switch — ⏸ Deferred, not built yet

There is no `featureFlags` table in `convex/schema.ts` today. This is the decision recorded, not a facility that exists — build it when something actually needs to be switched off remotely.

No new third-party service needed — this project already has Convex. A `featureFlags` table (`{ key: string, enabled: boolean, note: string }`) queried once at app launch gives a real remote kill switch: flip a row in the Convex dashboard, the running app picks it up on next launch (or live, if queried reactively) without an App Store resubmission. Cheaper and simpler than LaunchDarkly/Statsig for a solo project at this stage; revisit a dedicated service only if flag logic gets genuinely complex (percentage rollouts, user targeting).

## 7. CHANGELOG

`CHANGELOG.md` (created, Keep a Changelog format). Since commits already follow conventional-commits style (`feat:`, `fix:`, `chore:` — established in `small-commit-flow`), updating the changelog is a fast manual pass, not a new discipline: skim merged PR titles since the last entry, group them under Added/Fixed/Changed. Added as a step in `eas-release-checklist` so it doesn't get forgotten right before a submission.
