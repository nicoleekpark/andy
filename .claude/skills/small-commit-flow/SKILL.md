---
name: small-commit-flow
description: Use whenever asked to implement a feature, fix, or change in this repo. Enforces small vertical-slice commits with tests, instead of large multi-file batches. Trigger on requests like "implement X", "add Y", "다음 기능 만들어줘", "이거 고쳐줘".
---

# Small Commit Flow

This repo ships fast because every change is small, tested, and reversible. Follow this loop for every feature request, no exceptions:

1. **Scope the smallest vertical slice** that is independently useful and testable. If the request is bigger than one slice, say so explicitly and propose the slice breakdown before writing code — don't silently build all of it in one pass.
2. **Branch from `main` before touching any code** — `git checkout -b feat/<short-slice-name>` (or `fix/...`, `chore/...`). Per `CLAUDE.md`'s Branching Policy, nothing gets committed to `main` directly, no exceptions for size.
3. **If the slice uses an API/library you're not fully certain of the current syntax for** (Convex, Clerk, Expo/EAS, EventKit, WidgetKit, etc.), delegate to the `docs-verifier` subagent first. Don't guess on fast-moving APIs — a stale assumption (expo-av, removed in SDK 55) caught late costs more than a quick check up front.
4. **Implement** just that slice.
5. **Write the tests — then break the code and prove they notice.** A passing test proves nothing on its own. Delete the guard you just added, re-run, and confirm *those* tests go red and no others; then restore it. If the suite stays green, the test is watching something else and has to be rewritten before the slice is done.

   This is not a nicety. Every silent hole this project has found came out of this step, and each one had a green suite over it: the `autoCreated` guard could be deleted and everything passed, because the other tests were tripping on a different guard; case-folding could be deleted and everything passed, because the duplicate-name test used `민호` and Korean has no case; a deleted person's name could be made tappable again and everything passed, because the tests checked it was *visible*, not that it was *inert*. Writing more tests would not have found any of them.

   It also works on other people's suggestions. A review's proposed fix can be applied and run against the review's own repro — that is how a correct diagnosis with a backwards remedy gets caught.

6. **Run the review gates the changed files call for.** Decided by `git diff --name-only main...HEAD`, not by judgement about what the change "really" touches — that judgement is the thing that failed:

   | A file changed under | Gate | |
   | --- | --- | --- |
   | `convex/` | **`security-reviewer`** | blocking — do not proceed past a 🛑 |
   | `src/`, `__tests__/` | **`code-reviewer`** | act on "must fix"; judgement on the rest |
   | `app.json`, or any permission string | **`app-store-reviewer`** | blocking |
   | only `*.md`, `*.yml`, `package*.json`, `.github/` | none | |

   Two or three at once is normal — they are independent, so launch them together rather than in series; that is most of the reason to skip them gone.

   A `convex/` change you are certain is harmless still gets `security-reviewer`. Being certain is free and has been wrong: a resolution path that "carries no id, so there is nothing to check" was correct about that and wrong about the thing next to it.

7. **Run lint/typecheck** (`npm run lint`) — must be clean. Never behind a pipe: `npm run lint | tail -3` reports `tail`'s exit code, which is how a commit once landed carrying two type errors.
8. **Commit on the branch, push it, and open a PR** (`gh pr create`) — never merge it. The PR description is the handover report below, not a placeholder.
9. **Report back so they can review, then wait.** The report — which doubles as the PR description — is the deliverable of this step, not a formality:
   - what changed, file by file, and **why** — including anything discovered mid-slice that wasn't in the plan
   - the commands they can run to verify it themselves (`npm run lint`, `npm run test`, …) with the results you actually got
   - what you deliberately deferred, and to which slice
   - **a QA list and expected behavior the developer can run themselves, before merging.** Not a feature summary — the new behaviour as numbered steps with the expected result for each, including the negative cases (what should be refused, what should stay unchanged). Say where to look when the result isn't on screen, a check that passes by *nothing* changing is invisible without `npm run db`. Mark every row as either actually performed on a device or only covered by unit tests, because they need to know which claims are already proven and which they are proving. **If the slice added behaviour a unit test cannot reach, add the row to `QA.md` in this same PR** — a QA list that lives only in a PR description is gone the moment the PR is merged, which is how the same questions get asked again three days later.
   - the **PR link**, once opened
   - if unrelated changes are sitting in the working tree, say so and suggest splitting them into a separate branch/PR

    Then stop. **Never merge the PR** — not even if asked to "just merge it" in a later message; treat that as needing explicit confirmation in that exact moment, not as standing permission carried forward. Don't start the next slice's branch until this one's PR is merged or the developer says to proceed anyway.

If a request would naturally touch more than ~3 files or two concerns (e.g. "add voice capture and also wire up the widget"), split it into separate slices — separate branches, separate PRs — and confirm the order with the user before proceeding, don't decide silently that it's "one feature."
