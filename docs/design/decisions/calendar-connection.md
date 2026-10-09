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
| 2 | Ask at the point of use, less heavily | Designed — Option A chosen, to build |
| 3 | Connect later, after "Don't Allow", and disconnect | Designed — Option A chosen, to build |
| 4 | Mute from the card (X) | Designed — Option A chosen, to build |
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

## Options

_`product-designer`, 2026-10-08. Covers build-order steps 3–4: the
`briefing-card` changes (R1–R17) and the new `settings` → `calendar-section`
(R18–R22). Mocks: `docs/design/mocks/calendar-connection-a.html` (recommended),
`-b.html`, `-c.html`._

### Design read

**What already exists and has to be preserved.** `briefing-card.tsx` already
draws four states (`ask`/`denied`/`empty`/`ready`) with the stripe as the
app's one signature colour, a `Pressable` pill for the one forward action,
and a plain-text link for the reminder ask. `confirm-dialog.tsx` already
draws every alert in the app (`note-delete-alert`, `sign-out-alert`,
`sync-conflict-alert`) as a `paper` card over a `scrim`, actions stacked as
full-width pills with `Cancel` last and plain. `settings.tsx` today is a
placeholder with exactly two rows (`sign-out-button`, bordered; `account-delete-button`,
plain `alert` text) — there is no section system yet, so `calendar-section`
is the **first real section** this screen gets.

**Where the brief leaves real design freedom, and where it doesn't.** The
brief (R1–R22) is unusually prescriptive — it already fixes the mute
control's shape (`confirm-dialog`, three named buttons), which states carry
the X, what every state's copy says, and that there is exactly one calendar
switch with three values. That means the `briefing-card` side of this slice
is close to "apply an established pattern": the open questions are button
*placement and weight* (how "Connect calendar" and "Not now" sit next to
each other; how the lone "Open iPhone Settings" button in the denied state
is weighted), not the interaction model. The real fork is `calendar-section`:
nothing like it exists in `settings` yet, so how a three-state, five-row
permission control reads as a settings section is a genuine, consequential
choice — new users of this exact pattern will see it every time `settings`
grows. The three options below are built around that fork; each carries a
consistent (but, for the reasons above, minor) treatment of the card so the
whole slice reads as one option end to end.

**The user's task.** Someone who got "that calendar ask felt heavy" has three
possible intents when they reach for a control: connect (if not yet),
quiet it temporarily without losing the setup, or turn it off/on outright.
Each has to resolve in the fewest taps, and the control must never *look*
like it does one thing while doing another (R9's silent half-mute,
R17's rejected second switch) — the biggest UX risk here is a control whose
visual state and actual behaviour drift apart under the three-switches
model in the brief.

**Constraints carried into every option:** `brass` stays only on the
Briefing card's stripe/timestamp (not reused in `settings`); `alert` is not
used anywhere in this slice (muting and turning off are reversible, not
deletions — STYLE.md reserves `alert` for the three deletions); every new
control is drawn from `colors`/`space`/`textSize`/`radius`/`textOpacity`,
no raw numbers; every tap target ≥44×44pt; every new text/background pairing
states its ratio (below).

### Option A — Visible state rows (recommended)

**Concept.** `calendar-section` shows every control for the current state at
once — one status sentence, then its buttons — with no toggle and no
disclosure, styled with the weights the app already uses: a `moss` filled
pill for the one way forward, `moss` plain text for a reversible but
intentional action, `ink` at `textOpacity.quiet` for the rare "remove it
completely" escape hatch. The card gets a top-right X (`briefing-card-mute-button`)
and `Connect calendar` / `Not now` laid out inline, pill first.

**Why it may work (hypothesis).** *Recognition over recall* — the whole
section is scannable without a single tap, so "how do I turn this off" (the
brief's own success metric) is answered by opening Settings, not by also
guessing that a row has to be expanded or that a switch's third position is
hidden somewhere. *Jakob's Law, applied internally* — it matches `settings.tsx`'s
own existing two rows (bordered/plain text, not native chrome), so the first
real section doesn't introduce a visual language the rest of the screen
doesn't have yet. Test: in TestFlight, does anyone ask "how do I turn this
off" after opening Settings → Calendar once? (Brief's success metric #1.)

**Strengths.** Lowest build cost — no new interaction primitive, only new
content inside the shape `settings.tsx` already has. Every state in R18–R22's
table maps to visible markup 1:1, so a reviewer can check the spec against
the screen without exercising any control first. Three-tier text weight
(pill > moss text > quiet ink text) reuses existing tokens meaningfully
instead of inventing a fourth colour.

**Weaknesses / risks.** Doesn't scale gracefully if `settings` grows several
more sections later (each becomes its own small stack of rows with no shared
chrome) — not a V1 problem, since this is the only section, but worth
naming now so it isn't accidentally treated as "the" pattern without
revisiting it. The status sentence is the only thing separating five states
visually; if a tester skims, "On" and "Off" differ only in the sentence's
first word and which button follows — mitigated by the sentence always
leading with the word On/Off/Muted (a Von-Restorff-style lead word), but
worth QA'ing at a glance, not just by reading.

**Design-system impact.** No new component — reuses the `confirm-dialog`
pattern (unchanged) and two button weights the app already has (the existing
`moss` pill from `briefing-card`'s own `action`/`actionLabel`, and plain
`ink`/`textOpacity.quiet` text from `confirm-dialog`'s `plain`/`plainLabel`).
Formalises a `moss`-plain-text weight as a *second* tier between the pill and
the quiet tier — see token note below.

### Option B — Native grouped list + Switch

**Concept.** `settings` grows an iOS-style grouped-table card (inset rounded
group, inset rows, hairline dividers) and the On/Off half of the control
becomes a real `Switch`, coloured `moss` when on. Muted-for-today replaces
the switch's row with a status banner ("Muted until tomorrow · Turn back
on") rather than trying to make the switch show a third position.

**Why it may work (hypothesis).** *Jakob's Law, applied externally* — a
`Switch` next to "Calendar" is the single most recognised control on iOS for
exactly this job (it is literally how iOS's own Settings → Calendar accounts
list reads), so no explanation is needed for what flipping it does. Test:
do testers reach for the switch before reading the sentence next to it?

**Strengths.** Zero learning cost for anyone who has used an iPhone.
`Switch` ships with a correct 44pt+ target and its own accessibility role for
free.

**Weaknesses / risks.** The three-state model doesn't fit a binary control
cleanly: while muted, the switch still has to read "on" (the calendar
*connection* is on; only its effect is paused) while a separate banner says
"muted" right next to it — exactly the kind of "control's visual state and
actual behaviour drift apart" risk flagged in the Design read, and the
mock makes this concrete (see `-b.html`, `data-section="muted"`). It is also
the biggest visual swing in this slice: STYLE.md's Grounding explicitly
steers away from looking like "a corporate CRM" or an off-the-shelf utility
app, and this app's own screens (including today's `settings.tsx`) don't use
inset grouped-table chrome anywhere else — adopting it here means either
introducing it as a second visual language just for this one section, or
committing to re-skinning every future settings row the same way, which is a
bigger decision than this slice.

**Design-system impact.** New: a grouped-row primitive, an inset-card
container, and a themed `Switch` (needs its `trackColor`/`thumbColor`
checked against `colors.moss`/`colors.paper`/`colors.line` for the 3:1
control-edge minimum). Highest build cost of the three.

**Context where it would be the right choice.** If `settings` is deliberately
heading toward looking like iOS's own Settings app throughout (a real
redesign direction, not implied anywhere in STYLE.md today) — not this V1.

### Option C — Progressive disclosure (accordion)

**Concept.** `calendar-section` collapses to one row — "Calendar" + a status
word ("On" / "Off" / "Muted until tomorrow") + a chevron. Tapping it expands
in place to show the same content as Option A. The card is unchanged from
Option A (the brief fixes its content either way — R4 requires `Not now`
beside `Connect calendar` always, so there's no disclosure surface to use
there).

**Why it may work (hypothesis).** *Progressive disclosure / Hick's Law* — a
person who isn't thinking about the calendar right now sees one calm line
instead of up to five, which keeps `settings` matching STYLE.md's "every
other screen stays plain" instruction as more sections arrive later. Test:
does collapsing the detail change anything measured by the brief's success
criteria, or only add a tap with no behavioural effect?

**Strengths.** Scales the best of the three if `settings` grows — every
future section is "one line, tap to open," a real, reusable pattern. Keeps
the settings list short at a glance.

**Weaknesses / risks.** Adds a tap to the one job this section exists for —
someone who has already navigated to Settings → Calendar has already
decided to look at it; hiding the controls behind a second tap is friction
with no corresponding benefit *this* V1, since there is exactly one section
to disclose. This is the over-engineering risk named in the brief's own
companion material: building for a multi-section future that isn't
scheduled. It also means the brief's state table (R18–R22) no longer
describes what's visible at a glance in `settings` — it describes what's
visible after one more tap, which is a small but real gap between the
written spec and the shipped screen.

**Design-system impact.** New: a `settings-section` accordion primitive
(collapsed summary + animated/expand detail, `accessibilityState="{expanded}"`,
reduced-motion-safe). Medium build cost — more than A, less than B (no
`Switch` to theme), but the first thing anyone adding a second settings
section later has to decide is whether to keep using it.

**Context where it would be the right choice.** If two or three more
settings sections were already planned for this V1 (they are not — see
`PROJECT_SCOPE.md`'s scope cut) or if `calendar-section`'s content were long
enough to overwhelm the screen on its own (it isn't: at most one status
line, one muted line, two buttons, one removal line and the reminders row —
six short lines).

### Recommendation

**Option A.** It is the only one of the three that is simultaneously
cheapest to build, the most internally consistent (matches `settings.tsx`'s
own existing two rows rather than introducing a second visual language or a
new accordion primitive this V1 doesn't need elsewhere), and the one where
the shipped screen and the brief's state table (R18–R22) are the same
document — a reviewer can check one against the other without touching
anything. Option B's native `Switch` is the right call the day `settings`
deliberately adopts iOS's own grouped-table look throughout; Option C's
accordion is the right call the day a second or third section needs the
screen to stay short. Neither condition holds yet.

**Interaction states, end to end (Option A):**

- `briefing-card--ask`: stripe; `briefing-card-mute-button` (X, top-right,
  44×44pt, label "Mute the briefing") always present; `briefing-card-title`
  "Before you walk in"; `briefing-card-body`; a new
  `briefing-card-permission-note` (quiet, smaller, the "iPhone will ask for
  full access…" line — kept visually distinct from the body since it's
  about the *next* screen, not this one); `briefing-card-connect-button`
  (pill, "Connect calendar" / "Asking…" while pending) beside
  `briefing-card-not-now-button` (plain text, "Not now"); a new
  `briefing-card-footnote` ("You can connect later in Settings.").
- `briefing-card--denied`: X; title; body; **one** button,
  `briefing-card-open-settings-button`, drawn as the pill (it is the only
  forward action in this state, so it gets the pill's weight, not the plain
  text it would get if it were a second-tier choice beside something else —
  Fitts's Law: the one path forward should be the biggest easy target, not
  styled smaller because today's code happens to draw this state with no
  button at all).
- `briefing-card--empty`: X; title "Nothing coming up"; body (Terminology
  fix: "anyone you've written about", not "keep notes about").
  `briefing-card--ready`: unchanged, X added, `briefing-card-reminder-button`
  copy only changes (20→10 minutes).
- X → `briefing-mute-alert` (a `confirm-dialog` instance): title "Mute the
  briefing?"; body is one of the brief's two variants, chosen by whether the
  card is currently showing a connected state (`ready`/`empty`) or not
  (`ask`/`denied`) — see Assumption 1 below;
  `briefing-mute-alert-today` and `briefing-mute-alert-indefinite`, both
  `moss` pills (R7: neither is destructive), **"for today" listed first** —
  a deliberate ordering, not alphabetical or brief-order-by-accident: it
  puts the easily-reversible choice where a stacked list of equal-weight
  buttons is most often chosen from, supporting the brief's own hypothesis
  (b) that an easy, reversible mute gets picked over a permanent one;
  `briefing-mute-alert-cancel` plain, last.
- `settings` → `calendar-section`, placed above `sign-out-button` (R18):
  section label "Calendar" (`calendar-section-label`, sentence-case value,
  drawn uppercase per STYLE.md); one `calendar-status-line` per state;
  `calendar-connect-button` / `calendar-off-button` / `calendar-unmute-button`
  / `calendar-open-settings-button` as specified in R18–R22's table, in the
  three text weights above; `calendar-muted-line` ("Muted until tomorrow ·
  Turn back on", the unmute action inline after the `·`, mirroring the
  existing `outbox-line`/`outbox-line-action` and
  `pending-line`/`pending-line-sync` pattern of a status line with its
  action appended rather than a fourth new pattern); `calendar-remove-line`
  + its own `calendar-open-settings-button`, always at `textOpacity.quiet`
  weight since it's the rare, not-the-point escape hatch; `reminders-row`
  (shown only On/Muted) with `reminders-status-line` and
  `reminders-on-button` / `reminders-open-settings-button` in the matching
  weights.

**States this covers (every state needs its own row in `QA.md`, per the
brief's success criterion #3):** `briefing-card` × {ask, denied, empty,
ready} × {X not pressed, X pressed → dialog → each of the 3 buttons};
`calendar-section` × {not asked, refused, on, muted, off} × `reminders-row`
× {not asked, allowed, refused} where shown. Loading: before the remote
switch/module/first note copy is known, both the card (existing `"unavailable"`
state, R1) and `calendar-section` (new: hide until the flag is known, same
null-until-known pattern) show nothing — never a flash of the wrong state.
Offline: both work fully offline (R22) since the setting, the iOS permission
and the matching are all on-device; no network-error state is needed for
either, because nothing in this slice calls the network (`Linking.openSettings`
and the native permission check are both local and effectively can't fail
in a user-visible way — deliberately no error UI for them, not an omission).

**Components and tokens.**
- Reused as-is: `confirm-dialog` / `useConfirm` (unchanged — `briefing-mute-alert`
  is a new *instance*, not a new dialog component); `colors.moss`,
  `colors.paper`, `colors.ink`, `colors.line`; `space.xs/sm/md/lg/xl`;
  `textSize.sm/md/base/lg/xl/xxl`; `radius.pill`; `textOpacity.quiet` (0.7),
  `textOpacity.secondary` (0.8); `fonts.display` (card title only, unchanged).
- New, but no new tokens: a second **text-weight tier** — `colors.moss` at
  full opacity, no background, for a reversible-but-intentional action
  (`calendar-off-button`, `calendar-unmute-button`, `briefing-card-reminder-button`
  already uses this look today, just unnamed). This is a *pattern*, not a
  token — it's `colors.moss` + no fill, already legal — but worth naming in
  `STYLE.md`'s Signature Element / button-language notes as "the second
  tier" so a future screen doesn't reinvent it as a fourth button style.
  No change needed to `theme.ts`.
- `calendar-section` is intentionally **not** extracted into a reusable
  `<SettingsSection>` component this slice — it has exactly one caller.
  Extract it when a second section is added, per "don't over-abstract a
  component used once."

**Accessibility.**
- Contrast (computed against this file's token hex values; same method as
  `__tests__/contrast.test.ts`): `ink` on `paper` 12.0:1; `moss` on `paper`
  (status-line links, `calendar-off-button`, `calendar-unmute-button`,
  `briefing-card-reminder-button`) **4.58:1** — passes AA for normal text
  (≥4.5:1), new pairing, needs a row added to `contrast.test.ts`; `paper`
  text on a `moss` pill (`briefing-card-connect-button`,
  `briefing-card-open-settings-button`, `calendar-connect-button`) **4.58:1**
  (same pair, reversed — already in use elsewhere in the app, e.g.
  `confirm-dialog`'s pill); `ink` at `textOpacity.quiet` (0.7) on `paper`
  — the X glyph and `calendar-remove-line` — **5.0:1**, STYLE.md's own
  documented floor, reused rather than a new ratio.
- Touch targets: X is a 44×44pt `Pressable` with the glyph centred inside it
  (not a 20pt glyph alone) — this is new; today's code has no X at all.
  Every text-only button (`calendar-off-button`, `reminders-on-button`, etc.)
  gets `minHeight: 44` via padding, matching `confirm-dialog`'s own `plain`
  button, not just its visible text size.
- VoiceOver: X keeps its existing decided label "Mute the briefing" (not
  "×" or "close"); `calendar-unmute-button` needs its own label distinct from
  the sentence it sits inside ("Turn back on", read by VoiceOver as its own
  element, not swallowed into `calendar-muted-line`'s text) — same pattern
  `outbox-line-action` already uses.
- Meaning never depends on colour alone: every state's identity is carried
  by its sentence's first word (On/Off/Muted/Refused) and by which buttons
  are present, not by colour — true in all three options, confirmed in A by
  construction (no colour-only status dot).
- Reduced motion: no new animation (Option A and B have none; Option C's
  accordion would need a reduced-motion-safe, non-animated expand, matching
  `use-thread-motion.ts`'s existing honouring of the system setting).
- Dynamic Type: `calendar-status-line` and the mute alert's body already use
  `ScrollView`-wrapped text in `confirm-dialog` (existing), so a long status
  sentence at the largest Dynamic Type size scrolls rather than pushing
  buttons off-screen; `calendar-section`'s stacked rows (not a fixed-height
  card) grow naturally with type size, which Option B's fixed-height
  grouped-table rows would have to be checked against specifically (one more
  reason this isn't the lower-risk choice for V1).

**Questions and assumptions (flag to product-strategist/owner if these are
wrong):**
1. The two `briefing-mute-alert` body variants ("connected" vs "not
   connected", per the brief's copy section) are assumed to key off whether
   the card is currently `ready`/`empty` (connected: reminders may exist) vs
   `ask`/`denied` (not connected: they can't). The brief names the two
   variants but doesn't spell out which card states map to which — this is
   a reasonable reading of "no reminders exist yet" but worth a one-line
   confirmation.
2. `calendar-section-label`, `calendar-status-line`, `calendar-remove-line`
   and `reminders-status-line` are new names this file didn't have on its
   "Names (new)" list — added below for exactly the parts the brief's own
   copy table describes but doesn't name (a status sentence and a
   explanatory sentence both need their own name, same as `briefing-card-body`
   and `note-source-hint` already do elsewhere).

### New names (for `docs/design/component-names.md`)

All from the brief's own "Names (new)" list, confirmed as-is:
`briefing-card--denied`, `briefing-card--empty`, `briefing-card--ready`,
`briefing-card-mute-button`, `briefing-card-not-now-button`,
`briefing-card-open-settings-button`, `briefing-card-reminder-button`,
`briefing-mute-alert` with `-today`, `-indefinite`, `-cancel`;
`calendar-section`, `calendar-connect-button`, `calendar-off-button`,
`calendar-muted-line`, `calendar-unmute-button`, `calendar-open-settings-button`,
`reminders-row`, `reminders-on-button`, `reminders-open-settings-button`.

Added by this pass (parts the brief's copy table describes without naming,
following the precedent of `confirm-dialog-title`/`-body` and
`briefing-card-title`/`-body` — a dialog or card gets a name for its heading
and its body, not just for its buttons):
`briefing-mute-alert-title`, `briefing-mute-alert-body` (two copy variants,
one name); `briefing-card-permission-note` (the "iPhone will ask for full
access…" line — new copy, not in today's card); `briefing-card-footnote`
("You can connect later in Settings."); `calendar-section-label` (the
section header "Calendar", same role as `tags-label`/`aliases-label`
elsewhere); `calendar-status-line` (the one On/Off/Refused/Not-asked
sentence — one name, four states' content, same pattern as
`briefing-card-body`); `calendar-remove-line` ("To take away access
completely…"); `reminders-status-line` (the row's one sentence across its
three states).

`briefing-card-connect-button` keeps its existing name with its new label
("Connect calendar"), per the brief.

### Suggested refactor (not part of this slice's scope, flagged while the
file is open)

`briefing-card.tsx` predates `space`/`textSize`/`radius`/`textOpacity`
(added 2026-10-08) and still uses raw numbers throughout —
`fontSize: 18/14/16/13/12` (these map exactly onto `textSize.xxl/md/lg/sm/xs`,
no judgement call needed), `opacity: 0.7/0.5/0.55` (0.7 already equals
`textOpacity.quiet`; 0.5 and **0.55 are below STYLE.md's own documented AA
floor of 0.7** — `personMeta`'s "1 note"/"nothing remembered yet" text is a
pre-existing contrast gap, already named in STYLE.md's "Known gaps" list,
not newly found here), `borderRadius: 10` (neither `radius` token — closest
named gap, not a new token to add, just a reminder it's unresolved), and
`marginHorizontal/marginBottom/padding*` as raw 24/20/18/16/14/12/10/8/4.
Since this slice already has to touch every style in this file to add the X
and the new buttons, STYLE.md's own rule applies directly — "existing
screens move onto it as they are touched, not in a sweep" — so the
implementation PR should move `briefing-card.tsx` onto the named tokens
(and raise `personMeta`'s opacity to at least `textOpacity.quiet`) as part
of this change, not as a separate cleanup later.

## Final design

**Option A — Visible state rows**, chosen by the owner on 2026-10-08. Build
exactly what `### Option A` above specifies, with the copy in `## Brief` →
`### Copy`, and the mock `docs/design/mocks/calendar-connection-a.html`
(hosted: https://claude.ai/artifact/JMdsALGQSJvqfBS6G5iJch).

Carried into the build, from the brief and the owner's answers:
- one stored state (on / muted until a stored local midnight / off), on this
  phone; the remote `calendarBriefing` switch still overrides everything;
- reminders scheduled to the end of the next local day (≤20 meetings), 10
  minutes before, and none for a meeting that starts while muted;
- no `briefing-card` while nobody is in Andy;
- the new names in `### Names` and Option A's additions go into
  `docs/design/component-names.md` in the build PR;
- `briefing-card.tsx` moves onto the tokens while it is being rewritten
  (its `opacity: 0.55` text is under the AA floor).

Separate, smaller PRs first: pending reminders cancelled on sign-out and
account deletion (R15), and the lead moved from 20 to 10 minutes.
