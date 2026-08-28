---
name: small-commit-flow
description: Use whenever asked to implement a feature, fix, or change in this repo. Enforces small vertical-slice commits with tests, instead of large multi-file batches. Trigger on requests like "implement X", "add Y", "다음 기능 만들어줘", "이거 고쳐줘".
---

# Small Commit Flow

This repo ships fast because every change is small, tested, and reversible. Follow this loop for every feature request, no exceptions:

1. **Scope the smallest vertical slice** that is independently useful and testable. If the request is bigger than one slice, say so explicitly and propose the slice breakdown before writing code — don't silently build all of it in one pass.
2. **If the slice uses an API/library you're not fully certain of the current syntax for** (Convex, Clerk, Expo/EAS, EventKit, WidgetKit, etc.), delegate to the `docs-verifier` subagent first. Don't guess on fast-moving APIs — this project has already been burned once by a stale assumption (expo-av, removed in SDK 55).
3. **Implement** just that slice.
4. **Delegate to the `test-writer` subagent** to write and run the minimal test(s) for it. Do not mark the slice done until this comes back passing.
5. **Delegate to the `security-reviewer` subagent** if the slice touches data access, auth, or an external API call. This is a blocking gate — do not proceed past a 🛑 block.
6. **Delegate to the `code-reviewer` subagent** for a constructive pass — DRY, scope adherence against `PROJECT_SCOPE.md`, consistency, obvious bugs. Act on anything flagged as "must fix before committing"; use judgment on the rest.
7. **Run lint/typecheck** (`npm run lint`) — must be clean.
8. **Do NOT commit — Nicole commits.** Never run `git commit` (or `git add` to pre-stage) in this repo. Stop here and hand the slice over instead. Leave the working tree untouched so they can read the raw diff themselves.
9. **Report back so they can review, then wait.** The report is the deliverable of this step, not a formality:
   - what changed, file by file, and **why** — including anything discovered mid-slice that wasn't in the plan
   - the commands they can run to verify it themselves (`npm run lint`, `npm run test`, …) with the results you actually got
   - what you deliberately deferred, and to which slice
   - **a QA list Nicole can run herself, before she commits.** Not a feature summary — the new behaviour as numbered steps with the expected result for each, including the negative cases (what should be refused, what should stay unchanged). Say where to look when the result isn't on screen: a check that passes by *nothing* changing is invisible without `npm run db`. Mark every row as either actually performed on a device or only covered by unit tests, because she needs to know which claims are already proven and which she is proving. This is the point of the handover: she tests it, then she commits.
   - a **suggested conventional-commits message** (`feat: ...`, `fix: ...`, `chore: ...`) that accurately describes exactly this slice
   - if unrelated changes are sitting in the working tree, say so and suggest one message per commit so they can split them

   Then stop. Don't start the next slice until they confirm the commit landed.

If a request would naturally touch more than ~3 files or two concerns (e.g. "add voice capture and also wire up the widget"), split it into separate slices and confirm the order with the user before proceeding — don't decide silently that it's "one feature."
