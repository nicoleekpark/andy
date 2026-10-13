# Record flow — making a note (`record`, `record--transcript`, typing)

Device QA build 4 items #15, #16, #17 and #21 (`dev-reports/qa-device-build-4.dev.md`
§1 and §2). Brief written by `product-strategist` on 2026-10-12, for
`product-designer` to design **three options with mocks**. The owner picks one.

Screens and parts are named as in `docs/design/component-names.md`. Parts that do
not have a name there yet are marked **(new)**. They are proposals, and the
implementing PR adds them to that file.

## Brief

### 1. Already decided — do not reopen

- **copy-build-4** (`docs/design/decisions/copy-build-4.md`, owner chose A for every
  item on 2026-10-11): `read-button` is "Let Andy read it" (busy: "Reading…").
  `transcript-lead` is "Is this what you said? Fix any name or word, then let Andy
  read it." Every step of making a note, `review` included, is titled "New note".
  `nav-bar-back` is the chevron alone. `note-source-hint` is gone from `review`.
- **Offline notes** (`PROJECT_SCOPE.md` Must Have): with no connection, a recorded or
  typed note is kept on this phone word for word (`keep-note-button` "Keep this note").
  Andy reads it once the phone is back online.
- **#52**: drafts will be saved on the phone, with "Continue / Discard" on return. This
  is a separate slice. This brief only adds what that draft has to hold (§5, R13).
- **#30**: `review` will get a "Someone you've written about…" search, to link a
  misheard name to the right person. This is a separate slice. §5 R6 asks the designer
  to treat it as **the same person search** that `about-field` uses, not a second one.

### 2. The problem

Three moments, one job:

- **#15**, `record--ready`: the owner finds the layout and proportions weak. Today
  it is a tall empty area with one centred line, then three stacked pills of near-equal
  weight: Record, Scan a business card, Type it instead.
- **#16 and #17**, typing: the screen is one blank box, "What do you want to remember?".
  It gives no place to say who the note is about, and no hint that a quick list is fine.
- **#21**, `record--transcript`: the step where you check what was heard. It reads as
  a wall of text with buttons under it. It needs to be quicker to understand.

**The job (JTBD):** *"I just talked to someone and I'm about to lose what they told
me. Get it out of my head and onto the right person before the next conversation
starts."*

**The user's state when it happens** (an assumption from the owner's own use and the
scope's convention story, not user research):

- Standing at a convention, between two conversations, or just after a meeting
  (the post-meeting nudge opens `record--scoped`).
- The phone is in one hand, and often the other hand holds a coffee, a badge or a
  bag. It may be noisy, there may be no signal, and someone may be within earshot,
  which is when typing beats speaking.
- 30 to 90 seconds of attention. The person's name is the thing most at risk, and it
  is also what decides where the note lands.

**The smallest useful outcome:** the words are safe (saved, or kept on the phone)
and filed against the right person. Every detail can be fixed later on `note`. A
note filed against the wrong person, or a person invented by a misheard name, cannot
be fixed easily. So **getting the name right is the step to protect, and every other
step should be fast.**

### 3. Success criteria

Andy has no analytics (promise 4), so every criterion here is something a person can
see on a device. Each one is a hypothesis.

**The one metric: the owner's one-handed run on the build that ships this.** The
owner stands, holding the phone in one hand, and makes six scripted notes:

1. Voice, from home, about someone new.
2. Voice, from home, about someone already in Andy.
3. Voice, from someone's page (`record--scoped`).
4. Typed, about someone already in Andy.
5. Typed, about a name shared by two people.
6. Typed while offline.

**Pass:** every note lands on the right person, no wrong person is invented, and the
owner never has to stop and work out what a screen or button does. **Kill:** any
note filed against the wrong person, or any "where am I / what does this do"
moment. Either one means the option failed, however it looks.

**Supporting checks:**

- **Taps** (counted from mocks, then on the build): a typed note about someone
  already in Andy, from home to `remember-button`. Hypothesis: picking them in
  `about-field` removes the `review` "This {name}?" question, so this costs at most as
  many taps as today, and no more typing.
- **TestFlight, #21:** a tester who has never seen `record--transcript` is shown it and
  asked two things: "Can you change these words?" and "What happens if you tap the
  green button?". Pass: they answer "yes" and "Andy reads it / goes on". Fail: they
  answer "no" or "it saves".
- **"Add a name first — Andy couldn't tell who this is about."** on `review`: if a
  layout works, this line should show up less often in the owner's own use. It is
  observed, not counted.

### 4. States the options must cover

Each option shows every row below. A row can show "same as today" where nothing
changes.

| State | Name | What is true |
|---|---|---|
| Ready, from home | `record--ready` | Nothing said yet. Three ways in: speak, scan a card, type |
| Ready, from a page | `record--scoped` | The person is already known (`record-prompt--scoped`). Card and typing are available too |
| Mic permission not yet asked | `record--ready` | The iOS prompt appears on the first tap of `mic-button`, never before |
| Mic or speech denied | `record--ready` + error | The typing door stays fully usable |
| Listening | `record--listening` | Only Stop, and Start over once words exist. The two other doors are hidden |
| Check what was heard | `record--transcript` | The words, editable, with "Let Andy read it" and "Record again" |
| Typing | `record--typing` **(new)** | The two fields (§5) with "Let Andy read it" and Cancel |
| Typing, from a page | `record--typing` + `about-field--declared` **(new)** | `about-field` already holds the person |
| Reading | `extracting` | "Reading…", or "Reading the card…" for a card |
| Offline, voice | `record--transcript` + `offline-hint` | On-device speech still works where the phone has a model. Otherwise: "Speech needs a connection for this language — type it instead." |
| Offline, typed | `record--typing` + `offline-hint` | `keep-note-button` replaces `read-button` |
| Waiting note opened | `record--typing` / `record--transcript` | Opened from `outbox-line-action`. Read at once when online |
| Card | `record--ready` → reading → `review` | No `about-field`: the card names its own person |
| Read failed | any + error | The words stay on screen, and "Let Andy read it" works again |

### 5. Rules

**R1. Every door feeds the same pipeline.** Voice, typing and card all end at
`review` through the same extraction and the same `notes.saveCapture`. No option
may add a second way of saving.

**R2. Recording starts only on an explicit tap of `mic-button`.** No auto-start when
the screen opens. Three reasons: permission is asked at the point of use
(`CLAUDE.md`); a microphone that opens by itself in a room of people is a trust
failure; and the "armed capture" from the widget is V1.1, so nothing here is designed
toward it.

**R3. `about-field` (new) — "About who?".** It is the first field on `record--typing`.
It is **optional**: "Let Andy read it" needs words in the body, never a name.

- **Empty:** extraction works out who the note is about from the words, exactly as
  today.
- **Typed but not picked:** the text is sent as the note's subject. This is the
  `aboutName` / `<subject>` mechanism that `record--scoped` already uses
  (`convex/extraction.ts`, `convex/extractionPrompt.ts`), so the named person becomes
  the primary. What the user wrote outranks the model's guess. **It does not count as
  declared:** `review` resolves it through `profiles.resolveNames`, like any name
  Andy heard. If anyone answers to it, `review` asks "This {name}?" or
  "Which {name}?", and saving waits for the answer. One person answering to a name
  does not mean the note is about them (User Flow).
- **Picked from a suggestion:** this counts as **declared**, exactly as if the note
  had been recorded from that person's page. The field's text is replaced by the
  person's filed name, so `<subject>` carries the name `saveCapture` will check
  against. That profile id is sent as the subject's resolution, and `review` asks
  nothing about the subject. Editing the text after picking un-declares it, the same
  rule `subjectDeclared` already applies on `review`.
- **It is not a hint:** a non-empty `about-field` **replaces** extraction's choice of
  primary. It does not just steer it. A hint the model can override would let the
  screen say one person while the note is filed on another.

**R4. Names are not unique, and one person may have several (`CLAUDE.md`).**

- The suggestions match against `namesOf` (the filed name and its aliases). When a
  suggestion is reached through an alias, the row shows it as a meta line, e.g.
  `also Em`.
- A typed name that matches several people is **never refused, merged or
  auto-picked.** Suggestions list every one, each with `describePerson` (the same
  meta line as `name-choice-meta`). If the user picks none, `review` asks.
- Picking "none of these" is not required. Leaving the text as typed is the way to
  say "decide later".
- Suggestions may match more loosely than `resolveNames` (for example by any word,
  so "Watson" finds Emily Watson: the "Mrs. Watson" case behind #30). That is fine,
  because a suggestion only *offers*: picking one gives an id that `saveCapture`
  verifies. **Text that was not picked goes through `resolveNames` and nothing else.**
  The implementer must not write a second matching rule for the unpicked case.

**R5. One subject per note.** `about-field` holds one person. Text such as
"Priya and Tom" is not parsed; `review` shows the resulting name, and the user fixes
it there. Everyone else in the note becomes a mention (`also-came-up-label`). The
length limit is `MAX_NAME_CHARS`, the same limit the server enforces.

**R6. One person search, built once.** The `about-field` suggestions and #30's
"Someone you've written about…" on `review` are the same component and the same query
(people you've written about, by name and alias). Offline, both search the phone's
copy, as Ask's name search already does. Whichever slice ships first builds it, and
the other reuses it. **[call] Sequencing: #30 first, or both together?** I recommend
#30 first, because it fixes a wrong filing that already happens.

**R7. From a person's page (`record--scoped`):** `about-field` is prefilled with that
person and declared (`about-field--declared`). It can be changed, and changing it
un-declares it (R3). Voice from a page keeps today's behaviour.

**R8. No `about-field` for a card.** The card names its person, and the card path takes
no subject today. Scanning a card from someone's page keeps today's behaviour (the
card decides who it is about). This brief does not change that.

**R9. `about-field` on voice — [call].** `record--transcript` and `record--typing`
are one editor today ("the same editor for two doors"). The options must show one of
these two:

- **(a) Both doors get `about-field`, empty and optional.** One model to learn, and a
  place to fix a misheard name before anything is read. Cost: an extra field on a
  screen whose usual answer is "looks fine".
- **(b) Typing only.** Voice relies on the spoken name, and the name is checked on
  `review`.

I recommend **(a)**, with the field visually quiet. The designer may show (b) as one
of the three options. Either way, **no name is pre-filled by guessing**: there is no
model call before "Let Andy read it". It would be a second paid call, and the first
time words leave the phone without the user tapping for it.

**R10. Body: no format choice is required (#17).** Andy reads a paragraph and a list
equally well. The note's words reach Claude unchanged, line breaks included
(`neutralizeTags` keeps them), and extraction turns either one into the same details.
So:

- The body accepts both. Return makes a new line. A line starting with "-", "•" or
  "*" is just text.
- Line breaks must survive everywhere the words are shown later (`note-source-text`,
  `note-entry-source-toggle`) and the offline outbox. That needs a QA row.
- **Recommendation: no paragraph/bullet toggle.** It is a choice that does not change
  the outcome, since the same details come out either way, and every extra visible
  choice costs decision time (Hick–Hyman law). Voice cannot produce bullets anyway, so
  the toggle would exist on one door only. The placeholder (§7) tells the user that
  both work, which is what the toggle was meant to communicate.
- The designer may still show a format control or auto-continued bullets (as in Notes)
  as one option, so the owner can see it. **Scope flag:** anything that stores or
  renders formatting (markdown, rich text) is a new storage and rendering feature. It
  is out of scope (§9). Plain characters in plain text are fine.

**R11. `record--transcript` (#21): what it is for.** You glance, fix a misheard name if
there is one, and move on. Most of the time there is nothing to fix.

- The keyboard stays closed on arrival (today's behaviour, keep it).
- The words must look editable without being read about. `note-source-field` already
  has an underline; keep at least that.
- `read-button` is the one primary action and sits within thumb reach.
  `record-again-button` is visibly secondary.
- Nothing on this screen saves. Saving is only `remember-button` on `review`. The
  layout must not imply otherwise: for example, no checkmark, and no "Done".

**R12. Leaving with words on screen.**

- "Record again" on `record--transcript`, or Cancel on `record--typing`, with words
  present: ask first in a `confirm-dialog` (§7). Untouched heard words go without
  asking, because Record again is the obvious way to redo them.
- An empty field leaves without asking.
- `alert` red is not used: STYLE.md keeps it for three deletions.

**R13. #52 drafts.** Whatever the #52 slice keeps on the phone must include
`about-field`'s text **and** whether it was picked (the profile id). Otherwise a
restored draft silently loses the declared person. The offline outbox has the same
gap: today it stores `aboutProfileId` only, so a typed, unpicked name has to be added.
That is phone storage, so it goes through `forgetOnThisPhone` and its test in the
same PR (`CLAUDE.md`).

**R14. What leaves the phone, and when.** Nothing goes to Anthropic until "Let Andy
read it". At that tap, the body **and** `about-field`'s text go, the same as a
scoped name does today (`ENVIRONMENTS.md` §2). Suggestions are a name search over
the user's own people: no Claude, no OpenAI, no new disclosure. Speech recognition
may use Apple's servers where the phone has no on-device model. That is unchanged,
and the permission strings already avoid promising otherwise.

### 6. Layout guidance (#15) — the product's side; the designer owns the rest

- **Priority:** speaking is the core door, so `mic-button` is the dominant control in
  the lower, thumb-reachable part of the screen. Card and typing are clearly
  secondary, but never hidden behind a menu. In a room where you cannot speak, typing
  is the main door, and one tap must reach it.
- **One hand:** in Hoober's 2013 field study, 49% of people held the phone in one hand
  and tapped with the thumb ([UXmatters](https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php)).
  That data predates today's larger phones, so treat it as direction, not a
  measurement. Primary actions go low; the top of the screen is for reading.
- **Listening must be unmistakable without colour:** the label changes (Record → Stop)
  and the live words appear. Any level meter or motion stops under Reduce Motion, and
  **must not be the thread**: in STYLE.md, the thread's "pass" means waiting for
  something, never listening.
- **The empty space has a job:** on `record--ready`, the area where the words will
  appear is the right place for `record-prompt`. Do not fill it with decoration. Brass
  stays on the Briefing card only.
- `debug-panel` is `__DEV__` only and does not appear in testers' builds. Mocks
  should leave it out.

### 7. Copy

Final strings, sentence case, following STYLE.md Voice and Terminology. The designer
may move a line, but changes its words only through `## Open disagreements`.

| Part | String |
|---|---|
| `record-prompt` (home) | Tap record. Say who it's about and what you want to remember. |
| `record-prompt--scoped` | *(unchanged)* Tap record. This note goes to {name}, whoever else comes up. |
| `mic-button` / listening / starting | Record / Stop / Starting… *(unchanged)* |
| `record--listening` empty line | Listening — say what's new. *(unchanged)* |
| `about-field` label **(new)** | About who? |
| `about-field` placeholder | Their name (optional) |
| `about-field` VoiceOver | About who? Optional. |
| `about-field-suggestion` **(new)** | {name}, then the `describePerson` meta line, e.g. `friend · 4 notes · last 2026-10-02`; `also {alias}` when found by an alias |
| suggestion VoiceOver | {name}, {meta}. Picks this person. |
| `about-field-hint` **(new)**, several match, none picked | You've written about {n} people called {name}. Pick one, or Andy will ask after reading. |
| `about-field-hint`, typed name matches no one | *(nothing — `review` already says "Someone new — no one by this name yet.")* |
| `about-field--declared` change **(new)** | Change |
| body label (typing) | What do you want to remember? |
| body placeholder | Anything they told you — a few sentences or a quick list. |
| body placeholder, declared person | Anything {name} told you — a few sentences or a quick list. |
| body VoiceOver (typing) | What do you want to remember? |
| `note-source-label` (voice) | What you said *(unchanged)* |
| `transcript-lead` | *(decided)* Is this what you said? Fix any name or word, then let Andy read it. |
| `read-button` | *(decided)* Let Andy read it / Reading… |
| `record-again-button` | Record again *(unchanged)* |
| typing cancel | Cancel *(unchanged)* |
| leave-with-words `confirm-dialog` title | Discard this note? |
| body (typed) / (heard) | What you wrote won't be kept. / What Andy heard won't be kept. |
| actions | Discard (moss) · Keep editing (`confirm-dialog-cancel`) |
| mic denied error | Andy needs the microphone and speech recognition to take a voice note. Turn them on in Settings, or type it instead. |
| picked person no longer exists (save refused) | {name} isn't in Andy any more. Pick someone else, or leave About who? empty. |

Notes on the copy:

- **"About who?"** keeps the owner's words. "About whom?" is correct but stiff, and
  Andy's voice is plain. "Who is this about?" is the fallback if a tester stumbles
  over it.
- **The `record-prompt` change** asks for the name out loud. It is the one cue that
  lets extraction find the subject, which is a Fogg *prompt* aimed at the step that
  fails most. Hypothesis: "Add a name first" shows up less on voice notes. Kill
  condition: testers start every note with a stiff "This is about…", and the words
  read worse.
- **The mic-denied line** ends with the typing button's own words (one action, one
  name), so the way forward is on screen.
- **Banned words, as always:** profile, contact, entry, record (the noun), fact,
  data. The `about-field` hint says "you've written about", never "you keep".

### 8. Accessibility (WCAG 2.2 AA, a hard rule)

- **Targets:** every target is at least 44×44pt, `about-field-suggestion` rows
  included.
- **Text:** text scales with Dynamic Type. At the largest sizes, `read-button` and
  `mic-button` stay reachable by scrolling and are never clipped.
- **Labels:** each VoiceOver label starts with the visible words (2.5.3). The
  recording state is announced when it changes ("Recording", "Stopped").
- **Suggestions:** when suggestions appear, say how many ("2 people found"), without
  stealing focus from the field.
- **Contrast:** the placeholder uses `colors.placeholder`. A field's only edge uses
  `colors.edge`, and a disabled `read-button` is exempt.
- **No colour-only states:** listening and declared are both shown in words.

### 9. Out of scope

- Storing or rendering formatted text (markdown, rich text, real bullets). A toggle
  that does that is a scope change.
- Saving drafts (#52), the `review` person search (#30), editing tags on `review`
  (#31), and editing a saved note's words (#48). Each is a separate item.
- Anything widget- or Siri-shaped: armed recording, auto-start. These are V1.1, and
  this design must not be built toward them.
- A language picker or Korean capture (V1.1), keeping the audio, and video.
- A pre-permission screen for the microphone. Tapping Record is already the context,
  and the usage string carries the explanation. Revisit only if testers deny the
  permission out of surprise.
- Several subjects in one note, and any change to how cards decide their person.
- Changing `review` beyond receiving a declared subject from `about-field`.

### 10. Open questions for the owner

- **[call] R9:** should voice get `about-field` too, (a), or only typing, (b)?
  Recommended: (a), quiet.
- **[call] R3:** should picking a suggestion count as declared, so `review` asks
  nothing about the subject? Recommended: yes, the same as recording from their page.
- **[call] R7:** from someone's page, should the person show as a prefilled field, or
  as one line with Change? Recommended: whichever reads more clearly as "already
  decided"; the designer shows both.
- **[call] R10:** paragraph/bullet toggle? Recommended: no toggle, just a placeholder
  saying both work. The designer may show one.
- **[call] R12:** should leaving with words ask first? Recommended: yes, and only when
  there are words.
- **[call] R6:** should #30 ship before this slice, or with it? Recommended: first.
- **[call] §7:** the voice `record-prompt` that asks for the name. Recommended: yes.

**Scope:** no change needed if the recommendations above are taken. `about-field` is
a second input on the existing typed door, it reuses the existing `aboutName` path,
and it searches a name index that already exists, online and on the phone. R13 adds a
field to phone storage, which is a convention to follow, not a scope change.

## Options

_Written by `product-designer`: three options, each covering every state in §4, with mocks._

Mocks (HTML approximations of native screens, not production code; 390pt phone
frame; tokens declared as CSS variables named like `src/constants/theme.ts`;
every state in §4 reachable from the rig above the frame):

- `docs/design/mocks/record-flow-a.html` — Option A
- `docs/design/mocks/record-flow-b.html` — Option B
- `docs/design/mocks/record-flow-c.html` — Option C

### Design read

**Existing patterns to preserve.** `review` already has the shape this brief
reuses: a label drawn in uppercase through one shared `fieldLabel` style, an
underline (`colors.edge`) as the only sign a field takes typing, and a
candidate-row picker (`name-choice`) for "more than one person answers to
this name". `record--typing` and `record--transcript` are already one editor
in the code — same `TextInput`, same buttons beneath it — which is why `about-
field` can sit above either without becoming two different things to learn.
`record--ready`'s problem (#15) is purely a weighting one: `mic-button`,
`scan-card-button` and `type-instead-button` are drawn as three same-size
pills, so nothing says which is the default. The screens already set no
`fontFamily`, draw every border in `colors.edge` or `colors.line`
appropriately, and keep `alert` out of this flow except for genuine errors —
*except* the shipped `record--listening`, which colours `mic-button` with
`colors.alert` while recording. That one pre-existing choice contradicts both
STYLE.md ("`alert` has exactly one non-error use") and this brief's own §6
("Listening must be unmistakable without colour") — flagged below, carried
into none of the three options, and worth its own one-line fix regardless of
which option ships.

**The user's task.** Get the words down and the name right in the 30–90
seconds described in §2, one-handed, sometimes in a room where speaking is
wrong. The three moments in §2 map to three screens; the fix is the same
shape in each — make the one dominant action obvious, make "who" askable
without being forced, make "what was heard" quick to clear at a glance.

**Constraints.** Tokens only (no new colours proposed by any option below —
every treatment reuses `moss`, `ink`, `edge`, `line`, `placeholder`, `alert`,
`paper`, `scrim` as already defined). `about-field` must share its person
search with #30 (R6) rather than invent a second one. No model call before
"Let Andy read it" (R9). No toggle for paragraph vs list (R10), though one
option may show the alternative the brief invites. `alert` stays reserved for
the three deletions (R12) — none of these options use it for Discard.

**UX risks common to all three.** (1) Adding a field to a screen whose usual
answer is "looks fine" (R9's own stated cost) — every option keeps `about-
field` visually quiet so it costs a glance, not a decision, in the common
case. (2) A declared subject that looks editable invites an accidental
un-declare — handled differently per option (R7). (3) Suggestion rows/chips
must hit 44pt regardless of how short the name is — called out per option.

### Option A — Calm hierarchy, quiet field

**Concept.** Keep today's pill-button layout, but make `mic-button` the one
filled control on `record--ready` and drop the other two doors to plain text
beneath it; add `about-field` as an ordinary field — same label style,
underline and placeholder as every field on `review` — above the body on
*both* doors (brief R9, option **a**), and render a declared subject as a
real, editable field holding the person's filed name with a small `Change`
link beneath it (R7, the "prefilled field" variant).

**Why it may work.** The Von Restorff effect: the one control drawn
differently (filled, full-width, alone) among otherwise-plain text is read as
"the thing to do" without needing to be told so — this is the layout
guidance's "mic-button is the dominant control" taken literally, achieved by
subtraction rather than addition. Recognition over recall: `about-field` uses
a shape the person has already learned on `review`, so there is nothing new
to figure out, only a new place to look.

**Strengths.** Lowest build cost of the three — no new button shape, no new
collapse/expand behaviour, reuses `review`'s existing `Field`/candidate-row
patterns almost verbatim. Matches the brief's own recommendation for R9 (a)
and keeps `about-field`'s suggestions, on both doors, as literally the same
list component #30 will add to `review` (R6, "built once"). The "quiet field"
framing directly answers R9's stated cost (an extra field on a screen whose
usual answer is "looks fine") by making it visually unremarkable.

**Weaknesses/risks.** The least visually different of the three, so it is
the most conservative answer to "the owner finds the layout weak" (#15) —
the fix is real but subtle, and a owner expecting a more dramatic change may
read it as a smaller fix than it is. A prefilled, editable field for a
declared subject (R7) is one tap away from an accidental un-declare if
someone taps into it meaning only to look.

**Design-system impact.** New: `about-field`, `about-field-suggestion`,
`about-field-hint`, `about-field--declared` (all already named "(new)" in the
brief, §5/§7 — this option is the most literal reading of those names).
Reused: `review`'s `Field` pattern, `fieldLabel` style, candidate-row
border/selected treatment, `read-button`/`record-again-button` pattern. No
new tokens.

**[call] answers, this option:** R9 → (a), both doors. R3 → yes, picking a
suggestion declares, same as recording from a page. R7 → prefilled field (one
of the two variants the brief asks the designer to show). R10 → no toggle,
placeholder only. R12 → yes, `confirm-dialog` asks, only when there are words.

### Option B — Record is the room

**Concept.** Rebuild `record--ready` around one large circular `mic-button--
primary` (new) filling the lower, thumb-reachable half of the screen, with
the two other doors reduced to a slim text row beneath it. `about-field` is
**typing-only** (brief R9, option **b**) — voice keeps its exact current
shape, relying on `review`'s existing "This {name}?" question — and on typing
it starts collapsed behind one quiet line, "+ Add who this is about"
(progressive disclosure), expanding into the field only when touched. A
declared subject (from a page, or after picking) shows as one sentence with a
`Change` link, never a field (R7, the "one line" variant).

**Why it may work.** Jakob's law: a circular record button is the shape
Camera, Voice Memos and Instagram Stories have already taught, so no label is
needed to say what it does — recognition happens before reading. Progressive
disclosure: hiding `about-field` until asked for keeps `record--typing`'s
first impression as simple as a blank note, addressing #16 without adding
visible complexity for the person who has nothing to fix. Fitts's law: a
148pt circular target in the dominant thumb zone is the largest, least
ambiguous primary action of the three options.

**Strengths.** The most visually distinct answer to #15's literal complaint
("three stacked pills of near-equal weight") — nobody could mistake the
circle for anything but the main action. `record--transcript` stays the
smallest possible surface, which is exactly what R11 asks for ("most of the
time there is nothing to fix"). The collapsed chip costs nothing when unused.

**Weaknesses/risks.** Implements R9 **(b)**, against the brief's own stated
recommendation (a) — a misheard name on a voice note has no on-screen way to
be fixed before "Let Andy read it"; the only safety net is `review`'s later
question, one more screen downstream of where the words were actually heard.
A collapsed chip costs an extra tap for "about someone I already know by
typing", working slightly against the brief's own tap-count hypothesis (§3).
The circular button is the largest new primitive of the three — most build
and Dynamic-Type QA cost (a label has to stay inside a fixed circle at the
largest text sizes without clipping, which this option alone has to solve).

**Design-system impact.** New: `mic-button--primary` (a second, larger shape
for the same control — a system question: does the app now have two mic-
button shapes, or does this one replace the pill everywhere `record--ready`
appears?), `about-field--collapsed`, `about-field-declared-line`-style
sentence-with-Change (the "one line" R7 variant, here as plain text).
Reused: today's `record--transcript`/`review` question flow, unchanged.

**[call] answers, this option:** R9 → **(b)**, typing only — shown because
the brief explicitly invites one option to, not a disagreement with the
recommendation. R3 → yes, picking a suggestion declares. R7 → one line with
Change. R10 → no toggle. R12 → yes, asks only when there are words.

### Option C — One note, two halves

**Concept.** Frame `record--typing` and `record--transcript` as two clearly
bounded sections — About, then the note itself — separated by a hairline
rule (`colors.line`), so the "blank box" complaint (#16/#17) is answered with
structure, using only copy already decided in §7 drawn through the label
style every field on this screen already uses. `about-field` is on both doors
(R9, option **a**); its suggestions render as small tappable chips rather
than full-width rows, and a declared subject becomes a filled `moss` chip
holding the name with `Change` inside it (R7, the "one line" family, chip
flavour). The body demonstrates the one format affordance the brief invites
showing (R10): typing "- " and pressing Return continues the dash on the next
line — still one plain string, nothing stored or rendered as markdown.
`record--ready`'s mic-button stays dominant, with the two other doors grouped
into a shared, undecorated tray beneath it rather than three separate pills.

**Why it may work.** Gestalt's law of common region: two labelled, separated
sections read as "this form has two parts" at a glance, which is a more
direct fix for #16/#17's actual complaint (no place to say who, no
structure) than a quiet field alone. The aesthetic-usability effect: a
visibly structured form reads as more trustworthy at the exact step (getting
the name right) where a wrong guess is hardest to undo. Auto-continuing
bullets removes the one piece of friction a quick list has over a paragraph,
without adding a visible choice (Hick–Hyman law: zero new options on screen).

**Strengths.** Most directly answers the specific wording of #16/#17 among
the three. Demonstrates R10's invited alternative without a toggle and
without storing formatting — satisfies "the designer may still show a format
control... as one option" while staying inside §9's scope line. Chip
suggestions are more compact than full rows when there are two or three
candidates, which is the common case (R4's "never refused, merged or
auto-picked" tends to produce exactly two or three).

**Weaknesses/risks.** The largest new surface among the three: a second
suggestion-rendering (chip, alongside `review`'s existing row-based
candidate), a divider pattern not used elsewhere in this flow, and a filled-
chip declared state distinct from both other options' treatments — more for
`design-system-auditor` and `__tests__/contrast.test.ts` to track. Chips are
*the same* person-search component and query as #30 (R6) with different
chrome only, but that has to be said explicitly in the implementing PR or it
reads as a second thing built. Auto-continuing bullets, however small,
is behaviour a tester could plausibly mistake for "Andy is formatting my
note" if introduced without the exact framing above.

**Design-system impact.** New: `about-field-chip` (an alternate rendering of
`about-field-suggestion`, same data), `about-field-declared-chip`, a section-
divider convention for this screen (reuses `colors.line`, no new token).
Reused: `about-field` label/placeholder, the person-search query itself (R6).

**[call] answers, this option:** R9 → (a), both doors. R3 → yes, declares.
R7 → one line with Change, as a chip. R10 → no toggle; demonstrates the
auto-continuing-bullets alternative live in the mock.

### Accessibility, all three

- **Contrast — no new pairings.** Every colour used is an existing token on
  `paper`: `placeholder` (5.0:1), `edge` as a control/field edge (3.2:1,
  WCAG 1.4.11), `ink` at full opacity (12.0:1) and at `textOpacity.quiet`
  (5.0:1) for meta lines and hints, `moss`/`paper` for filled controls
  (already the pairing `candidateOn`/`candidateNameOn` uses on `review`, and
  Option C's declared chip and Option A/B's `read-button`). No row needs
  adding to `__tests__/contrast.test.ts` beyond what already exists, unless
  the implementing PR introduces Option B's `mic-button--primary` as a
  genuinely new style rather than a resize of the existing pill, in which
  case its label-on-moss pairing should get its own row for the record even
  though the colours are unchanged.
- **Touch targets.** Every `about-field-suggestion` row (A), chip (C) or
  collapsed line (B) is a minimum 44×44pt regardless of label length, by
  fixed padding rather than content-driven sizing. Option B's circular
  `mic-button--primary` is 148pt — far over the floor — but needs a Dynamic-
  Type pass to confirm its label never clips inside the fixed circle; this is
  that option's own named risk above.
- **VoiceOver order.** Top to bottom, matching reading order on all three:
  field label → field value → (suggestion count, e.g. "2 people found",
  announced without moving focus — §8) → suggestion rows/chips → body label →
  body. The declared state's VoiceOver label should read the sentence/chip
  text followed by "Change, button" as a separate stop, not merged into one
  label, so VoiceOver users can navigate to "Change" without re-hearing the
  whole sentence.
- **Dynamic Type.** `read-button`, `mic-button` (or `mic-button--primary` in
  B) and the two secondary actions must stay reachable by scrolling and never
  clip at the largest text sizes — verify on-device for whichever option
  ships, since none of the three mocks can test real Dynamic Type scaling.
- **Reduced motion / colour-only states.** None of the three options animate
  anything beyond what already exists (`transcript-live` growing text), and
  none uses colour alone to signal listening or declared — label text and
  words on screen carry the meaning in all three, per §8's "no colour-only
  states" and §6's "listening must be unmistakable without colour".
- **Mic-denied / offline / card / read-failed.** All three mocks' rigs
  include every row of §4's state table; offline swaps `read-button` for
  `keep-note-button` and adds `offline-hint` identically across options
  (copy is already decided, §7), and a card read shows no `about-field` in
  any option (R8).

### A design-system inconsistency found, not introduced by any option

`capture-screen.tsx`'s shipped `record--listening` colours `mic-button` with
`colors.alert` (the `recording` style). STYLE.md reserves `alert` for errors
and the three deletions, and this brief's own §6 says listening must be
unmistakable *without* colour. None of the three options above carry this
forward — all three show `mic-button`/`mic-button--primary` in `moss`
throughout listening, with the label change ("Record" → "Stop") and the live
words doing the work instead. Worth a one-line fix in whichever PR ships
this brief, independent of which option is chosen.

### Recommendation

**Option A.** It is the option that most directly does what the brief's own
rules already decided: R9 recommends (a), R6 asks for one person-search
component reused rather than re-skinned, and R11 asks for `record--transcript`
to stay a quick glance rather than grow a new interaction to learn. Option A
delivers the hierarchy fix (#15) by subtraction — one filled pill, two plain-
text doors — which is the lowest-risk way to make `mic-button` unmistakably
dominant without inventing a new control shape (Option B's circle) or a new
divider/chip vocabulary (Option C) that would need its own QA and
`design-system-auditor` pass before it could be trusted. It answers #16/#17
by giving `about-field` the exact shape `review`'s fields already have, so
there is nothing new to learn, and it keeps the owner's tap-count hypothesis
in §3 intact (picking a suggestion in `about-field` removes `review`'s "This
{name}?" question at no extra cost). Option C's structural answer to #16/#17
is genuinely stronger reading-at-a-glance, and is worth keeping in reserve if
Option A's quieter field turns out, in the owner's one-handed run (§3), not
to be noticed; Option B's circular button is the right call only if the
owner's priority shifts from "match `review`'s patterns" to "make the
record action impossible to miss" at the cost of R9's recommended safety net
on voice.

**Key interaction states (Option A), restated for the implementer:** empty
`about-field` changes nothing about extraction's name-guessing (R3); typed-
but-unpicked text becomes the `aboutName` subject and still goes through
`profiles.resolveNames` on `review`, unchanged from today's scoped-recording
path; a picked suggestion replaces the field's text with the filed name and
is sent as a declared subject, exempting it from `review`'s "This {name}?"
question (R3, R9); editing that text afterwards un-declares it, same rule as
`subjectDeclared` today; leaving `record--typing`/`record--transcript` with
non-empty `about-field` or body text asks via `confirm-dialog` ("Discard this
note?", moss Discard / plain Keep editing — never `alert`, per R12); an
empty field or untouched heard words leave without asking.

**Components/tokens reused:** `confirm-dialog`, `review`'s `Field`/candidate-
row pattern, `read-button`/`record-again-button`, `colors.edge`/`placeholder`/
`moss`/`ink`/`line`, `space`/`textSize`/`radius` as already defined. **New,
to add to `docs/design/component-names.md` in the implementing PR:**
`about-field`, `about-field-suggestion`, `about-field-hint`, `about-field--
declared` (all already named "(new)" in this brief) — no further additions
needed for Option A specifically.

**Assumptions, labelled as hypotheses:** that "quiet" (same visual weight as
existing fields) is enough for `about-field` to be noticed when it matters
and ignored when it doesn't — tested by the owner's one-handed run (§3) and
by whether "Add a name first" shows up less often in their own use. That
dropping two pills to plain text is itself enough to fix the owner's
"near-equal weight" complaint without a bigger shape change — tested the same
way, and falsifiable: if the owner's run still produces a "what does this
button do" moment at `record--ready`, Option B's larger, shape-distinct
primary control is the next thing to try, not a smaller tweak to Option A.

## Product review

_Pending the options._

## Open disagreements

_None yet._

## Final choice

Owner, 2026-10-12: **Option A**, plus the recording state:

1. **Elapsed time.** Shown while recording as m:ss. VoiceOver reads it on request, not every second.
2. **Recording is unmistakable.** A **red** recording indicator (`alert`) with the word "Recording" and the time, so meaning never rests on colour alone. The dot pulses slowly, and holds still under Reduce Motion. STYLE.md gains a second named exception for `alert`: the live recording indicator, the universal convention (Voice Memos, Camera, screen recording). This supersedes the designer's moss proposal.
3. **Pause.** Pause stops listening and keeps the words so far. Resume starts listening again and appends; a short gap at resume is possible, because expo-speech-recognition has no native pause. Paused shows "Paused · m:ss" with Resume and Done.
4. **Finishing.** While recording, **Done** is large and **Pause** is small beside it, so finishing is one tap. While paused, Resume and Done.

### Voice screen — owner's redesign

Owner, 2026-10-13, sent a reference (a voice-recorder screen) and asked for
Andy's Voice door to carry its feel: one large rounded card filling the
screen; a live waveform with a playhead; the elapsed time centred below the
main area, above the controls; a bottom row of three controls — a large
centre button (a rounded-square stop glyph inside a thin ring) with a small
icon on each side. This section is that adaptation, built on this document's
own Final choice above (Option A, `about-field`, the `alert` recording
indicator, large Done / small Pause) and on `capture-doors.md`'s "Owner's
orbit flow," which this now sits inside: Voice is a `capture-orbit` door that
opens straight into `record--listening`, so `record--ready` (the mic-glyph
"before" state) is now the rare case, not the usual first screen.

Mock (interactive, every state below reachable from the rig above the phone
frame, the same convention this project's other mocks use):
`docs/design/mocks/voice-screen.html`.

This is a single owner-directed redesign, not three options to choose
between — the reference and the Final choice above already decided the
shape. What follows is the spec, the places it had to depart from the
reference on purpose, and the accessibility pass, the same way
`capture-doors.md`'s "Owner's orbit flow" is written.

#### What changed from the reference, and why

- **Waveform → live transcript.** The words themselves are the thing worth
  looking at, not a visualisation of the sound making them (brief §6: "Do
  not fill it with decoration"). `transcript-live` becomes the largest
  element on screen by area — not by font size. Every line stays one
  uniform size; recency is carried by `ink` opacity alone (newest line at
  full `ink`, the one before it at `textOpacity.secondary`, everything
  older at `textOpacity.quiet` — never below the 5.0:1 floor). A uniform
  size keeps Dynamic Type simple (one thing to scale, not several) and
  avoids a second visual flourish competing with the transcript for
  attention, on a screen that already spends STYLE.md's named exception on
  the recording indicator.
- **A caret, not a playhead.** A thin vertical mark (`transcript-caret`,
  new) blinks after the last character while actively listening — Andy has
  no audio waveform to put a playhead on, and a text caret says "more is
  coming" the way a cursor always has. It disappears the moment listening
  stops or pauses (nothing to insert into). Reduce Motion: solid, visible,
  never blinking. Decorative — hidden from VoiceOver, since "Recording"
  plus the timer already say what it would otherwise duplicate.
- **No second background tone, no shadow.** The reference's card sits on a
  visibly lighter page behind it. Andy's whole palette is six colours
  (STYLE.md), and `paper` is the only background anywhere in the signed-in
  app — adding a second neutral or a drop-shadow token for one screen is
  the ad-hoc drift the tokens rule exists to prevent, and STYLE.md already
  made the same call once, dropping the Briefing card's torn-edge border
  for the same reason (Signature Element: "the stripe already sets the
  card apart… drawn by hand was weighed against dropping it, and
  dropped"). The card read here is a `1px colors.edge` outline at
  `radius.card`, inset by `space.sm` from the screen's edges — the shape
  alone carries "a card," no new colour or shadow token proposed. The
  `nav-bar` stays outside the card, as the one piece of chrome every screen
  in the app already shares.
- **The old secondary doors are gone, not hidden.** `record--ready`'s
  previous "Scan a business card" / "Type it instead" row does not appear
  anywhere in this redesign. Under the orbit flow, Write and Photo are
  their own `capture-orbit` doors, reached from `home`, not links on the
  Voice screen (`capture-doors.md`, "Owner's orbit flow," points 4–5). This
  is a real simplification, not an oversight: once Voice is its own door,
  the screen it opens only ever needs to do one job.

#### The controls row

Three slots, LEFT · MAIN · RIGHT, 52pt / 76pt / 52pt, all over the 44pt
floor. LEFT and RIGHT are a quiet `edge`-ringed circle (no fill, `ink`
icon); MAIN is a filled `moss` circle inside a thin outer ring, holding a
`paper`-coloured icon — the reference's "rounded-square glyph inside a thin
ring," read literally.

| State | LEFT | MAIN | RIGHT |
|---|---|---|---|
| `record--ready` | *(empty slot, reserved)* | mic glyph. Tap: starts listening. VoiceOver "Record" | *(empty slot, reserved)* |
| `record--listening`, no words yet | *(empty slot, reserved — nothing to clear)* | stop glyph ("Done talking"). Tap: moves to the editable review | pause glyph. Tap: pauses |
| `record--listening`, words exist | **trash glyph** (`start-over-button`). Tap: opens `start-over-alert` | stop glyph, ring tinted `alert`, pulsing | pause glyph |
| `record--paused` **(new)** | trash glyph, unchanged | stop glyph, ring back to plain `edge`, static | play glyph ("Resume"). Tap: resumes, appending |
| `record--transcript` (after Stop) | *(row removed entirely — see below)* | | |

- **LEFT stays empty, not just disabled, until words exist.** Carrying
  forward this document's own existing rule for the old layout
  ("`record--listening` … Start over, once words exist" — §4 of the brief
  above): there is nothing to start over from before the first word, so the
  slot is reserved but invisible rather than shown greyed-out. MAIN never
  shifts sideways between the two states, which matters because it is the
  one control present in all of them.
- **MAIN's ring is the "subtle live indication," not the fill or a
  progress arc.** The brief's own instruction ("the MAIN ring may show a
  subtle live indication — not a fake progress arc") is answered by tinting
  the ring itself `alert` and pulsing it slowly while actually listening —
  a uniform tint across the whole ring, never a sweep, fill or arc that
  could be misread as measuring a duration or a quota. Pausing or stopping
  reverts the ring to the plain `edge` tint at once, static. Reduce Motion
  keeps the `alert` tint, drops the pulse: colour (paired with the word,
  below) carries the state; motion is never required to perceive it.
- **After Stop, the three-button row is removed, not reduced to two.**
  Once there is nothing left to pause or interrupt mid-sentence, naming the
  next two actions in words — `read-button` "Let Andy read it" (primary,
  full-width `moss` pill) and `record-again-button` "Record again"
  (secondary, plain text) — says what to do more plainly than icons would,
  and it is exactly this document's own Option A shape for
  `record--transcript`, reflowed inside the card rather than pushed to a
  new screen (see below).

#### The status line: "Recording" / "Paused"

Sits centred below the main area, above the controls row, exactly the
reference's timer position. One line, `fonts.utility` (tabular, and this
project's own convention for a word-plus-figures meta line, e.g.
`profile-row-meta`'s "4 notes · last 2026-10-02"):

- **Listening:** a small pulsing `alert` dot (decorative, `aria`/VoiceOver
  hidden) + "Recording · m:ss" — the dot and the word together, so meaning
  never rests on colour alone, per this document's own Final choice.
- **Paused:** "Paused · m:ss" — no dot, plain `ink`. Paused is not a *live*
  recording, so it does not borrow STYLE.md's one named exception for
  `alert`; the word alone carries it.
- **`record-timer` (new)**, the `m:ss` figure, is read on request, not
  announced every second (this document's own Final choice, item 1) — not
  a live region. Its accessibility label is spoken in words ("1 minute 42
  seconds elapsed"), not the raw "1:42" string, which VoiceOver reads as
  stray digits and a colon.

**Flagged, not resolved — exact punctuation.** "Recording · m:ss" /
"Paused · m:ss" is this designer's own proposed format (consistent with the
app's existing meta-line convention), not literally dictated by the Final
choice above, which only fixed the words "Recording" and "Paused" and the
rule that colour never stands alone. `product-strategist` should confirm or
adjust the exact join before this ships.

#### After Stop: still no separate screen

The owner's instruction — "the transcript on the same screen becomes
editable (no separate check screen)" — is already this document's existing
Final choice in substance: `record--transcript` has always been a *state*
of the one `record` screen, not a push to another one
(`component-names.md`'s own state table for `record` already lists
`record--ready` / `--listening` / `--transcript` as one screen's states).
What changes here is only the container: the card's content swaps in place
for Option A's shape — `transcript-lead`, the unchanged `about-field`
("About who?", quiet, exactly as Option A decided), the editable
`note-source-field` holding the full heard text, then `read-button` /
`record-again-button` — reflowed inside the same card, keyboard closed
until the field is tapped, nothing on this pane implying a save (R11,
unchanged: no checkmark, no "Done").

Offline, after Stop: `offline-hint` above a `keep-note-button` ("Keep this
note") in place of `read-button`, unchanged from the existing state table.
Nothing about Voice's offline behaviour changes — on-device recognition
still works without a connection where the phone has a model; only the
*after*-Stop step (reading the note) waits.

#### A copy inconsistency this redesign surfaces, flagged not fixed

The decided mic-denied line (§7 of the brief above) ends "…Turn them on in
Settings, or type it instead." That sentence assumed the old inline
"Type it instead" link, which no longer exists on this screen under the
orbit flow — Write is now a separate `capture-orbit` door, reached only by
going back. Shown as-is in the mock (it is still the decided string), but
flagged here because the way forward it names is no longer on screen.
**Decided (owner, 2026-10-13): B — a button, not just words.** Whenever voice
cannot be used on this screen (mic or speech recognition denied, or offline
with no on-device model for the language), `record--ready` shows a filled
**Write instead** button (`write-instead-button`) under the line, which opens
the Write door directly. Both lines end "…write it instead." so they name the
button beneath them. Someone who said no to the microphone must still see, in
one step, how to leave the note.

#### Names, new or changed (for `docs/design/component-names.md` in the
implementing PR)

- `record--paused` **(new)** — a third state of the `record` screen,
  alongside the existing `record--ready` / `--listening` / `--transcript`.
- `start-over-alert` **(new)** — the `confirm-dialog`-shaped dialog LEFT
  opens while words exist: title "Start over?", body "What you said so far
  will be cleared.", `start-over-alert-confirm` "Start over" (`moss` — not
  `alert`; this is not one of STYLE.md's three named deletions, same rule
  R12 already applies to "Discard this note?"), `start-over-alert-cancel`
  "Keep recording" (plain text).
- `record-timer` **(new)** — the `m:ss` figure, `fonts.utility`.
- `transcript-caret` **(new)** — the blinking insertion mark at the end of
  `transcript-live` while listening; decorative, VoiceOver-hidden.
- `pause-button` **(new)**, states `pause-button--paused` ("Resume") — RIGHT.
  `start-over-button` already exists in `component-names.md` (today a text
  link; here a 52pt trash icon — same role, new look, per naming rule 6).
- `mic-button` / `mic-button--listening` are unchanged in name; their
  *shape* changes from a full-width pill to the 76pt ringed circle above,
  and `mic-button--listening`'s VoiceOver label changes from "Stop" to
  "Done talking" (flagged above as superseding this document's own copy
  table for the spoken word only — the visible glyph carries no text to
  begin with, so 2.5.3 does not require the two to match).

No new colour, spacing, radius or opacity tokens. `textSize.xxl` (the
transcript), `fonts.utility` (the status line and timer), `colors.edge` /
`colors.alert` / `colors.moss` / `colors.ink` / `colors.paper`, `space.sm`
(the card inset), `radius.card` and `radius.pill` are all reused as already
defined.

#### Accessibility (WCAG 2.2 AA)

- **Targets.** MAIN 76pt, LEFT/RIGHT 52pt — both already over the 44pt
  floor the brief's own §8 sets.
- **Contrast, no new pairings.** `edge` ring 3.2:1 (WCAG 1.4.11); the
  `alert` ring/dot is the pairing this document's own Final choice already
  approved for the recording indicator (≥3:1, a meaningful graphic, not
  text); `ink` on `paper` 12:1 for every icon and the transcript's newest
  line; dimmed transcript lines never below `textOpacity.quiet` (5.0:1).
- **VoiceOver order:** transcript → timer/status → Start over → Done
  talking → Pause — the task's own stated order, and already the natural
  top-to-bottom, left-to-right reading order, so no override is needed.
- **No colour-only state.** "Recording" and "Paused" are both spoken
  words, never only the ring's tint or the dot's presence (brief §6,
  unchanged).
- **Icon-only controls, justified.** Mic, stop, pause, play and trash are
  each a single, universally recognised recorder convention (Voice Memos,
  Camera, every voice-note app) — the same exception
  `card-scan-shutter-button` already relies on in `capture-doors.md`, each
  with its own VoiceOver label rather than a command with no spoken
  equivalent.
- **Dynamic Type.** The transcript grows; the three round controls keep
  their fixed size, since none of them holds visible text to reflow —
  verify reachability on a device, which this HTML cannot simulate.
- **Reduce Motion.** The status dot, the MAIN ring's pulse and the
  transcript caret all drop their animation and hold a static, still
  visible state (try the mock's own Motion toggle). Auto-scroll jumps
  rather than animates.
- **Permission-denied / no-on-device-speech.** Both unchanged from the
  existing `record--ready` + error state table row; the typing-door phrase
  inside that error string is the one flagged inconsistency above, not
  silently kept or silently rewritten.

#### Open questions for the owner / `product-strategist`

- The exact status-line punctuation ("Recording · m:ss") — proposed, not
  decided.
- ~~The mic-denied line's "...or type it instead"~~ — decided 2026-10-13:
  "…or write it instead." plus a `write-instead-button` (see above).
- Whether `record--scoped`'s existing behaviour (prefilled, declared
  `about-field` from a person's page) still reaches this screen the same
  way under the orbit flow, or only through the still-unsettled "Write"
  door — `capture-doors.md`'s Final choice marks Write and Photo as "still
  to settle"; this section assumes Voice-from-a-page is unaffected, since
  the orbit flow's own Final choice only speaks to `home`'s entry.

#### Revision 2026-10-13

The owner sent a second reference (a recorder with a large time readout
under the waveform and a controls row — Stop left, a red outlined pill
holding a red ⏸ centre, labelled "Paused"/the current state, Delete right —
each control carrying a small text label beneath it) and four pieces of
feedback on top of the redesign above. This subsection records what changed
and why; the sections above are left as the history of how this screen got
here, not rewritten to match. The mock (`docs/design/mocks/voice-screen.html`)
is updated in place and carries its own dated note at the top and inline in
the side notes — read the mock for the interactive version of everything
below.

**1. The transcript is top-anchored, not bottom-anchored.** The first line
now sits at the top of the transcript area and the block grows downward;
once it overflows, the screen auto-scrolls to keep the newest line visible,
the same way the render step already pinned `scrollTop` to `scrollHeight`
before this revision. Only the CSS anchor changed (`justify-content:
flex-end` → `flex-start`) — the line order in the markup was already
oldest-to-newest, top-to-bottom, so nothing about *that* needed to change.

**2. "Recording" and its dot are gone.** Nothing on screen says the word
"Recording" any more, and there is no pulsing dot. While listening, the
state is carried by three things together: the timer running, the centre
control's pause glyph tinted `alert`, and a one-time VoiceOver announcement
("Recording.") fired once, when listening starts — not a live region, not
repeated on resume. **STYLE.md consequence:** its "second named exception
for `alert`" (this document's own Final choice, item 2, "the live recording
indicator") now reads on the centre control's ring and glyph, not on a
separate dot — the exception was never about the dot's shape, only about
`alert` being allowed to mark live recording at all, so no further change to
STYLE.md's wording is needed, but its example should point at the control
rather than at a dot that no longer exists if STYLE.md is ever revised to
name the control explicitly.

**3. The three controls are remapped, not just relabelled.**

| State | LEFT | CENTRE | RIGHT |
|---|---|---|---|
| Before recording | *(nothing — mic alone, unchanged)* | mic glyph, filled `moss`. Tap: starts listening | *(nothing)* |
| Recording | trash (`start-over-button`), outlined `edge`, always visible | ⏸, bare ring + glyph tinted `alert`, pulsing. Tap: pauses | ✓ (`done-button`, new name), filled `moss`, the only filled control on the row. Tap: finishes talking |
| Paused | trash, unchanged | ▶, ring and glyph back to plain `edge`/`ink`, static. Tap: resumes, appending | ✓, unchanged |

This is a genuine reshuffle, not a relabel of the same three slots:

- **Pause moves to CENTRE; finishing moves to RIGHT.** Before this revision,
  CENTRE was the filled-`moss` finishing control (then called "Done
  talking") and RIGHT was Pause. Now CENTRE is the red pause/resume toggle —
  bare, not filled — and RIGHT is Done. The reasoning for the fill moving
  with it is its own point below.
- **LEFT is always reachable now, not reserved-empty until words exist.**
  The redesign above (§"Start over is hidden until there are words") kept
  LEFT invisible until the first word, so that CENTRE never jumped sideways
  between "nothing to clear" and "words exist." That problem doesn't
  recur here, because LEFT no longer shares a row with a control that would
  need to shift — all three slots are fixed now. Hiding LEFT today would
  only recreate the jump on CENTRE and RIGHT instead, which is strictly
  worse since there are now two controls either side of it. So LEFT shows
  the trash icon from the first instant of listening. What still depends on
  whether there are words is the *confirmation*, not the control's
  visibility: tapping it with nothing recorded yet returns straight to
  `record--ready`, no dialog — the same "empty leaves without asking" rule
  R12 already states for leaving `record--transcript` — and only once there
  are heard words does it open `start-over-alert`. **Flagging this as a
  genuine behaviour change, not only a visual one:** before this revision,
  an empty recording had no way to discard itself except the back chevron;
  now trash does it in one tap, with no dialog, because there is nothing to
  lose.
- **Done is the one filled-`moss` control, and it sits on the opposite end
  from trash.** `product-strategist`'s coordination note that prompted this
  revision gave the reasoning directly: finishing is this screen's purpose,
  so it earns the one spot of fill among three outlines (Von Restorff —
  the one control that looks different is read as "the thing to do,"
  already this document's own justification for `mic-button` on
  `record--ready`); and putting the destructive control and the finishing
  control on opposite ends of the row, rather than adjacent, means a
  mis-tap under thumb pressure or poor light is far more likely to land on
  the quiet CENTRE pause toggle than to swap Done for Start over or back.
  Both reasons are hypotheses about reach and glance, not measured — the
  same kind of claim the rest of this document already labels as such.
- **Sizes: CENTRE 76pt, LEFT/RIGHT 56pt** (up from 52pt). All three stay
  over the 44pt floor regardless.

**4. Each control now carries a small visible text label beneath it** —
"Start over," "Pause" / "Resume," "Done" — matching its VoiceOver name
exactly. This is a real accessibility improvement over the redesign above,
which relied on 2.5.3's exemption for icon-only controls with no visible
text to match (the glyph "carries no text at all"). Now that there is
visible text, the spoken name and the visible word are required to be
identical by 2.5.3 directly rather than by exemption, and they are: `done-
button`'s label is "Done" on screen and "Done" in VoiceOver, not "Done
talking" (the redesign above's spoken name for the old centre control,
which this revision retires along with the control it named).

**The timer, read large, without a new token.** The owner's reference asks
for "a large time readout." Rather than add a new, larger text-size token
for one screen, the timer keeps `textSize.xxl` (18pt, the largest already
defined) but now stands alone in the status area — with the word
"Recording" and the dot gone, it is the only thing there while listening,
which is where the visual weight the reference asks for comes from: isolation
and whitespace, not a new size. **No token proposed.** Paused keeps a small
quiet "Paused" word stacked above the now-frozen timer, reusing
`field-label`'s visual recipe (small, uppercase, `textOpacity.quiet`) without
sharing its class, since a status word and a form field's label are
different things that happen to look alike. This is the designer's own call
on the one point the coordination note left open ("keep 'Paused' small,
your call, note it") — flagged below for confirmation, not assumed settled.

**Accessibility, re-checked against the new mapping (WCAG 2.2 AA):**

- **No colour-only state, re-verified.** Listening vs. paused now differs
  in three non-colour ways at once: the timer runs or sits frozen, the
  centre glyph's *shape* changes (pause bars → play triangle, not only its
  colour), and "Paused" is a word on screen. The red ring is one more cue
  layered on top of shape and motion, never the only one — this holds even
  though "Recording" the word is gone, because the glyph shape and the
  timer's behaviour over time were already doing independent work before
  this revision removed the word.
- **Targets.** CENTRE 76pt, LEFT/RIGHT 56pt, all over the 44pt floor.
- **Contrast, no new pairings.** `edge` ring 3.2:1 (WCAG 1.4.11); `alert`
  ring/glyph ≥3:1 for a meaningful graphic, the pairing this document's own
  Final choice already approved for the recording indicator; `moss`/`paper`
  on the Done button reuses the pairing already approved for `read-button`
  and `name-choice--selected`; `ink` on `paper` 12:1 for every icon, label
  and the transcript; the paused label and dimmed transcript lines stay at
  `textOpacity.quiet` (5.0:1), never below it.
- **VoiceOver order:** transcript → timer/status → Start over → Pause/
  Resume → Done — the same left-to-right order on screen, so no override is
  needed, now naming the controls by their new roles.
- **Dynamic Type.** The transcript and the three control labels grow; the
  three round controls keep their fixed size, since the label sits below
  the circle rather than inside it and can wrap onto a second line without
  stretching the control — verify reachability and wrapping on a device,
  which the mock cannot simulate.
- **Reduce Motion.** The CENTRE ring's tint-pulse, the transcript caret, and
  the VoiceOver-announcement banner's fade (the mock's stand-in for the
  real announcement) all drop their animation and hold a static or
  instantly-toggled state.

**Names, new or changed** (for `docs/design/component-names.md` in the
implementing PR, in addition to the redesign above's list):

- `done-button` **(new)** — RIGHT, filled `moss`, the finishing action.
  Retires the redesign-above naming of `mic-button--listening` as the
  finishing control; `mic-button` now only ever means the single
  before-recording control.
- `pause-button` already named above; its position moves from RIGHT to
  CENTRE and it gains the bare-ring, `alert`-tinted-while-listening
  treatment previously described for `mic-button--listening`.
- `start-over-button` already named above; its visibility rule changes from
  "hidden until words exist" to "always visible; the resulting confirm
  dialog is what depends on whether words exist."
- `paused-label` **(new)** — the small quiet "Paused" word stacked above
  `record-timer` while paused. Visual recipe borrowed from `field-label`,
  not the same class.

**As built (2026-10-13, the implementing PR) — three deliberate differences:**

- The centre control is **72pt** (`size.round`, the token home's + already uses), not 76pt — no new token for 4pt.
- The live ring does **not pulse**, in any mode: `alert` on the ring and glyph, the running timer and the pause/play shape already carry "listening" without motion, so there is no Reduce Motion branch to get wrong.
- **No `transcript-caret`.** The not-yet-settled words at the end of the transcript are drawn dimmed (`textOpacity.quiet`), which already says "more is coming". The settled words fade with age as specified (newest full `ink`, the one before `secondary`, older `quiet`).
- **After Done, no "About who?" field.** The check step stays as it was (lead, What you said, Let Andy read it, Record again), matching the Write screen's decision that the subject is found by extraction. Raised with the owner in the PR.

**Open questions this revision adds, for `product-strategist`:**

- Confirm or adjust "Paused" staying as a small word near the timer — the
  owner's note left this as the designer's call, not a decided string.
- The reshuffle means `start-over-button` can now discard an empty
  recording in one tap with no confirmation (point 3 above) — confirm this
  is the intended behaviour and not only a side effect of the control
  always being visible.
- STYLE.md's "second named exception for `alert`" (Final choice, item 2)
  was written describing a dot; confirm whether its wording needs a
  one-line update to describe the control instead, now that the dot is
  gone, or whether the exception's intent ("the live recording indicator")
  already covers this without edit.
