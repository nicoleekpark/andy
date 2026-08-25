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
npm run reset-project     # one-time: moves the default example routes to app-example/,
                           # leaves app/ blank to build on. Run this before Day 1 if not done already.
npm install
npx expo lint              # sets up ESLint if not already configured —
                           # small-commit-flow's lint step needs this working from Day 1
# Set up Jest per https://docs.expo.dev/develop/unit-testing/ if not already configured —
# test-writer needs a working test runner from Day 1, don't skip this
npx convex dev              # starts Convex dev deployment, generates convex/_generated
npx expo run:ios              # builds and launches a development build.
                           # NOT `npx expo start` + Expo Go — this project uses custom native
                           # modules (Calendar, LocalAuthentication, Widgets) that Expo Go's
                           # sandbox doesn't support. See PROJECT_SCOPE.md Reality Checks.
```

> **Note**: `create-expo-app` auto-generates its own `AGENTS.md`, `CLAUDE.md`, and `.claude/settings.json` pointing at the versioned Expo SDK docs and the official Expo Claude plugin. Merge this repo's `CLAUDE.md` into that one (append, don't overwrite) — see the merge note at the top of `CLAUDE.md`.

### Environment variables

Set in the Convex dashboard (server-side, never in the Expo app):

```
ANTHROPIC_API_KEY=...
```

Set in `.env.local` (client-safe only):

```
EXPO_PUBLIC_CONVEX_URL=...
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

## Scripts

```bash
npm run dev          # expo start
npm run test          # jest
npm run lint           # eslint + tsc --noEmit
npx convex deploy      # deploy backend functions
eas build --platform ios
eas submit --platform ios
```

## Commit Convention

One small, working, tested vertical slice per commit. Conventional commits (`feat:`, `fix:`, `chore:`). See `.claude/skills/small-commit-flow/SKILL.md` — this is the default workflow Claude Code should follow for every feature request in this repo.

## Before Submitting to the App Store

Run through `.claude/skills/eas-release-checklist/SKILL.md` and have the `app-store-reviewer` subagent check permission strings and privacy manifest before `eas submit`.

## Expo Resources

[Expo docs](https://docs.expo.dev/) · [Expo Router](https://docs.expo.dev/router/introduction) · [Unit testing guide](https://docs.expo.dev/develop/unit-testing/) · [ESLint/Prettier guide](https://docs.expo.dev/guides/using-eslint/)
