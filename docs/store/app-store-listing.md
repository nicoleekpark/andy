# App Store listing: copy to paste at submission

Draft, 2026-10-15. It is ready to paste into App Store Connect on submission
day, but **every line is checked against the code first** (STYLE.md: a promise
is added after the code keeps it). The voice and the five promises come from
STYLE.md → Voice; the subtitle, promotional text and opening come from the
approved positioning brief (`dev-reports/positioning.dev.md` §5). The App
Privacy answers are in `docs/design/decisions/pre-submission-privacy.md`,
decision 3.

Never on the listing: *track, profile, data, database, contacts, leads, CRM,
manage relationships, never forget a face, know everything about.*

## Hard gates, checked immediately before `eas submit`

These are not things to do "sometime after build 6". Check each one on the day,
against the live system (app-store-reviewer, 2026-10-15):

1. **The production `aiPermission` row is gone.** Check with
   `npx convex data featureFlags --prod`. If it is still there, the reviewer
   tests a build where Andy sends notes without ever asking, which is exactly
   the 5.1.2(i) gap the permission sheet closes.
2. **The policy and support pages load.** GitHub Pages is on, both URLs open,
   and the policy's dates are filled in.
3. **Clerk is the production instance** (`pk_live` in the EAS `production`
   environment).
4. **Every line of the description holds** (the table below), and the App
   Privacy answers match the code.

## Fields

| Field | Limit | Copy | Length |
|---|---|---|---|
| Name | 30 | **Andy** (what was entered when the app was created for TestFlight. App Store names are unique; if it is ever re-entered and taken, *Andy: Remember People* is the fallback, 20) | 4 |
| Subtitle | 30 | **Remember what people tell you** | 29 |
| Promotional text | 170 | Say a few words after you meet someone. Before you see them again, Andy reminds you what they told you, so you can ask how it went. | 131 |
| Keywords | 100 | `notes,memory,meeting,reminder,voice notes,follow up,names,networking,conference,small talk,coffee` (the name and subtitle are indexed already, so "remember" and "people" are not repeated) | 97 |
| Support URL | — | `https://nicoleekpark.github.io/andy/support/` (`docs/support/index.html`) | |
| Privacy policy URL | — | `https://nicoleekpark.github.io/andy/privacy/` | |
| Category | — | Primary **Productivity**, secondary **Lifestyle** | |
| Availability | — | **United States only** (PROJECT_SCOPE reality check 13) | |
| Age rating | — | Answer the questionnaire honestly (no objectionable content, so it should come out **4+**). The policy says Andy is not *intended* for under-13s, which is about who it is for, not its content | |
| Copyright | — | © 2026 Eunkyung Park | |

## Description (4,000 limit)

> You met someone lovely, and they told you about their sister's wedding in Lisbon. Three weeks later, you'd like to ask how it went.
>
> Andy is a private notebook for the people in your life. Say or type a few words after you meet someone, or take a photo of their card or a page of notes. Andy turns them into a note about that person. Before your next coffee, it shows you what you wrote, quietly, so you walk in remembering.
>
> WHAT ANDY DOES
> • Notes in a few seconds: speak, write, or photograph a card, a page of notes or a screenshot.
> • One page per person: what to remember, newest first, and who else came up.
> • Ask in your own words: "who just started a new job?" Andy answers from your notes, and shows which ones.
> • Before you meet: with your calendar connected, Andy shows who you are about to see and what they told you, and reminds you afterwards to add what's new. Calendar names are matched on your iPhone and never leave it.
> • A follow-up, drafted: a short message or email from what you know, to edit and send yourself.
> • Works with no signal: read everyone and every note offline, and keep new notes on your iPhone until you're back online.
>
> ANDY'S PROMISES
> • Only you. Your notes are never sold or shown to anyone. Andy sends them only to the services that read them for you.
> • Andy never reaches out. It doesn't message anyone. Drafts stay with you.
> • Quiet on the lock screen. Reminders show a name, never what you wrote.
> • No ads, no tracking. Not now, not later.
> • Gone when you say. Delete a note, a person, or everything, in the app.
>
> ASKED FIRST
> Reading your notes, searching them by meaning and drafting follow-ups are done by Anthropic (Claude) and OpenAI. Andy asks before anything is sent. They don't train on it, and they delete it within 30 days. Say no, and you can still keep notes exactly as you wrote them. Change your mind any time in Settings.
>
> Andy can be locked with Face ID. English at launch.

Length: about 1,900 characters. Check each line against the code on submission day:

| Line | Holds while |
|---|---|
| "or take a photo of their card or a page of notes" | Photo door (#167–#169) |
| "and shows which ones" | Ask cites its sources (Ask Andy, day 5) |
| "Calendar names … never leave it" | On-phone matching (#127) **and build 4 retired** |
| "Asked first …" | **The production `aiPermission` row is deleted.** Before that it is untrue (the same gate as the policy) |
| "they delete it within 30 days" | Anthropic and OpenAI API terms, re-read on the day |
| "Face ID" | App lock (day 9) |

## Screenshot captions (one line each, in order)

Show the face of the person remembered, never a screen full of what was
written about someone (STYLE.md). Use example people only.

1. **Walk in remembering.** The Briefing card before a coffee.
2. **Say it, and it's kept.** The voice screen mid-note.
3. **One page for each person.** A person's page.
4. **Ask in your own words.** Ask Andy answering with its sources.
5. **A follow-up, ready to send.** The draft sheet in Message + Friendly.
6. **Only you.** The five promises on paper.

## Review notes (App Review Information → Notes)

> Andy is a private notebook. Sign in with Apple, then tap + to write or record a note about someone. Reading a note uses Anthropic (Claude) and OpenAI; Andy asks for permission the first time you reach for it ("Let Andy read your notes?"). Choosing "Not now" still lets you save notes as written (Save as written). Settings → What Andy sends changes the answer; Settings → Privacy policy opens the policy. Calendar access is optional and asked for from the Briefing card; no other permission is asked at launch. The app contacts no one: follow-up drafts are copied by the user.

A **demo account** is not needed with Sign in with Apple, but check
App Store Connect at submission: if it asks, explain that Sign in with Apple
creates an account on first use.
