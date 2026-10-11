# Copy proposals — device QA build 4

Proposals for the wording items still open from device QA on build 4
(`dev-reports/qa-device-build-4.dev.md` §2: #1, #22–#25, #27, #32–#35, #37, #46).
Written by `product-strategist` on 2026-10-11. **Nothing here is decided. The
owner picks one option per item**, or none. After that, the implementer
changes the code, the tests listed under each item, `QA.md`, and
`docs/design/component-names.md`, then runs `npm run copy-deck` again.

Every string was checked against the code on 2026-10-11, not only against
`docs/copy-deck.md`. Screens and parts are named as in
`docs/design/component-names.md`. Rules applied: `STYLE.md` → Copy Tone,
Terminology and Voice.

## Brief

### Summary

| # | Where (`file:line`) | Current | Recommended |
|---|---|---|---|
| 1 | `sign-in-tagline`, `sign-in-description` (`src/app/(auth)/sign-in.tsx:92–94`) | "Remember what they told you." / "Notes about the people you meet, so you can ask about it next time." | Keep the tagline. Description: **"A private notebook for the people you meet, so next time you know what to ask about."** |
| 22 | `read-button` (`src/components/capture-screen.tsx:1917, 1925`) | "Read it" | **"Let Andy read it"** (not "Confirm") |
| 23 | `transcript-lead` (`capture-screen.tsx:1837`) | "Check what Andy heard. Fix any names or words before it's read." | **"Is this what you said? Fix any name or word, then let Andy read it."** |
| 24 / 34 | `note-source-hint` on `review` (`capture-screen.tsx:1713`) | "Correcting this fixes the note itself. The facts above stay as they are — unless you ask Andy to read it again." | **Remove it.** `note-source-edited-line` already says this, and only at the moment it becomes true |
| 25 | `review` `nav-bar-title` (`capture-screen.tsx:1338`) | "Check this over" | **"New note"**, the same title as every other step of making a note |
| 27 / 37 | `nav-bar-back`, app-wide (`src/app/(app)/_layout.tsx:189`) | The previous screen's title ("Andy", "Check this over", "Ask Andy", a person's name) | **Chevron only, no words**, on every screen. VoiceOver still says "Back" |
| 32 | `name-choice-kept-note` (`capture-screen.tsx:1486`) | "{name}'s details stay as they are. Change them from their profile." | **"To change how you know {name} or when you first met, edit their page."** |
| 33 | `name-choice-new` (`capture-screen.tsx:260, 271, 279`) | "Someone new" / "A different {name}, kept separately" · VoiceOver "New person called {name}" | "Someone new" / **"A different person, also called {name}"** · VoiceOver **"Someone new: a different person, also called {name}"** |
| 35 | `ask-hint` (`src/app/(app)/search.tsx:307`) | "Ask in your own words. Andy reads everything you have saved — including people who only came up inside someone else's note." | **"Type a name, or ask in your own words — like “who runs a climbing gym?” Andy looks through all your notes, even where someone only came up in passing."** |
| 46 | `QA.md` 20.11a / 20.11b (tester copy) | "Tap one of those Came up in rows → The note opens to read…" | **Delete both rows.** `__tests__/note.test.tsx` already covers them. A rewrite is offered if a person should still look |

**Where this differs from what the owner suggested:**
- **#22:** "Confirm" is not recommended. It reads as "saved", and the note is not saved until **Remember this** on the next screen.
- **#27:** "Back" would work. Chevron-only is recommended over it, for the reasons given under #27/#37.

**Items these depend on:** #23's recommended wording ends with #22's button
words, so if #22 changes, #23 changes too. #25 and #27 also interact. Under
option 27-C (keep the previous screen's title as the back label), #25's title
becomes a back label as well.

**How we'll know it worked** (a hypothesis: Andy has no analytics, so this
is checked by people, not a dashboard). On build 5, the owner reads these
screens again in the order of a real capture: record, check the words, review,
save, then Ask. None of these items comes back as "unclear". A second check: a
TestFlight tester who has not seen the app is shown `record--transcript` and
asked "what happens if you tap the green button?". If the answer is "it saves",
#22 has failed.

**What is out of scope here:** layout and visual items from the same QA pass:
- #4, the back button looking like it sits in a bubble (this is iOS 26's glass)
- #21, making the transcript step more intuitive
- #30, picking a person from a list

Those belong to `product-designer`. #27/#37 below touches #4 only where the
label changes the shape of the bubble.

---

### #1 — Sign-in first impression

**Current** (`sign-in`, `src/app/(auth)/sign-in.tsx:92–94`):
- `sign-in-tagline`: "Remember what they told you."
- `sign-in-description`: "Notes about the people you meet, so you can ask about it next time."

**Does it fit the direction?** The tagline does. It is STYLE.md's one line
almost word for word ("…so you remember what they told you"). It frames Andy as
care, not as collecting, which is the positioning that has to survive App
Review. The **description** is the weak line:
- "it" has nothing to refer to.
- "ask about it" could mean asking the person or asking Andy.
- At the moment someone is deciding whether to trust an app with notes about
  other people, it never says the notes are private.

Promise 1 ("Only you") is already guaranteed by the code, so saying "private"
here is allowed.

**Principle (framing and first impressions):** the first sentence a person
reads sets how they interpret everything after it. "A private notebook" puts
the app in the notebook category before any recording screen appears. That is
a hypothesis, not research. It is confirmed if TestFlight testers describe
Andy as "a notebook / for remembering people", and killed if they describe it
as "a contacts app / CRM".

| Option | `sign-in-tagline` | `sign-in-description` |
|---|---|---|
| **A (recommended)** | Remember what they told you. | A private notebook for the people you meet, so next time you know what to ask about. |
| B | Remember what they told you. | After you meet someone, say what they told you. Andy keeps it for next time. |
| C | The people you meet, and what they told you. | A private notebook, so next time you know what to ask about. |

- **A:** keeps the approved tagline, adds "private", and makes "ask" mean
  asking the person, which is the job before you walk in.
- **B:** explains how it works (you speak) but drops "private". Using "keeps"
  is fine here because it refers to what they said, not to a person.
- **C:** the tagline names the people first. It is a little closer to the
  banned "know everything about" register, so it is not recommended.

**Tests and docs that change:**
- `__tests__/sign-in.test.tsx:96–98` asserts the description exactly. Under A
  and B the tagline assertion at `:95` stays.
- `QA.md` 24.2 quotes the tagline; it is unchanged under A and B.
- Check `README.md` / `README.ko.md`, the store listing and the privacy page
  for the old description. They are a bilingual pair, so edit both or neither.

---

### #22 — `read-button` on `record--transcript` (and typing)

**Current** (`src/components/capture-screen.tsx:1917` VoiceOver, `:1925` text): "Read it". While working: "Reading…".

**What the button does:** it sends the words to Claude, which picks out the
details, and opens `review`. **Nothing is saved yet.** Saving is
`remember-button` on the next screen. Typed notes use the same button.

**The problem:** "Read it" does not say *who* reads. It sounds like an
instruction to the user ("read it over"), which is the opposite of its job.

**Why not "Confirm" (the owner's suggestion):**
- "Confirm" is a word for finishing. Someone at a convention who taps
  "Confirm" and puts the phone away believes the note is safe. It is not: it
  is a draft on a screen. If iOS clears the app from memory (#52), the draft
  is gone.
- Losing what someone told you is the one failure this app exists to prevent.
  People feel a loss more strongly than an equal gain (loss aversion), so a
  word that creates a false sense of being done costs more than an unclear
  one.
- STYLE.md also bans words of the "Submit" kind ("Remember this," not
  "Submit").

**Andy's verb is already "read":** "Read it again", "Reading…", "Read it
now", "Read the first now", "Andy will read it when you're back online",
"…Andy hasn't read yet", "Reading the card…". STYLE.md's one-action-one-name
rule says to keep the family together and fix the missing subject.

**On trust:** this tap is also the moment the words leave the phone for
Anthropic (`ENVIRONMENTS.md` §2). Saying that *Andy* reads it, and that you
are the one who lets it, is the honest version.

| Option | Text | VoiceOver | Busy | Notes |
|---|---|---|---|---|
| **A (recommended)** | Let Andy read it | Let Andy read it | Reading… | Says who reads, and keeps "Read it again", "Read it now" and "Reading…" one family |
| B | Next | Next | Reading… | Honest that nothing is saved, but empty. It stops telling you what happens |
| C | Pick out the details | Pick out the details | Picking out details… | Says the outcome and uses the Terminology word "detail". It breaks the family, though: `reread-button` would have to become "Pick them out again", and home's `outbox-line-action` "Read it now" would no longer match |
| D | Confirm | Confirm | Reading… | **Not recommended**, for the reasons above |

**Hypothesis:** a tester shown A can say "Andy will go through it". They do
not say "it's saved". Same check as the summary.

**Tests and docs that change** (A, B and C all change these):
- `__tests__/capture.test.tsx` finds the button by exact name "Read it":
  - `:216`, inside the `reachReview` helper (one edit covers about 40 tests)
  - `:512`, `:555`, `:695`, `:1608`, `:1646`, `:1681` (`getByLabelText`), `:2950`, `:2975`, `:3071`
- `QA.md` 7a.35, 7a.36, 8.2, 8.3, 11.15, 11.21 ("no Read it to press").
- `component-names.md` `read-button` 설명, the `record--transcript` state
  ("Read it 전"), `offline-hint` and `keep-note-button`.
- `reread-button` "Read it again" stays under A.

---

### #23 — `transcript-lead` on `record--transcript`

**Current** (`capture-screen.tsx:1837`, voice only): "Check what Andy heard. Fix any names or words before it's read."

**The problem:**
- "before it's read" is passive: read by whom?
- "Check" is the same verb as the next screen's title ("Check this over"), so
  the flow asks you to check twice in a row. That feels like paperwork.
- Most of the time there is nothing to fix (the code does not open the
  keyboard for this reason). The line should let a person glance at it and
  move on, not ask for a careful proofread.

**Principle (Fogg, prompt and ability):** a yes/no question that the label
under it answers ("What you said") costs less than an instruction. Ending the
line with the button's own words follows one action, one name, and tells the
user what the next tap does.

| Option | Text |
|---|---|
| **A (recommended)** | Is this what you said? Fix any name or word, then let Andy read it. |
| B | This is what Andy heard. Tap to fix a name or word first. |
| C | Andy heard this. Names are the easiest thing to mishear — fix any here. |

- **A** follows #22-A. With #22-B it becomes "…then tap Next." With #22-C it
  becomes "…then let Andy pick out the details."
- **C** says *why* names matter (they are what decides who a note is about),
  but it is the longest option.
- No option uses "heard" anywhere a typed note could show it. This line only
  appears for voice (`heard ? … : null`).

**Tests and docs that change:**
- `__tests__/capture.test.tsx:499`
  (`getByText(/Fix any names or words before it/)`). A and B both break it.
- `QA.md` 7a.35 quotes the old line.

---

### #24 / #34 — `note-source-hint` above "What you said" on `review`

**Current** (`capture-screen.tsx:1713`): "Correcting this fixes the note itself. The facts above stay as they are — unless you ask Andy to read it again."

(The owner listed this under `record--transcript`, but it renders on `review`,
above the `note-source-field`.)

**The problem:**
- It uses "facts", a banned word.
- "the note itself" is vague.
- It explains a consequence before the person has done anything, on every
  review, to everyone.
- Since #136 it is also **redundant**: the moment the wording is edited,
  `note-source-edited-line` appears under the field ("The details above still
  come from the old wording.") with `reread-button` right below it.

**Principle (just-in-time vs just-in-case):** a warning that is always on
screen, about something that rarely happens, gets learned and then ignored.
That habituation also weakens the edited line, which says the same thing at
the moment it is true. The field's underline already shows it can be edited.

| Option | Text |
|---|---|
| **A (recommended)** | *(no hint — remove the line)* |
| B | Fix a misheard word here, then tap Read it again to update the details above. |
| C | These are your words as they'll be saved. Changing them doesn't change the details above unless Andy reads them again. |

- **B** is the fallback if the owner wants a line that explains it before
  anything is edited. It names the button, so it follows one action, one name.
- **C** is accurate but describes how the app works rather than what to do.
- **A, a hypothesis:** with the hint gone, a tester who corrects a word still
  either taps "Read it again" or saves on purpose, because the edited line
  told them. If testers save without noticing that the details are stale, go
  back to B.

**Tests and docs that change:**
- None in jest. No test asserts "Correcting this…"; `capture.test.tsx` was
  read in full to check.
- `component-names.md`: remove `note-source-hint` from the `review` section
  only. The `note` screen keeps its own hint.

**Also for the implementer:** `QA.md` 7a.2–7a.6 still describe the "You
changed what you said" save dialog that #136 removed. 7a.39 is the current
behaviour. Those rows should go in the same PR. That is the implementer's
call; it is not a copy decision.

---

### #25 — `review` title

**Current** (`capture-screen.tsx:1338`): `nav-bar-title` "Check this over". The record and typing steps before it are titled "New note" (`:1817`, `_layout.tsx:196`).

**The problem:**
- A title should name the place you are in. "Check this over" is an
  instruction, and `review-lead` under it already gives the instruction ("This
  is what Andy will remember. Change anything first.").
- It also makes the second "check" in a row (see #23).
- It becomes an odd back label on `profile` when that is reached through
  `name-choice-view-link` (#27).

**Principle (match the real world, and one name for one thing):**
- Record, check the words and review are all one thing being made: a new
  note. One title across the flow says that it is still the same note.
- The lead line and the **Remember this** button already carry the step.
- People think of a title as where they are, not what to do.

| Option | Title |
|---|---|
| **A (recommended)** | New note |
| B | Review |
| C | Last look |

- **B** is plain and short, but it is a word for a process.
- **C** gives a sense of being nearly done (the goal-gradient effect) without
  any urgency, but it is a little cute for this app's voice.

Under option 27-C, the title is also the back label: "‹ New note" (A) is
fine; "‹ Last look" (C) is not.

**Tests and docs that change:**
- None in jest. The native header title is not rendered in jest; see
  `QA.md` §27.
- `QA.md` 7a.38, 7a.39 and 11.21 call the screen "Check this over".
- `component-names.md` uses it in the `review` capture descriptions (S6–S6d).
- `dev-reports/qa-device-build-4.dev.md` §5's heading (local only).

---

### #27 / #37 — `nav-bar-back` labels, one rule app-wide

**Current** (`src/app/(app)/_layout.tsx:189–202`): no back setting, so iOS
shows the previous screen's title. A long title falls back to "Back", or to the
chevron alone if space is short. On iOS 26 that label sits in the glass pill
the owner flagged in #4. What a person reads today:

| Screen (pushed) | Reached from | Back label today |
|---|---|---|
| `capture` (record / transcript / review) | `home` | Andy |
| `ask` | `home` | Andy |
| `settings` | `home` | Andy |
| `profile` | `home`, `briefing-card` | Andy |
| `profile` | `ask` | Ask Andy |
| `profile` | `review` → `name-choice-view-link` | Check this over |
| `profile` | `note` (an Also came up link) | the person's name |
| `profile-edit` | `profile` | the person's name |
| `capture` (`record--scoped`) | `profile` → `add-note-button` | the person's name |
| `note` | `profile` | the person's name |
| `note` | `ask` (`mention-result`, `source-note`) | Ask Andy |

`home`, `sign-in`, `lock`, `connecting` and the `draft` sheet have no back
button. The sheet closes with `draft-sheet-done`.

**The problem:**
- "‹ Andy" reads as "go to the assistant". In this app, "Andy" is also who
  you ask (`ask-button` "Ask Andy"), so the label means two things.
- "‹ Check this over" is an instruction, not a place.
- A long name ("‹ Emily Watson") gets cut short, or turns into "Back"
  depending on width, so the same control changes its words from one screen
  to the next.
- Andy's stack is shallow (at most about four deep), so a label telling you
  where you came from adds little.

**iOS convention vs this app:**
- Apple's long-standing guidance is that the back button shows the previous
  screen's title, as a breadcrumb ([HIG, toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars); [WWDC22, Explore navigation design for iOS](https://developer.apple.com/videos/play/wwdc2022/10001/)).
- With iOS 26's Liquid Glass, Apple's own apps dropped the label and show a
  chevron in a round glass button. Nielsen Norman Group criticises this,
  because the breadcrumb is gone ([NN/g, "Liquid Glass Is Cracked"](https://www.nngroup.com/articles/liquid-glass/)).
- The breadcrumb only helps when every title is a place. In Andy, two of the
  most common labels are not places.

**Principle (Jakob's law):** people spend most of their time in other apps.
On iOS 26 those apps increasingly show a bare chevron, so this app's back
button should look like theirs.

| Option | Rule | What every row above reads | VoiceOver |
|---|---|---|---|
| **A (recommended)** | **Chevron only, everywhere** (`headerBackButtonDisplayMode: "minimal"` in the stack's `screenOptions`) | ‹ | "Back" (to be verified on a device) |
| B | **"Back" everywhere** (`"generic"`) — the owner's suggestion | ‹ Back (just ‹ when space is short) | "Back" |
| C | Keep the previous title, but fix the titles that are not places | ‹ Andy, ‹ New note (with #25-A), ‹ Ask Andy, ‹ name | the title |

- **A over B:**
  - Neither gives a breadcrumb, so both lose the same thing.
  - A matches iOS 26's own apps.
  - A shrinks the glass pill the owner disliked (#4) to a small round button.
    Whether that settles #4 is `product-designer`'s call.
  - A has no word in it that has to be translated or that can be cut short.
- **B is close behind.** If the owner tries A and finds a bare chevron too
  hard to see on the paper background, B is the change.
- **C** keeps the breadcrumb but leaves "‹ Andy" meaning two things. It
  would also need a rule that every future title is a place.

**Hypothesis:** with A, no tester says something like "the back button says
'Andy' — what does that mean?" (#37), and none hesitates on the `review` → View
→ back trip. Draft survival on that trip is already tested (QA 5.3, 7a.17).
Kill condition: a tester cannot find the back button on the paper background.
If so, move to B.

**Implementation note (not copy):**
- One line in the root `<Stack screenOptions>` covers every screen in the
  table above.
- Before building, confirm that `headerBackButtonDisplayMode` is supported in
  this Expo SDK 57 / react-native-screens version with `docs-verifier`. The
  React Navigation docs describe `default` / `generic` / `minimal`
  ([native stack docs](https://reactnavigation.org/docs/native-stack-navigator/)).
- Jest cannot see the native header, so this needs a new `QA.md` row (for
  example in §27): open each pushed screen in the table and check the back
  control is the same everywhere. With VoiceOver on, it reads "Back" (or the
  previous screen's name); a bare "button" is a fail.
- No jest test changes. `QA.md` 7.8 (no back button after deleting someone)
  is unaffected.

---

### #32 — `name-choice-kept-note`

**Current** (`capture-screen.tsx:1486`): "{name}'s details stay as they are. Change them from their profile."

**What it means:** when the note goes to someone you have already written
about, `review` hides **How you know them** and **First met**. Saving them
would quietly fill those values on the existing person, and that person never
confirmed them (`capture.test.tsx:895`). The line explains where the two
fields went.

**What value it adds:** a real one: fields that vanish without a reason look
like a bug (QA 3.6). But as worded it does harm:
- **"details" is the Terminology word for the items in What to remember**, the
  section directly below it. It reads as "the details below won't be saved",
  the opposite of what happens.
- "profile" is banned on screen (STYLE.md → Voice).

**Principle (information scent):** a line that explains a missing control
should name that control and say where it went.

| Option | Text |
|---|---|
| **A (recommended)** | To change how you know {name} or when you first met, edit their page. |
| B | How you know {name} and when you first met aren't changed here — edit their page for that. |
| C | *(no line)* |

- **A** names both fields and where to go, and uses neither "details" nor
  "profile".
- **B** is longer and starts with a negative.
- **C, not recommended:** the fields would appear and disappear with no
  explanation as a name is picked or unpicked (QA 3.6).
- **Design follow-up** (`product-designer`, not copy): show the person's
  current values read-only in place of the line, so you can see what is
  already there.

**Tests and docs that change:**
- `__tests__/capture.test.tsx:924` (`getByText(/Nina's details stay as they are/)`).
- `QA.md` 3.5 quotes the line.

---

### #33 — `name-choice-new`

**Current** (`capture-screen.tsx:271, 279`): "Someone new" / "A different {name}, kept separately". VoiceOver (`:260`): "New person called {name}". (The copy deck's planned change is "A different {name}, with their own notes".)

**The problem:**
- "kept" used about a person breaks the Terminology rule (Andy keeps notes,
  never people).
- "separately" is abstract.
- **"A different Emily Watson"** asks you to picture a second copy of someone
  you know. What the card means is simpler: a different person who happens to
  share the name.
- The VoiceOver label does not contain the visible words "Someone new". That
  fails WCAG 2.5.3, Label in Name: a Voice Control user saying "tap Someone
  new" gets nothing. Under the project's AA rule this is a bug, not a style
  choice.

**Principle (mental model):** "two people can share a name" is a fact
everyone already knows. "A second copy of Emily Watson" is something people
have to work out.

| Option | Title | Line | VoiceOver |
|---|---|---|---|
| **A (recommended)** | Someone new | A different person, also called {name} | Someone new: a different person, also called {name} |
| B | Someone new | Another {name}, with their own notes | Someone new: another {name}, with their own notes |
| C | Someone else | Not any of these — a new person called {name} | Someone else: a new person called {name} |

- **B** is the copy deck's planned wording with "A" turned into "Another". It
  is good, but it keeps the "copy of a person" framing.
- **C** reads well with two or more candidates and slightly oddly with one.
- **A related line, already planned in the copy deck:** `Fate`'s "New person —
  nobody by this name yet." (`:312`) becomes "Someone new — no one by this name
  yet.", so the visible "Someone new" means one thing across the screen. Its
  tests: `capture.test.tsx:1366, 1777, 1806`, and `QA.md` 3.1 and 7a.26.

**Tests and docs that change:**
- `__tests__/capture.test.tsx` finds this card by "New person called …" at
  `:881`, `:984`, `:1198`, `:1861`, `:2017`, `:2082`, `:2137`. All of them
  change to the new label.
- `QA.md` 7a.25 ("kept separately").
- `component-names.md` `name-choice-new` (description only).

---

### #35 — `ask-hint`

**Current** (`src/app/(app)/search.tsx:307`): "Ask in your own words. Andy reads everything you have saved — including people who only came up inside someone else's note."

**The problem:**
- It is two long clauses about how the app works.
- "everything you have saved" leans toward the language of collecting.
- It never says the most useful thing: **typing a name works too, at once**.
  The People and Came up in results appear without pressing Ask.
- A first-time user needs an example more than an explanation.

**Principle (Fogg, ability):** a concrete example question lowers the effort
of asking the first one, and recognising an example is easier than inventing a
question from nothing. The example uses no person's name, so it cannot be
mistaken for someone the user has written about.

| Option | Text |
|---|---|
| **A (recommended)** | Type a name, or ask in your own words — like “who runs a climbing gym?” Andy looks through all your notes, even where someone only came up in passing. |
| B | Ask in your own words, like “who runs a climbing gym?” Andy looks through all your notes — even people who only came up in someone else's. |
| C | Type a name, or ask a question. Andy looks through all your notes. |

- **B** keeps the current opening, so the tests are untouched, but it does
  not mention name search.
- **C** is the shortest. It drops both the example and the "came up" reach,
  which is a Must-have worth hinting at.
- **On honesty:** "looks through all your notes" is accurate. Recall searches
  every note's index; the answer is then written from the closest ones. The
  current "reads everything" overstates what happens.

**Tests and docs that change:**
- `__tests__/search.test.tsx:312` and `:365` match `/Ask in your own words/`,
  which is case-sensitive. **A** has "ask in your own words" in lower case, so
  both lines change, for example to `/ask in your own words/i`. **B** keeps
  them green.
- `QA.md` 14.7 refers to the "Ask in your own words" invitation.

---

### #46 — `QA.md` row "Note opens to read" (for a tester)

**Current:** `QA.md` 20.11a: "Tap one of those **Came up in** rows | The note
opens **to read**: date, the facts as plain text, what was said. No fields, no
Save, no Delete. **Edit** at the top right turns it into the editor; **Save
changes** brings you back to reading the corrected note. (Before 2026-10-01 it
opened straight into the editor)". Row 20.11b is its pair. The owner's build-4
checklist had a short copy of it ("Ask Andy, type 'clint' → tap the row under
Came up in → …"). Wherever that copy lives, update it too.

**The problem:**
- The row says *what to see*, not *why it matters*.
- It describes the old bug ("opened straight into the editor") rather than
  the risk: opening someone's note from a search should let you read it
  without being one stray tap from changing it.
- It uses "facts".

**Also:** `QA.md` holds only checks automated tests cannot make (its own
header and CLAUDE.md). This row is already automated:
- `__tests__/note.test.tsx:81`: "should open to read, with no field to type
  in, when reached from search"
- `:108`: comes back to reading after saving
- `:136`: the timeline's Edit opens straight into editing (row 20.11b)

| Option | Change |
|---|---|
| **A (recommended)** | **Delete 20.11a and 20.11b.** Jest covers both, and the QA rules say a row a test covers should go |
| B | Rewrite 20.11a for a person, keeping it as a quick look on a device (text below) |
| C | Keep it, adding only a "Why" line in front of the current text |

Option B text, if a person should still look:

> | 20.11a | **Why:** a note you open from `ask` is for reading — you came to remember, not to edit, so nothing should be one stray tap from changing. In `ask`, type a name that comes up in someone else's note, then tap that note under **Came up in** | The note shows its date, its details and its words as plain text — **no text boxes, no Save changes, no Delete this note**. Tap **Edit** (top right): now it can be changed. Tap **Save changes**: you are back to reading it, with your change |

---

## Open disagreements

None with `product-designer`; no designer options exist for these items yet.
Two recommendations differ from the owner's own suggestion and are flagged
for the owner, not settled here:
- #22: "Let Andy read it" over "Confirm". What would settle it: the TestFlight
  "what happens if you tap this?" check in the summary.
- #27/#37: chevron only over "Back". What would settle it: the owner using
  build 5 for a week; if the bare chevron is hard to find, switch to "Back".

**Scope:** no change needed. Every item is copy on an existing screen, or one
navigator option. Nothing adds a screen, an integration or a feature.
