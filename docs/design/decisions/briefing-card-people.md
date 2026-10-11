# Briefing card: which person, and more than one meeting

Two changes the owner asked for, to the `briefing-card` on `home`. Both come from
device QA build 4 (`dev-reports/qa-device-build-4.dev.md`), using the caller's
numbering: **#10/#11**, two people with the same name, and **#12/#14**, the
meeting that stays after it starts and the meetings you can't see.

Builds on `docs/design/decisions/calendar-connection.md`. Its decisions 1–5 and
rules R1–R22 still hold and are not reopened here. Names follow
`docs/design/component-names.md`. The new names this file proposes are listed at the end.

## Brief

_`product-strategist`, 2026-10-11. The owner decided both changes (2026-10-08
and 2026-10-11) and was not available for this brief. The calls made here on
the owner's behalf are marked **[call]** and collected under Open questions._

### 1. Problem and job

- **Job:** "Before I walk in, show me what I wrote about *this* person, and
  tell me what's next after that."
- **Problem A (#10/#11):** "Coffee with Priya", when two people called Priya
  are in Andy, gets "You've written about 2 people called "Priya", so Andy can't
  tell which one this is." That's a dead end: nothing on the card fixes it.
  Adding an alias to one Priya doesn't help either, because both still answer
  to "Priya". When the alias is the fuller name ("Priya Shah"), it makes things
  worse: the card shows that Priya *and* the same sentence (#11, see §4).
- **Problem B (#12/#14):** a meeting stays on the card after it has started
  (11:00 Priya is still there at 11:02). When 11:00 Priya and 11:05 Emily are
  both coming up, only Priya is shown, so Emily's briefing can't be seen until
  Priya's meeting is over.
- **Smallest useful outcome:** one tap tells Andy which Priya, and Andy
  never asks about that meeting again, including when it repeats. Every
  upcoming meeting with someone you've written about can be reached from the
  card, and a meeting leaves the card when it starts.

### 2. Success criteria

Andy has no analytics (promise 4), so these are checked by device QA and the
owner's own week of use.

1. **One metric:** in the owner's next week of use, an ambiguous name is asked
   about **at most once per calendar event**. A weekly 1:1 with a Priya gets
   asked about once, not every week.
2. On device, 11:00 Priya and 11:05 Emily can both be read before 11:00, and at
   11:00 Priya leaves the card without the app being reopened.
3. Every state in §3 has a `QA.md` row. The matching rules in §4 get vitest
   cases (`convex/calendarMatch.test.ts`) and the pick store gets jest cases,
   including in `__tests__/outbox.test.tsx` for sign-out.

**Hypotheses, not findings:**

- (a) *Fogg, ability:* one tap at the moment of need, remembered, turns a
  recurring dead end into a one-time cost. If the owner still meets the prompt
  for an event already answered, the event-id keying is wrong. Check against
  recurring and moved events.
- (b) *Recognition over recall, with no default:* candidates that show how you
  know each one are picked correctly, and a picker with nothing pre-selected
  avoids the wrong-Priya briefing a default would cause. This is killed if
  testers pick and then tap "Not this Priya?".
- (c) A carousel keeps the card about *the next* meeting, with the later
  ones one step away, without pushing the profile list down. This is killed if testers
  don't find the second meeting without being told.

### 3. States

**The card as a whole.** R1–R2 from `calendar-connection.md` still decide whether the card shows at all.

| Matched meetings in the window | Card shows |
|---|---|
| 0 | `briefing-card--empty` (unchanged) |
| 1 | That meeting, drawn like today. No position, no paging controls |
| 2–10 | `briefing-card--carousel`: the first meeting, plus a way to reach the others |
| more than 10 | The first 10. **[call]** In practice this can't happen in a 12-hour window, and a "+N more" line would be a state nobody tests |

**One name inside a meeting** (a meeting can mix these):

| State | What the meeting shows |
|---|---|
| Resolved: the name has one answer in Andy | `briefing-card-person-link`, as today |
| Ambiguous, not answered | `briefing-card-pick`: the question, every candidate, and **Neither of them** |
| Ambiguous, picked | The picked person as `briefing-card-person-link`, and `briefing-card-pick-change-button` under it |
| Ambiguous, "Neither" picked | `briefing-card-pick-none-line` with **Change** (see R-P6) |
| Picked person since deleted | The pick is dropped and the name is matched again from scratch. If only one person answers to it now, that person is shown; if several still do, the question comes back (R-P7) |
| Picked person no longer answers to the name (renamed, alias removed) | Same as deleted (R-P7) |
| A third person with that name added later | The pick stands. The person said who this meeting is with, and a new Priya doesn't change that. **Not this Priya?** is still there |
| Recurring event | One answer for the whole series (R-P2) |

**Offline:** everything here works the same. The calendar, the copy of your
notes, the matching and the picks are all on the phone. Before the first copy
of your notes has arrived there is no card (R1).

### 4. Matching: what has to change in `convex/calendarMatch.ts`

Asked: does an attendee or title with a fuller name ("Priya Shah") already
resolve when a profile's name or alias matches exactly? **Partly, and the part
that doesn't is the #11 bug.**

- **Attendee "Priya Shah", one profile with alias "Priya Shah":** this resolves.
  The attendee path is an exact `matchKey` lookup.
- **Title "Coffee with Priya Shah", same profile:** `namesFoundIn` finds
  "priya shah", which is correct. It *also* finds "priya", because "Priya" is
  followed by a space, and "priya" belongs to two people. The meeting ends up
  with Priya Shah in `people` **and** "2 people called Priya" in `ambiguous`.
  That is exactly what the owner saw in #11.
- **Attendee "Priya Shah" resolved, title "Coffee with Priya":** the title's
  "priya" is a different key, so it's reported as ambiguous too.

Rules (vitest for each; mutation-check that each test notices its guard removed):

- **M1. A name found only inside a longer matched name is not a second name.**
  If "priya" occurs in the title *only* within the span of "priya shah", which
  also matched, it's dropped. If "Priya" also appears on its own ("Priya Shah /
  Priya"), it stays and is asked about. This needs `namesFoundIn` to report
  where each name occurred, not just whether it did. Longest match wins.
- **M2. A name that a person already matched on this event answers to is that
  person.** If the invitation lists Priya Shah and the title says "Priya", the
  title's Priya is the same person. This isn't a guess between two people; the
  event itself says which Priya is coming. **[call]** This is the narrowest
  reading I could find that fixes #11 without guessing, and it's flagged below.
- **M3. One person appears once per meeting.** `people` is de-duplicated by
  `profileId`. Today a person with name "Priya Shah" and alias "PS" in "PS /
  Priya Shah" appears twice.
- **M4. Unchanged: comparison stays exact.** An attendee called "Priya Kumar"
  doesn't bring up the Priyas. Searching inside attendee names would widen
  matching, which `calendarNames.ts` warns against, and it isn't asked for.
- **M5. `ambiguous` carries what a picker needs**: the matched key and the
  candidates' `profileId`s, not just a display name and a count. A screen
  offering one set of people while the store saves against another is the
  failure `CLAUDE.md`'s `namesOf` rule exists to prevent.

Both of today's callers (the phone, and `calendar.matchEvents` for build 4) get
M1–M3 automatically. That's the point of the shared function.

### 5. Rules: the pick

- **R-P1. Where it lives:** on this phone only. It's a new `jsonFileStore` in
  `src/lib/on-phone.ts`, tagged with its owner like the other stores. It never
  goes to Convex. **`calendarLinks` is not used**: writing an EventKit
  identifier to the server would break decision 5 ("the calendar never leaves
  the phone"), and would bring Calendar back into App Privacy. That table stays
  as it is, unused. Removing it is a separate schema decision, not part of this
  work.
- **R-P2. What is stored:** `{ eventId, nameKey, profileId | "none",
  pickedAt, lastSeenAt }`. The key is **(EventKit event id, the folded name)**,
  not just the event. If "Coffee with Priya" later becomes "Coffee with Priya
  and Emily", the Priya answer still applies and Emily is matched as usual. All
  occurrences of a recurring event share one EventKit identifier, so one answer
  covers the series, which is what the owner asked for ([expo-calendar
  docs](https://docs.expo.dev/versions/latest/sdk/calendar/): instances of a
  recurring event don't have their own ids). If iOS gives the event a new id
  (for example, it moved to another calendar), the answer is simply lost and the
  question is asked again. That fails safe: it never guesses.
- **R-P3. Applied on the phone, after matching.** A pick only counts if its
  `profileId` is still one of that name's candidates, or it is "none".
  Otherwise it's ignored and pruned (R-P7).
- **R-P4. Picking is one tap and saves at once.** No Save button, no dialog. It
  changes the card in place and, being one tap to undo, needs no confirmation.
- **R-P5. Reminders follow the card.** A picked meeting now has a person, so
  under the existing rule (`briefable`) it gets its reminder and nudge, and the
  nudge opens the picked Priya. This isn't a new reminder rule: "what the phone
  will say and what the screen says cannot disagree" (`use-briefing.ts`).
  Picking reschedules at once, like muting does (R10), so a pick made at 10:45
  still gets its 10:50 reminder. An **unanswered** ambiguous meeting still gets
  no reminder, as today. **[call]**
- **R-P6. "Neither of them"** is stored as `"none"`. It's for the Priya who
  isn't in Andy. The meeting stays on the card until it starts, showing the
  none-line and **Change**, so the answer can always be undone from the screen
  where it was given. If no one on that meeting is left, it gets no reminder.
  **[call]** The alternative, dropping the meeting from the card, leaves
  nowhere to undo it.
- **R-P7. Pruned on every refresh, never trusted stale:** dropped when its
  person isn't in the copy of your notes (deleted on this phone or any other),
  when they no longer answer to the name, or when the event hasn't been seen in
  a read for **90 days**. The store holds at most **500** entries; when it's
  full, the oldest `lastSeenAt` goes first. `lastSeenAt` is written at most once
  per day per entry. Deleting a person on the server can't reach this file, so
  pruning on read is the only correct place for it.
- **R-P8. Cleared by `forgetOnThisPhone`** on sign-out and account deletion,
  together with any copy held in memory (`onForgetOnThisPhone`), with a test in
  `__tests__/outbox.test.tsx` (`CLAUDE.md`, 2026-10-10). It is **kept** when the
  calendar is turned off in Andy, when the card is muted, and when the remote
  switch is off. All three are reversible, and the picks never leave the phone.
  **[call]** This settles the question `calendar-connection.md` §3 left open.
- **R-P9. Per device.** An iPad on the same account asks for itself, the same
  as the mute (decision 4).
- **R-P10. Never guessed, never pre-selected.** No candidate is highlighted by
  note count or by how recently you wrote. The order is the one `review`'s
  `name-choice` uses, so the same two Priyas appear in the same order on both
  screens.

### 6. Rules: the carousel

- **R-C1. Which meetings:** every event starting **after now** and before now +
  12 h that has at least one resolved, picked or unanswered-ambiguous name, or
  a "none" pick (R-P6). The card counts a meeting as started at `startsAt`.
  Today `listEvents` also returns meetings already in progress, which is why
  #12 happens. **A meeting leaves the card when it starts** (owner, 2026-10-11).
- **R-C2. Order:** by start time, then title, then event id, so the order is the
  same on every refresh. The first page is always the next meeting.
- **R-C3. Page identity is (eventId, startsAt)**, not eventId. Two occurrences
  of an hourly recurring event can both fall in the window, and they share an
  id (R-P2).
- **R-C4. Card-level, not page-level:** the X (`briefing-card-mute-button`)
  mutes the whole card and all reminders (decision 4, unchanged), and there is
  one per card. The reminder link or the blocked line (`briefing-card-reminder-button`)
  is about notification permission, not about one meeting, so it appears once.
- **R-C5. When a meeting starts while the app is open,** the card updates at
  that moment without a foreground: a timer set to the next `startsAt` re-filters
  the meetings already read. It does **not** re-read the calendar or
  reschedule reminders, so it only touches what's on screen. If that page was
  showing, the card moves to the new first page. If it was the last meeting, the
  card shows `briefing-card--empty`. **Exception:** if the person is in the
  middle of a pick on that page, the removal waits until they finish. Content
  isn't pulled out from under a finger or VoiceOver focus, and the pick still
  saves for the next occurrence.
- **R-C6. On refresh** (foreground, pick, setting change), the card stays on the
  same page if that meeting is still there. Otherwise it goes back to the first
  page.
- **R-C7. Never moves by itself.** No auto-advance, no timed rotation. STYLE.md
  says the Briefing card never moves. A page change only happens when the person
  asks for one.
- **R-C8. Accessibility (WCAG 2.2 AA, `CLAUDE.md`):**
  - Swiping is never the only way to reach a page. There are visible previous
    and next controls of at least 44×44 pt (2.5.1 Pointer Gestures; 2.5.8
    Target Size).
  - Position is shown as text (`1 of 3`), not only as dots. Dots carry meaning
    by shape and colour alone, and `line` dots would fail 3:1.
  - VoiceOver reaches every meeting without the swipe. Each page announces its
    position, time and title ("Meeting 2 of 3, 11:05, Coffee with Emily").
    Whether the pager is one adjustable element or separate next/previous
    buttons is the designer's call.
  - When a page is removed (R-C5), focus moves to the card's first element,
    never into nothing.
  - **Reduce Motion:** page changes are instant (or a cross-fade), with no
    sliding.
  - **Dynamic Type:** a page grows with its text. Nothing is cut off to keep the
    pages the same height. The profile list below moves down instead.
  - The brass time on each page is the existing known contrast gap (STYLE.md).
    It's not made worse, and it's not fixed here.

### 7. Copy direction

Voice: "you've written about", never "contacts" or "profiles". "Remembers", and
say where it's kept. `{Name}` is the matched spelling, in the original casing of
the first candidate's name (as today).

**`briefing-card-pick`**
- Label: `Which {Name} is this?`
- Hint (`briefing-card-pick-note`): `You've written about {n} people called {Name}. Andy will remember your answer for this event, every time it repeats. It stays on this phone.`
- Each `briefing-card-pick-choice`: the name, then `briefing-card-pick-choice-meta` in the meta-line form: `{relationship} · {n} notes · {last date}` (lowercase, as STYLE.md says). Use the same pieces as `name-choice-meta`; leave out any piece that's empty.
- VoiceOver for a choice: label `{Name}, {meta}`, hint `Remembers this {Name} for this event.`
- `briefing-card-pick-neither`: `Neither of them`

**Picked:** `briefing-card-pick-change-button`: `Not this {Name}?`. VoiceOver label: `Choose a different {Name} for this event`.

**Neither picked:** `briefing-card-pick-none-line`: `Not a {Name} you've written about.` followed by `Change`.

**Carousel:** `briefing-card-page-position`: `{i} of {n}`. VoiceOver labels for the controls: `Next meeting` and `Previous meeting`. No visible words are needed if the designer uses arrows.

**Gone:** "so Andy can't tell which one this is". The new label asks the question
instead of describing the dead end.

### 8. Edge cases

- **Two ambiguous names in one meeting** (two Priyas and two Sams): a separate
  pick block for each, answered separately.
- **Three or more candidates:** all of them are shown, with no cap. A name shared
  by more than four people in one person's Andy is very unlikely, and hiding one
  would be hiding the right answer.
- **Picked, then the event's time changes:** the id is the same, so the pick
  stays.
- **The event is deleted from the calendar:** the pick ages out (R-P7).
- **Pick made, then signed out and back in:** asked again. Picks don't come back
  from the server, because they were never there (R-P1).
- **Two meetings at the same time:** both are pages, ordered by R-C2.
- **Muted for today:** no card and no picker. Picks already made are kept.
- **Clock or time zone change while open:** the next foreground re-reads, and
  the timer (R-C5) is set again from there.
- **The 11:00 meeting has started, the 11:05 one hasn't:** at 11:00 the card
  shows Emily alone, with no position text (one meeting, §3).

### 9. Not in this work

- Picking for a single occurrence of a recurring event.
- Picking from a notification, or a reminder for an unanswered ambiguous
  meeting (R-P5).
- A `settings` list to review or clear picks. Sign-out clears them, and each
  one has **Change** on the card.
- "Neither" offering to add the new Priya to Andy. That's `record`'s job.
- Matching partial names inside attendee names (M4).
- Showing a meeting that's in progress, or "starting now".
- Syncing picks across devices, or writing to `calendarLinks`.
- Changes to reminder timing, the mute dialog, or the reminder cap.

### 10. Open questions (decided here on the owner's behalf: confirm or overturn)

1. **M2: the invitation settles the title.** If the attendee list names Priya
   Shah, the title's "Priya" is her. Recommended: yes. The alternative keeps
   asking a question the event has already answered (#11). If the owner reads M2
   as a guess, drop it and keep only M1.
2. **R-P5: no reminder until a Priya is picked.** Recommended: keep today's rule.
   A reminder that can't name the person shouldn't promise a briefing it can't
   give, and the card asks the question.
3. **R-P6: "Neither" keeps the meeting on the card** with **Change**, so it can
   be undone. Recommended, over removing it.
4. **R-P8: turning the calendar off in Andy keeps the picks**. Only sign-out and
   deletion clear them. Recommended, because off is reversible and the picks
   never leave the phone. This answers `calendar-connection.md` §3's open line.
   That file should get a one-line pointer here in the build PR.

### Names (new; to add to `component-names.md` in the build PR)

`briefing-card--carousel` (state), `briefing-card-page` (one meeting),
`briefing-card-page-position`, `briefing-card-next-button`,
`briefing-card-previous-button`, `briefing-card-person-link` (the existing
person row, unnamed until now), `briefing-card-pick`,
`briefing-card-pick-label`, `briefing-card-pick-note`,
`briefing-card-pick-choice`, `briefing-card-pick-choice-meta`,
`briefing-card-pick-neither`, `briefing-card-pick-change-button`,
`briefing-card-pick-none-line`. The designer may rename these under the file's
rules.

## Options

_`product-designer`, 2026-10-11. Covers §5 (the pick) and §6 (the carousel)
together, since the brief's own §3 state table says a meeting can carry both
at once and the real UX risk is how they sit on one card, not either alone.
The owner was asleep for this brief and will choose from these three in the
morning; each option answers the brief's open questions 1–4 explicitly below.
Mocks: `docs/design/mocks/briefing-card-people-a.html` (recommended), `-b.html`,
`-c.html`. Builds on top of the card as it exists after PR #133 (not in this
worktree): the ✕ `briefing-card-mute-button` on every visible state, the
`ask`/`denied` states with their pills, and the meeting time redrawn in `ink`
rather than `brass` (decided 2026-10-11 — see the note below the frame in
`-a.html`; `brass` is now the stripe only, everywhere in the signed-in app, and
this closes STYLE.md's own "known gap" line for this text, which should be
removed in the same PR)._

### Design read

**What already exists and has to be preserved.** `briefing-card.tsx` (as
read in this worktree, pre-#133) draws one meeting per card: a time, a title,
a flat list of `person` rows, and the ambiguous-name sentence the brief is
replacing (§7, "Gone"). `review`'s `name-choice` already solves almost the
same problem — pick one of several candidates sharing a name — as a flat,
always-visible list of cards with a meta line, no default selection, no
sheet. `confirm-dialog` is the app's only modal surface today, reserved for
yes/no and three-way *confirmations* (mute, sign-out, delete, sync conflict),
never for picking from an open set of named options — reusing it for the pick
would be its first use as a chooser rather than a confirmer.

**The user's task.** Someone glancing at the card before walking into a room
has two things they might need, often together: "which Priya is this" (a
question that blocks nothing else and is answered once per event, ever,
per R-P1–R-P2) and "what's after this" (a second or third meeting that today
is simply invisible, per #12/#14). The design has to make clear that these
are independent — answering the Priya question doesn't page you anywhere,
and paging doesn't lose an unanswered Priya question (R-C5's exception) —
without the card reading as two unrelated features bolted together.

**Constraints carried into every option:** `brass` stays the stripe only;
no `alert` (nothing here is destructive — a pick is undone in one tap, R-P4);
every tap target ≥44×44pt; position shown as text, not dots alone (R-C8);
no auto-advance, ever (R-C7); page changes have no motion to need reducing —
simplest compliance with "Reduce Motion: instant, or a cross-fade" is to
have no animation at all, which is what all three options below do, rather
than building a cross-fade just to then disable it; every new text/colour
pairing states its ratio under Recommendation.

**Where the brief leaves real design freedom.** The brief (R-P1–R-P10,
R-C1–R-C8) is prescriptive about *what* each state contains and *what*
every rule does to data and reminders — not about *how* a candidate list
is reached (inline vs. a tap away) or *how* a second meeting is reached
(step vs. jump vs. browse-at-a-glance). Those two axes are the real fork,
and they interact: an inline, always-open pick block is tall, which matters
more or less depending on whether the carousel also wants vertical room for
a multi-page strip or keeps the card to one page's height at a time. The
three options below are built around that interaction, with a consistent
(but on the picker/carousel axis, genuinely different) answer to both halves
at once.

### Option A — Inline, always open (recommended)

**Concept.** Every candidate, every page's content, and the "N of M" pager
are always fully visible — no sheet, no accordion. Paging is two 44×44pt
chevron buttons flanking the position text, placed once at the bottom of the
card (`briefing-card-pager`); the pick block (`briefing-card-pick`) sits
inline wherever an ambiguous name would otherwise be a resolved
`briefing-card-person-link`, laid out exactly like `name-choice` on `review`.

**Why it may work (hypothesis).** *Recognition over recall, and Jakob's Law
applied internally* — a tester who has already seen "which Marcus?" on
`review` recognises the same shape here without re-learning it; nothing is
hidden behind a tap, so the brief's own hypothesis (b) — *no default,
candidates that show how you know each one* — is testable exactly as
written, because the candidates are visible the instant the card is. Test:
does anyone in TestFlight tap a wrong Priya because a candidate's meta line
wasn't visible before they committed? (Kills (b) if so — unlikely here, since
nothing is hidden.)

**Strengths.** Lowest build cost of the three — no new modal, no new
expand/collapse state machine, nothing to make Reduce-Motion-safe beyond
"don't animate." Every name the brief proposes (§5, §6, "Names (new)") maps
onto this option with no renaming and no restructuring — this is close to
"apply the pattern the brief already specified," which is itself a signal
it's the lower-risk choice. Consistent with the owner's own prior choice on
this exact card: `calendar-connection.md`'s Option A ("visible state rows,"
chosen 2026-10-08) was the same bet — show everything, no disclosure — for
the settings half of this same component; choosing A again here keeps one
house style for "how `briefing-card` and its neighbourhood ask questions,"
rather than two.

**Weaknesses / risks.** The card can get tall: one page with two ambiguous
names (the brief's own edge case, shown in `-a.html`'s toggle) stacks two
full pick blocks before the pager. STYLE.md's and the brief's own rule
(R-C8, Dynamic Type) explicitly sanctions this — "nothing is cut off… the
profile list below moves down instead" — so it's a named, accepted
trade-off, not an oversight, but it is real scroll distance on a small
phone at the largest text sizes. Mitigated by the fact that only the
*current* page's content renders at all (not all pages at once), so the
worst case is bounded by one meeting's own ambiguity, not by how many
meetings are in the window.

**Design-system impact.** No new component. Reuses `briefing-card`'s
existing pill/quiet-text button styles, `name-choice`'s established
candidate-list shape (new to this file, not new to the app), and the
mute button's 44×44pt icon-button treatment for the two chevrons. No new
tokens.

### Option B — Compact question + sheet, jump-to-page pager

**Concept.** An unanswered ambiguous name collapses to one line —
`briefing-card-pick-question-button`, "Which Priya is this? ›" — that opens
a new modal, `briefing-card-pick-sheet` (the `confirm-dialog` card shape over
a scrim, but as a chooser rather than a confirmer — a genuinely new use of
that visual language). The pager gains small numbered buttons
(`briefing-card-page-number-button`) alongside the chevrons, so any page is
reached in one tap rather than N steps.

**Why it may work (hypothesis).** *Progressive disclosure / Hick's Law* —
the card's resting state, unanswered, shows one line instead of up to four
(label, note, two candidates, Neither), which matters more as candidate
count grows past two (the brief's own "three or more, no cap" edge case).
*Jakob's Law, applied externally* — action-sheet pickers are a common iOS
pattern. Test: does hiding the candidates until the sheet opens change
whether testers pick correctly, or does it just add a tap with no
behavioural effect (i.e., does hypothesis (b) hold just as well behind a
sheet as inline)?

**Strengths.** Shortest card height in the unanswered state — useful if a
future meeting has many candidates sharing a name (uncapped per the brief).
A modal sheet gives VoiceOver a focused, trapped context for free, which can
make the "every candidate reachable, in order" requirement (R-C8) easier to
guarantee than scanning a long inline list.

**Weaknesses / risks.** The jump-to-page numbers do not scale to the
brief's own stated cap: `-b.html`'s 6-meeting state already needs ~350pt of
the card's ~342pt usable width at compliant 44×44pt targets, and R-C1 allows
up to 10. Past a small count, the pager would have to silently become
chevrons-only, which means two different pager UIs depending on count — more
states to spec and QA, not fewer. The sheet introduces a second place in the
app that turns a name into a person (the first is `name-choice` on
`review`), which is exactly the seam `CLAUDE.md`'s `namesOf` rule exists to
guard — not a defect by itself, but a new surface `security-reviewer` and
the implementer have to keep in sync with the inline pattern rather than
one shared piece of markup. Hiding the meta line until the sheet opens also
works *against* the brief's hypothesis (b) being cleanly testable, since
"no default" is easiest to trust when the candidates were visible the whole
time, not revealed by the same tap that might commit to one.

**Design-system impact.** New: a picker-flavoured instance of the dialog
surface (`briefing-card-pick-sheet`), with its own lock-aware modal-host
wiring (the `ConfirmHost(inModal)` unmount-under-lock behaviour
`confirm-dialog.tsx` already has to coordinate with); a new
jump-to-page control. Highest build cost of the three.

**Context where it would be the right choice.** If candidate counts
routinely ran past three or four, or if a future version wanted an even
richer candidate row (a photo, a longer note excerpt) that would crowd an
inline card — neither is true for this brief's data (one line of meta, a
realistic cap of two or three people sharing a first name).

### Option C — Meeting strip + expand-in-place

**Concept.** Every meeting in the window is shown as a small chip
(`briefing-card-meeting-chip`, time + name) in a horizontal strip
(`briefing-card-meeting-strip`) above the focused meeting's detail; tapping
a chip swaps the detail below it — browsing, not stepping. An ambiguous
name collapses to a toggle row (`briefing-card-pick-toggle`) that expands
downward in place (no modal) to show the candidates.

**Why it may work (hypothesis).** *Gestalt grouping / recognition over
recall, aimed squarely at the brief's hypothesis (c)* — "testers don't find
the second meeting without being told" is answered most directly by making
every meeting visible without any tap at all, rather than inferring a
hidden second page from a "1 of 3" text that first has to be noticed and
read. Test: in TestFlight, does anyone with a 3-meeting window reach Emily's
briefing without being told the strip exists?

**Strengths.** The only option where "11:00 Priya and 11:05 Emily can both
be read before 11:00" (brief §2's success criterion #2) is true without any
interaction — both are visible at once, which is the most literal reading
of that line in the whole brief.

**Weaknesses / risks.** Two real, separable costs. First: a horizontal
scroll strip living inside a card that itself sits inside a vertically
scrolling `home` is a nested-scroll gesture conflict on iOS, and R-C8
("swiping is never the only way to reach a page") means a second, linear
VoiceOver path has to be built and tested *in addition* to the strip, not
instead of it (`-c.html`'s toggleable "Previous meeting / Next meeting"
pair demonstrates this — it is a second navigation surface, not a
convenience). Second, and sharper: expand-in-place *adds* a tap to the
single highest-priority action the card has — unlike `calendar-connection`'s
accordion option (which collapsed a status line someone would read once and
leave), here the question is the reason the card exists, so collapsing it
by default trades calm for friction on exactly the task the brief says must
have *minimum* friction (§1, "one tap tells Andy which Priya").

**Design-system impact.** New: a horizontal chip-strip primitive with a
required linear fallback path, and an expand-in-place accordion distinct
from `confirm-dialog`'s whole-screen modal pattern. Highest combined
complexity of the three once the required accessibility fallback is
counted, for a browsing benefit that's genuinely valuable only if hypothesis
(c) is actually killed by testers in Option A's simpler pager.

**Context where it would be the right choice.** If the owner's own week of
use (or TestFlight) kills hypothesis (c) under Option A — i.e., people
really do miss the second meeting with "1 of 3" visible — this is the
direct fix to reach for, not a first guess ahead of that evidence.

### How each option answers the brief's open questions (§10)

1. **M2 (the invitation settles the title's ambiguous name)** is a matching
   rule in `convex/calendarMatch.ts`, not a screen decision — identical
   under all three options. All three show the result of M1–M3 the same
   way: a name M2 already resolved never reaches a pick block at all.
2. **R-P5 (no reminder until a Priya is picked)** — same across all three;
   none of them puts a reminder control inside the pick block or sheet, so
   nothing here changes whether this is testable.
3. **R-P6 ("Neither" keeps the meeting, with Change)** — every option keeps
   `briefing-card-pick-none-line` + Change visible on the page itself
   (A, inline always; B, after the sheet closes; C, after the toggle
   collapses) — in no option does "Neither" require reopening anything to
   find Change again.
4. **R-P8 (off-in-Andy keeps picks; sign-out/deletion clear them)** — a data
   rule, invisible on screen in all three; no option surfaces a picks list
   (explicitly out of scope, §9) so none of them risk re-opening it.

### Recommendation

**Option A.** It is the cheapest to build, the one whose markup matches the
brief's own named parts without renaming anything, the one most consistent
with an established in-app pattern (`name-choice`) rather than inventing a
new modal use or a new nested-scroll primitive, and it is the most literal,
lowest-risk way to satisfy R-C8's accessibility rules (nothing to keep in
sync between a visible state and a hidden one, because nothing is hidden).
It is also the same bet the owner already made for this card's settings
half seven days ago (`calendar-connection.md`), which argues for consistency
over re-opening the question. Option B is the right call if real candidate
lists grow past two or three names or a richer candidate row is wanted later;
Option C is the right call specifically if hypothesis (c) is killed — if
testers really do miss a second meeting under A's simple pager, despite
"1 of 3" being visible text. Neither condition holds yet; both are
revisit-on-evidence, not now.

**Interaction states, end to end (Option A), on top of PR #133's card:**

- **Single meeting (brief §3, "drawn like today"):** no `briefing-card-pager`,
  no position text — identical to a one-page carousel with the pager hidden,
  so there is exactly one code path for "the current page's content," not two.
- **Carousel, 2–10 meetings:** `briefing-card-page` holds one meeting's time,
  title, and either `briefing-card-person-link` rows or `briefing-card-pick`
  blocks (one per ambiguous name on that meeting, stacked); below all pages,
  card-level and rendered once regardless of which page is showing:
  `briefing-card-pager` (`briefing-card-previous-button` /
  `briefing-card-page-position` "`{i} of {n}`" / `briefing-card-next-button`,
  each previous/next 44×44pt, disabled — `aria-disabled`-equivalent,
  `accessibilityState={{ disabled: true }}` — rather than hidden, at the
  first/last page so the control never jumps around under a finger) and the
  `briefing-card-reminder-button`/blocked line (R-C4: about notifications,
  not about one meeting, so it never re-renders per page).
- **Pick, unanswered:** `briefing-card-pick-label` ("Which {Name} is this?"),
  `briefing-card-pick-note` (hint), each `briefing-card-pick-choice` (name +
  `briefing-card-pick-choice-meta`), `briefing-card-pick-neither` ("Neither
  of them") — tapping any of these commits at once (R-P4, no dialog).
- **Pick, picked:** the chosen candidate as `briefing-card-person-link`, plus
  `briefing-card-pick-change-button` ("Not this {Name}?") beneath it, which
  returns to unanswered — never defaults back to the previously-picked
  candidate (R-P10).
- **Pick, "Neither":** `briefing-card-pick-none-line` + inline Change,
  returning to unanswered.
- **Two ambiguous names on one meeting** (brief §8 edge case, shown in
  `-a.html`'s toggle): two independent `briefing-card-pick` blocks, stacked,
  each answered separately — never a shared Neither or a shared candidate
  list.
- **R-C5 (meeting starts while the app is open):** page content is filtered
  by a timer re-checking `startsAt`; if the page removed was mid-pick, the
  removal is deferred until the pick resolves (inline, so "mid-pick" is
  simply "the pick block is still showing its unanswered state" — no extra
  flag needed to detect this, unlike a sheet/accordion option where
  "mid-pick" would also have to mean "the sheet/accordion is open").
- **VoiceOver order:** mute button → time → title → (person links / pick
  blocks, in the order they appear) → previous button → position text →
  next button → reminder button. Previous/next are two separate elements
  (not one `adjustable` control), matching the mute button's existing plain
  two-state pattern rather than introducing the `adjustable` trait
  elsewhere unused in this app; each page's container carries a combined
  label ("Meeting 2 of 3, 11:05, Coffee with Emily") so landing on a new
  page after Next/Previous announces all three at once, per R-C8.
- **Reduce Motion:** page and pick-state changes are an instant content
  swap in both mocked and real versions — there is no animation to turn off
  (the simplest compliant answer, not a cross-fade disabled under Reduce
  Motion, since nothing here needs motion to begin with).

**Components and tokens.**
- Reused as-is: `briefing-card`'s existing pill (`colors.moss` fill,
  `colors.paper` text, `radius.pill`) and quiet-text (`colors.ink` at
  `textOpacity.quiet`) button styles; `name-choice`'s candidate-row shape
  (new to this file, established elsewhere); `colors.line` as a decorative
  divider between choice rows (not the sole indicator of interactivity —
  full-width `Pressable` rows with `accessibilityRole="button"` carry that,
  the same way `profile-row` already relies on layout and text, not its
  hairline, to read as a row); `space.*`, `textSize.*`, `radius.pill`,
  `textOpacity.quiet`/`secondary`; `fonts.display` (titles), `fonts.utility`
  (time, meta lines) — all unchanged from `briefing-card.tsx`.
- New, no new tokens: the two 44×44pt chevron buttons reuse the mute
  button's icon-button shape (centred glyph in a fixed-size `Pressable`,
  `colors.ink` at `textOpacity.quiet`) rather than inventing a second
  icon-button treatment.
- Not extracted into a shared component this slice: `briefing-card-pick`'s
  layout is visually close to `name-choice` but not identical (no "View"
  link, no "Someone new," different copy) — noted as a candidate for a
  shared `<CandidateList>` primitive if a third picker ever appears, not
  built now, per "don't over-abstract a component used once/twice."

**Accessibility (ratios against this file's token hex values, same method
as `__tests__/contrast.test.ts`):**
- `ink` (time, titles, pick labels, choice names) on `paper`, full opacity:
  **12.0:1** — unchanged pairing, now also used for `briefing-card-when`
  (moved off `brass`'s 2.28:1, per the 2026-10-11 decision carried into
  every option here).
- `ink` at `textOpacity.quiet` (0.7) on `paper` — pick notes, meta lines,
  the "Neither of them" row, disabled chevrons' glyph, `pick-none-line`:
  **5.0:1**, STYLE.md's own documented floor, reused rather than a new ratio.
- `moss` on `paper` — `briefing-card-pick-change-button`, the inline
  "Change" in `pick-none-line`: **4.58:1**, the same pairing already
  recorded in `calendar-connection.md`'s Options for this card's other
  buttons; needs a row in `__tests__/contrast.test.ts` if it isn't there yet
  from that slice.
- `paper` on `moss` (the person-link's implicit background is none — this
  pairing isn't used in Option A at all, since choice rows have no fill;
  listed here only to confirm it was considered and rejected as unnecessary).
- Touch targets: every `briefing-card-pick-choice`, `-pick-neither`, and
  `-pick-change-button` gets `minHeight: 44` the same way `confirm-dialog`'s
  `plain` button does, independent of its visible text size at default
  Dynamic Type; the two pager buttons are fixed 44×44pt regardless of text
  size (their glyph does not reflow).
- Meaning never depends on colour alone: a picked vs. unanswered vs. "none"
  state is carried by which text and buttons are present (a label, a
  person's name, or a none-line), never by colour; the disabled chevron at
  the first/last page is marked `accessibilityState={{ disabled: true }}`,
  not conveyed by dimming alone.
- Dynamic Type: no fixed-height containers; a long pick note or a long
  candidate name wraps and pushes the rest of the page down, same as every
  other text block in this card today — nothing is clipped.

**Open disagreement: none.** Nothing in the brief makes a design worse here
— R-P1–R-P10 and R-C1–R-C8 are specific enough that this slice is closer to
"apply a prescribed pattern" on the data/rules side, and the genuine design
freedom (inline vs. sheet vs. strip) doesn't conflict with any business
rule either way.

**Questions for the owner, surfaced by choosing between options (not by the
brief itself):**
1. Is Option A's "card can get two pick-blocks tall" an acceptable look, or
   should the two-ambiguous-names edge case (rare, per the brief) get a
   different treatment even under A — e.g., answering one collapses it to
   a one-line `person-link` before showing the second? (Default assumed:
   acceptable as shown in `-a.html`, since STYLE.md's own Dynamic Type rule
   already sanctions a growing card.)
2. Confirm the previous/next-as-two-buttons VoiceOver choice (vs. one
   `adjustable` pager) — R-C8 leaves this explicitly to the designer, flagged
   here only because it's a first in this app and worth the owner's eyes
   once, not because the brief is ambiguous about it.

### New names (for `docs/design/component-names.md`, beyond the brief's own list)

All of the brief's "Names (new)" list (§ above) is adopted as-is under
Option A, with no renames. Added by this pass, for parts the brief's copy
section describes but Option A's build needs a name for (following the
precedent of `confirm-dialog-title`/`-body`, `briefing-card-title`/`-body`):
none — Option A needed no part the brief hadn't already named. (Options B
and C each would have needed their own additional names —
`briefing-card-pick-question-button`, `briefing-card-pick-sheet` with
`-title`/`-note`/`-choice`/`-neither`, `briefing-card-page-number-button`
for B; `briefing-card-meeting-strip`, `briefing-card-meeting-chip` with its
`--selected` state, `briefing-card-pick-toggle`, `briefing-card-pick-detail`
for C — listed here only so they exist if the owner picks either of those
instead, not added to `component-names.md` unless chosen.)

## Final design

**Option A — inline, always open.** Chosen by the owner, 2026-10-11.

The open questions were settled on the recommended side. The owner chose A
after reading them, and none were overturned:

- **§10.1 M2:** yes. The attendee list settles the title's shared name. Only the
  attendee list does: a second Priya in the title, or a second attendee "Priya",
  is still asked about.
- **§10.2 R-P5:** no reminder until a Priya is picked.
- **§10.3 R-P6:** "Neither of them" keeps the meeting on the card, with **Change**.
- **§10.4 R-P8:** turning the calendar off in Andy keeps the picks. Only sign-out
  and deletion clear them.
- **Designer Q1:** two pick blocks stacked on one page is acceptable as shown in
  `-a.html`.
- **Designer Q2:** previous and next are two separate buttons, not one
  `adjustable` pager.

Build order, confirmed by the owner:

1. Matching rules M1–M3 and M5 (`convex/calendarMatch.ts`), PR #141.
2. Picks stored on the phone (R-P1–R-P8), after #134.
3. The pick on the card, after #133.
4. The carousel (R-C1–R-C8), after #133 and #134.

Each slice adds its own names to `docs/design/component-names.md` when it builds
the part.
