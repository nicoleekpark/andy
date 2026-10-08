# Calendar connection — decisions

The single place for how Andy connects to, uses, hides and lets go of the
calendar. Decided with the owner on 2026-10-08, from device QA build 4 #2
("asking for full calendar access as soon as the app opens feels heavy") and
the discussion it started. `product-strategist` / `product-designer` build on
this; a later change edits this file in the same PR.

Names follow `docs/design/component-names.md` (`briefing-card`, `home`,
`settings`, `confirm-dialog`).

## Status

| # | Decision | State |
|---|---|---|
| 1 | Ship the calendar briefing in V1, with a remote off switch | ✅ Built — #124 (`featureFlags`, key `calendarBriefing`; how-to in `INFRA.md` #6) |
| 2 | Ask at the point of use, less heavily | Decided — to design |
| 3 | Connect later, after "Don't Allow", and disconnect | Decided — to design |
| 4 | Mute from the card (X) | Decided — brief written, to design |
| 5 | Match names on the phone; the calendar never leaves it | ✅ Built — `convex/calendarMatch.ts`, used by `src/lib/use-briefing.ts`; `calendar.matchEvents` kept only for build 4 |

## 1. V1 keeps the briefing, with a remote off switch

The briefing is a Must-have and the product's own story (`PROJECT_SCOPE.md` →
"The Briefing"). Options weighed: keep it (A), keep it with a remote off switch
(B), cut it from V1 (C). **B chosen**: if it misbehaves at an event it is
switched off from the Convex dashboard, live, with no App Store resubmission.
Off means no card, no calendar read, and this app's scheduled reminders
cancelled.

**App Store review, assessed 2026-10-08:** a calendar adds a little, not a
lot. Purpose strings are already specific (both `NSCalendarsUsageDescription`
and `NSCalendarsFullAccessUsageDescription`), access is asked at the point of
use, and the app works when it is refused. Local notifications need no
special review. What remains is declaring data accurately in App Privacy —
which decision 5 removes for calendar data entirely.

## 2. When Andy asks

Industry patterns: an onboarding step with *Not now* (Notion Calendar,
Fantastical, Granola — calendar is the core), the first use of the feature
(personal CRMs such as Clay and Dex — Andy today), or Settings only (most work
apps; rarely found). Apple's guidance: ask in context, explain first; the iOS
prompt shows **once**, so an in-app explanation comes before it.

**Decided: keep asking at the point of use (the `briefing-card`), but lighter.**
- It must not be the first thing that dominates `home` for someone who has not
  written a note yet.
- It offers **Not now** beside the connect button.
- Since iOS 17 the only read access is *Full Access*, so the in-app
  explanation carries the weight the system sheet's wording cannot.

## 3. Connect later, refused, disconnect

| State | What the person can do |
|---|---|
| Never asked (Not now / muted) | `settings` → **Calendar** → **Connect** → the iOS prompt |
| Refused in the iOS prompt | iOS will not ask again, so **Open Settings** opens Andy's page in the iPhone Settings app (`Linking.openSettings`). Today the card only says so in words, with no button — to fix |
| Connected | `settings` → **Calendar** → turn off |
| Turned off in Andy | **Connect** turns it straight back on, no iOS prompt |

**An iOS app cannot give its own permission back.** "Disconnect" is two levels:
1. **Off in Andy:** stop reading the calendar, cancel this app's scheduled
   reminders, hide the card. Instant and reversible.
2. **Remove access entirely:** "Turn off Calendars for Andy in iPhone
   Settings", with **Open Settings**.

When "this meeting's Priya is this Priya" is remembered (device QA #10, using
`calendarLinks`), turning the calendar off has to say whether those choices
are forgotten. Open — decide with #10.

## 4. Muting from the card (X)

The `briefing-card` gets an X (≥44pt target, label "Mute the briefing"),
connected or not. It opens a `confirm-dialog`:

- **Mute for today** — until midnight, local time. Not 24 hours: the card is
  about today's meetings.
- **Mute until I turn it back on**
- Cancel

**Muting silences the card *and* the meeting reminders** for that period (the
owner's choice: "mute" means both). Rules that follow from it:
- The card disappears from `home` at once, and today's pending reminders are
  cancelled.
- *Mute for today* must not cost tomorrow's early reminders: reminders for
  meetings after midnight are still scheduled while muted, so a 08:00 meeting
  is reminded at 07:40 even if Andy is not opened before it.
- It comes back by itself after today, or from `settings` → **Calendar** →
  **Show on home** (while muted for today it reads "Muted until tomorrow ·
  Turn back on").
- Before connecting, *Mute until I turn it back on* is the same as **Not now**;
  connecting is then in `settings`.
- Stored **on this phone** (a display preference, like the lock): an iPad on
  the same account decides for itself.
- Separate from the remote switch in decision 1, which is the team's, not the
  person's.

## 5. Privacy — names are matched on the phone

Until build 5 the phone sent upcoming event titles and attendee names to
Andy's server (`calendar.matchEvents`), which matched them against the
person's own saved names and kept nothing. The iOS purpose string said so; the
card did not. From build 5 the matching happens on the phone, and the purpose
string and the card both say so.

Industry practice is data minimisation and on-device processing where it is
possible; Apple does not count data that never leaves the device as
"collected". Server-side calendar products (Calendly, Clockwise) disclose
instead, because the server is their product. Andy's is not: the names and
note counts it matches against are already on the phone (the offline copy),
and the matching is pure functions (`convex/calendarNames.ts`,
`convex/naming.ts`).

**Decided: match on the phone. The calendar never leaves it.**
- Then the promise is literal — "your calendar stays on your phone" — which is
  Andy's positioning (remembers, never collects).
- Calendar data drops out of App Privacy.
- The briefing works offline too.
- The purpose strings in `app.json` change from "matched against the people
  saved in your own Andy account" to "matched on this phone", in the same PR
  (re-run `app-store-reviewer`, since a permission string changes).
- **At submission (App Store Connect, not the repo):** App Privacy → Calendar
  is **Not Collected** — Apple counts only data transmitted off the device.
  If an earlier answer listed it as collected, correct it before `eas
  submit`. Build 4 still sends events to `calendar.matchEvents`, but it is a
  TestFlight build, not a submission.

## Build order

1. ~~Remote off switch~~ — #124.
2. ~~On-device matching (5) + purpose strings~~ — built. `calendar.matchEvents` stays until build 4 is retired, then goes with its tests.
3. Card: Not now, Open Settings when refused, X → mute dialog (2, 3, 4).
4. `settings` → Calendar section: Show on home, Connect / off, Open Settings;
   meeting-reminder timing (#9) belongs here too, if it is taken on.

Steps 3–4 go through `product-strategist` → `product-designer` (three options,
HTML mock) before code: they change a permission flow and add a `settings`
section.

## Out of V1

Choosing which calendars to read (work only, say). Every calendar synced into
iOS is read today; that is `PROJECT_SCOPE.md`'s decision and stays.

<!--
  For product-strategist / product-designer: the decisions above are fixed.
  Add `## Brief` and then `## Options` / `## Final design` below this line for
  steps 3–4 of the build order, as your instructions describe.
-->

## Brief

_`product-strategist`, 2026-10-08. Turns decisions 2, 3 and 4 into what
`product-designer` designs for build-order steps 3 and 4. Decisions 1–5 are not
reopened; where they leave a real gap it is under "Open questions" at the end._

### Problem and job

- **Who:** someone who already wrote about at least one person in Andy and has
  meetings in the iPhone Calendar.
- **Job:** "Just before I walk in, remind me what I wrote about who I'm
  meeting — and when I don't want that, get out of my way without a fight."
- **Problem today:** the `briefing-card` asks for full calendar access on the
  first `home` a new person sees (QA #2: "feels heavy"); after "Don't Allow" it
  has words but no way forward; once connected there is no way to quiet it
  (QA #5) or turn it off; `settings` has no Calendar section at all.
- **Smallest useful outcome:** every state of the calendar has exactly one way
  forward and one way out, each within two taps, and nothing about it is asked
  for before the person has a reason to say yes.

### Success criteria

Andy has no analytics (promise 4), so these are checked by device QA, the
owner's own use and TestFlight testers, not by a dashboard.

1. **One metric:** in the next TestFlight round, no tester reports the calendar
   ask as heavy, and none asks "how do I turn this off / back on".
2. On device, no reminder fires while muted or off in Andy, and a muted-for-today
   phone still gets tomorrow's first reminder without Andy being opened.
3. Every state below has its way forward and its way out (QA rows, one per state).

**Hypotheses, not findings.** (a) Asking only once someone has written about a
person, with an explanation before the iOS sheet, gets more "Allow" than asking
on an empty `home` — Fogg: motivation is near zero when there is nobody to be
briefed about, and iOS shows its sheet once (pre-permission priming). Confirmed
if testers who tap **Connect calendar** mostly allow; killed if they still call
it heavy. (b) An easy, reversible mute makes the card *less* likely to be
switched off for good than a card with no off at all — a control that is easy
to undo is used lightly (default effect: the default stays "on", the exit is
cheap). Killed if testers pick **Mute until I turn it back on** as their first
reaction to the X.

### The model: three switches, one place each

The rules below read cleanly only if these are kept apart:

| Switch | Values | Owner | Stored |
|---|---|---|---|
| Remote (decision 1) | on · off | the team | `featureFlags` |
| iOS calendar permission | not asked · refused · allowed · module missing | iOS | iOS |
| Andy's own setting (decisions 3, 4) | **on** · **muted until midnight** · **off** | the person | this phone |
| iOS notification permission | not asked · refused · allowed | iOS | iOS |

**Off in Andy, Not now, and Mute until I turn it back on are one value: off.**
Decision 4 already says the last two are the same before connecting; after
connecting, a mute that hides the card and silences every reminder has nothing
left to read the calendar for, so it is the same as decision 3's "off in Andy"
(and reading a calendar that nothing uses would be collecting by another name).
Three doors, one state, one way back (**Connect calendar**). See Open question 1.

### Rules — when the card shows

- **R1. Nothing shows** when the remote switch is off, when the calendar module is
  missing from the build, when Andy's setting is off, while muted, or while the
  first copy of the person's notes is still loading.
- **R2. No card while nobody is in Andy** — in any state, not just the ask.
  With no one to match against, the card can only ask for something it cannot
  use yet or say "nothing coming up" about an empty list. This is how decision 2's
  "must not dominate `home` for someone with no notes" is kept; how light the
  card looks once it does appear is the designer's call. The `settings` Calendar
  section is available regardless, so anyone who wants to connect first can.
- **R3. Every visible card state carries the X** (`briefing-card-mute-button`,
  ≥44pt, label "Mute the briefing"): ask, refused, nothing coming up, and a
  meeting.
- **R4. Ask state** (not asked, setting on): **Connect calendar** shows the
  iOS sheet; **Not now** sets the setting to off at once, with no dialog, and the
  card goes. The card says beforehand where to connect later, so Not now is never
  a surprise.
- **R5. Refused state** (iOS will not ask again — this includes someone who chose
  *Add Events Only* in iPhone Settings, which cannot read): **Open iPhone
  Settings** opens Andy's own page there (`Linking.openSettings`). When the person
  comes back with access allowed, the next foreground refresh shows the briefing
  without another tap.
- **R6. Meeting state:** unchanged, plus the X. Its reminder link
  (`briefing-card-reminder-button`) keeps asking for notifications at this
  point of use, as today.

### Rules — muting

- **R7. The X opens `briefing-mute-alert`** (a `confirm-dialog`): **Mute for
  today** / **Mute until I turn it back on** / Cancel. Neither action is
  destructive, so neither is drawn in `alert`.
- **R8. Mute for today** lasts until the next local midnight, computed at the
  moment of muting from the calendar date (not "+24 hours", which breaks across
  daylight saving) and stored as that instant. Travelling across time zones does
  not move it. It lifts at the first refresh after that instant; the card need
  not reappear at the stroke of midnight.
- **R9. What is silenced is decided by when the meeting starts, not when the
  reminder fires.** While muted for today, a meeting that *starts* before the
  stored midnight gets neither its reminder nor its nudge — even a 23:30–00:30
  meeting whose nudge would fire at 00:45. A meeting starting at or after it gets
  both, as usual. One rule, nothing half-silenced.
- **R10. On muting**, the card leaves `home` at once and this app's pending
  reminders are rescheduled under R9 (for today) or cancelled (until I turn it
  back on) before the dialog closes. Reminders from other apps are never touched
  (`cancelBriefings` already filters to Andy's own).
- **R11. Muting before connecting:** "for today" hides the ask card until
  midnight; "until I turn it back on" is Not now (R4).
- **R12. Mute at 23:59** means one minute. Kept literal: the label says "today",
  and `settings` says "Muted until tomorrow", which stays true. The person who
  meant "not this meeting" has **Mute until I turn it back on**.

### Rules — reminders and the calendar read

- **R13. Reminders look further ahead than the card.** The card shows the next
  12 hours; reminders must be scheduled from a longer read — at least to the end
  of the next local day — or decision 4's own example (the 07:40 reminder for an
  08:00 meeting, Andy not opened since the afternoon before) is not true *today*,
  muted or not. Still capped at 20 meetings (the 64-pending rule). Open question 2.
- **R14. When the calendar reads as refused**, on any refresh, this app's pending
  reminders are cancelled. Taking access away in iPhone Settings must not leave
  reminders already on the phone buzzing about meetings Andy can no longer see.
- **R15. Sign-out and account deletion cancel this app's pending reminders and
  clear the calendar setting on this phone**, alongside `forgetOnThisPhone`.
  Today they do neither: a reminder carries a person's name to the lock screen
  after the account that wrote about them has left the phone, and the next
  account would inherit "off" or "muted". _(For `security-reviewer` to confirm.)_
- **R16. Notification permission** is separate and asked only at the point of
  use — the card's reminder link, or the reminder row in `settings`. Never as a
  side effect of connecting the calendar.
- **R17. No in-app "reminders off, card on" switch.** Someone who wants the card
  but no buzz turns Andy's notifications off in iPhone Settings, which the row
  points to. One more switch would be one more state for every rule above.

### Rules — the `settings` Calendar section

- **R18.** A new section (`calendar-section`) in `settings`, above account
  actions. It is **not shown** when the remote switch is off or the module is
  missing (R1) — the person can still remove access in iPhone Settings directly.
- **R19. Off in Andy is instant and needs no confirmation**: stop reading,
  cancel this app's reminders, hide the card. It is undone by one tap, so a
  dialog would only make leaving harder than staying.
- **R20.** **Connect calendar** after off-in-Andy turns straight back on — no
  iOS sheet if access is already allowed — and refreshes at once, scheduling
  reminders without waiting for a foreground.
- **R21. Removing access completely** is always offered beside off-in-Andy, as
  a sentence and **Open iPhone Settings**, because an iOS app cannot give its
  own permission back.
- **R22.** Everything in the section works offline — the setting, the
  permission and the matching are all on the phone.

| State | `calendar-section` shows |
|---|---|
| Not asked (setting on or off) | explanation · **Connect calendar** |
| Refused | refused line · **Open iPhone Settings** |
| On | status · **Turn off in Andy** · remove-completely line + **Open iPhone Settings** · reminder row |
| Muted for today | "Muted until tomorrow · Turn back on" · rest as On |
| Off in Andy, access allowed | off line · **Connect calendar** · remove-completely line + **Open iPhone Settings** |

Reminder row (`reminders-row`), shown only in On and Muted for today:

| Notification permission | Row shows |
|---|---|
| Not asked | explanation · **Remind me 20 minutes before** |
| Allowed | status line |
| Refused | refused line · **Open iPhone Settings** |

### Copy

Sentence case; "you've written about", never "keep notes about"; "reads", never
"syncs", "accesses" or "collects". **One action, one name**: the card and the
section both say **Connect calendar** (the card's "Read my calendar" goes), and
both reminder buttons say **Remind me 20 minutes before**. On an iPad, every
"iPhone" below reads "iPad". "Open iPhone Settings", not "Open Settings": Andy
has its own `settings` screen, and the bare word sends people to the wrong one.

**`briefing-card--ask`**
- Title: `Before you walk in`
- Body: `Andy can read your calendar and show what you wrote about whoever you're meeting next. It reads on this phone — your calendar never leaves it, and nothing is added to it.`
- Before-the-sheet line: `iPhone will ask for full access. It's the only kind that lets an app read events.`
- Buttons: `Connect calendar` (while asking: `Asking…`) · `Not now`
- Footnote: `You can connect later in Settings.`

**`briefing-card--denied`**
- Title: `Before you walk in`
- Body: `Calendar access is off, so Andy can't see who you're meeting. To turn it on, choose Full Access under Calendars.`
- Button: `Open iPhone Settings`

**`briefing-card--empty`**
- Title: `Nothing coming up` (unchanged)
- Body: `No meetings in the next twelve hours with anyone you've written about.` (was "anyone you keep notes about" — Terminology)

**X** — accessibility label `Mute the briefing` (decided).

**`briefing-mute-alert`, connected**
- Title: `Mute the briefing?`
- Body: `The card leaves home and meeting reminders stay quiet. "For today" ends at midnight, so tomorrow's reminders still come.`
- Actions: `Mute for today` · `Mute until I turn it back on` · `Cancel`

**`briefing-mute-alert`, not connected** (no reminders exist yet, so none are mentioned)
- Title: `Mute the briefing?`
- Body: `The card leaves home. You can connect your calendar any time in Settings.`
- Actions: same three.

**`calendar-section`** (section label `Calendar`)
- Not asked: `Before a meeting, Andy shows what you wrote about whoever you're meeting. It reads your calendar on this phone — nothing leaves it, and nothing is added.` · `Connect calendar`
- Refused: `Calendar access is off for Andy. To turn it on, choose Full Access under Calendars.` · `Open iPhone Settings`
- On: `On — Andy reads your calendar on this phone.` · `Turn off in Andy`
- Muted for today: `Muted until tomorrow` · `Turn back on` (decision 4's wording)
- Off in Andy: `Off — Andy isn't reading your calendar, and no reminders are set.` · `Connect calendar`
- Remove completely: `To take away access completely, turn off Calendars for Andy in iPhone Settings.` · `Open iPhone Settings`

**`reminders-row`**
- Not asked: `Andy can remind you 20 minutes before a meeting, and ask afterwards what's new.` · `Remind me 20 minutes before`
- Allowed: `Reminders on — 20 minutes before, and a nudge after. They show a name, never what you wrote.` (promise 3, already true in `briefingText`)
- Refused: `Notifications are off for Andy.` · `Open iPhone Settings`

Notification text itself is unchanged (`briefingText`, `nudgeText`).

### Edge cases

- **iPad on the same account:** the setting, the mute, the iOS permissions and
  the reminders are all per device. Muting on the iPhone leaves the iPad as it
  was. Two devices can both remind about one meeting; that exists today and is
  not this slice's.
- **Mute at 23:59:** R12. **A meeting before midnight while muted for today:**
  R9 — no reminder, no nudge, whatever time they would fire.
- **Reminders already scheduled:** R10 (mute), R14 (access taken away), R15
  (sign-out), R19 (off in Andy). All cancel only Andy's own.
- **Remote switch flipped off while muted or off:** nothing shows; the person's
  setting is kept, and applies again when the switch comes back on.
- **Offline:** the card and the section both work (R22). Before the first copy
  of the person's notes has arrived, there is no card (R1).
- **Refused, then allowed in iPhone Settings:** picked up at the next foreground
  (R5); if the setting was off, it stays off until **Connect calendar**.
- **Allowed in iOS, setting off, then access taken away in iPhone Settings:**
  shows as Refused in `settings`; no card (setting is off).
- **Notifications refused, calendar on:** the card still shows; reminders simply
  do not arrive, and the card's and row's refused line says so.

### Not in this slice

- **Reminder timing (QA #9) — recommended out of V1.** It is not in Must Have;
  it is one tester's wish with no second data point; 20 minutes is a defensible
  default; and every rule above (R9, R13, the copy) would gain a variable. The
  section says "20 minutes" plainly so the fixed timing is visible rather than
  hidden. Revisit if a second tester or the owner's own week of use asks for it;
  if taken on, a short fixed list (5 · 10 · 15 · 20 · 30), stored on this phone,
  in `reminders-row`. **Taking it on is a scope change for the owner.**
- Choosing which calendars to read (Out of V1, above).
- Muting one meeting rather than the whole briefing.
- Syncing the mute or the setting across devices.
- An onboarding step for the calendar.
- Which of two Priyas a meeting means (QA #29–30) and remembering it (#10).
- Showing more than one meeting on the card (QA #33).
- An in-app reminders-only switch (R17).

### Names (new — to add to `docs/design/component-names.md` in the same PR)

`briefing-card--denied`, `briefing-card--empty`, `briefing-card--ready`
(states), `briefing-card-mute-button` (the X), `briefing-card-not-now-button`,
`briefing-card-open-settings-button`, `briefing-card-reminder-button` (the
existing "Remind me…" link), `briefing-mute-alert` with `-today`,
`-indefinite`, `-cancel`; in `settings`: `calendar-section`,
`calendar-connect-button`, `calendar-off-button`, `calendar-muted-line`,
`calendar-unmute-button`, `calendar-open-settings-button`, `reminders-row`,
`reminders-on-button`, `reminders-open-settings-button`. The designer may
rename these under the file's rules; the existing `briefing-card-connect-button`
keeps its name with the new label.

### Open questions for the owner

1. **"Show on home" vs. what it does.** Decision 4 names the control
   `settings` → Calendar → **Show on home**, but muting also silences reminders,
   so that label undersells it, and a separate "Show on home" next to "Turn off
   in Andy" would be two switches with the same effect. Recommended: one state
   (off), shown as the On / Muted / Off rows above, with "Muted until tomorrow ·
   Turn back on" kept word for word. Confirm, or say what "Show on home" should
   do that "Turn off in Andy" does not.
2. **Reminders read further ahead than the card (R13).** Needed to make decision
   4's 07:40 example true; it is a behaviour change to scheduling, not just to
   muting. Recommended: to the end of the next local day, still ≤20 meetings.
3. **Reminder timing (#9):** out of V1, as recommended above — or in, as a
   scope change.

### Owner's answers (2026-10-08)

1. **One control: On / Muted / Off.** "Show on home" is not a separate switch;
   "Muted until tomorrow · Turn back on" is kept word for word.
2. **Reminders are scheduled to the end of the next local day**, still ≤20
   meetings. The card keeps showing only the next meeting.
3. **Reminder timing stays out of V1** (QA #9 → V1.1 candidate), **but the
   fixed lead changes from 20 to 10 minutes before the meeting.** Every
   string that says "20 minutes" changes with it ("Remind me 10 minutes
   before ›"; the `settings` section says "10 minutes").
