---
name: small-commit-flow
description: Use whenever asked to implement a feature, fix, or change in this repo. Enforces small vertical-slice commits with tests, instead of large multi-file batches. Trigger on requests like "implement X", "add Y", "다음 기능 만들어줘", "이거 고쳐줘".
---

# Small Commit Flow

ALWAYS ASK QUESTIONS WHEN NOT CLEAR.

This repo ships fast because every change is small, tested, and reversible. Follow this loop for every feature request, no exceptions:

1. **Scope the smallest vertical slice** that is independently useful and testable. If the request is bigger than one slice, say so explicitly and propose the slice breakdown before writing code — don't silently build all of it in one pass.
2. **Branch from `main` before touching any code** — `git checkout -b feat/<short-slice-name>` (or `fix/...`, `chore/...`). Per `CLAUDE.md`'s Branching Policy, nothing gets committed to `main` directly, no exceptions for size.
3. **Settle what you don't know before writing code.** Two different unknowns, two different subagents:

   - **An API/library you're not fully certain of the current syntax for** (Convex, Clerk, Expo/EAS, EventKit, WidgetKit, etc.) — delegate to the `docs-verifier` subagent first. Don't guess on fast-moving APIs — a stale assumption (expo-av, removed in SDK 55) caught late costs more than a quick check up front.
   - **A slice that adds or changes what a person sees or reads** — a new screen, a new flow, a permission request, a notification, an empty or error state, any new wording. Delegate to `product-strategist` for the brief, rules and copy, then to `product-designer` for the options, then back to `product-strategist` for the review. They work through one file, `docs/design/decisions/<slice-name>.md`, and they will disagree in writing rather than settle it between themselves. **Stop there and let the developer choose** — do not pick an option and build it. A slice that only applies a pattern already on three other screens does not need this; say which pattern you are following and move on.

4. **Implement** just that slice. For a designed slice, build what `## Final design` in the decision file says, with its copy, not a nearby interpretation of it.
5. **Write the tests — then break the code and prove they notice.** A passing test proves nothing on its own. Delete the guard you just added, re-run, and confirm _those_ tests go red and no others; then restore it. If the suite stays green, the test is watching something else and has to be rewritten before the slice is done.

   This is not a nicety. Every silent hole this project has found came out of this step, and each one had a green suite over it: the `autoCreated` guard could be deleted and everything passed, because the other tests were tripping on a different guard; case-folding could be deleted and everything passed, because the duplicate-name test used `민호` and Korean has no case; a deleted person's name could be made tappable again and everything passed, because the tests checked it was _visible_, not that it was _inert_. Writing more tests would not have found any of them.

   It also works on other people's suggestions. A review's proposed fix can be applied and run against the review's own repro — that is how a correct diagnosis with a backwards remedy gets caught.

   The `test-writer` subagent does this step, guard removal included, and reports the result for each test; delegating keeps the test output out of this conversation. Read its report for two things it cannot do for you: the rows it says belong in `QA.md`, and anything it marks "needs proof against the deployment." If a test is red and the reason is not obvious within a minute, hand it to `debugger` rather than patching at it here.

6. **Run the review gates the changed files call for.** Decided by `git diff --name-only main...HEAD`, not by judgement about what the change "really" touches — that judgement is the thing that failed:

   | A file changed under                              | Gate                        |                                                    |
   | ------------------------------------------------- | --------------------------- | -------------------------------------------------- |
   | `convex/`                                         | **`security-reviewer`**     | blocking — do not proceed past a 🛑                |
   | `convex/`, `src/`, `__tests__/`                   | **`code-reviewer`**         | act on "must fix"; judgement on the rest           |
   | `convex/`, `src/`                                 | **`silent-failure-hunter`** | act on "must fix"; judgement on the rest           |
   | `src/` — a screen, component, or style (`*.tsx`)  | **`design-system-auditor`** | act on "must fix"; judgement on the rest           |
   | `app.json`, or any permission string              | **`app-store-reviewer`**    | blocking — a ❓ unverified blocks the same as a ⚠️ |
   | only `*.md`, `*.yml`, `package*.json`, `.github/` | none                        |                                                    |

   Three or four at once is normal — they are independent, so launch them together rather than in series; that is most of the reason to skip them gone.

   A `convex/` change you are certain is harmless still gets `security-reviewer`. Being certain is free and has been wrong: a resolution path that "carries no id, so there is nothing to check" was correct about that and wrong about the thing next to it.

   A fix made because a gate asked for it is a change like any other: re-run the gate that raised it, and if the fix touched a guard, re-run step 5 on it.

7. **Run lint/typecheck** (`npm run lint`) — must be clean. Never behind a pipe: `npm run lint | tail -3` reports `tail`'s exit code, which is how a commit once landed carrying two type errors.
8. **Commit on the branch, push it, and open a PR** (`gh pr create`) — never merge it. The PR description is the handover report below, not a placeholder.
9. **Report back so they can review, then wait.** The report — which doubles as the PR description — is the deliverable of this step, not a formality:
   - what changed, file by file, and **why** — including anything discovered mid-slice that wasn't in the plan
   - the commands they can run to verify it themselves (`npm run lint`, `npm run test`, …) with the results you actually got
   - **which gates ran and what each one said**, one line apiece, including every "worth noting, your call" you chose not to act on and why. A gate that ran and was overruled in silence is the same as a gate that did not run.
   - what you deliberately deferred, and to which slice
   - **a QA list and expected behavior the developer can run themselves, before merging.** Not a feature summary — the new behaviour as numbered steps with the expected result for each, including the negative cases (what should be refused, what should stay unchanged). Say where to look when the result isn't on screen, a check that passes by _nothing_ changing is invisible without `npm run db`. Mark every row as either actually performed on a device or only covered by unit tests, because they need to know which claims are already proven and which they are proving. **If the slice added behaviour a unit test cannot reach, add the row to `QA.md` in this same PR** — a QA list that lives only in a PR description is gone the moment the PR is merged, which is how the same questions get asked again three days later.
   - the **PR link**, once opened
   - if unrelated changes are sitting in the working tree, say so and suggest splitting them into a separate branch/PR

   Then stop. **Never merge the PR** — not even if asked to "just merge it" in a later message; treat that as needing explicit confirmation in that exact moment, not as standing permission carried forward. Don't start the next slice's branch until this one's PR is merged or the developer says to proceed anyway.

If a request would naturally touch more than ~3 files or two concerns (e.g. "add voice capture and also wire up the widget"), split it into separate slices — separate branches, separate PRs — and confirm the order with the user before proceeding, don't decide silently that it's "one feature."
