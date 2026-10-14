# Before App Store submission: AI permission, promise 1, App Privacy

Status: **options for the owner**, drafted 2026-10-14 overnight. Nothing here is built.
TestFlight is not blocked by any of it; App Review is.

## Why this exists

Three things came up in the build-5 app-store-reviewer pass:

1. **Apple asks for permission, not only disclosure.** App Review Guideline
   5.1.2(i), current text, checked 2026-10-14:
   > "You must clearly disclose where personal data will be shared with third
   > parties, including with third-party AI, and obtain explicit permission
   > before doing so."

   Andy sends the person's notes to Anthropic and OpenAI on the first note it
   reads. Today, nothing in the app says so, and nothing asks. The privacy page
   says it, but a link is not "explicit permission". **This is the blocker.**
2. **Promise 1 is not true as written.** "Your notes are never shared, sold or
   shown to anyone" has to coexist with the providers' table on the privacy
   page. STYLE.md's rule is that a promise lists only what the code guarantees.
3. **The App Privacy questionnaire** in App Store Connect has to match what the
   code does. It must not under- or over-declare.

## What actually leaves the phone (from the code, 2026-10-14)

| Moment | Function | Goes to | What |
|---|---|---|---|
| Read it (voice or Write) | `extraction.fromTranscript` | Anthropic | the note's words, and the name it is about when started from a person |
| Let Andy read it (Photo) | `extraction.fromPhoto` | Anthropic | the photo, shrunk; not stored by Andy |
| Every saved note | `embeddings.embedNotes` (scheduled) | OpenAI | the note's text |
| Ask Andy | `search.recall` → `answer.write` | OpenAI (the question, for search), Anthropic (the question plus the matching notes) | |
| Draft a follow-up | `followUp.draft` → `email.write` | Anthropic | this person's notes |
| Speaking, when the on-device model is unavailable | iOS speech recognition | Apple | the audio, as iOS handles it |
| Calendar | — | nowhere; matched on the phone | |

The first two rows, Read it and Photo, happen on the **first thing a person
does** in Andy. A permission asked any later than the first note is asked
after the fact.

## Decision 1: where Andy asks

| | A. Once, before the first note **(recommended)** | B. At each AI feature's first use | C. A line at sign-in |
|---|---|---|---|
| What the person sees | One screen after sign-in, before home. It says what is read, by whom, and why, with **Allow** and **Not now** | A sheet the first time they tap Read it, Ask, Photo, or Draft | "By continuing you agree that…" under the sign-in buttons |
| Meets 5.1.2(i) | Yes. It asks explicitly, before anything is sent | Yes. Each request is explicit | Weak. Implied consent at sign-in is what "explicit" rules out |
| Fits CLAUDE.md "permissions at the point of use" | Mostly. It isn't an iOS permission, but it is asked before Andy's first use | Fully | No |
| Friction | One screen, once per account | Up to four sheets, and the first one interrupts a note mid-capture | None |
| Not now | Andy still opens: people, notes typed by hand, the offline copy. **Read it** waits and asks again, and so do Ask, Photo and Draft. Notes save without facts or search until allowed | Only the feature asked about waits | — |
| Build cost | One screen, one field on `users`, a server check in five actions, and Settings to withdraw | Four sheets with the same server check | Copy only |

Recommended: **A**, stored on the server (`users.aiAllowedAt`, additive), so it
holds on every device and is gone with the account. The server is the guard,
not the screen: the five actions above refuse with a `ConvexError` until it is
set. A screen-only check is the kind `security-reviewer` blocks. Withdrawing it
in **Settings → What Andy sends** stops new calls; it does not delete notes
already read.

Draft copy for A (Voice: remember, never collect; no "data"):

> **Before Andy reads your first note**
>
> To turn what you say or photograph into notes, and to find them again when
> you ask, Andy sends the words, and photos you choose, to two services:
> **Anthropic (Claude)** reads them, and **OpenAI** makes them searchable.
> They use them only to do this for you, and don't train on them.
>
> Calendar names never leave this phone. Andy never sends anything to the
> people you write about.
>
> **Allow** · Not now · [What Andy sends](privacy page)

## Decision 2: promise 1

The rule is that every word is something the code already guarantees.

| | Wording | Note |
|---|---|---|
| a **(recommended)** | **Only you.** Your notes are never sold or shown to anyone. Andy sends them only to the services that read them for you. | True today. "Only to" is guaranteed by the providers' table, and the next screen names them |
| b | **Only you.** Only you can see your notes. They are never sold, and are read only to do what you ask. | Shorter, but "read" without saying by whom leans on the privacy page |
| c | **Only you.** Your notes are never sold or shown to anyone. Anthropic and OpenAI read them for Andy, and nowhere else. | The most explicit. Two company names in a promise is heavy for the store listing |

Promise 1 appears in four places, which must change together:
- `STYLE.md` → Andy's promises
- `dev/design/privacy.html`
- `dev/design/positioning.html`
- `dev/design/story.html`

`dev-reports/positioning.dev.md` is a record of a past decision and is left as it was.

## Decision 3: App Privacy questionnaire (draft answers)

"Collected" in Apple's sense means sent off the phone and kept longer than it
takes to answer the request.

| Apple's category | Declare? | Linked to the person | Tracking | Purpose | Why |
|---|---|---|---|---|---|
| Contact Info → Email Address | Yes | Yes | No | App Functionality | Clerk sign-in |
| Contact Info → Name | Yes | Yes | No | App Functionality | From Sign in with Apple, if shared |
| User Content → Other User Content | Yes | Yes | No | App Functionality | Notes and facts, stored in Convex and sent to Anthropic and OpenAI |
| User Content → Photos or Videos | Yes | Yes | No | App Functionality | Profile photos are stored. Note photos are sent to Anthropic and may be kept by them for abuse checks, so declare it rather than argue it |
| User Content → Audio Data | **No** | — | — | — | Audio is never sent by Andy. Apple's own speech service is Apple's, not Andy's |
| Identifiers → User ID | Yes | Yes | No | App Functionality | Convex and Clerk account id |
| Contacts, Location, Health, Browsing, Search History, Purchases | No | | | | Not read, or stays on the phone (calendar) |
| Usage Data, Diagnostics | **No** | | | | No analytics or crash SDK in `package.json` (checked 2026-10-14). Re-check if one is added |

"Data used to track you": **none**. Third-party AI is disclosed under
"Other User Content", shared with service providers for App Functionality,
which Apple does not count as tracking.

## Also found, not decided here

- **The privacy page still has `[contact email]`.** It has to be a real
  address before submission.
- **5.1.1(i) also wants the policy to confirm** that providers give "the same
  or equal protection". Today the page says what they receive and that they
  don't train. One sentence would cover it, for example: "Each is bound by
  terms that protect what it receives at least as well as this policy does."
  It should only go in once the owner has checked their terms say so.
- **No app-level privacy manifest** (`ios.privacyManifests` in `app.json`).
  Expo's modules carry their own, and build 5 was accepted, so this is a
  check, not a known failure. Look for an ITMS-91053 email from Apple about
  build 5.
- Still pending: the Clerk `pk_live` instance, and a cost check in the
  Anthropic console.

## If A + a are chosen, the build slices

1. Server: `users.aiAllowedAt` (additive), `account.allowAi` / `withdrawAi`,
   and the five actions refuse until it is set, with tests
   (`security-reviewer`).
2. The screen after sign-in, the waiting states (Read it, Ask, Photo, Draft)
   and Settings → What Andy sends (`code-reviewer`, `design-system-auditor`).
3. Promise 1 in all four places, plus the privacy page sentence and email.
   Docs only.
