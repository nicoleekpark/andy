# Capture doors — what Record on `home` opens (voice, write, photo, paste)

Owner's suggestion, 2026-10-12. Brief by `product-strategist`, 2026-10-12, for `product-designer`:
**three options with HTML mocks**. The owner picks; this brief recommends nothing final.
**(new)** marks a proposed name for `docs/design/component-names.md`, added by the implementing PR.

## Brief

### 1. Already decided — do not reopen

- **`home` bottom chrome** (`home-actions.md`, Final choice): a round 72pt `record-button` carrying
  the word "Record", sitting across the top edge of an opaque bar (V-NOTCHED) above a full-width
  `home-search-field`. Its R1: Record is one tap from home at rest, keeps the visible word, and is
  never icon-only. That brief left "what Record does" open for this one.
- **`record` screen** (`record-flow.md`, Final choice): Option A, `about-field` "About who?", a red
  "Recording" indicator with m:ss, a large Done and a small Pause.
- **One pipeline** (record-flow R1): every door ends at `review` and one tap of "Remember this".
  Nothing is saved unseen: extraction turns misreadings into confident details (Open Risks).
- **Offline notes** (Must Have): recorded and typed notes are kept on the phone word for word and
  read when back online. PROJECT_SCOPE says, verbatim: "**Still later:** photos offline."

### 2. What the owner asked for

Record on `home` shows three iconed choices over a darkened background (Google Calendar's +):
**record** (voice), **pen** ("Write it instead"), **camera** (a handwritten note or a business card,
taken or from the album). Plus **import**: notes first written in Notion or Apple Notes, pasted in
or brought as a screenshot. "We can't expect the user to always write directly into Andy."

### 3. Jobs and how often they happen

These are assumptions from the owner's use and the scope's convention story, **not user research**.

| Door | Job | Where and in what state | Frequency (hypothesis) |
|---|---|---|---|
| **Voice** | "Get it out of my head before the next conversation" | Standing at a convention, one hand, 30–90 s, often no signal | Bursty and highest: many a day at events |
| **Write** | The same job when speaking is wrong | In a meeting, on a train, someone within earshot | Steady, second |
| **Card photo** | "Keep who this person is" | At the event, card in hand | Bursty, at events |
| **Photo of a handwritten note** | "I wrote it on paper; get it into Andy" | Later, at a desk, with the notebook | Rare (hypothesis, unmeasured) |
| **Screenshot or album photo** | "It's already in a picture" | At a desk | Rare |
| **Paste** | "I already wrote this somewhere else" | At a desk. Likely **front-loaded**: moving existing notes in during the first week, then occasional | High at first, then low |

Voice decays in minutes; the others can wait. **Voice wins any conflict over the fastest path;
the other doors must be findable without being in its way.** Hypothesis: paste matters most in
week one, when existing notes are the quickest way to a useful Andy (Fogg: protect *ability*).

### 4. The key tension

Today, voice from `home` costs **two taps**: Record opens `record--ready`, then `mic-button` starts
listening (record-flow R2). The owner has been asked whether Record should start listening at once
(one tap). The doors and the one-tap start pull against each other:

- **If Record opens a chooser**, voice stays at two taps (Record, then the voice item). Every door is
  equally visible. But the word on the button is no longer true: a button labelled "Record" that
  opens a menu breaks *one action, one name* (STYLE Copy Tone), so the label would change (R3).
  Google Keep made this exact change in 2024: a plain text note went from one tap to two, and the
  top reader complaint was that it was "no longer a one-step/tap action" (9to5Google).
- **If Record starts listening at once**, voice is one tap and the label stays true. The other doors
  then need a second, smaller entry. Long-press alone cannot be that entry: Apple's HIG and NN/G
  both say a command must never live only in a context menu, because nothing shows that it exists.
  A person who wanted to write would also meet the microphone first, and on first use **the
  microphone permission prompt**, which breaks "ask at the point of use" (CLAUDE.md) for someone who
  never meant to speak.

**The three options must span three models**, so the owner compares real alternatives, not three
colours of one idea:

| Model | Record tap | Other doors | Voice taps from home |
|---|---|---|---|
| **M1 Chooser** (the owner's proposal) | Opens `capture-menu` (new) over a scrim | Items in the menu | 2 |
| **M2 Voice first, doors beside** | Starts listening on `record--listening` | A smaller visible control by Record opens `capture-menu`. Long-press on Record may open it too, as a shortcut only | 1 |
| **M3 Voice first, doors after** | Opens `record` already listening | Write and Photo on the `record` screen, visible while listening; choosing one stops and discards the empty recording | 1 |

M3 must say how it avoids the permission problem above (for example, the first ever Record shows
`record--ready` and auto-starts only after the microphone is granted). If it cannot, the mock says so.

### 5. What comparable products do

| Source | Pattern | What it teaches here |
|---|---|---|
| Google Calendar (Android, 2024) | + opens Event / Task / Birthday (and Out of office) | The owner's model: equal-weight types behind one + |
| Material 3 FAB menu (2025) | 2–6 related actions; a scrim shows the rest of the screen is disabled; the menu stays until an action or the scrim is tapped | The scrim is a modal, so focus rules apply (§9) |
| Google Keep (Nov 2024) | The old bottom bar (list, drawing, voice, image) became one FAB menu: Image, Drawing, List, Text. **Audio was dropped**, and text went from one tap to two | A menu taxes the most common door. Keep paid that cost on text |
| Apple Notes (iOS 26) | The compose button writes at once. Photos sit behind the attachment button: Take Photo or Video, Choose Photo or Video, Scan Documents | The primary door is one tap; media is a secondary menu inside the note |
| Day One (iOS) | + starts a text entry. **Long-press** + opens the New Entry menu (Photos, Audio, Templates…) | Primary on tap, the rest on long-press. Their forum shows users missing quick access when a redesign moved it |
| Apple HIG, Context menus; NN/G | Never put a command only in a context menu; gestures are not discoverable | Long-press is an accelerator only (R4) |
| Hick–Hyman law | Decision time grows with the log of the number of choices, and faster when the choices are familiar | 3–4 clearly labelled items cost little. The real cost is the extra *tap*, not the reading |

Fitts's law: the most frequent door gets the largest, nearest target. Every option must state its
voice tap count and the target size of each door.

### 6. Business rules

**R1. One pipeline.** Voice, Write, Photo and Paste all end at `review` → "Remember this".
No door saves without that step.

**R2. Voice is never slower than today.** From `home` at rest, listening starts in at most two
taps, offline too. An option that makes voice three taps fails.

**R3. The label tells the truth.** If tapping the round button opens a chooser, it cannot say
"Record". The option proposes its label (for example "New note") and flags the change to
`home-actions.md` R1, and to the empty home line "tap record". If it starts listening, it keeps
"Record".

**R4. Every door is visible somewhere without a gesture.** Long-press may be a shortcut to a door
that is also reachable by a visible tap. VoiceOver users reach every door with plain double-taps.

**R5. Listening starts only from a tap whose label says so.** Record auto-starting (M2/M3) is
allowed only if the owner amends record-flow R2. Opening `home`, the app, or a notification never
starts the microphone. This is not the V1.1 widget's armed capture, and nothing here builds toward it.

**R6. Write and paste are one door.** Paste is not a separate item. Pasting happens in the Write
field (`record--typing`) through the system edit menu, and optionally through a visible Paste
control (R7). One door, so pasted words get the same `about-field`, offline keeping and review.

**R7. Never read the clipboard by ourselves.** No `getStringAsync`/`hasStringAsync` on open: on iOS
16+ that raises "Allow Paste" every time, and reading what someone copied without asking is the
"collecting" Andy never does. If a visible Paste control is shown, it must be the system one
(`ClipboardPasteButton` in `expo-clipboard`, Apple's `UIPasteControl`). There the tap is the consent
and there is no prompt. `expo-clipboard` is already a dependency. [call] whether to show it, since
its look is the system's (only its colours and corners can be set).

**R8. Long pastes.** Text over `MAX_TRANSCRIPT_CHARS` keeps today's error ("…Try splitting it into
two."). One note has one subject (record-flow R5). A pasted list of thirty people becomes one person
with twenty-nine who "came up". The empty Write screen says to paste one person's notes at a time (C8).

**R9. Photo: one door, two sources.** "Take a photo" (camera) and "Choose a photo" (Photos library,
including screenshots). The same picture door reads a card, a page of handwriting, or a screenshot.
Today's `scan-card-button` and its `confirm-dialog` (Take a photo / Choose from library) is the
starting point. [call] whether the menu shows two photo items or one item with a second step.

**R10. What a photo becomes.** A card yields **one person** (today: `fromBusinessCard` returns one
person and the card's text). A page of notes or a screenshot may name **several people**, so it must
not go through the card prompt. Rule: **picture → its words → the person checks them → "Let Andy
read it" → the normal note extraction.** The words land on the same editor voice uses
(`record--transcript`, here `record--picture` (new)), under "What the picture said". The reason: OCR
misreads names the way speech mishears them, and that editor is where a name gets fixed before
anything is built on it (record-flow R11). This costs one more Haiku call than a card does today.
The transcription prompt (server side, via `convex/promptBoundary.ts`) copies the words exactly as
written, never fixes or infers them, marks unreadable words, and returns nothing for a picture with
no writing. [call] whether a card keeps its direct path to `review` or also passes through the
words step.

**R11. The picture is not kept.** Only its words are saved, as the note's wording. The image is sent
to Anthropic to be read and is not stored by Andy (true of cards today). The picked file is removed
from the app's cache after reading, through `forgetOnThisPhone` (CLAUDE.md: "no cached or picked
photos"). If an implementation must store the image, it is a scope change and the copy in §8 changes.

**R12. Words, not faces.** A photo with no writing (a person, a room) gets C12; nothing is guessed.
Claude refuses to name people in images, and Andy must not look like it tries.

**R13. Permissions at the point of use.** Camera: the system prompt appears on the first tap of
"Take a photo". Photos library: **no permission prompt at all**. The iOS picker (PHPicker) runs in
its own process and hands Andy only the picture chosen. Expo's docs say "No permissions request is
necessary for launching the image library." The current card code calls
`requestMediaLibraryPermissionsAsync` first. That asks for more than Andy needs, so the
implementing PR removes it (security-reviewer to confirm, including whether
`NSPhotoLibraryUsageDescription` is still needed for profile photos). Microphone: first tap of a
control that starts listening.

**R14. One picture per note** in V1: no multi-select, batch import or watching an album.

**R15. Images are untrusted text.** A screenshot of a web page can carry instructions. Its words go
through `promptBoundary` exactly like a transcript (`neutralizeTags`), and they are shown to the
person before extraction runs (R10). Flag for `security-reviewer`.

**R16. Offline, per door.**

| Door | Offline behaviour |
|---|---|
| Voice | Unchanged: on-device recognition where the phone has a model; "Keep this note" |
| Write / paste | Unchanged: "Keep this note" |
| Photo | **Cannot be read offline.** Say so *before* the camera or picker opens (C11). The person can take the photo with the iPhone Camera and choose it here later. The photo then waits in their own Photos, not in Andy. Keeping images in Andy's outbox is "photos offline", which PROJECT_SCOPE defers: a scope change, not recommended |
| Picture already turned into words, then connection lost | The words are text now, so "Keep this note" works as for typing, with `kind` recorded as a picture |

**R17. Scrim menu behaviour** (if an option has one): it opens over `home` with `colors.scrim`
(existing token). Tapping the scrim or the close control, the VoiceOver escape gesture, or choosing
an item closes it. Nothing behind it is tappable while it is open. It never opens by itself.

### 7. States every option shows

`home` at rest · menu open · each door's first screen · first camera tap (system prompt) · camera
denied · Choose a photo (no prompt) · reading · `record--picture` with a misread name · no words
found · offline + Photo · Write empty and pasted · paste over the limit · VoiceOver order ·
largest Dynamic Type · Reduce Motion.

### 8. Copy (final strings; the designer moves lines, and changes words only via Open disagreements)

| # | Where | String |
|---|---|---|
| C1 | `capture-menu-item--voice` (new) | Record |
| C2 | `capture-menu-item--write` (new) | Write |
| C3 | `capture-menu-item--photo` (new), one item | Photo |
| C3a | its second line (meta, lowercase) | a card, a page of notes, a screenshot |
| C4 | Two photo items instead | Take a photo · Choose a photo |
| C5 | Menu close control, VoiceOver | Close |
| C6 | Round button label if it opens a chooser (M1) | New note |
| C7 | `record--ready` text door (replaces "Type it instead", owner's words) | Write it instead |
| C8 | Write body placeholder, from home | Write or paste what you want to remember — one person's notes at a time. |
| C9 | `record--picture` lead | Is this what the picture says? Fix any name or word, then let Andy read it. |
| C10 | Wording label, saved note | What the picture said |
| C11 | Photo while offline | Reading a photo needs a connection. Take it with your Camera now and choose it here later, or write it instead. |
| C12 | No writing found | Andy couldn't find any writing in that picture. Try one where the words are in focus. |
| C13 | Camera denied | Andy needs the camera to take a photo of a card or a note. You can turn it on in Settings. |
| C14 | Reading | Reading the picture… (a card keeps "Reading the card…") |
| C15 | Too large / failed | *(unchanged)* That photo is too large for Andy to read. Try taking it again, closer in. · That photo didn't come through. Try again. |

Notes: "Write" not "Type": it matches "What you wrote" (STYLE Terminology) and the owner's words.
"Photo" covers screenshots too, because the meta line (C3a) says so. That is recognition, not
recall: people see their own case named. "What the picture said" needs a new row in STYLE.md
Terminology. Banned words as always: capture, import, scan data, upload, entry, record (as a noun).

### 9. Accessibility (WCAG 2.2 AA, a hard rule)

- **Menu = modal.** `accessibilityViewIsModal` on the menu; focus moves to its first item on open
  and returns to the round button on close; the scrim is one element labelled "Close"; the escape
  gesture closes it.
- **Every item shows a word.** No icon-only item (an icon may sit beside the word). Labels start with
  the visible word (2.5.3). Items and close are at least 44×44pt.
- **Reduce Motion:** crossfade, no fan-out or spring. **Dynamic Type:** items wrap, never
  truncate; at the largest size the menu scrolls. **Contrast:** items `ink` on `paper`.
- **Long-press** (if any) is never the only path (R4), and VoiceOver gets a custom action on the
  round button for the same doors.

### 10. Success criteria (QA-observable: no analytics, promise 4)

Each one is a hypothesis.

- **The one metric: the owner's convention run.** Standing, one hand, from `home` at rest: three
  voice notes, one written, one card, one page of handwriting, one paste from Apple Notes. **Pass:**
  voice reaches listening in the option's stated taps (at most two, R2) with no hesitation, and every
  other door is reached in at most three taps. **Kill:** a wrong door opened, or a pause to work out
  where something is.
- **Findability (TestFlight):** a tester who has never seen the build is asked "Put a note you have in
  Apple Notes into Andy" and "Save this handwritten page." **Pass:** both done in under 30 s without
  help. **Kill:** more than one in five cannot find paste or photo.
- **Handwriting quality (owner, on device):** five real handwritten pages. **Pass:** every name is
  either right on `record--picture` or fixable there before reading. **Kill:** a misread name reaches
  `review` without the words step having shown it. If quality is poor, photo-of-note waits.
- **No over-asking:** a fresh install picking from the library shows **no** Photos permission prompt.
  A person who only writes never sees the microphone prompt.

### 11. Out of scope

- **Share Extension** ("share to Andy" from Notion, Notes or Photos). This is the real long-term
  answer to "import from other apps", and it is a V1.1 Could Have and a new native target. Nothing
  here builds toward it.
- Batch import, PDFs, the Files app, VisionKit scanning, on-device OCR, offline images, reading
  the clipboard without a tap, and splitting one pasted text into several people's notes.
- Anything that reads Messages or mail. A screenshot the person chooses is their own act, but no copy
  or design invites "screenshot your chats".
- Who is in a photo (faces), the profile photo flow, and video.

### 12. Scope and document changes that need the owner's approval

1. **Photo of a handwritten note or a screenshot** is a new input type. Must Have names only
   "Business card photo → profile". This is a **scope change**: amend PROJECT_SCOPE.md Must Have and
   the Entry-Input Channels table, **and PROJECT_SCOPE.ko.md in the same change**.
2. **Album import for non-card pictures** follows from 1. Album for cards is already in scope.
3. **Paste** needs no scope change: it is the typed door. The optional system Paste control uses an
   existing dependency.
4. **Offline photos** is explicitly "still later". Not recommended. A scope change if chosen.
5. **Record auto-start (M2/M3)** reverses record-flow R2, an owner decision, and changes
   `home-actions.md` (R1 wording for M1, the empty-home line).
6. **STYLE.md:** a Terminology row "What the picture said"; icons in the menu reuse the SF Symbols
   line `home-actions.md` already asks for.
7. **ENVIRONMENTS.md §2 and the privacy policy:** Anthropic would receive "a photo of a note or a
   screenshot, when one is read", not only a card. `app-store-reviewer` re-checks the photo usage
   strings and the privacy label.
8. **Schema:** a new `notes.source` literal for a picture (additive).

### 13. [call] Open questions for the owner

1. **Does Record start listening at once?** (M2/M3 yes, M1 no.) This decides most of the rest.
2. **Is a photo of a handwritten note in V1?** (Scope change 1.) If not, Photo stays cards only.
3. **Is album import of screenshots and photos of notes in V1?** (Scope change 2.)
4. One Photo item with a second step, or two items (Take / Choose) in the menu? (R9)
5. Does a card keep its direct path to `review`, or also go through the words step? (R10)
6. Show the system Paste control on an empty Write screen, or rely on the edit menu? (R7)
7. If Record opens a chooser, is "New note" the button's word? (R3, C6)
8. From someone's page (`add-note-button`), the same doors with the person declared? (Likely yes.)

### Sources

- [Material 3 FAB menu](https://m3.material.io/components/fab-menu/overview) · [M3 FAB menus guide](https://www.boltuix.com/2025/06/ultimate-guide-to-material-3-fab-menus.html) · [Google Calendar birthdays (9to5Google)](https://9to5google.com/2024/09/19/google-calendar-birthdays/) · [Chrome Unboxed](https://chromeunboxed.com/google-calendar-gets-a-dedicated-birthdays-event-option-on-android/) · [Google Keep FAB redesign (9to5Google)](https://9to5google.com/2024/11/05/google-keep-fab-redesign/) · [Keep drops the bottom bar](https://chromeunboxed.com/google-keep-ditches-the-bottom-bar-for-a-cleaner-modern-look/) · [Apple Notes attachments (Apple Support)](https://support.apple.com/guide/iphone/scan-text-and-documents-iph653f28965/ios) · [Day One Creating Entries](https://dayoneapp.com/guides/getting-started-with-day-one/creating-entries/) · [Day One templates forum](https://forums.dayoneapp.com/forums/topic/new-design-30th-may-2024-removed-quick-access-to-templates-why/)
- [HIG Context menus](https://developer-mdn.apple.com/design/human-interface-guidelines/components/menus-and-actions/context-menus/) · [NN/G contextual menus](https://www.nngroup.com/articles/contextual-menus-guidelines/) · [Hick's law](https://en.wikipedia.org/wiki/Hick%27s_law)
- [Expo ImagePicker v57](https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/) · [WWDC20 limited Photos library](https://developer.apple.com/videos/play/wwdc2020/10641/) · [Expo Clipboard v57 (ClipboardPasteButton)](https://docs.expo.dev/versions/v57.0.0/sdk/clipboard/) · [Branch: iOS 16 paste prompt](https://www.branch.io/resources/blog/everything-you-need-to-know-about-ios-16-and-pasteboard-opt-ins/)
- [Claude vision docs (limits, image quality, people identification)](https://platform.claude.com/docs/en/build-with-claude/vision) · [Claude handwriting tests (Family Locket)](https://familylocket.com/handwritten-text-recognition-by-claude-3-5-sonnet/)

## Options

_Written by `product-designer`: three options, one per model in §4, each covering §7, with mocks._

**Mock** (one interactive file, every model and every state reachable from the rig above the phone frame — a model switcher plus a shared state rig underneath it, the same convention `home-actions.md`'s later mocks used for comparing variants in one file): `docs/design/mocks/capture-doors.html`.

### Design read

**Existing patterns to preserve.** `home`'s bottom chrome is already settled (`home-actions.md` Final choice, decided the same day as this brief): V-NOTCHED — an opaque paper bar with a hairline, `record-button` round (72pt, carrying the word "Record") straddling the top edge, a full-width `home-search-field` below it. `record`'s own shape is settled too (`record-flow.md` Final choice, same day): Option A's quiet `about-field` ("About who?") above either door's body, a red (`alert`) "Recording" indicator with m:ss, a large Done and a small Pause. Both of those documents already bake the word "Record" into their own copy and rules — `home-actions.md` R1 ("keeps the visible word 'Record'") and `record-flow.md`'s own `record-prompt` ("Tap record…") — so anything here that changes what Record's label says is reopening two decisions finished hours before this one, not working on a clean slate. `scan-card-button`'s existing Take-a-photo/Choose-from-library `confirm-dialog` is explicitly named (R9) as the starting point for the Photo door's two sources, and the scrim token (`colors.scrim`) already exists and is already doing exactly this job (`confirm-dialog`'s dim).

**The user's task.** Thirty to ninety seconds, one hand, between conversations, the name is the thing most at risk (§2/§3 of this brief; §2 of `record-flow.md`). Voice is the highest-frequency, most time-critical door and must never lose a tap to the other three; Write, Photo and Paste are all real jobs, but each can tolerate being found a beat later than voice can.

**Constraints.** No new colour tokens — every treatment below reuses `moss`, `ink`, `edge`, `line`, `placeholder`, `alert`, `paper` and `scrim`, all already defined. `about-field` is already settled by `record-flow.md`'s Final choice (Option A, on both the voice and the typing door) — these three options inherit it unchanged rather than redeciding it. Every photo's words are checked before extraction runs (R10, answered once below). The system `ClipboardPasteButton` is the only shape a visible Paste control may take (R7).

**UX risks common to all three.** (1) Whatever makes voice faster costs something else — a tap, a label, or a new thing to learn — named per option below, not hidden. (2) A menu or a secondary control is a new affordance at least once; every option is judged partly on how it answers this brief's own findability success criterion (§10, TestFlight: "put a note from Apple Notes into Andy," "save this handwritten page" — pass is under 30 seconds, unaided). (3) `alert` stays reserved for the three deletions plus the one named exception `record-flow.md` just added (the live recording indicator); none of these options reach for it anywhere else.

### Answered once — shared by all three models, not a difference between them

Four of the brief's `[call]`s don't vary by model. Answering them once here, rather than three times, keeps the options comparable on the axis that actually differs — §4's chooser-vs-direct-start question — the same discipline `home-actions.md` used for its own §6 back-button finding.

- **R9/call 4 — one Photo item, two-step.** Every model's Photo door is a single item/control labelled "Photo" (C3) that opens a small two-choice sheet, "Take a photo" / "Choose a photo" (C4), built on today's `scan-card-button`'s existing `confirm-dialog` mechanism rather than a new shape. Four separate top-level items (Record, Write, Take a photo, Choose a photo) would push M1's menu past Hick's law's cheap range and would give M2's and M3's smaller surfaces nowhere clean to put a fourth item. Named in the mock as `photo-source-dialog` (new — a `confirm-dialog` variant with two `moss` actions instead of one).
- **R10/call 5 — a card goes through the words step too.** Today's `fromBusinessCard` shortcut (one person, no check) is dropped in favour of one rule for every photo: picture → words → the person checks them → "Let Andy read it." A card's OCR misreads a name exactly the way speech mishears one (R10's own reasoning for the new rule), and one law for every photo is simpler to build, test and explain than "cards are the one exception." Cost, named plainly: one more Haiku call per card than today.
- **R7/call 6 — the visible Paste control is shown.** `record--typing`'s empty body carries the system `ClipboardPasteButton` (tinted `moss`, `radius.control` corners — the only two things R7 says are stylable) beside the placeholder, rather than relying on the long-press edit menu alone. Reason: §10's own TestFlight criterion explicitly tests whether a first-time tester finds paste in under 30 seconds, unaided, and the brief's own Fogg hypothesis (§3, "paste matters most in week one") describes exactly the person least likely to think of long-press — someone who has never opened the app before. The edit menu still works too; the button is additive, never the only path.
- **R16 — Photo while offline says so before anything opens.** A dedicated `photo-offline-notice` (new — a `confirm-dialog`-shaped card, no title) shows C11's sentence with one `moss` action, "Write it instead," and a plain-text Cancel, never a camera or picker that opens and then fails. Identical across all three models, because it happens after the Photo door is already chosen, which is the one point in the flow that genuinely doesn't vary by model.

### Option M1 — Chooser over a scrim

**Concept.** Record's label becomes "New note" (C6); tapping it dims `home` with `colors.scrim` and opens `capture-menu` (new): `capture-menu-item--voice` "Record" (C1), `capture-menu-item--write` "Write" (C2), `capture-menu-item--photo` "Photo" / "a card, a page of notes, a screenshot" (C3/C3a), and `capture-menu-close` "Close" (C5). Tapping the Record item closes the menu and starts listening at once — the only way this stays inside R2's "voice is never slower than today" two-tap ceiling, since a chooser that then required a *third* tap on a separate `mic-button` would make voice slower than it is now, not merely unchanged.

**Why it may work.** Hick's law, kept cheap: three clearly-labelled, familiar-shaped items cost little decision time, and the real cost, per the brief's own citation of Hick, is the extra *tap*, not the reading. Every door gets literally equal visual weight — the owner's own stated goal, and the Google Calendar precedent the brief names. Von Restorff is deliberately *not* invoked here: nothing in the menu is visually privileged over anything else, which is the whole point of a chooser.

**Strengths.** The most legible "these are your four ways in" of the three — nothing is hidden behind a smaller or more obscure control, so the TestFlight findability criterion (§10) should be the easiest of the three to pass cleanly. One flow to build for every door's *entry* (open menu, pick one) rather than three different entry mechanics.

**Weaknesses/risks.** Costs the word "Record" — the one word `home-actions.md` and `record-flow.md` each independently decided to keep, hours before this brief, and which appears inside `record-flow.md`'s own copy (`record-prompt`: "Tap record…"). Shipping M1 means a small follow-up PR against both of those just-finished documents, not just a copy tweak in this one. It is also, structurally, the shape Google Keep shipped in 2024 — the one the brief's own research flags as drawing the loudest complaint, "no longer a one-step/tap action," even though Andy's voice door doesn't actually regress here (R2 holds). The *feeling* of "my one main button now shows me a menu first" is the same feeling that complaint describes, and is worth taking seriously as a hypothesis rather than dismissed because the tap count technically survives.

**Design-system impact.** New: `capture-menu`, `capture-menu-item--voice`/`--write`/`--photo`, `capture-menu-close` (all already named "(new)" in the brief). Reuses `record-button--round`'s existing shape with new text, `colors.scrim`, and the shared `photo-source-dialog`/`photo-offline-notice` above. No new tokens.

**Taps from `home` at rest, to each door's first real screen:**

| Door | Taps | What happens |
|---|---|---|
| Voice | **2** | New note → Record item → listening starts |
| Write | **2** | New note → Write item → `record--typing`, empty |
| Photo, camera | **3** | New note → Photo item → Take a photo → system camera opens |
| Photo, library | **3** | New note → Photo item → Choose a photo → system picker opens, no prompt |
| Paste | 2 + a paste | New note → Write item → paste into the body |

**VoiceOver and focus.** `accessibilityViewIsModal` on `capture-menu`; on open, focus moves straight to `capture-menu-item--voice` (the first *item*, not `capture-menu-close` — an explicit order override, the same kind `home-actions.md` already uses for its own bottom chrome), then Write, then Photo; Close is still reachable by a swipe or the two-finger-Z escape gesture (R17). On close, focus returns to the round button. Every item's label starts with its visible word, per 2.5.3.

### Option M2 — Voice first, doors beside

**Concept.** Record keeps its word and its V-NOTCHED position unchanged; tapping it starts listening at once (1 tap). A second, smaller, visibly separate control sits beside it in the same bar — `capture-more-button` (new; a quiet, `edge`-ringed pill, *not* filled, so it never competes with Record's `moss` fill for "the primary one") — labelled, in the absence of a copy row for this exact control, **"Write or add a photo"** (designer's proposed wording, following the brief's own words rather than inventing new ones — flagged for `product-strategist` to confirm or adjust). Tapping it opens the same `capture-menu` shape as M1, holding only `capture-menu-item--write` and `capture-menu-item--photo` — Record already has its own unambiguous button, so repeating it in the menu would just be a second way to do the thing the big button already does, costing a Hick's-law choice for nothing.

**Why it may work.** Fitts's law for the frequent door: Record stays the larger, nearer, unchanged target it already was. Recognition over recall: nothing a returning user already knows about `home` changes at all; only one new, small, honestly-labelled thing is added beside it. This is also the one option that resolves the brief's own stated permission worry *by construction*, not by a special case: because Write and Photo each have their own route that never touches `mic-button`'s territory, a person who only ever wants to write never taps anything that could trigger the microphone prompt — unlike M1, where "Record" and "Write" are two rows of the *same* control's menu, and unlike M3, where Write sits downstream of a control that has already started listening.

**Strengths.** Keeps both just-shipped decisions (`home-actions.md`, `record-flow.md`) completely untouched — zero ripple into either document. Voice goes from 2 taps to 1, a genuine speed win the brief raised as worth considering. The permission problem the brief spends two paragraphs on (§4) simply doesn't arise here.

**Weaknesses/risks.** `capture-more-button` is a new affordance nobody has learned yet, and its label is this document's own proposal rather than brief-supplied copy — the single largest open item among the three options. It is the smallest "find Write or Photo" target of the three (a secondary pill, not a menu, not an on-screen link row), so it is the one most worth watching against §10's TestFlight findability criterion specifically. Dynamic Type at the largest size is the tightest fit of the three: Record and a labelled pill sharing one bar may need `capture-more-button` to wrap to its own row below Record rather than beside it (shown in the mock).

**Design-system impact.** New: `capture-more-button`. Reuses `capture-menu`/`capture-menu-item--write`/`--photo` from M1 (same component, fewer rows), `record-button--round` unchanged. No new tokens.

**Taps:**

| Door | Taps | What happens |
|---|---|---|
| Voice | **1** | Record → listening starts |
| Write | **2** | Write-or-photo control → Write item → `record--typing`, empty |
| Photo, camera | **3** | Write-or-photo control → Photo item → Take a photo → system camera |
| Photo, library | **3** | Write-or-photo control → Photo item → Choose a photo → system picker |
| Paste | 2 + a paste | Write-or-photo control → Write item → paste into the body |

**VoiceOver and focus.** Same `capture-menu` modal behaviour as M1, with two items: focus opens on `capture-menu-item--write`, then Photo, then Close reachable by escape. `capture-more-button` itself needs a VoiceOver label that says what it opens, and its visible text already does — "Write or add a photo, button" is enough; no extra hint required.

### Option M3 — Voice first, doors after

**Concept.** Record keeps its word; tapping it opens `record` already listening (1 tap, after the first grant — see below). Write and Photo move onto the `record` screen itself, as a quiet secondary row visible under the live transcript while listening (and under the prompt on `record--ready`, for the cases that land there) — reusing `type-instead-button`'s existing slot, retitled "Write it instead" (C7, already decided), beside a new `photo-button` (new; replaces/broadens `scan-card-button`, since R9 already widens that door from cards-only to cards/notes/screenshots) labelled, by the same "instead" pattern C7 already set, **"Photo instead"** (designer's placement, reusing C3's word and C7's suffix — flagged for confirmation, same as M2's label). Tapping either while listening stops and discards the just-started, necessarily-empty recording (the model table's own rule) before opening that door.

**Why it may work.** The brief's own suggested escape hatch for the permission question: *"the first ever Record shows `record--ready` and auto-starts only after the microphone is granted."* On a first-ever tap, `record--ready` appears with Write-it-instead and Photo-instead both visible and fully usable *before* any microphone prompt fires — so a first-time user who only meant to write is never surprised by a mic prompt, the exact failure mode §4 names. Once permission is granted, every later tap of Record goes straight to listening, matching M2's 1-tap speed for voice without adding any new control to `home` at all — the cleanest `home` of the three.

**Strengths.** `home` itself is completely unchanged — no menu, no second control, nothing new to learn there at all. Reuses almost entirely existing names (`type-instead-button`, `scan-card-button`'s role if not its name) rather than inventing a menu vocabulary. Matches the brief's own suggested fix for first use precisely.

**Weaknesses/risks, named plainly.** The brief's escape hatch covers the *first* use. On every use *after* permission is granted, the model table's own words are exact: Record "starts listening on `record--listening`," and Write/Photo sit "on the `record` screen, visible *while listening*." That means a returning user who wants to write or take a photo — not speak — still taps the same Record button first, which activates a live microphone for the second or two it takes to notice and tap "Write it instead," before that recording is discarded. This is precisely the risk the brief's own tension section (§4) warns about ("a person who wanted to write would also meet the microphone first") — M3 removes it for the *first* tap ever made in the app and reintroduces it, in a smaller but real and *recurring* form, for every tap after that, on Write — the project's own second-most-frequent door (§3's job table: "Steady, second"). `record-flow.md`'s Final choice also just gave the listening state a red `alert` "Recording" indicator with a live m:ss timer specifically to make listening unmistakable; auto-starting it the instant Record is tapped means that unmistakable, slightly urgent state appears for a beat even when the tap was actually meant for Write or Photo. Reversing `record-flow` R2 ("recording starts only on an explicit tap of `mic-button`") is also this option's own doing, and needs the owner's explicit sign-off per that document, not an assumption made here.

**Design-system impact.** New: `photo-button` (broadens `scan-card-button`'s role to match R9). Reuses `type-instead-button`'s slot and C7's copy as-is, `record--ready`/`record--listening` otherwise unchanged. No new tokens.

**Taps:**

| Door | Taps | What happens |
|---|---|---|
| Voice | **1** (after first grant) | Record → listening starts at once |
| Voice, first ever use | 1 tap + a system prompt | Record → `record--ready` + permission prompt → listening starts once granted |
| Write | **2**, with a brief live mic in between | Record → (listening starts, then stops/discards) → Write it instead → `record--typing` |
| Photo, camera | **3**, same brief live-mic cost | Record → Photo instead → Take a photo → system camera |
| Photo, library | **3**, same cost | Record → Photo instead → Choose a photo → system picker |
| Paste | 2 + a paste, same cost | Record → Write it instead → paste into the body |

**VoiceOver and focus.** No modal anywhere in this option — nothing to trap focus in. VoiceOver order on `record--listening` is: live transcript → "Stop" → "Write it instead" → "Photo instead," matching the visual order already used for today's `record--ready` secondary row.

### Accessibility, all three

- **Contrast — no new pairings.** Every surface reuses an already-tested token: `scrim` behind the menu (M1/M2), `edge` on fields and the quiet `capture-more-button` (M2), `placeholder` on every field's hint text, `alert` only on the recording indicator (the one named exception) and genuine errors (camera denied, read failed, over-limit).
- **Targets.** Every menu item, `capture-menu-close`, `capture-more-button`, and both on-screen secondary links are a minimum 44×44pt by fixed padding, regardless of label length — the same approach `record-flow.md` already specifies for its own suggestion rows.
- **No icon-only commands.** Every `capture-menu-item` shows its word beside its icon (§9); `capture-more-button`, `photo-button` and `type-instead-button` are plain text, no icon required.
- **Reduce Motion.** `capture-menu` (M1/M2) opens and closes by crossfade only — no fan-out, no spring, matching R17/§9. Nothing about M3's on-screen links needs any new motion treatment.
- **Dynamic Type.** Menu items wrap, never truncate, and the menu scrolls at the largest sizes (§9); `capture-more-button` (M2) may need to drop to its own row below Record at the largest sizes, shown in the mock; M3's two secondary links stack vertically rather than compress.
- **Permission and offline states.** Shown identically across all three, per the "answered once" section above: `photo-offline-notice` before any camera or picker opens offline, camera-denied as an error line with the typing door named as the way forward, and the typing door fully usable under every mic-denied or offline condition in all three models.

### Recommendation

**M2.** It is the only one of the three that gets voice down to one tap (matching M3) without M3's recurring cost of a live microphone briefly engaging every time a returning user actually meant to write or add a photo — a cost that lands on the project's own second-most-frequent door, not an edge case. It is also the only one that leaves both of today's just-finished decisions (`home-actions.md`'s Record button, `record-flow.md`'s own copy) completely untouched, where M1 reopens both by renaming the button "New note." M2's one real, named weakness — `capture-more-button` is a new, small, unlearned affordance — is exactly the kind of risk this brief's own §10 success criteria are built to catch (the TestFlight findability test), rather than a structural cost baked into the model itself the way M1's and M3's are. **M1** is the right call if the owner weighs "every door equally visible, nothing smaller or secondary" above the one-tap voice speed-up, and is willing to spend the two-document ripple — it is, after all, the owner's own first idea, drawn here in full rather than talked out of. **M3** is not recommended: its first-use fix is real and matches the brief's own suggested escape hatch exactly, but the model table's own words commit it to a recurring mic-engage-then-discard cost on Write for every use after that, which this document can name but the owner should weigh with eyes open, not discover in use.

**Key interaction states (M2), restated for the implementer:** `capture-more-button` sits beside `record-button` inside the existing V-NOTCHED bar, quiet (`edge` ring, no fill) so it never reads as a second primary action; tapping it opens `capture-menu` with exactly two rows (Write, Photo) over `colors.scrim`; picking either closes the menu and navigates to that door's first screen, same as M1's menu mechanics; Record itself is untouched — still the round, filled, word-bearing control `home-actions.md` already shipped, still navigating straight to a listening `record` screen on a single tap.

**Components/tokens reused:** `record-button--round`, `colors.scrim`, `colors.edge`, `about-field` (from `record-flow.md`'s Final choice, inherited unchanged), `type-instead-button`'s slot, `confirm-dialog`'s shape (for `photo-source-dialog` and `photo-offline-notice`). **New, to add to `docs/design/component-names.md` if M2 ships:** `capture-more-button`, `capture-menu`, `capture-menu-item--write`, `capture-menu-item--photo`, `capture-menu-close`, `photo-source-dialog`, `photo-offline-notice`. `capture-menu-item--voice` is not needed under M2 specifically (only M1 uses it), but stays documented in M1's section in case the owner picks that option instead.

**Assumptions, labelled as hypotheses:** that a quiet, text-labelled pill beside Record is enough to be noticed when needed and ignored otherwise — tested directly by §10's TestFlight findability pass/kill line (under 30 seconds, unaided; killed if more than one in five testers can't find paste or photo). That removing Record's own menu-trigger duty is worth the cost of one new small control to learn — falsifiable the same way: if testers consistently miss `capture-more-button`, M1's equal-weight chooser is the next thing to try, not a smaller tweak to M2's pill.

### Radial explorations

The owner sent two references and asked to see their feel — a **dimmed-focus
arc/fan menu** — drawn around the round `record-button` that `home-actions.md`
already settled (V-NOTCHED: 72pt, centred, straddling the bar's hairline):
**Google Calendar's +** (tapping dims the whole screen; labelled pills, icon
plus word, stack *above* the button, which turns into a ✕) and **Samsung Air
Command** (round buttons laid out on an *arc* around a trigger, each with a
text label *beside* it, over a dimmed background). "The main button stays the
Record button" — the owner's own constraint.

Three variants, same arc geometry (two labelled satellites, Write and Photo,
fanning upward from Record's centre, in the thumb zone — never icon-only, per
§9), different interaction model. Each is a redraw of this brief's own M1/M2
axis as an arc rather than a scrim sheet, not a fourth new model: **R1** is
M1's tap-to-open chooser, drawn as an arc, with a twist that keeps the label
"Record" true in a stricter sense than M1's rename; **R2** is M2's "doors
beside" shape, drawn as a hold-to-fan arc with a visible plain-tap path (R4);
**R3** is M2's shape again, drawn with the indirection removed entirely — two
satellites that simply rest beside Record, always. One interactive mock, a
variant switcher: `docs/design/mocks/capture-radial.html`.

**Geometry, shared by all three.** Each satellite sits at radius ~104pt from
Record's centre, ~50° off vertical (`dx ≈ ±80pt, dy ≈ -67pt`). At 390pt width
with Record centred, the satellites' outer edges land at ~49pt and ~341pt from
the screen edges — inside the 16pt (`space.lg`) margin on both sides with room
to spare. **Approximate, confirm on device**, the same caveat this project's
other geometry mocks already carry (home-actions.md's overlap-buffer math,
R7's usual note). Because the arc is bilaterally symmetric around a centred
Record, it is identical for a right- or left-handed grip — unlike a
corner-anchored control (`home-actions.md` Option C's `record-fab`), there is
no handedness trade-off to make here at all.

**R1 — Tap to fan.** Tap Record: a scrim dims the list, the arc opens (Write,
Photo), and Record itself stays exactly where it is, growing slightly
(`record-button--armed`, new state, 72pt → 84pt) — never relabelled, never
replaced by a ✕. Tap the now-larger Record again to start listening. Voice is
**2 taps, zero finger travel**.

- *Why it may work.* Von Restorff by motion — the arc visibly grows out from
  behind the one thing that doesn't move, which is also the thing most worth
  tapping twice in a row. It resolves the button-naming question (R3 above)
  differently from M1: M1 had to rename "Record" to "New note" because
  tapping it opened a menu *containing* a Record row — button and door became
  two different things. Here Record never stops being the one and only path
  to listening; Write and Photo sit beside it, never inside it, so the label
  stays true in a stricter sense than M1's.
- *Worth seeing plainly, not declared settled.* The first tap doesn't record —
  it arms. Whether "Record, tap twice" still satisfies "one action, one name"
  as cleanly as a button that does the thing on every tap is a smaller, real
  hair to split; the owner should weigh it with eyes open rather than take
  R1's resolution as fully closing the question M1 raised.
- *Cost, named plainly.* Voice costs a tap more than R2/R3 (2 vs 1) — the same
  cost M1 paid, for less of M1's "every door equal weight" benefit, since
  Write/Photo stay visually secondary satellites here, not equal-weight peers.
- *Design-system impact.* New: `capture-menu--arc` (a state of the existing
  `capture-menu`, holding the already-named `capture-menu-item--write`/
  `--photo` and `capture-menu-close`), `record-button--armed`. No new tokens.

**R2 — Tap records at once; hold fans.** Tap Record: listening starts
immediately, no detour (1 tap, matching M2/M3). A small, separately-labelled
**"More"** badge (`capture-arc-more`, new) sits at Record's upper edge,
reusing M2's own approved VoiceOver words, "Write or add a photo" — nothing
new invented there. Press-and-hold Record is a **shortcut** to the same arc,
never the only way in (R4; Apple HIG/NN/G: a command must never live only
behind a gesture nothing shows exists). A first-run hint
(`capture-arc-hint`, new) points at the badge once.

- *Why it may work.* Recognition over recall — Record's behaviour never
  changes from what a returning user already knows (Fitts's law: it stays the
  largest, nearest, unchanged target); the one new thing to learn is a single
  small badge, taught once by the hint, reachable by a plain tap forever
  after. The button-naming question is **fully** resolved, not just
  better-kept than M1: Record always means "start listening," on every tap,
  with no "armed" middle state to reason about at all — the cleanest of the
  three on this specific question.
- *Cost, same shape as a risk already named for M2.* The badge is a new,
  unlearned affordance — the same risk M2's own `capture-more-button` already
  carried for itself, drawn smaller and closer to Record here. Whether that
  reads as more integrated (Air Command's own idiom) or easier to miss is
  exactly what §10's TestFlight findability pass/kill line would settle, not
  something arguable from a mock alone.
- *Icon-only, considered and rejected.* The badge carries the word "More"
  beside its chevron rather than being a bare icon: unlike `settings-button`'s
  gearshape (acceptable icon-only because it is one universally-recognised
  symbol with nothing else competing for its meaning), "more capture options"
  has no equally-settled icon convention yet. "More" is this designer's
  shortest-possible proposed word, not from the copy table (C1–C15) —
  **flagged for `product-strategist`** to confirm or adjust before it ships.
- *Design-system impact.* New: `capture-arc-more`, `capture-arc-hint`. Reuses
  `capture-menu--arc` from R1 (same arc, same items). No new tokens.

**R3 — Arc always half-open.** Write and Photo rest permanently in the arc's
final position beside Record — no scrim, no open state, nothing to reveal,
ever. Tap Record: listening starts at once. Tap Write or Photo: that door
opens at once. **Every door is exactly one tap** — the only variant, of these
three or of M1/M2/M3, where that is true of all three doors simultaneously.

- *Why it may work.* Hick's law at its floor — there is no decision about
  *whether* to reveal anything, because nothing is ever hidden; Jakob's law in
  reverse — the one variant with no gesture or control to learn at all.
- *Cost, named plainly.* This is the one variant that does **not** deliver the
  thing the owner asked this follow-up to explore — there is no scrim, no
  fan-out, no moment of focus. It is included as the honest zero-cost floor
  the other two should be judged against, not because it answers the brief of
  this particular follow-up.
- *Design-system impact.* New: `capture-satellite-button--write`/`--photo` —
  unlike `capture-menu-item--write`/`--photo`, these are never inside a menu
  and never animate open or closed. No new tokens.

**Shared across all three.** Downstream screens are unchanged: Write opens
`record--typing` with the visible system Paste control; Photo opens the same
`photo-source-dialog`; offline Photo still shows `photo-offline-notice`'s text
before any camera or picker opens. New here: the Photo satellite's own meta
line swaps inline from "a card, a page of notes, a screenshot" to "Needs a
connection" while offline, visible before the tap, not only after the dialog
opens. No new tokens anywhere in this exploration.

**Accessibility.** Record is 72pt (84pt armed, R1); each satellite is ≥44pt
tall; the close control and the "More" badge draw smaller (36pt) inside a
44×44pt hit area, the same pattern `nav-bar-action-right` already uses.
VoiceOver order, R1/R2 while open: Record (still live — tapping it again
acts, unlike M1/M2's menu rows which replace the trigger) → Write → Photo →
Close by the two-finger-Z escape or a swipe past Photo (R17). VoiceOver order,
R3 (nothing modal, ever): list → field → Write → Photo → Record, Record last
per the same deliberate override `home-actions.md`'s S4 exploration already
established. Proposed labels (confirm with `product-strategist`): Record —
"Record a voice note" (accessibility hint "Double tap again to start
listening" only while armed, R1); Write — "Write it instead"; Photo — "Add a
photo of a note or card"; R2's badge — "Write or add a photo" (M2's words,
reused). Reduce Motion: the fan-out and the close control's pop both become
an instant position with only a 120ms opacity crossfade — no translate, no
scale, no spring. Dynamic Type: at the largest accessibility size the arc
hides and `capture-menu--arc` converges to the plain stacked `capture-menu`
card it is a state of — full-width rows, no absolute geometry to collide —
the same convergence pattern `home-actions.md`'s S1-oval already established.
Contrast: no new pairings — satellites are `ink` on `paper` with an `edge`
ring (3.2:1, WCAG 1.4.11), identical to every other field in this system.

**Tap counts, from `home` at rest:**

| Door | R1 | R2 | R3 | M1 / M2 / M3 (for reference) |
|---|---|---|---|---|
| Voice | 2 | **1** | **1** | 2 / 1 / 1 |
| Write | 2 | 2 (hold or tap "More", then Write) | **1** | 2 / 2 / 2 (+ brief live mic) |
| Photo (either source) | 3 | 3 | **2** | 3 / 3 / 3 |
| New control to learn | none beyond Record itself | a small "More" badge | none | — / a pill beside Record / — |
| Delivers the scrim/fan feel asked for | yes | yes, on demand | **no** | — |

**Recommendation: ranked R2, then R3, then R1.** R2 is the only one that gets
everything at once: 1-tap voice, the arc/fan feel the owner asked to see (on a
hold, or a plain tap on "More"), and a fully — not just more cleanly —
resolved answer to "can it still be called Record." Its one real cost, a
small new badge to learn, is the same shape of risk M2 already named for
itself, not a new kind of risk this exploration introduces. **R3** is the
right fallback if, having seen R1/R2, the owner decides no amount of visual
drama is worth even one small new control — it beats R1, R2 and M1/M2/M3 on
every door's tap count, at the cost of being the one variant that doesn't
deliver a "dimmed focus" moment at all, which is the thing this follow-up set
out to explore. **R1** is ranked last: it is dominated by R2 on both the tap
count and the "does a plain tap always exist" question, for a naming benefit
R2 matches in full — closest to the Google Calendar reference's literal
gesture, worth seeing in full for that reason, but not the one to build
first. **Hypotheses, not tested behaviour:** that a small badge beside Record
is noticed when needed and ignored otherwise (R2) — tested directly by §10's
TestFlight findability pass/kill line; that the naming distinction drawn
between R1's "armed" state and R2/R3's always-honest label matters to a real
user rather than only to this analysis — named as a risk to watch, not a
proven cost.

**Names, if a variant ships:** `capture-menu--arc` (new state of `capture-menu`,
R1/R2), `record-button--armed` (new state of `record-button--round`, R1),
`capture-arc-more` and `capture-arc-hint` (new, R2),
`capture-satellite-button--write`/`--photo` (new, R3). No new tokens proposed.

## Product review

_Pending the options._

## Open disagreements

_None yet._

### Owner's orbit flow

Decided 2026-10-13, building on `home-actions.md`'s shipped V-NOTCHED bottom
chrome and `record-flow.md`'s Final choice (Option A's `about-field`, the
red `alert` "Recording" indicator with a live m:ss timer, a large Done and a
small Pause). Mock: `docs/design/mocks/capture-orbit.html` — one interactive
file, every state below reachable from the rig above the phone frame, in the
same convention this document's own `capture-doors.html`/`capture-radial.html`
already used. This is the owner's chosen flow, not three options to pick
between; the design work below is the layout, states, accessibility and
naming needed to build it, plus what it changes in documents already shipped.

**What it is.** Home's round button (`capture-orbit-trigger`, new) keeps
`record-button`'s slot, size (72pt) and shape, but is a generic trigger
("New note") rather than Record. Tapping it dims the whole screen with
`colors.scrim` (Google Calendar's own focus-dim) and opens `capture-orbit`
(new): three round, equal-weight doors fan out — **Voice** at 12 o'clock
(directly above), **Write** at ~10 o'clock, **Photo** at ~2 o'clock —
bilaterally symmetric around the centred trigger, which itself becomes a
close (✕). Voice opens `record--listening` already listening. Write opens
`record--typing` with the keyboard already up and the cursor in
`about-field`. Photo opens a new full-screen camera, `card-scan`, built on
`expo-camera` (no VisionKit, no live edge detection).

**1–2. The trigger and the orbit.** Two trigger labels, both in the mock:
**T1** draws "+" inside the moss circle with "New note" set as its own
caption beneath it (`capture-orbit-trigger-caption`) — recognition over
recall, the same shape `record-button` already had, with the word moved
outside the circle. **T2** is "+" alone; VoiceOver still says "New note."
Both converge to a bare ✕ while open, no caption needed — the same
icon-only exception `settings-button`'s gearshape already establishes (one
universally recognised symbol, nothing competing for its meaning). Each
orbit item is a 56pt moss circle (icon) with its word in a solid **paper**
chip directly beneath it, never bare `ink` text floating on the scrim
itself: the scrim composites to a mid grey over whatever is behind it, not a
reliable 4.5:1 backdrop at full opacity, so every orbit item follows the
same rule `confirm-dialog` already does — text sits on a solid `paper`
surface above the scrim, never directly on it. Geometry (approximate,
confirm on device, the usual caveat this project's geometry mocks carry):
each item sits at radius 120pt from the trigger's centre — Write/Photo at
±104pt horizontal / -60pt vertical (60° off vertical), Voice at 0 / -120pt.
At 390pt width the widest item's outer edge lands at ~328pt from the right
edge and ~62pt from the left, both inside the 16pt margin. Because the orbit
is bilaterally symmetric around a centred trigger, it is identical for a
right- or left-handed grip, the same finding `capture-radial.html`'s arc
already established.

**3. Voice opens already listening.** Tapping Voice opens
`record--listening` exactly as `record-flow.md`'s Final choice drew it,
unchanged: red `alert` "Recording" + live m:ss, growing transcript, large
Done, small Pause (and Pause's own "Paused · m:ss" + Resume + Done). On the
very first ever use, the system microphone prompt appears before any audio
is captured — the same escape hatch `capture-doors.md`'s M3 proposed for
this exact problem — and only once granted does listening begin; declining
returns to `home` with Write still fully open.

**4. Write opens with the keyboard already up.** From `home`, `about-field`
is empty with the cursor already in it and the keyboard already up — no
second tap to focus the field; the body shows the system
`ClipboardPasteButton` when empty, per this document's own "answered once"
§R7. From a person's page, `about-field` is already declared
(`about-field--declared`, `record-flow.md`'s own shape, with `Change`), and
the cursor moves to the body instead.

**5. Photo opens the camera directly.** `card-scan` (new): a full-screen
camera, `card-scan-frame` (new, four static corner brackets that never move
or react — the honest reading of "no live edge detection"),
`card-scan-close-button` (new) top-left, `card-scan-album-button` (new)
bottom-left (opens the system photo picker directly, no Photos permission
prompt, R13), `card-scan-shutter-button` (new) large and centred. No mode
tabs. After capture, `card-scan-retake-button` / `card-scan-use-photo-button`
(new), then `record--picture` (already named in this document) — its lead
and label say "the card" / "What the card said" under scope S-b, where every
photo is a card, and stay generic ("the picture" / "What the picture said",
C9/C10) under S-a. One photo per note (R14) — no "add another" control
anywhere in this screen.

**6. Offline, said before anything opens.** While the orbit is open, the
Photo item's own label gains a second, quiet line reading "Needs a
connection" (`ink` at `textOpacity.quiet` on the item's `paper` chip, 5.0:1,
an already-approved pairing) — visible before the tap. Tapping it anyway
shows `photo-offline-notice` (already named in this document) as a
`confirm-dialog`-shaped card over the still-open orbit, never opening the
camera first and failing. Voice and Write are unaffected offline.

**7. Scope switch (S-a / S-b).** S-a "Notes and cards": the frame hint says
"Fit the note or card inside the frame," the door says "Photo,"
`record--picture` stays generic. S-b "Cards only": the hint says "Fit the
card inside the frame," the door says "Card," and `record--picture`
specialises to "the card" / "What the card said," matching copy-build-4's
existing precedent for a card's busy state ("Reading the card…", C14).
Neither changes `card-scan`'s mechanics — only three words move. This is
still this document's own open scope question (§12.1); the mock lets the
owner compare both before deciding it.

**Tap counts, from `home` at rest:**

| Door | Taps | What happens |
|---|---|---|
| Voice, returning (mic already granted) | **2** | New note → Voice → listening starts at once |
| Voice, first ever use | 2 + a system prompt | New note → Voice → permission sheet → listening starts once granted |
| Write, from home | **2** | New note → Write → `record--typing`, keyboard up, cursor in About who? |
| Write, from a person's page | **2** | New note → Write → `record--typing`, About who? already declared, cursor in the body |
| Photo, to the camera opening | **2** | New note → Photo → `card-scan` opens (if already granted) |
| Photo, full path to `record--picture` | 4 | New note → Photo → Shutter → Use photo → `record--picture` |
| Photo, via the album | 2 + a system picker | New note → Photo → Album → system picker (no prompt) → choose → `record--picture` |
| Photo, offline | **2** | New note → Photo → explanation shown, no camera opens |

All four doors are reached in exactly 2 taps from `home` at rest. This is a
deliberate trade: Voice is no longer 1 tap, as M2/M3 or the radial R2/R3
achieved elsewhere in this document's own exploration — the orbit's one
extra tap is paid once, equally, by every door, rather than by Voice alone,
in exchange for Write and Photo being exactly as fast to reach as Voice,
with none of them living behind a smaller or secondary control.

**This supersedes, for this flow:**

- `home-actions.md`'s copy for `record-button` ("keeps the visible word
  'Record'") — the round button's word is now "New note" (reusing this
  document's own C6), and its role is a chooser, not a recorder.
- `record-flow.md`'s R2 ("recording starts only on an explicit tap of
  `mic-button`") — amended: tapping the Voice door *is* that explicit tap,
  so `record--listening` opening already-listening does not violate R2's
  intent, it relocates where the explicit tap happens.
- This document's own "answered once" §R9/call 4 (one Photo item opening a
  Take/Choose sheet, built on `scan-card-button`'s `confirm-dialog`): this
  flow's Photo door opens the camera immediately, with the album as an
  in-screen button rather than a separate step. Named, not hidden: someone
  who only ever wants the library now sees the camera UI first, briefly,
  before reaching for the album button.

**Copy flagged for `product-strategist`:**

- "Voice" / "Write" / "Photo" as the three door words are new for this flow
  — this document's own copy table had `capture-menu-item--voice` say
  "Record" (C1), which would be confusing twice over here (it is not the
  trigger, and it is not a verb distinct from "Voice" as a door name).
  Confirm "Voice"/"Write"/"Photo", superseding C1 for this flow.
- "Retake" / "Use photo" (`card-scan-retake-button` / `-use-photo-button`)
  and "Take it again" on `record--picture` are this designer's plain,
  conventional words (Camera/Photos' own vocabulary), not yet in any copy
  table.
- The camera-denied line for scope S-a ("Andy needs the camera to take a
  photo of a note or a card. You can turn it on in Settings.") extends C13
  to cover notes; C13 itself only says "a card." S-b uses C13 verbatim.
- **Wording discrepancy, named rather than resolved:** this task's own
  offline sentence — "Photos need a connection to be read. Take it with the
  iPhone Camera now and choose it here later." — differs slightly from this
  document's already-decided C11 ("Reading a photo needs a connection. Take
  it with your Camera now and choose it here later, or write it instead.").
  The mock uses the newer wording as given; pick one and update the other
  so the app doesn't end up with two true sentences for the same state.

**Accessibility (WCAG 2.2 AA).**

- **Modal, explicit order.** `capture-orbit` sets
  `accessibilityViewIsModal`; on open, focus moves to Voice first, then
  Write, then Photo, then the trigger-as-close last — **Voice → Write →
  Photo → Close**. The two-finger-Z escape gesture or a swipe past Photo
  also closes it.
- **Targets.** Each orbit item's full hit area (56pt badge + label chip)
  exceeds 44×44pt; the trigger is 72pt; `card-scan-shutter-button` is 72pt;
  `card-scan-album-button` and `-close-button` are 44×44pt.
- **No icon-only doors.** Every orbit item shows its word in the paper chip
  beneath its icon. The camera's shutter, close and album controls are
  icon-only, justified the same way `settings-button`'s gearshape is — each
  is a single, universally recognised camera convention with a VoiceOver
  label, not a command hidden with no spoken equivalent.
- **Reduce Motion.** The fan-out and the trigger's icon swap drop to a
  120ms opacity crossfade only, no translate or scale; the recording dot and
  the field caret both freeze rather than pulse/blink.
- **Dynamic Type.** At the largest accessibility size, the orbit hides and
  converges to a plain full-width stacked list (Voice, Write, Photo in that
  order) — the same convergence pattern `capture-radial.html`'s arc already
  established.
- **Contrast, no new pairings.** Orbit item words: `ink` on `paper` chip
  (12.0:1). Offline meta: `ink` at `textOpacity.quiet` on the same chip
  (5.0:1). `card-scan`'s hint text is `paper` on the camera placeholder,
  which is sensor content, not a themed app surface, kept at full opacity so
  it stays legible regardless of what the lens sees.
- **Colour never carries meaning alone.** Recording says "Recording" and
  the time; offline says "Needs a connection" and the explanation dialog's
  own sentence; denied states always pair with a sentence and a way forward
  (Settings, or the album, which stays usable).

**Names, if this ships** (to add to `docs/design/component-names.md` in the
implementing PR):

- `capture-orbit-trigger` (new) — the round button on `home`; state
  `--open` (✕). Takes over `record-button`'s slot and size; no longer
  records.
- `capture-orbit` (new) — the open radial menu: the scrim, the three items,
  the trigger acting as Close.
- `capture-orbit-item--voice` / `--write` / `--photo` — the three round
  doors.
- `card-scan` (new) — the full-screen camera. `card-scan-frame`,
  `-shutter-button`, `-album-button`, `-close-button`, `-retake-button`,
  `-use-photo-button`, `-denied-line`, `-open-settings-button` (all new).
- `record--picture` and `photo-offline-notice` — already proposed in this
  document, reused unchanged; `photo-offline-notice` is now triggered
  directly from the orbit's Photo item rather than from a photo-source
  sheet, since this flow has no sheet to trigger it from.

No new tokens proposed — every surface reuses `moss`, `ink`, `paper`,
`edge`, `line`, `placeholder`, `scrim`, and the one named `alert` exception
(the recording indicator).

## Final choice (in progress)

Owner, 2026-10-13.

- **Orbit flow.** Home's round button is a trigger: **T2, "+" only**, with the VoiceOver label "New note"; it becomes ✕ when open. Opening it dims the screen and shows Voice (12 o'clock), Write (10) and Photo (2), each with its word.
- **Scope S-a, notes and cards.** Photos of handwritten notes, screenshots and business cards all go through `record--picture`, and the album is available. This is a V1 scope change: PROJECT_SCOPE.md and PROJECT_SCOPE.ko.md (Must Have and Entry-Input Channels) and the privacy policy need amending in the PR that builds it.
- **Offline.** The Photo circle shows "Needs a connection"; tapping it explains, and no camera opens.
- **Voice screen.** Being redesigned: one card, transcript, timer under it, three controls (Start over / Done talking / Pause). See record-flow.md, "Voice screen — owner's redesign".
- **Still to settle.** The Write screen and the Photo screens.
