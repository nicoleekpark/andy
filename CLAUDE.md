@AGENTS.md

## Project

"Andy" — Expo (React Native) + Convex app. Voice notes → Claude-extracted structured profiles → semantic recall search, Siri Shortcut, home widget. Full scope: `PROJECT_SCOPE.md`.

## Stack & Commands

- Frontend: Expo + TypeScript (`npx expo start`)
- Backend: Convex (`npx convex dev` locally, `npx convex deploy` to ship)
- Test: `npm run test` — runs both runners: jest (`src/`, RN components) then vitest (`convex/**/*.test.ts`, convex-test). Convex functions cannot be tested under jest; see `convex/_generated/ai/guidelines.md`. Targeted runs: `npm run test:rn`, `npm run test:convex`.
- Lint/typecheck: `npm run lint` (must pass before any commit)
- Build/submit: `eas build --platform ios`, `eas submit --platform ios`

## Non-Negotiable Conventions

- **One feature per commit.** Smallest working, tested vertical slice. Never batch unrelated changes. Use the `small-commit-flow` skill for every feature request — don't hand-roll this workflow ad hoc.
- **Never call the Anthropic API from client code.** All Claude calls go through a Convex `action`, key lives only in the Convex dashboard env vars.
- **Never commit `.env`, API keys, or Convex deploy keys.**
- **Write or update a test before saying a feature is done.** No test = not done.
- **Convex schema changes are additive by default.** Don't drop/rename fields without a migration note in the commit message — this is real user data (voice-derived personal notes), treat it like it matters, because it does (PII).
- **Contacts, microphone, calendar, and photos permissions are opt-in per feature, not app-wide.** Request at the point of use, not on launch.
- **Never build toward SMS/Messages reading or Gmail inbox auto-read.** Both are out of scope for this submission (see `PROJECT_SCOPE.md` Reality Checks) — if a task seems to need either, stop and flag it rather than implementing a workaround.
- **Notes are indexed per-note, not per-profile.** Every note gets its own embedding and an optional `mentionedEntityIds[]` array. Don't collapse notes into a single profile-level blob — that breaks cross-profile mention search, which is a Must-have.
- **Cap scheduled local notifications.** iOS allows at most 64 pending per app — only schedule briefing/nudge pairs for the next ~20-25 upcoming matched calendar events, refreshed on foreground, not for every future event unconditionally.
- **Before any App Store submission work**, run the `eas-release-checklist` skill and invoke the `app-store-reviewer` subagent — do not submit without both.

## Convex Function Conventions

- Validate all args with Convex's `v.*` validators (already the pattern in `schema.ts`) — not Zod, this isn't a REST API.
- User-facing errors: use `ConvexError` for anything the client should display, not an ad hoc `{ error: string }` shape — confirm the exact current pattern with `docs-verifier` if unsure, Convex's error handling has evolved across versions.
- Every function reading/writing `profiles`/`notes`/`metrics`/`calendarLinks` must check `ctx.auth.getUserIdentity()` and filter by the authenticated user's id — this is `security-reviewer`'s first blocking check, so get it right the first time rather than relying on the gate to catch it.
- No manual rate-limiting infrastructure for V1 — Convex's own function-call model doesn't need a REST-style API gateway rate limiter; revisit only if abuse becomes an actual problem post-launch.

## Data Model Note

Internally model the core entity generically (not hardcoded to "contact") — this same object type represents people, clients, and foster animals. Keep this flexible; it's a deliberate scope decision, not scope creep.

## Visual Design

Check `STYLE.md` before building any screen — color tokens, type roles, and the one signature element (the Briefing card) are already decided. Don't invent ad hoc colors/fonts per screen.

## Scope Discipline

`PROJECT_SCOPE.md`'s MoSCoW list is the agreed boundary of V1. If a request during a session would add anything beyond what's already in Must/Should Have — a new integration, a new channel, a new screen not in the User Flow — flag it and ask before implementing, don't silently build it. Good scope creep still costs the deadline.

## A Note on `.claude/rules/`

If a path-scoped rule file is ever added here later, use `globs:` in the frontmatter, not `paths:` — the latter is documented but has confirmed bugs (silently loads globally instead of scoping, or is ignored entirely, depending on version). Quote glob patterns (`"**/*.ts"`, not `**/*.ts"`). After adding one, run `/memory` to confirm it actually loaded only when expected before trusting it.

## When Stuck

If a workflow here starts getting hand-tweaked more than twice, that's a signal to revise the relevant skill file, not to keep patching it in conversation.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
