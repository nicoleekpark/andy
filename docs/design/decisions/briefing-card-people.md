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
