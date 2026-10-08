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
| 4 | Mute from the card (X) | Decided — to design |
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
