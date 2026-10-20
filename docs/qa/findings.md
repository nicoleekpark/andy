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
| B5-1 | `record` | The phone locked while recording; the app closed and the recording was cut off. Andy should stay awake while something is live (audio etc.) | bug | Nothing keeps the screen on while recording, so iOS auto-locks and stops speech recognition | 🔧 | #183 | ⬜ | Screen stays on while recording and while Andy reads; released right after. QA 33.14 |
| B5-2 | `home-bottom-bar` Ask row | "Ask Andy in your own words" is not clear enough. Change it to "Advanced search" | copy | `src/components/home-bottom-bar.tsx:120,128` | 🔧 | #189 | ⬜ | Owner, 2026-10-19: (b) the whole feature is renamed **Advanced search**: Home line, screen title, in-app wording, store copy, docs |
| B5-3 | `ask` | Once the keyboard is up, it doesn't go down unless you leave the screen and come back | bug | `src/app/(app)/search.tsx` | 🔧 | #186 | ⬜ | A drag or a tap off a control puts it away; Ask puts it away. QA 14.12 |
| B5-4 | `ask` | "Type a name, or ask in your own words — like …" is hidden behind the keyboard once it is up | bug | `src/app/(app)/search.tsx:222` | 🔧 | #186 | ⬜ | The hint sits just under the field. QA 14.11 |
| B5-5 | `ask` | "Describe your memory" instead of "ask in your own words" | copy | `src/app/(app)/search.tsx:189,222` | 🔧 | #189 | ⬜ | Goes with B5-2 (b) |
| B5-6 | `ask` | A new person, Brian; his raw words included "…tomorrow night, friday we're gonna go get drinks with the team", which went into neither What to remember nor Tags. Searching "who did i plan to grab drinks with" found nothing. Brian should come up | feature | Search embeds only the facts when a note has any (`convex/embeddingModel.ts`, `embeddingTextFor`): a deliberate earlier choice, so a corrected fact would not be found by its old wording. Since #160 the words themselves can be corrected, so that reason is gone | 🔧 | #188 | ⬜ | Owner, 2026-10-19: search the words too. Facts + words are embedded and sent to the answer, facts first and winning where they disagree. **One-time re-index** of every note after deploy (`embeddings:reindexAll`). QA 14.13, 14.14 Dev re-index run 2026-10-19: 0 notes, because the dev account has not said yes (switch on in dev), as designed; Allow re-indexes it. Production: run after #188 is deployed |
| B5-7 | `write`, back → `write-discard-alert` | With words written, back (‹) left to home first and only then asked "Discard this note?" over home. Discard and Cancel did the same: Cancel did not return to the note and nothing was kept | bug | The question used a plain `beforeRemove` listener. The native iOS stack pops on the header back button and the swipe *before* JavaScript hears about it, so `preventDefault` had nothing left to stop. jest's JavaScript stack waits, so the suite was green over it (`write-screen.test.tsx`). Intent all along: **Cancel stays on the note, every word kept** | 🔧 | #187 | ⬜ | `usePreventRemove` tells the native stack (`preventNativeDismiss`), so back and the swipe wait for the answer. QA 8.9 |
| B5-8 | `record` → `review` → `profile` | Recorded about Barbara (already kept) with her last name for the first time; Andy read "Barbara Apple", filed the note on the existing Barbara, but her last name was not added. To discuss: how to handle first name, last name, nickname, full name | design | A person has one `name` plus `aliases` (`convex/naming.ts` `namesOf`). A fuller name matched by overlap files the note on the existing person, but nothing offers to update the name they are kept under | 🔧 | | ⬜ | Owner, 2026-10-19: option A. When a kept person is matched by a fuller name ("Barbara" → "Barbara Apple"), review asks whether to update their name; yes renames them and keeps the old name as an alias **Refined 2026-10-19:** the first name of a full name is *derived* in `namesOf` (never stored, so it follows renames and cannot be deleted as a duplicate); first name only, never the surname. Part 1 = derived first name (notes, calendar, suggestions, edit-screen line); part 2 = the review checkbox to update the name. |
| B5-9 | `profile-edit`, Also known as and Tags | Emptying an alias or a tag leaves its line; there is no way to remove a line completely. Suggestion: ⊖/⊕ at each line, like Apple Contacts (screenshot referred to, not received) | bug | The empty line was only dropped on Save ("Clearing one removes it"), so while editing it stayed and looked unremovable | 🔧 | #190 | ⬜ | Owner, 2026-10-19: picked C, then changed to **option A**: ⊖ then Delete in front of every alias and tag line, ⊕ to add (Apple Contacts). Mockup: claude.ai artifact *Removing a Line* |

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

**2026-10-19 (owner)**

```text
새로운 노트를 적다가 뒤로가기 <를 누르면 home 화면으로 나가지고 그 위에  discard this note? what you wrote will be cleared가 떠. discard누름-> 지워지는거니까 제대로 됨. Cancel 누르면 어떤 일이 일어나도록 현재 코딩되어있는지, 우리의 의도는 원래 무엇이었는지 알려줘. 현재는 cancel, discard 둘다 똑같이 작동해(cancel눌러도 다시 쓰던 페이지로 돌아가거나 draft가 저장되거나 하는게 없음)
```

**2026-10-19 (owner), second batch**

```text
Action: Home->+->record->I mentioned Barbara's ("Barbara" exists in the list) last name for the first time ->read it to Andy->Andy picked up "Barbara Apple" as name->saved the note to the existing  Barbara's profile->Barbara's last name was not updated
Suggestion/things to discuss: what's the best way to manage people's name/first name/lastname/nickname/fullname etc

Action: GO into someone's profile->Click to type "Also known as"
What happened: even when i delete the content, the line does not go away.  Same for tag.
Expected: There should be a way to remove the line completely
Suggestion/things to discuss: what if we add +/- button in the beginning of /or at the end of each line just like apple contacts? see the screenshot for the reference
```
