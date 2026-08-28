# Andy

Voice-note a person → LLM structures it into a searchable profile → recall it later via natural language, a Siri Shortcut, or a home-screen widget.

See [`PROJECT_SCOPE.md`](./PROJECT_SCOPE.md) for the full feature scope, architecture, and 7-day build plan. See [`CLAUDE.md`](./CLAUDE.md) for how Claude Code should work in this repo.

## Stack

- Expo (React Native) + TypeScript
- Convex (database, backend functions, realtime, vector search, file storage)
- Clerk (auth — Apple Sign-In for V1)
- Claude API (extraction + RAG chatbot, called server-side only from Convex actions)
- expo-contacts, expo-audio (recording), expo-speech-recognition (transcription), expo-speech (TTS for Siri responses), expo-local-authentication (passcode/biometric app lock)

## Tech Stack Decisions (why, and what else we considered)

**Frontend — Expo (React Native), not Flutter or native Swift/Kotlin.**
Fastest path to a real cross-platform app for a solo dev, plus the largest AI-codegen ecosystem of the three — matters when Claude Code is doing most of the typing. Flutter and native were considered and rejected for this specific constraint (1 solo dev, tight timeline); native would give the best platform depth but at ~2x the build cost for two codebases.

**Backend — Convex, not Supabase or Firebase.**
All three can do realtime + vector search + serverless functions. The deciding factors for _this_ project:

- Convex unifies schema, backend functions, and client types in one TypeScript codebase — smallest surface area for an AI coding agent to make mistakes in, and the fastest to build in for a solo dev on a hard deadline.
- Native reactive queries (realtime is automatic, not manually wired) and native vector search at the scale this app needs.
- Considered and rejected: **Supabase** — more portable (plain Postgres, huge SQL talent pool, true relational joins) but requires hand-configuring realtime subscriptions and Postgres RLS policies, which is where solo/fast-moving devs most commonly introduce real security bugs. **Firebase** — best-in-class offline sync and most mature ecosystem, but NoSQL denormalization overhead for our profile→notes→mentions relations, a separate Cloud Functions deploy pipeline, and no self-hosting (highest lock-in of the three).

**Auth — Clerk, not Convex Auth or Auth0.**
Convex's own docs describe Convex Auth as beta and recommend Clerk or Auth0 for production. Clerk has an official Convex integration, ships pre-built Apple/Google sign-in UI (no screens to hand-build), and is the more battle-tested choice for a 10–12 day solo build. **V1 ships with Apple Sign-In only** — Apple's guideline 4.8 requires offering Sign in with Apple as soon as any other social login is offered, so adding Google now would obligate Apple Sign-In anyway with no benefit to an iOS-only V1. Google Sign-In is deferred to V1.1, alongside the Android build where it actually matters.

## Setup

```bash
# Already done: the create-expo-app demo scaffold was moved aside to example/ (kept for
# reference, not built or type-checked), and the one-time reset-project script was removed.
npm install
npx convex dev             # starts the Convex dev deployment and generates convex/_generated.
                           # Leave it running while you work on backend code.
```

Then get a build onto the simulator — see **Commands** below. Note that
`npx expo run:ios` (a local native build) does **not** work on macOS Sequoia; builds go
through EAS instead. The reason is in the Commands section.
```bash
```

> **Note**: `create-expo-app` auto-generates its own `AGENTS.md`, `CLAUDE.md`, and `.claude/settings.json` pointing at the versioned Expo SDK docs and the official Expo Claude plugin. Merge this repo's `CLAUDE.md` into that one (append, don't overwrite) — see the merge note at the top of `CLAUDE.md`.

### Environment variables

Set in the Convex dashboard (server-side, never in the Expo app):

```
ANTHROPIC_API_KEY=...
```

Set in `.env.local` (client-safe only — Metro inlines these into the app bundle, so
never put a secret here):

```
EXPO_PUBLIC_CONVEX_URL=...
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=...
```

`.env.local` is gitignored and stays on your machine, so **EAS cloud builds don't see it**.
The same two variables must also be registered on EAS, or the built app throws on launch:

```bash
eas env:create --scope project --environment development \
  --name EXPO_PUBLIC_CONVEX_URL --visibility plaintext \
  --value "$(grep '^EXPO_PUBLIC_CONVEX_URL=' .env.local | cut -d= -f2-)"
```

## Folder Structure

```
src/
  app/              # Expo Router screens
  components/
  hooks/
  constants/
convex/             # schema.ts, functions (queries/mutations/actions), vector index config
.claude/
  agents/           # subagents (test-writer, app-store-reviewer, docs-verifier, code-reviewer, security-reviewer)
  skills/           # small-commit-flow, eas-release-checklist, expo-native-extension-setup
.mcp.json           # MCP servers for Claude Code (GitHub, etc.)
```

## Commands

### Day to day

Most work needs only these. JS and TypeScript changes reach the simulator instantly — no
rebuild.

| Command | When | Why |
| --- | --- | --- |
| `npm run dev` | **Every working session — start here** | Runs both halves at once: `convex dev` pushing anything under `convex/` to the deployment, and `expo start --dev-client` serving the JS bundle to the installed build. They are separate processes because the app is in two places — screens on your Mac, backend in Convex's cloud — and neither knows about the other. One command because running only the second is a real and repeated mistake: `npm run lint` and `npm run test` both pass against backend code that was never deployed, so the app calls a function that doesn't exist yet and the error looks like a screen bug. `-k` kills both together, so there is no half-running state. |
| `npm start` | Only the JS half | The Expo server on its own, for when the backend is already running elsewhere or isn't being touched. `--dev-client` (not plain `expo start`) because this app can't run in Expo Go. |
| `npm run test` | Before calling a slice done | Runs both runners: jest for `src/`, then vitest for `convex/`. Convex functions can't be tested under jest, so a single runner would silently skip half the suite. |
| `npm run lint` | Before every commit | `expo lint convex src`, then `tsc --noEmit` twice — once at the root, once with `convex/tsconfig.json`. Convex code runs on V8, not Node, and only the second pass catches Node-only globals leaking in. |
| `npm run test:rn` / `npm run test:convex` | Narrowing a failure | One runner at a time. |
| `npm run test:watch` / `npm run test:watch:convex` | While writing a test | Re-runs on save, one runner each — two watchers cannot share a terminal. Neither touches the simulator: jest renders screens into a fake React Native, and convex-test runs backend functions against an in-memory database, so a bug that only appears in the real app (a crash on sign-out, a function that was never deployed) is invisible to both. That is what the day report's QA list is for. |

### Getting a build onto the simulator

Only needed when **native** config changes: a new native module, an `app.json` plugin, a
permission string, the bundle id. Never for JS changes.

| Command | When | Why |
| --- | --- | --- |
| `npm run build:ios` | After a native config change | ~8 min, builds in Expo's cloud. **`npx expo run:ios` cannot be used**: Expo SDK 57's `expo-modules-jsi` uses `weak let` (Swift 6.3), Xcode 26.4 is the first release with Swift 6.3, and every Xcode from 26.4 on requires macOS Tahoe 26.2+. This machine runs Sequoia. EAS builds on `macos-tahoe-26.5-xcode-26.6`, so the local toolchain stops mattering. |
| `npm run ios:install` | After a build finishes | Downloads, installs and launches it. Add `-- --simulator "iPhone 17 Pro"` to skip the device-picker prompt. |
| `npm run build:ios:device` | Testing on a real iPhone | Produces a signed `.ipa`; needs a paid Apple Developer account. The `development` profile is simulator-only and needs no account at all. |

> `npm run ios` / `npm run android` are Expo's own local native builds. `npm run ios` does not work on this machine — see the build row above — and there is no Android build in V1. Use `npm run build:ios`.

### Convex

| Command | When | Why |
| --- | --- | --- |
| `npx convex dev` | While working on backend code | Watches `convex/`, pushes, and regenerates `convex/_generated`. |
| `npm run db` | Checking what actually got written | Opens the deployment dashboard. Its Data tab updates live as rows are written, which is the only way to see the checks that pass by *nothing* changing — saving a second note about someone must add a `notes` row and leave `profiles` alone. Its Logs tab carries the server-side reason behind a failed save. |
| `npx convex codegen` | After editing `schema.ts` without `convex dev` running | Regenerates the generated types. It does contact the deployment, so it is not purely local. |
| `npx convex env set NAME value` | Adding a server-side secret | Deployment env vars — this is the only place `ANTHROPIC_API_KEY` may live. |
| `npx convex env get NAME` | Checking one variable | Use this, **not `npx convex env list`** — the list form prints every value in full, including API keys. |

### Poking at the running app

| Command | When | Why |
| --- | --- | --- |
| `xcrun simctl openurl booted "andy:///search"` | Reaching a screen with no link to it yet | **Three slashes.** `andy://search` treats `search` as the URL host, so nested paths like `andy://profile/abc` silently land on the home screen instead of erroring. |
| `xcrun simctl io booted screenshot out.png` | Recording what a screen actually looks like | Faster than describing it. |

### Release

| Command | When | Why |
| --- | --- | --- |
| `npx convex deploy` | Shipping backend changes to production | Separate from the app build; the two deploy independently. |
| `eas build --profile production --platform ios` | Release build | Run the `eas-release-checklist` skill and the `app-store-reviewer` subagent first. |
| `eas submit --platform ios` | Uploading to App Store Connect | Never without the two checks above. |

## Commit Convention

One small, working, tested vertical slice per commit. Conventional commits (`feat:`, `fix:`, `chore:`). See `.claude/skills/small-commit-flow/SKILL.md` — this is the default workflow Claude Code should follow for every feature request in this repo.

## Before Submitting to the App Store

Run through `.claude/skills/eas-release-checklist/SKILL.md` and have the `app-store-reviewer` subagent check permission strings and privacy manifest before `eas submit`.

## Expo Resources

[Expo docs](https://docs.expo.dev/) · [Expo Router](https://docs.expo.dev/router/introduction) · [Unit testing guide](https://docs.expo.dev/develop/unit-testing/) · [ESLint/Prettier guide](https://docs.expo.dev/guides/using-eslint/)
