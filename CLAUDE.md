@AGENTS.md

## Project

"Andy" — Expo (React Native) + Convex app. Voice notes → Claude-extracted structured profiles → semantic recall search, Siri Shortcut, home widget. Full scope: `PROJECT_SCOPE.md`.

## Stack & Commands

- Run it: **`npm run dev`** — starts both halves together, `convex dev` pushing the backend and `expo start --dev-client` serving the JS. Start here; running only the JS half is how backend changes silently fail to reach the deployment. (`npm start` is the JS half alone, for when the backend is already running elsewhere. This app cannot run in Expo Go, so plain `expo start` is not an option.)
- Backend: Convex (`npx convex dev` locally, `npx convex deploy` to ship). `convex codegen` regenerates types but does **not** apply `auth.config.ts` or schema to the deployment.
- Test: `npm run test` — runs both runners: jest (`src/`, RN components) then vitest (`convex/**/*.test.ts`, convex-test). Convex functions cannot be tested under jest; see `convex/_generated/ai/guidelines.md`. Targeted runs: `npm run test:rn`, `npm run test:convex`.
- Lint/typecheck: `npm run lint` (must pass before any commit)
- Build: `npm run build:ios` (EAS cloud, ~8 min), then `npm run ios:install`. Local `npx expo run:ios` does **not** work here — Expo SDK 57 needs Swift 6.3, which needs Xcode 26.4+, which needs macOS Tahoe. See `README.md`'s Commands table.
- Submit: `eas submit --platform ios`, only after the `eas-release-checklist` skill and `app-store-reviewer`.

## Before Starting Work

Read the most recent `dev-reports/day-NN.dev.md` first. It carries what the previous day
learned that isn't in the code — assumptions that turned out wrong, approaches that were
tried and abandoned, what is verified versus merely assumed, and what has to be true before
certain work can start. `git log` and that day's `dev-reports/day-NN-commits.dev.md` record what changed; the report
records why, and what it cost to find out.

## Non-Negotiable Conventions

- **One feature per commit.** Smallest working, tested vertical slice. Never batch unrelated changes. Use the `small-commit-flow` skill for every feature request — don't hand-roll this workflow ad hoc.
- **Never call the Anthropic API from client code.** All Claude calls go through a Convex `action`, key lives only in the Convex dashboard env vars.
- **Never commit `.env`, API keys, or Convex deploy keys.**
- **Write or update a test before saying a feature is done.** No test = not done.
- **Convex schema changes are additive by default.** Don't drop/rename fields without a migration note in the commit message — this is real user data (voice-derived personal notes), treat it like it matters, because it does (PII).
- **Contacts, microphone, calendar, and photos permissions are opt-in per feature, not app-wide.** Request at the point of use, not on launch.
- **Never build toward SMS/Messages reading or Gmail inbox auto-read.** Both are out of scope for this submission (see `PROJECT_SCOPE.md` Reality Checks) — if a task seems to need either, stop and flag it rather than implementing a workaround.
- **Notes are indexed per-note, not per-profile.** Every note gets its own embedding, and who came up in it lives in the `noteMentions` table — one row per link, carrying the verbatim quote from that note. Don't collapse notes into a single profile-level blob, and don't move mentions back onto the note as an array: Convex cannot index inside an array, so "every note mentioning profile X" would become a scan, and the quote belongs to the link rather than to either end. Cross-profile mention search is a Must-have.
- **Two people may share a name, and one person may answer to several.** Names are not unique and the app must not make them so: refusing the second 치선 tells the user their friend does not exist. `notes.saveCapture` resolves a spoken name against `name` *and* `aliases`, refuses to guess when several people answer to it, and the capture screen asks first (`profiles.resolveNames`). Every place that turns a name into a person goes through `namesOf` in `convex/naming.ts` — a screen asking about a different set of names than the mutation acts on is how a note gets filed against somebody nobody offered.
- **Convex has no cascading delete, so every delete walks every reference by hand.** A note carries `noteMentions` rows; a profile carries notes, the links inside them, `metrics`, `calendarLinks`, and a `photoStorageId` that lives outside the tables entirely. Missing one does not fail loudly — it leaves a row that renders on a screen and opens nothing, or a stored file the user pays for forever. The shared rule for people Andy invented lives in `convex/cleanup.ts`; use it rather than restating it. And deleting somebody must not rewrite other people's notes: links pointing *at* them stay, carrying the name they were written with, and stop being tappable.
- **Renaming or dropping a schema field is five steps, not one.** Convex refuses a schema push while existing documents carry a field the schema no longer declares. Widen (both optional) → deploy → copy → switch every read and write → deploy → clear the old field → narrow the new one → deploy, then delete the temporary `internalMutation`s. Done twice now (`mentionedEntityIds` on day 2, `isStub`→`autoCreated` on day 3); the migration file itself will block the final push if it still references the removed field.
- **Cap scheduled local notifications.** iOS allows at most 64 pending per app — only schedule briefing/nudge pairs for the next ~20-25 upcoming matched calendar events, refreshed on foreground, not for every future event unconditionally.
- **Before any App Store submission work**, run the `eas-release-checklist` skill and invoke the `app-store-reviewer` subagent — do not submit without both.
- **The docs are bilingual pairs — edit both or neither.** `README.md` ↔ `README.ko.md`, `CLAUDE.md` ↔ `CLAUDE.ko.md`, `PROJECT_SCOPE.md` ↔ `PROJECT_SCOPE.ko.md`. Update the twin in the same change, not "later": these are loaded as instructions and read as the agreed scope, so a stale twin quietly becomes a second, wrong source of truth. Afterwards confirm they still line up — compare `grep -c '^## '`, any table's command column, and code-block counts (headings are translated, so compare structure, not text).

## Convex Function Conventions

- **After any change under `convex/`, push it before claiming it works.** `npm run lint` and `npm run test` both pass against code that was never deployed — tsc reads files and convex-test runs an in-memory database, so neither knows what the deployment is actually serving. The symptom is never a type error; it is the app calling a function that does not exist yet, or getting the previous shape back. Keep `npx convex dev` running in its own terminal so this is automatic; if it is not running, `npx convex dev --once` after every edit.
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
