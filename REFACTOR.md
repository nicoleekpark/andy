# REFACTOR.md — cleanup options, what each one solves, and when

Written 2026-10-02, while the designer and QA test build 1.0.0 (3) on their phones. Measured on `main` at that date.

**Refactoring here means changing how the code is organised without changing what the app does.** A person using the app should not be able to tell that any of these happened, with one exception. B fixes a real bug. J2 and G produce reports and change no code.

## The rules for every option

1. **No behaviour change.** The existing tests must pass **without being edited**, apart from import lines. If a test has to change for a refactor to pass, the refactor changed behaviour. Stop and look.
2. **One option per PR.** Run `code-reviewer`, plus `design-system-auditor` when a screen's styles change.
3. **A fix from QA always comes first.** Refactor branches are rebased on top of fixes, never the other way round, so a tester's bug is never stuck behind a cleanup.
4. **No build just for a refactor.** EAS gives 15 iOS builds a month. Refactors ride along with the next build that carries QA fixes.

---

## Summary

| ID | In one line | Size | Importance | Collides with QA fixes? | When |
|---|---|---|---|---|---|
| **B** | Lists remember rows by position, so deleting a row can confuse which one is which | 4 files, 8 places | Medium–high (a real bug) | Low | **Now** |
| **J1** | No list of which word we use for what | 1 file | Medium | None | **Now** |
| **J2** | No way to see every sentence in the app at once | Script + report | Medium (useful for the designer now) | None | **Now** |
| **A** | The same small piece of logic is written in several places | 5–6 files | Medium | Low | **Now** |
| **H** | Test set-up code is copied between test files; CI cold start is slow | Tests + CI | Medium | None | **Now** |
| **G** | Unused code and schema left behind | Report only | Low–medium | None | **Now (report)** |
| **C** | `capture-screen.tsx` is 2,166 lines: step 1, move the small pieces out | 1 → 4 files | High | Medium | After the first QA fixes to capture |
| **D** | `capture-screen.tsx`: step 2, split the 1,660-line component | 1 file → hooks | High (long term) | High | After the QA round |
| **E** | Spacing and font sizes are typed as raw numbers, not tokens | ~15 files | Medium–high | High | After the designer's review |
| **F** | The same text styles ("quiet", "error"…) are defined separately on each screen, and drift | ~10 files | Medium | High | With E |
| **I** | `profile/[id]/index.tsx` is 824 lines | 1 → 3–4 files | Medium | Medium | After the QA round |
| **J3** | Every sentence moves into one copy file | ~15 screens + server | Medium | High | After the QA round |
| **K** | Errors are turned into on-screen messages two different ways; one way can show a raw technical error | 3 screens, 7 places | **High** (what a person sees when something fails) | Low | **Soon**, after one check against the deployment |
| **L** | The "is this row the caller's?" check is written by hand ~10 times in Convex | ~5 backend files | **High** (security: one forgotten copy is a data leak) | Low | After the QA round, with `security-reviewer` |
| **M** | `saveCapture` is one 396-line function | 1 file | Medium | Medium | After L |
| **N** | The "are you sure? Delete" confirmation is written 7 times | 5 files | Low–medium | Low | With F |
| **J4** | A real translation system | J3 + a library | — | — | When Korean returns (V1.1) |

Recommended order: **Now:** B → J1 → J2 → A → H → G, then **K** (after its check). **After QA:** L → M → C → D → J3 → E + F (+ N) → I. **V1.1:** J4.

**Done:** B (#90), J1 (#92), J2 (#93), and the three "you keep" strings (#94).

---

## B — Lists remember rows by position, not by identity

**The problem.** React decides which row on screen is which by a `key`. Eight lists use the row's **position** as its key (`key={index}`). When a row is deleted from the middle, every row below it moves up a position, and React reuses the wrong on-screen field for it.

**What a person sees.** On the capture review, tap **Add a fact** and start typing in the new line. Then tap × on an earlier fact. The keyboard closes mid-sentence, and the line you were typing in now needs a second tap. It's the same family of bug as #82, reached a different way. Found in #82's code review and left as a follow-up.

**Where.** `note/[id].tsx` (2), `profile/[id]/index.tsx` (1), `profile/[id]/edit.tsx` (2), `capture-screen.tsx` (3: facts, tags, mentions).

**The fix.** Give each row a stable id when it is created (a counter is enough) and use it as the key. The data sent to the server is unchanged; ids live only on screen.

**Tests.** New: add a line, type, delete an earlier line, and the line you were typing keeps its text and focus. Plus a `QA.md` row, because whether the keyboard stays up can only be seen on a device.

---

## J1 — No list of which word we use for what

**The problem.** STYLE.md says *how* to write (Voice, sentence case), but not *which word* to use for each thing. Without that list, two names for one thing creep in, and nothing catches it until someone reads everything. Already happened:
- "First meeting" vs "First met" (fixed in #83)
- "Read again" vs "Read it again" (fixed in #83)
- "Search" vs "Ask Andy" (fixed in #83)

**The fix.** A **Terminology** table in STYLE.md, with the one approved word per concept and the words not to use:

| Concept | Say | Don't say |
|---|---|---|
| The record of a conversation | note | memo, entry |
| What Andy pulls out of a note | what to remember / fact | insight, data |
| Keeping something | remember | save, collect, store |
| … | … | … |

**Tests.** None (documentation). `design-system-auditor` and `product-strategist` already read STYLE.md, so they enforce it from then on.

**Status (2026-10-02).** The table is in STYLE.md → Copy Tone → Terminology. **Applying it is a separate copy PR**, which goes into the next build with the QA fixes. It changes what people read and some test labels, so it is not a refactor. The strings to change:

| Now | After |
|---|---|
| "New person — nobody by this name yet." | "Someone new — no one by this name yet." |
| "A different {name}, kept separately" | "A different {name}, with their own notes" |
| "You already keep somebody by this name. Is this them?" | "You've written about someone by this name. Is this them?" |
| "This note goes to whoever you pick — or to somebody new." | "This note goes to whoever you pick — or to someone new." |
| "Andy heard a name that might belong to somebody you already keep. Pick them, or keep it as a new person." | "Andy heard a name that might belong to someone you've written about. Pick them, or choose someone new." |
| "Everyone you keep in Andy, every note and every photo will be deleted…" | "Everyone in Andy, every note and every photo will be deleted…" |
| "Anyone who only ever came up inside those notes goes too." | "Anyone who only ever came up in those notes goes too." |
| "Add a fact" / "Remove fact N" / "Fact N" (accessibility label) | "Add a detail" / "Remove detail N" / "Detail N" |
| "· fix any fact Andy got wrong." | "· fix any detail Andy got wrong." |
| "Keep my facts" | "Keep my edits" |
| "The facts above still come from the old wording…" | "The details above still come from the old wording…" |
| Server: "That's longer than a fact. Try splitting it up." | "That's too long for one detail. Try splitting it in two." (`convex/notes.ts`, so push the backend) |

Before starting, search `src/` and `convex/` for `fact`, `somebody`, `nobody`, `mention`, `transcript` and `keep` in user-facing strings, to catch any this list missed.

---

## J2 — No way to see every sentence in the app at once

**The problem.** The app's sentences are written inside about 15 screen files and 13 server files. To review the copy, the designer would have to read the code, or tap through every screen and every error.

**The fix.** A small script that pulls every user-facing string (screen text, buttons, accessibility labels, alerts, server error messages) into one table: **screen / string / file:line**. Output: `docs/copy-deck.md`. **No app code changes.** The designer marks changes in the table, and those become QA fixes.

**Tests.** None needed. It's a report, regenerated whenever needed.

---

## A — The same small piece of logic written in several places

**The problem.** When the same decision is written in several places, changing it means finding every copy. Missing one makes two screens disagree. Two cases:

1. **The note's source label**: "What you said" / "What you wrote" / "What the card said", depending on how the note was made. It's written separately in `capture-screen.tsx`, `note/[id].tsx` and `profile/[id]/index.tsx`. They match today; nothing keeps them matching.
2. **Date format**: `toLocaleDateString("en-CA")` (2026-10-02 style) is written about 10 times across 5 files. If the format should change, for example to "2 Oct", that's 10 edits and an easy miss.

**The fix.** One `sourceLabel(source)` helper and one `formatDate(ms)` helper in `src/lib/`, used everywhere.

**Tests.** A unit test per helper. The existing screen tests must pass unchanged, and they already check these strings.

---

## H — Test set-up copied between files; slow CI cold start

**The problem.**
1. Seven test files each write their own version of the same mocking helper ("when the screen asks Convex for X, answer Y"). When the screen code changes how it asks, seven helpers need the same fix.
2. CI compiles everything from scratch on each run, which is what pushed a test past jest's time limit (runs 180/181, fixed by #80 with a longer limit). Caching the compile step between runs makes CI faster and keeps a margin.

**The fix.**
1. One shared helper in `test-support/`.
2. Cache jest's transform directory in the GitHub workflow.

**Tests.** All tests pass. Compare CI time before and after.

---

## G — Unused code left behind (report only)

**The problem.** Code nobody uses still has to be read, kept compiling and kept secure. Candidates already known:
- the `profiles.search_name` index, which `schema.ts` itself marks **"Unused"**
- `metrics` and `profiles.contactId`, kept for features cut to V1.1

**The fix.** Run a dead-code finder (`knip` or `ts-prune`) and write a report. **Delete nothing until each item is decided.** Schema changes follow CLAUDE.md: removing an index is safe; removing a field needs the migration steps.

**Tests.** None for the report.

---

## C — `capture-screen.tsx`, step 1: move the small pieces out

**The problem.** At 2,166 lines, the capture screen is four times the next largest screen. It holds four separate things that don't need to live in it:
- `NamePicker` (the "This X?" choice)
- `Fate` ("Adding to X" / "New person")
- `Field`
- `describe()`

Every capture fix starts with finding the right place in 2,000 lines, and every review has to read around it.

**The fix.** Move those four into their own files under `src/components/capture/`. **A pure move: no logic changes.**

**Tests.** The 64 capture tests pass with **no edits**. Collision risk: QA fixes will probably touch capture, so do this right after the first capture fixes land, not during them.

---

## D — `capture-screen.tsx`, step 2: split the big component

**The problem.** Even after C, the main component is about 1,660 lines. It does five jobs in one function:
- recording
- reading (extraction)
- working out who each name is
- the review form
- saving

A change to one job means reading all five, and the state of each job is mixed with the others.

**The fix.** Pull each job into a hook (`useRecording`, `useExtraction`, `useNameResolution`), one per PR. The screen then just connects them.

**Tests.** The same suite, unchanged, after each hook. High collision with QA fixes, so **after the QA round**.

---

## E — Spacing and font sizes typed as numbers, not tokens

**The problem.** Colours and fonts always come from `theme.ts`, which is good. Spacing and font size mostly don't:
- **Spacing:** 136 raw numbers, only 3 using the `space` tokens. Several values are off the scale (`10` ×13, `14` ×12, `20` ×5, `3` ×4, `18` ×4).
- **Font size:** 116 raw numbers in **13 different sizes**, with no type scale.

Two screens meant to look the same end up a couple of points apart. A designer can't change "body text" in one place.

**The fix.**
1. Add a type scale to STYLE.md and `theme.ts`.
2. Replace the numbers with tokens, mapping each to its **current** value first, so nothing moves on screen.
3. Then adjust the scale in one place.

**Tests.** design-system-auditor, plus one before/after screenshot comparison per screen on the simulator. **Wait for the designer's review:** their feedback may change the values, and doing it twice is waste.

**Measured 2026-10-02: the same element, different values on different screens.** The developer saw this on the phone during QA. It is drift, not design: only colour and font are tokens.

| Element | Values found |
|---|---|
| Gap between sections | 16 (home, capture, profile, search) · 24 (profile edit, note) · 20 (capture review) |
| Quiet secondary text | 14 pt at 55% (capture) · 15 pt at 60% (note, edit, others) |
| Field labels | system 12 pt (most) · **Lora** 12 pt (Ask Andy) · 11 pt at 45% (Ask Andy, elsewhere) |
| Main moss button | 18 tall padding (home) · 16 (edit, note) · a different pill (Ask Andy) |
| Lead line under a title | 15 pt at 75% (capture) · 14 pt at 60% (note) |
| Error text | line height 21 / 20 / none |
| Tap slop around small buttons | 8 (×8) · 12 (×5) |

The designer marks which value is right (TESTERS.md → Design), and E applies the choice everywhere in one pass.

---

## F — The same text styles defined separately on each screen

**The problem.** "Quiet" secondary text is defined separately in 9 files, and the definitions have drifted:
- `note/[id].tsx` and `edit.tsx`: 15 pt at 60% opacity
- `capture-screen.tsx`: 14 pt at 55%
- other variants elsewhere

"Error" text has 7 copies. The same kind of text looks slightly different from screen to screen.

**The fix.** Shared text styles (`quiet`, `error`, `hint`, `fieldLabel`) built from E's tokens, used everywhere. Plus three shared components, because the same piece is built by hand on each screen:
- **`Button`**: the main moss button and the quiet text button. Today it is rebuilt with different heights per screen.
- **`FieldLabel`**: one font. Ask Andy's labels use Lora, every other screen's don't.
- **`ScreenStatus`**: the centred "Loading…" and "Andy doesn't have a … by that link." states, written separately on four screens.

**Tests.** As E. Do it together with E.

---

## I — `profile/[id]/index.tsx` is 824 lines

**The problem.** It's smaller than capture but mixes the header, photo handling, the notes timeline, "Came up in", and the follow-up draft.

**The fix.** Split it into section components, a pure move as in C.

**Tests.** `profile.test.tsx` passes unchanged. **After the QA round.**

---

## K — Two ways of turning an error into a message

**The problem.** When something fails, a screen shows a message. Two patterns exist side by side:
- **Ask Andy (`search.tsx`)** shows the server's words only for a `ConvexError`, the errors written for a person, and a plain fallback otherwise. Its comment says why: "Never the raw error — it can carry the question back."
- **The note editor, profile editor and capture** (7 places) show `e.message` for **any** `Error`. A network failure or an unexpected server error can then put a technical message on screen, such as a request ID or a function name.

**What a person might see.** On a bad connection, saving a note shows something like "[CONVEX M(notes:updateNote)] Server Error…" instead of "Andy couldn't save that change. Try again."

**First, check against the deployment**, not convex-test. CLAUDE.md: backend behaviour has to be proven on the real thing. What exactly does the client receive as `e.message` for a `ConvexError`, for a thrown `Error`, and for a dropped connection?

**The fix.** One helper, `userMessage(error, fallback)`: the server's words for a `ConvexError`, the fallback for anything else. Used in all 8 places.

**Tests.** A unit test per case. Screen tests that throw a plain `Error` will now expect the fallback, so those **edits are intended** and named in the PR. This one is a behaviour change, not a pure refactor.

---

## L — The ownership check, written once

**The problem.** Convex has no row-level security, so every function checks by hand that a row belongs to the caller: normalise the id, load the row, compare `userId`. That sequence is written out about 10 times across the backend. Each copy is a chance to forget one step, and a forgotten copy is someone else's note on your screen. `security-reviewer`'s first check exists because of this.

**The fix.** One helper per table, for example `ownedProfile(ctx, user, id)` and `ownedNote(ctx, user, id)`, that returns the row or `null`. Every function uses it instead of repeating the steps.

**Tests.** The existing isolation tests ("another user cannot read this") must pass unedited. Plus `security-reviewer`, which is blocking. After the QA round.

---

## M — `saveCapture` is one 396-line function

**The problem.** The mutation that saves a note does everything in one function:
- check the input
- work out who the note is about
- update the person
- create the people who came up
- write the note and its links
- schedule the search index

It is the most important write in the app and the hardest one to read.

**The fix.** Split it into named steps inside the same file, keeping the same order and the same single transaction. No behaviour change.

**Tests.** `convex/notes.test.ts` (60 tests) passes unedited. After L, since L changes the ownership lookups this function uses.

---

## N — The destructive confirmation, written 7 times

**The problem.** "Delete this note?", "Delete this person?", "Remove this photo?", "Delete your account?", "Read it again?" and others each build the same `Alert.alert` with Cancel plus a red action by hand. One copy getting the button order or the Cancel style wrong goes unnoticed.

**The fix.** One `confirmDestructive({ title, message, action, onConfirm })` helper.

**Tests.** The existing confirmation tests pass unedited. Do it with F.

---

## J3 — Every sentence in one copy file

**The problem.** The same as J2, but solved permanently: a sentence's home is the screen file, so changing copy means editing code, and checking consistency means a search.

**The fix.** Move every string into `src/copy/en.ts` (screens) and `convex/messages.ts` (server errors). Screens import them. No new library.

The reasons currently written in comments next to each sentence move with it: Andy's code explains *why* each wording was chosen.

**Trade-off.** Reading a screen's code no longer shows its sentences directly.

**Tests.** Tests import the same constants, so they still check the real text. **After the QA round**, once copy fixes have settled.

---

## J4 — A real translation system

**The problem.** V1 is English only; Korean returns in V1.1.

**The fix.** A translation library (for example i18next) with `en.json` and `ko.json`, picked by the phone's language. With J3 in place this is a mechanical swap.

**When.** With Korean, not before.
