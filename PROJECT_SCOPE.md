# PROJECT_SCOPE.md

_(app name: "Andy")_

## Mission Alignment

Wealth/product-building here is a means, not the end. This app itself is also a direct-impact tool: same architecture serves networking recall, client recall, **and cat-fostering notes** — i.e. it generalizes to "remember anything about anyone/anything I interact with." Keep that generalization in the data model (don't hardcode "contact" — use "entity" internally where cheap to do so).

## Success Signal

_(the one PRD element this scope doc was missing — Problem/User already lives in the One-liner below, Non-goals already live in "Won't Have")_

Don't fill this with a guessed KPI number before you have real usage. For Week 1, the signal is a question, not a metric:

> After 7 days of actually using it: am I reaching for this app **unprompted**, or am I reminding myself to use it?

If it's the former — convert this into a real number (D7 retention, # of voice notes/week, recall-search "found the right person" rate) and track it from V1.1 onward. If it's the latter, that's a real signal too: the core loop isn't sticky yet, and the fix is UX/friction, not more features.

## One-liner

Voice-note a person (or a foster cat) → LLM structures it into a searchable profile → recall it later via natural-language search, Siri Shortcut, or a home-screen widget — without needing to remember a name.

## Product Narrative — "The Briefing"

Andy whispering the ambassador's name and key facts into Miranda's ear before she has to greet him. The app's job is to surface exactly what you need to know about someone, exactly when you need it — before a meeting (calendar-triggered briefing) and right after (a nudge to capture what's new) — without you having to go dig for it.

**Timeline: extended to 10–12 days** (from the original 7) to properly fit Calendar-triggered briefing/nudge and cross-profile mention search — both are now Must-have, not stretch goals.

## Decision Framework Recap

```
Goal       : Ship a complete, real product to the App Store in ~1 week, solo.
Constraints: Solo dev, 1 week, Apple Individual account already approved,
             Claude Code as primary dev tool.
Leverage   : Semantic (vector) search over voice-derived notes = core moat.
             TypeScript-unified stack (Expo + Convex) = smallest surface
             area for an AI coding agent to make mistakes in.
Risk       : iOS cannot auto-surface caller profiles during a real cellular
             call (confirmed infeasible — see below). Scope replaces this
             with Siri Shortcut + widget, which IS achievable this week.
```

## Reality Checks Baked Into This Scope

1. **No iOS call-time auto-popup.** Call Directory Extensions only fire for
   numbers _not already in system Contacts_, and custom CallKit UI is
   VoIP-only — neither applies to a real cellular call from a known
   contact. Do not build toward this; it will not work no matter how much
   time is spent on it.
2. **Android call overlay is deferred to V1.1**, pending a real read of
   current Play Console policy on `READ_CALL_LOG`/`READ_PHONE_STATE`
   (Core App declaration risk). Don't start this mid-week without
   re-verifying policy first.
3. **Apple review time is not in your control.** Budget for review
   turnaround after "code complete" — code-complete ≠ submitted ≠ live.
4. **SMS/문자 reading is infeasible on iOS, same category as the call
   popup.** There is no public API for a third-party app to read Messages
   content. Do not build toward this. Android's SMS permission group is
   Play's most heavily restricted — not worth the risk either.
5. **Gmail inbox auto-read requires Google OAuth "sensitive scope"
   verification (CASA security assessment)** — this can take days to
   weeks and is outside your control, same failure mode as an
   unpredictable App Store review. Deferred to V1.1+ specifically so it
   never blocks this submission. Follow-up **email drafting** (using
   your own already-stored notes, sent via a `mailto:` deep link) needs
   **no OAuth at all** and ships in V1.
6. **Calendar (EventKit) is the actual answer to the "phone call" vision.**
   Unlike a phone number, a calendar event already has the person's name
   on it — no identity-guessing problem, no CallKit restriction, no
   special entitlement. This is the highest-leverage addition in this
   revision.
7. **iOS caps local notifications at 64 pending per app.** Don't schedule
   a briefing/nudge pair for every calendar event indefinitely — schedule
   only for the next ~20–25 upcoming matched meetings and refresh on
   each app foreground/calendar sync.
8. **No separate Google Calendar integration needed.** EventKit reads
   every calendar synced into the iOS Calendar app, including Google
   Calendar if the user has added their Google account under
   Settings → Calendar → Accounts. One permission prompt, one API,
   covers Apple + Google + most CalDAV calendars. Don't build a second
   OAuth-based Google Calendar integration — it would be redundant.
9. **No custom Siri wake word ("Hey Andy") is possible.** iOS has no
   API for third-party apps to register their own always-listening wake
   phrase — "Hey Siri"/"Siri" is the only system wake word, by design.
   The already-scoped Siri Shortcut ("Hey Siri, look up John Doe from Andy") is the correct pattern via App Intents — the app name is
   part of the spoken phrase. Don't chase a true custom wake word.
10. **True end-to-end encryption is not compatible with this
    architecture, on purpose — not an oversight.** Extraction requires
    Claude (server-side, in a Convex action) to read note content in
    plaintext; a Day-One-style scheme where the server literally cannot
    decrypt the data would break the core extraction pipeline unless
    extraction moved to an on-device model (out of scope). V1 uses
    standard encryption in transit and at rest, not zero-knowledge E2E.
    Be ready to explain this distinction if asked — it's a deliberate
    trade-off for the LLM-extraction feature, not a security shortcut.

11. **Local iOS builds are impossible on this machine; EAS is the path.**
    Confirmed Day 1, not a guess: Expo SDK 57's `expo-modules-jsi` uses
    `weak let` (SE-0481), which no Swift before 6.3 accepts and no flag
    unlocks earlier. Swift 6.3 ships with Xcode 26.4, and every Xcode from
    26.4 on requires macOS Tahoe 26.2+ per Apple's release notes. This
    machine runs Sequoia, whose ceiling is Xcode 26.3 / Swift 6.2.3.
    Upgrading the package does not help — 57.0.6 has the same 16
    occurrences as 57.0.5. EAS builds on `macos-tahoe-26.5-xcode-26.6`,
    so the local toolchain stops mattering; the simulator profile needs no
    Apple Developer account. Budget ~8 min per native config change, and
    do not let anyone "fix" this by attempting a local build.
12. **Dashboard setup outside the repo is not done until it is verified.**
    Day 1 lost hours to two silent misconfigurations: a missing `convex`
    JWT template in Clerk (`ConvexProviderWithClerk` swallows the failure
    and returns null, so the app is simply never authenticated), and an
    `auth.config.ts` that was committed but never pushed to the deployment
    (`convex codegen` does **not** apply it — only `convex dev`/`deploy`
    does). Neither produced an error. Ask for evidence that names the
    thing, not a value that merely coexists with it.

### Precedent — this trade-off is standard, not a shortcut unique to us

Researched directly rather than assumed:

- **Day One itself** (our own benchmark, see below) states in its own AI-features documentation that content from an end-to-end encrypted journal is temporarily _not_ end-to-end encrypted while AI processes it — it's decrypted on-device, sent over HTTPS to the AI service, processed, and deleted from both Day One's and the AI provider's servers afterward. Same underlying trade-off we're making, just without persisting the extraction — ours persists it because structured recall _is_ the product. (dayoneapp.com/guides/ai-features)
- **WhatsApp/Meta AI** draws the identical line: person-to-person messages stay end-to-end encrypted, but a message sent _to_ Meta AI (or tagging it in a chat) is explicitly not covered by that guarantee — Meta can read what you send the assistant. Same pattern: E2E for storage/transport, an explicit carve-out the moment AI needs to read the content.
- **Mainstream health-adjacent AI apps** (photo-based food logging, AI wellness coaches, etc.) generally use standard encryption-in-transit/at-rest plus access controls, not zero-knowledge E2E, for the same structural reason.
- **Regulatory note, not legal advice**: most consumer health-adjacent apps in the US fall outside HIPAA (which covers healthcare providers/insurers/clearinghouses and their business associates, not general consumer apps), but are increasingly in scope for state consumer-health-data laws (e.g. Washington's My Health My Data Act). Given this app stores pet health metrics and notes that may reference other people's health/personal circumstances, get an actual legal read on this before any wide public launch — this note is informational, not a compliance judgment.

## V1 Feature Scope (MoSCoW)

### Must Have

- [ ] Auth via **Clerk** — Apple Sign-In only for V1 (see README Tech Stack Decisions)
- [ ] Voice recording → on-device/API transcription → Claude extraction into structured profile (name, relationship context, key facts, tags, first-met date)
- [ ] Manual profile create/edit (fallback when voice isn't used)
- [ ] **Business card photo → profile** — same Claude extraction action as voice, given an image input instead; extracts name/title/company directly from a photo (near-zero marginal cost, reuses the existing pipeline)
- [ ] **Cross-profile mention-graph search** — semantic search runs over every _note_ (not just profile-primary fields), so "X 생일파티에서 만난 메타 개발자" surfaces a person even if they only exist as a mention inside someone else's profile, not as their own profile. See schema note below.
- [ ] Timeline per profile — chronological list of notes/interactions
- [ ] iOS Contacts sync — per-profile opt-in, read existing contact + optionally write back a note/tag (expo-contacts)
- [ ] **Calendar Briefing** — read calendar (EventKit — covers Apple + Google + CalDAV in one API, see Reality Checks), fuzzy-match attendee/title names to profiles, schedule a local pre-meeting notification (last notes digest) and a post-meeting nudge ("오늘 A랑 어땠어? 새로 기억할 것?")
- [ ] **Follow-up email draft** — generate a draft from stored notes, hand off via `mailto:` deep link (no inbox read, no OAuth)
- [ ] Manual photo attachment per profile (expo-image-picker)
- [ ] **Pet/animal metrics log** — structured time-series sub-record per profile (date, metric type, value, unit) for weight/health tracking, separate from free-text notes
- [ ] **Passcode/biometric app lock** (expo-local-authentication) — this app stores notes about other people without their consent; a lock screen is table stakes for trust, cheap to add
- [ ] Siri Shortcut — "Hey Siri, look up John Doe from Andy" → returns spoken/text summary of latest note
- [ ] Home screen widget — pinned + 5 most-recent profiles for instant glance, **plus a second widget variant with a single quick-record button** (tap → app opens directly into an armed capture screen, recording starts immediately; true zero-app-open background recording is not reliable via widget extensions, see Entry-Input Channels below)
- [ ] Realtime sync across the user's own devices
- [ ] **iPad support, free** — don't restrict device family in `app.json`; the iPhone UI runs in scaled/compatibility mode on iPad automatically. No dedicated iPad layout in V1, but full functionality.

### Should Have

- [ ] Simple RAG chatbot — "브라이언이랑 마지막에 무슨 얘기했지?" free-form Q&A grounded in the user's own notes
- [ ] Tag/category system (client / friend / networking / foster-animal / other), with search filterable by tag and date range
- [ ] Quick-entry buttons for common metric types on animal profiles (e.g. "weight," "vet visit") — templated shortcuts on top of the `metrics` table, not a separate feature
- [ ] vCard export per profile

### Could Have (V1.1+)

- [ ] Google Sign-In (alongside the Android build, where it actually matters — see README Tech Stack Decisions)
- [ ] Gmail inbox auto-read (blocked on Google OAuth sensitive-scope verification — start that process early if pursuing this, it has its own multi-week lead time)
- [ ] **Inbound email-to-note** (BCC/forward a message into a dedicated address, à la Day One) — needs inbound-email infra (domain + parse webhook), real but non-trivial setup
- [ ] **Inbound SMS-to-note via a dedicated Twilio number** (different from reading the user's own Messages, which stays infeasible) — technically approachable, deferred for cost/time
- [ ] **iOS Share Extension** — appears in the system share sheet from Photos, Safari, Files, etc. ("share to Andy"). Photos shared in reuse the same Claude vision extraction built for business cards (Day 2); URLs shared in are simply attached to a note (don't build automatic webpage scraping/extraction — that's a separate, bigger feature). Genuinely worth prioritizing first in V1.1: reuses the widget's App Group + extension-target pattern, and reuses the Day 2 extraction pipeline — cheaper than the watch app or a native Mac app, but still a new native target, so it's not free enough to fold into the current 10–12 days without trading something else out.
- [ ] **Interactive relationship graph** — nodes are profiles, edges are one person being mentioned in a note about another, in the shape Obsidian's graph view has. Explicitly wanted later. The data model already carries it: once mentions are stored as their own rows (see the DB Schema section's `noteMentions` note) the graph *is* that table, so nothing extra needs collecting for it — this is a view, not a new kind of data. Not V1: it earns its place once there are enough people and notes for a shape to emerge, which is not true on day one of using the app.
- [ ] **Unlinked mentions** — a name that appears in a note's text but was never linked to a profile, surfaced the way Obsidian surfaces them, so a connection the extraction missed can be found and made afterwards. Cheap once full-text search exists; it is the safety net for the fact that our links are inferred by a model rather than typed by a person.
- [ ] Automatic photo-to-profile face matching (on-device ML, separate privacy review)
- [ ] Android call-time overlay (post Play policy re-verification)
- [ ] Multi-user / shared profiles (e.g. shared foster-cat log with a partner)
- [ ] Map view / calendar view of entries, streak-style reminders — lower priority for this app specifically: recall here is person-first, not place/date-first, and the calendar-triggered nudge already covers the "remember to log something" job better than a generic streak reminder would
- [ ] **True interactive-widget recording** (start and hold a recording entirely without the app ever opening) — technically possible in principle but the widget extension process isn't built to hold a live long-running mic session reliably; revisit only if the deep-link version (in Must Have) feels too slow in practice
- [ ] **Apple Watch companion app** — confirmed this requires a genuinely separate native Swift/SwiftUI codebase (React Native doesn't run on watchOS at all), plus watchOS's own interactive-widget/complication APIs have documented reliability issues on Apple's developer forums. This is a real fourth platform, not an extension of the phone app. Validate the Success Signal on the core phone experience first — don't build a watch app for a loop that isn't sticky yet on the phone.
- [ ] **Laptop capture via a lightweight web page** (not a native Mac app) — a minimal browser page hitting the same Convex functions (type a note, or record via the Web Audio API) covers most of the "capture from my laptop" need at a fraction of the cost of Mac Catalyst or React Native macOS, which would each be a genuine separate platform effort

### Won't Have (V1)

- iOS call-time auto popup (infeasible, see Reality Checks)
- SMS/문자 reading of the user's own Messages (infeasible on iOS, high policy risk on Android)
- True end-to-end (zero-knowledge) encryption — incompatible with server-side LLM extraction, see Reality Checks
- Video notes
- Non-Korean/English transcription

## User Flow (lightweight — enough to remove Day 1 ambiguity, not a full IA doc)

**Capture flow**

```
Tap record → speak → see extracted draft (name, tags, key facts) →
confirm/edit → save
   (if name matches existing profile → append note; if new → create profile;
    if Claude flags a low-confidence match → ask user to confirm/merge)
```

**Recall flow**

```
Search bar → natural-language query → ranked results
   (own profile matches AND "mentioned in X's profile" matches, labeled
    differently) → tap into profile → timeline view
```

**Briefing flow**

```
Calendar event matched to profile → pre-meeting local notification
(last-notes digest) → meeting time passes → post-meeting nudge →
tap nudge → opens capture flow pre-scoped to that profile
```

**Screens (minimum for V1, Expo Router)**

```
/ (home)              → pinned/recent profiles, search bar, record button
/profile/[id]          → timeline, tags, metrics (if animal), photo, follow-up email button
/profile/[id]/capture  → voice/manual capture, pre-scoped to this profile
/search                → recall search results
/settings              → contacts sync toggle, calendar permission, account
```

## Entry-Input Channels

Every channel below is just a different front door into the _same_ capture → extract → store pipeline — the Claude extraction action doesn't know or care which door the input came from. Text-based channels (SMS, email, web page) skip the transcription step and go straight to extraction.

| Channel                           | Status        | Notes                                                                       |
| --------------------------------- | ------------- | --------------------------------------------------------------------------- |
| In-app record button              | V1            | Core flow                                                                   |
| Home widget — glance              | V1            | Pinned/recent profiles                                                      |
| Home widget — quick record        | V1            | Tap → app opens to armed capture screen (not zero-app-open, see Could Have) |
| Business card photo               | V1            | Same extraction action, image input                                         |
| iPad                              | V1, free      | Compatibility-mode, no extra work                                           |
| Siri Shortcut                     | V1            | "Hey Siri, search John Doe from Andy"                                       |
| SMS to a dedicated number         | V1.1          | Needs Twilio number + webhook                                               |
| Email to a dedicated address      | V1.1          | Needs inbound-parse webhook                                                 |
| Laptop web capture page           | V1.1          | Cheaper than a native Mac app                                               |
| Apple Watch app                   | V1.1+         | Separate native Swift/SwiftUI codebase, real scope — see Could Have         |
| True interactive-widget recording | V1.1+ stretch | Only if the deep-link version proves too slow                               |

## DB Schema (Convex) — implemented Day 1, deviations recorded below

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  profiles: defineTable({
    userId: v.id("users"),
    name: v.string(),
    entityType: v.union(v.literal("person"), v.literal("animal")),
    relationshipContext: v.optional(v.string()), // "client" | "friend" | "networking" | "foster" | ...
    tags: v.array(v.string()),
    firstMetDate: v.optional(v.string()),
    contactId: v.optional(v.string()), // linked iOS Contacts identifier
    photoStorageId: v.optional(v.id("_storage")),
    isStub: v.boolean(), // true = auto-created purely from a mention, no direct note yet
  })
    .index("by_user", ["userId"])
    .searchIndex("search_name", { searchField: "name" }),

  notes: defineTable({
    userId: v.id("users"),
    profileId: v.id("profiles"), // primary profile
    mentionedEntityIds: v.array(v.id("profiles")), // secondary mentions
    text: v.string(),
    embedding: v.array(v.float64()),
    source: v.union(
      v.literal("voice"),
      v.literal("manual"),
      v.literal("calendar_nudge"),
    ),
    createdAt: v.number(),
  })
    .index("by_profile", ["profileId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["userId"],
    }),

  metrics: defineTable({
    userId: v.id("users"),
    profileId: v.id("profiles"),
    date: v.string(),
    metricType: v.string(), // "weight" | "vet_visit" | ...
    value: v.number(),
    unit: v.string(),
  }).index("by_profile", ["profileId"]),

  calendarLinks: defineTable({
    userId: v.id("users"),
    profileId: v.id("profiles"),
    calendarEventId: v.string(), // EventKit event identifier
    meetingStart: v.number(),
    meetingEnd: v.number(),
    briefingNotificationId: v.optional(v.string()),
    nudgeNotificationId: v.optional(v.string()),
  })
    .index("by_profile", ["profileId"])
    .index("by_event", ["calendarEventId"]),
});
```

**Implemented on Day 1** (`convex/schema.ts`, commit `59758d0`) with five deviations from the draft above, each validated in plan mode before writing:

1. **A `users` table was added.** The draft referenced `v.id("users")` without ever defining that table — Clerk does not create one. Keyed on `tokenIdentifier` (not `subject`), per `convex/_generated/ai/guidelines.md`.
2. **Child-table indexes lead with `userId`** — `by_user`, `by_user_and_profile_and_createdAt`, `by_user_and_profile_and_date`, `by_user_and_event`. The draft indexed only by `profileId`, which cannot satisfy the rule that every function filters through `by_user`, since Convex only queries index fields in declared order.
3. **`notes.embedding` is `v.optional`** — the embedding pipeline is Day 4 and manual notes (Day 3) must be insertable without a vector. The vector index is declared now at `dimensions: 1536`, so an embedding model must produce that width or the index has to be recreated.
4. **`metrics.value`/`unit` are optional, plus a `note` field** — the draft's own example, `"vet_visit"`, has no numeric value.
5. **`profiles.search_name` gained `filterFields: ["userId"]`** so name search cannot cross users.

`mentionedEntityIds` stayed a required array defaulting to `[]`, as drafted. Note it is an array, so Convex cannot index it: "every note mentioning profile X" means scanning the caller's notes and filtering in JS. Fine at V1 scale; a `noteMentions` join table is the additive fix if it ever isn't.

## Architecture

```
Voice/Photo Input (expo-speech-recognition captures the mic, expo-image-picker for business card photo)
   → Transcription (expo-speech-recognition, on-device — settled Day 2, see Open Risks)
   → Claude extraction (Convex action, server-side key) — accepts voice transcript
     OR business card image as input
       → identifies primary profile + secondary mentions
   → Structured write to Convex (profile + note + embedding + mentionedEntityIds)
   → Convex vector index (per-note, not per-profile)
   → Recall: natural-language query → embed → vector search → results
       (grouped by profile, mention-hits labeled separately)
   → Surfaces: in-app search | Siri Shortcut | home widget | RAG chatbot

Calendar Briefing (parallel path)
   EventKit calendar read (covers Apple + Google + CalDAV, one API) →
   fuzzy-match attendee/title → profile
   → schedule 2 local notifications per matched upcoming meeting:
       (a) pre-meeting: last-notes digest
       (b) post-meeting: "anything new to remember?" nudge
   → nudge response → voice/text capture → same extraction pipeline above

Follow-up Email (on demand)
   Stored notes for a profile → Claude drafts follow-up → mailto: deep link
   (no inbox access, no OAuth)
```

## Tech Stack

- **Frontend**: Expo (React Native) + TypeScript
- **Backend**: Convex (DB, functions, realtime, vector search, file storage)
- **Auth**: Clerk — Apple Sign-In only for V1 (see README Tech Stack Decisions for why, and why not Convex Auth/Firebase/Supabase)
- **LLM**: Claude API (Haiku for extraction/cost, Sonnet for chatbot quality; multimodal for business-card photo extraction) — called only from Convex actions, key never on-device
- **Contacts**: expo-contacts
- **Voice**: expo-speech-recognition — it captures the microphone *and* transcribes, so no separate recorder is needed (expo-audio was installed Day 2 as a fallback hedge and removed once on-device recognition was proven; expo-av is removed as of Expo SDK 55 — do not use it). If the audio file itself is ever wanted, this same library writes one via `recordingOptions.persist`. expo-speech is text-to-speech only (Siri Shortcut's spoken response, not transcription)
- **Security**: expo-local-authentication (passcode/biometric app lock)
- **Shortcuts/Widgets**: native iOS App Intents (requires a small native/Expo config plugin — budget real time for this, it's the least "just works" part of the stack)

## 10–12 Day Plan

_(unchanged length — the Day One-inspired additions below are cheap enough to fold into existing days: business-card extraction reuses Day 2's pipeline, passcode lock is a couple hours added to Day 9)_

| Day   | Focus                                                                                                                                                                       |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Expo + Convex project init, Clerk auth (Apple Sign-In), schema (incl. `mentionedEntityIds`, `Metric`), CI skeleton                                                          |
| 2     | Voice capture → transcription → Claude extraction pipeline (primary profile + secondary mentions) + **business-card photo as a second input to the same extraction action** |
| 3     | Profile CRUD + timeline UI + manual entry fallback + pet metrics log UI + quick-entry metric buttons                                                                        |
| 4     | Per-note vector index + cross-profile mention search + RAG chatbot                                                                                                          |
| 5     | Contacts sync + manual photo attach + follow-up email draft (mailto)                                                                                                        |
| 6     | Calendar read (EventKit) + attendee/profile fuzzy matching                                                                                                                  |
| 7     | Local notification scheduling (pre-meeting briefing, post-meeting nudge) + capture-from-nudge flow                                                                          |
| 8     | Siri Shortcut + home widget (glance variant + quick-record variant, same widget extension work)                                                                             |
| 9     | Tags + search filters, vCard export, notification-count guardrail (64-cap), **passcode/biometric lock**, bug bash                                                           |
| 10    | Privacy strings, `app-store-reviewer` pass, polish                                                                                                                          |
| 11–12 | Buffer — physical-device end-to-end test, EAS build, TestFlight, submit (buffer absorbs whatever slipped, don't skip it)                                                    |

## Open Risks to Revisit

- ~~Transcription accuracy for Korean speech (test early, Day 2, not Day 9)~~ — **measured Day 2 on device.** `ko-KR` has an on-device model (`supported:true installed:true`), so audio need not leave the phone. Sentence structure and personal names transcribe correctly; **domain terms do not** — "브랜딩 디자이너" came back as "브랜든 집 디자인". Punctuation is inconsistent — requested on both runs, absent from the first and present in the second. **The same sentence transcribes differently run to run**: the first run mangled a job title and got the names right, the second got the job title right and heard one name as a different real name. Name errors are the worse class, because they create a profile for a person who does not exist and split that person's history in two.
- **Transcription errors are laundered into confident false facts** (new, Day 2). Extraction is robust in *structure* — it did not invent a person from the mangled words, and it repaired a broken clause from context — but it recorded the mangled job as a fact and inferred a specialisation ("인테리어 디자인") that appears nowhere in the transcript. Since these facts are read back before a meeting as if true, **the confirm/edit step in the Capture flow is load-bearing, not polish**: nothing may be saved without a human seeing it first.
- Per-extraction Claude API cost at scale (fine for MVP, model before scaling)
- App Store privacy review for contacts + microphone + **calendar + photos** access — write precise, honest usage-description strings (see `app-store-reviewer` subagent)
- Calendar attendee/title name-matching quality — test with your actual messy real calendar early (Day 6), not synthetic data
- Mention-graph extraction quality — Claude needs to reliably distinguish "this note is about person A" vs "this note mentions person B in passing"; validate on real voice transcripts before trusting it, not just clean typed text
