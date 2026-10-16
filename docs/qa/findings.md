# Device QA findings

What testers find on a real device, and what happened to each finding. One
row per finding, kept for good: a finding is never deleted, only marked
resolved, so "was this ever reported?" always has an answer.

This file is the **ledger**. `QA.md` is the **manual test pass** (steps and
expected results). A finding usually ends with a new or corrected `QA.md` row,
and its fix PR names both.

## How to use it

**Adding a finding.**
1. Paste the tester's words, unchanged, under **Raw reports** for that build,
   dated.
2. Give each finding the next ID for that build (`B5-7`, `B5-8`, …) and add a
   row to the table. Use the names in `docs/design/component-names.md` for
   screens and parts.

**Fixing one.**
1. The PR that fixes it puts its number in **PR** and moves **Status** to 🔧.
2. When the PR merges, Status becomes ✅ merged.
3. **Device** stays ⬜ until someone checks it on a build that contains the PR.
   Then mark it ✅, with the build number. A finding is **done** only when both
   Status and Device are ✅.

**Status**
- ⬜ open
- ❓ needs a decision (the owner's; the question is in **Notes**)
- 🔧 PR open
- ✅ merged
- ⏸ deferred (with where it went)
- ✖ won't fix (with why)

**Type**
- bug: does the wrong thing
- copy: words on screen
- design: layout or look
- feature: new behaviour; the scope rule applies (`CLAUDE.md`, Scope Discipline)
- question

## Build 5 (TestFlight, 2026-10-14)

| ID | Where | Finding | Type | Cause (from the code) | Status | PR | Device | Notes |
|---|---|---|---|---|---|---|---|---|
| B5-1 | `record` | The phone locked while recording; the app closed and the recording was cut off. Andy should stay awake while something is live (audio etc.) | bug | Nothing keeps the screen on while recording, so iOS auto-locks and stops speech recognition | ⬜ | | ⬜ | Fix: keep awake while recording and while Andy is reading (no decision needed) |
| B5-2 | `home-bottom-bar` Ask row | "Ask Andy in your own words" is not clear enough. Change it to "Advanced search" | copy | `src/components/home-bottom-bar.tsx:120,128` | ❓ | | ⬜ | Only this row, or the whole `ask` screen too (its title "Ask Andy", the settings, the docs)? |
| B5-3 | `ask` | Once the keyboard is up, it doesn't go down unless you leave the screen and come back | bug | `src/app/(app)/search.tsx` | ⬜ | | ⬜ | |
| B5-4 | `ask` | "Type a name, or ask in your own words — like …" is hidden behind the keyboard once it is up | bug | `src/app/(app)/search.tsx:222` | ⬜ | | ⬜ | |
| B5-5 | `ask` | "Describe your memory" instead of "ask in your own words" | copy | `src/app/(app)/search.tsx:189,222` | ⬜ | | ⬜ | Goes with B5-2's decision |
| B5-6 | `ask` | A new person, Brian; his raw words included "…tomorrow night, friday we're gonna go get drinks with the team", which went into neither What to remember nor Tags. Searching "who did i plan to grab drinks with" found nothing. Brian should come up | feature | Search embeds only the facts when a note has any (`convex/embeddingModel.ts`, `embeddingTextFor`): a deliberate earlier choice, so a corrected fact would not be found by its old wording. Since #160 the words themselves can be corrected, so that reason is gone | ❓ | | ⬜ | Search the words too, not only the facts? Needs a re-index of every note |

### Raw reports

**2026-10-16 (owner)**

```text
UI
1. app needs to stay awake while one of the operation is going live (audio etc). the app closed and audio was interrupted while recording since the phone locked
2. Home page
    1. "Ask Andy in your own words" is not clear enough -> change it to "Advanced search"
3.  Ask Andy screen
    1. once the keyboard goes up, it doesnt go down unless the we exit the screen and come back
    2. Type a name, or ask in your own words - like..
        1. these are getting hidden behind the keyboards once it goes up
        2. "Describe your memory" instead of "ask in your own words"

FEATURES
1. Advanced search (Ask Andy)
    1. The user saved a new profile "Brian". Raw script includes "…or tomorrow night, friday we're gonna go get drinks with the team". This did not get saved as part of either "what to remember" or "tags". The user searched "who did i plan to grab drinks with". Nothing came up. Brian is supposed to show up.
```
