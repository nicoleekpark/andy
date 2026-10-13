# Home actions — Record and search at the bottom of `home`, plus #3 and #4

Device QA build 4 #6 (search on home), #4 (`nav-bar-back` bubble), #3 (Settings gearshape).
Brief by `product-strategist`, 2026-10-12, for `product-designer`: **three options with
HTML mocks**; the owner picks, this brief recommends none. **(new)** marks a proposed name
for `docs/design/component-names.md`, added by the implementing PR.

## Brief

### 1. Already decided — do not reopen

- **#3:** `nav-bar-action-right` on `home` becomes a gearshape icon. It is an SF Symbol
  through `expo-symbols`, which is already a dependency. Its VoiceOver label is "Settings".
- **#4:** the owner chose "remove the bubble" behind `nav-bar-back`. It stays the chevron
  alone, as decided in copy-build-4. §6 asks the designer what is achievable.
- **Asking stays one screen** (`ask`, PROJECT_SCOPE Must Have). Typing a name or a word
  finds people at once, with no paid call, offline too (`people.search` online,
  `searchView` offline). A question needs Ask, online only: the question goes to OpenAI
  for an embedding and the notes it finds go to Anthropic (Reality Check 10), so the
  tap is a privacy moment as well as a cost.
- `home-index` (A–Z, from 20 people), the `profile-row` layout, and `record-button` →
  `record`. The widget, Siri and tag filters are cut from V1. Do not design toward them.

### 2. The problem

Today the bottom of `home` holds two stacked full-width pills: `ask-button` "Ask Andy"
(outlined, opens `ask`) and `record-button` "Record" (moss, filled). In #6 the owner wants
a real search field instead of a button, and asks which arrangement of Record and search
is most comfortable. iOS 26 moved search to the bottom in many Apple apps.

### 3. The two jobs (assumptions, not user research)

| Job | When it happens | State of the user | Frequency (hypothesis) |
|---|---|---|---|
| **Record:** keep what someone just told me | Seconds after a conversation, at a convention, walking | One hand, half-attention, often offline, time-critical | Bursty: many in a day at an event, then none |
| **Find:** who was that, what did they say | Before a meeting, at a desk, or when a name is on the tip of the tongue | Less rushed, sometimes one hand | Steadier, and likely more frequent than Record across a week |

Record decays: an unrecorded detail is lost within minutes. Find can wait a few seconds.
So **Record wins any conflict over the most reachable, most visible spot. Find gets the
second-best spot, not a hidden one.** (Fogg: at a convention, motivation is high and
ability is the thing to protect. Every extra tap or hunt before the mic costs notes.)

### 4. The key tension: one search place, two behaviours

A field on home can do one of two things:

- **(a) Filter in place.** Typing narrows `profile-list` to matching people (by name and by
  word) on `home` itself. That is free, instant and works offline, like Contacts. Asking a
  question then needs a second, explicit step, such as an "Ask Andy about …" row
  under the results.
- **(b) Open Ask.** The field is a doorway: tapping it opens `ask` with the keyboard up.
  `ask` already does names-as-you-type and then Ask on submit.

Option (a) gives the field a true, live behaviour and uses the space home already has. Its
risk is two places that look alike (the home field and `ask-field`), each with a different
result shape. Option (b) keeps one place, but it is the "field that only acts after you
leave" which day 5 rejected as a false promise. That rejection came before free
name search existed, and the reason has since changed. Either way, the designer must keep
these true: **no keystroke ever costs a call, and the paid step is always a labelled tap.**
Also: **if a field says "Ask Andy", typing in it must not just filter. If it filters, it
must not say "Ask Andy".** That is one action, one name (STYLE Copy Tone).

### 5. What the platform and comparable apps do (verified unless marked)

| Source | Pattern | Relevance |
|---|---|---|
| Apple HIG, Search fields (iOS 26) | Search can sit in a tab bar, a bottom or top toolbar, or inline. Apple recommends the bottom when search is a priority, for reach. In a bottom toolbar it can be a full field or a button that expands above the keyboard | The bottom is now the platform default, not a novelty (Jakob's law) |
| iOS 26 Notes | Search bar is always visible at the bottom. The compose button sits in the same bottom bar, on the right | **Closest analogue:** one primary create action next to search |
| iOS 26 Mail, Messages, Contacts | Search at the bottom (owner's observation, press reports). Contacts layout **not verified**: designer checks on a device | Same chrome family |
| Voice Memos | Large red record button at the bottom centre. Search is a pull-down field over the list | Capture-first app: record dominates, search is secondary |
| Day One (2025.16) | Floating new-entry button; users can move it to the other side | Primary create button floats. Handedness matters |
| Things 3 (from memory, **not verified**) | Floating "Magic Plus" button bottom right; Quick Find by pulling down the list | FAB plus hidden search |
| Clay / Mesh personal CRM | Natural-language search over notes, plus a **separate** AI assistant ("Nexus") for questions | The closest product splits find and ask into two places |
| NN/G on iOS 26 | Floating glass search bars "fade into the background" and crowd tab bars | Risk: a glass field over a paper list may be missed |
| Hoober 2013 (1,333 people observed) | 49% hold the phone in one hand, 36% cradle it, 15% use two hands | The bottom third is the reachable zone for half of users |

**Judge options by:** *Fitts* (Record is the largest target, nearest the thumb) · *Hick*
(at most two choices at the bottom at rest) · *defaults* (Record looks heavy; search never
looks primary) · *Jakob* (the iOS 26 bottom-search pattern, not a home-made one) · *cost
transparency* (the action that sends notes to a third party and costs a call names itself).

### 6. #4 back bubble: what the designer must find out

Research so far (designer: confirm in `node_modules/react-native-screens` 4.26.2 types and
on an iOS 26 simulator):

- `hidesSharedBackground` removes the glass from left and right bar items, **but Apple's
  forum reports that it has no effect on the system back button** (`backBarButtonItem`).
  No workaround is documented as of Feb 2026.
- React Navigation's native stack exposes `unstable_headerLeftItems` with
  `hidesSharedBackground`, `scrollEdgeEffects`, `headerTransparent`, and
  `headerSearchBarOptions.placement` `integrated` / `integratedButton` /
  `integratedCentered` (iOS 26). Check which of these 4.26.2 actually ships.
- `UIDesignRequiresCompatibility` (Info.plist) opts the whole app out of Liquid Glass,
  but **is ignored when built for iOS 27 or later**: not a durable answer.

The designer reports which of these is achievable: (i) the bubble removed on the system
back button; (ii) a custom left item without a bubble that keeps everything in R13; or
(iii) not achievable, so the bubble stays. The decision is the owner's.

### 7. Business rules

- **R1. Record is always one tap from home at rest.** It is visible without scrolling and
  never covered by the list, the index or a banner. It keeps the visible word "Record".
  An icon may sit beside the word, but no icon-only button: the empty home says "tap
  record", and Record is the primary action.
- **R2. Record looks primary; search does not.** `moss` fill on Record only. Search is
  quieter: outlined, `edge` ring or glass. Search must never be the bigger target.
- **R3. Typing never calls Claude or OpenAI.** It may only run the free name and word
  search. The paid ask happens only on a tap of a control whose label says "Ask"
  (or the keyboard's return key, if §13 Q3 allows it).
- **R4. One matching rule.** Any name or word filtering on home uses the same search
  as `ask` (`people.search` / `searchView`). Never a second, client-side matcher. Two
  people who share a name both show, each with its meta line. Nothing merges or dedupes.
- **R5. Offline:** the field stays and filtering works. The Ask step shows as unavailable
  with the reason in words (copy C6), never as a dead control with no reason.
- **R6. While a query is present:** `home-index` and `home-letter-heading` are hidden,
  because results are not A–Z sections. `briefing-card`, `outbox-line` and `pending-line`
  also hide; all return when the query clears (§13 Q5 may keep the briefing).
- **R7. No overlap.** `home-index` ends above the bottom chrome, and no letter sits under
  the field or Record. Check this at the largest Dynamic Type size and with 27 letters.
- **R8. Keyboard.** The field rises above the keyboard. Results scroll above it and stay
  tappable while the keyboard is up (`keyboardShouldPersistTaps`). A scroll dismisses
  the keyboard. With the keyboard up, Record may step aside. Cancel or an empty field
  brings it back.
- **R9. Handing off to `ask`:** the typed text arrives in `ask-field`, so nothing is
  retyped. Tapping a control labelled with the question (C4) asks it. Opening `ask` by
  any other route never auto-submits.
- **R10. The query lives in memory only.** It survives opening a profile and coming back,
  and survives the lock (QA: the lock covers the screen, it does not reset it). It is not
  saved to disk, so there are no recent searches, and nothing new enters
  `forgetOnThisPhone`. Any design that persists a query must add it there in the same PR.
- **R11. No people yet:** the empty home keeps its invitation to record. Whether the field
  shows at all is §9 Q4.
- **R12. Gearshape** (`settings-button` **(new)**): at least 44×44pt, `ink`, VoiceOver
  "Settings", button role.
- **R13. `nav-bar-back`**: whatever is drawn keeps the edge swipe-back gesture, the
  VoiceOver label "Back", a 44pt target, the long-press back menu where the system gives
  it, and the same look on every pushed screen. The fix must not cost any of these.

### 8. Copy (final strings, per model)

| # | Where | String |
|---|---|---|
| C1 | `home-search-field` **(new)** placeholder, model (a) filter | Find a name or a word |
| C2 | `home-search-field` placeholder, model (b) opens Ask | Ask Andy |
| C3 | Field accessibility label | (a) "Find a name or a word" · (b) "Ask Andy" |
| C4 | `home-ask-row` **(new)**, under filtered results | Ask Andy: "{query}" |
| C5 | `home-ask-row`, empty query | Ask Andy in your own words |
| C6 | `home-ask-row`, offline | Asking needs a connection. Names and words still work. |
| C7 | No match, model (a) | No one matches "{query}". |
| C8 | Clear (x) accessibility label | Clear |
| C9 | Leave search (if the design has it) | Cancel |
| C10 | `record-button` | Record (unchanged) |
| C11 | Gearshape | (no visible text) · VoiceOver "Settings" |
| C12 | `nav-bar-back` | (no visible text) · VoiceOver "Back" |

`ask-hint` on `ask` already says what Ask reads. Do not repeat it on home.

### 9. Accessibility (hard rule, STYLE)

- Targets at least 44×44pt; text 4.5:1; the field's only edge `edge` (3:1). A glass field
  must pass both over the worst scrolled `profile-row`, not over blank paper.
- VoiceOver order: nav bar (title, Settings), the list content, then search, then Record,
  matching iOS bottom chrome. Show the order in the mock.
- Dynamic Type at the largest accessibility size: labels wrap and never truncate to
  "Rec…". If the side-by-side layout fails, it stacks, and the mock shows that state.
- Reduce Motion: any expanding field animates by crossfade or not at all.

### 10. Success criteria (QA-observable: Andy has no analytics, promise 4)

Each is a **hypothesis**, with what would kill it:
- **S1 Reach.** One-handed, on a 6.1" and a 6.9" phone, the owner reaches Record without
  shifting grip.
- **S2 Speed.** From home at rest, recording starts in one tap. A known person's profile
  opens in typing plus one tap, offline too.
- **S3 Zero paid calls while typing.** The Convex logs show no `search.recall` until the
  Ask control is tapped. Online and offline QA rows. *Killed if* even one appears.
- **S4 No confusion between the two behaviours.** TestFlight testers are asked: "When
  you typed on home, did you know whether Andy would answer or just find names?"
  *Killed if* more than one in five say no or not sure.
- **S5 No mis-taps.** In a week of the owner's real use, no accidental Record when
  reaching for search, and no accidental search when reaching for Record.

### 11. Not in this brief

A tab bar with more destinations, recent searches, search filters or scopes (tag
filters are cut), voice search, and any change to `ask` beyond receiving the query (R9).

### 12. Doc and scope changes this would need (owner approval)

- **PROJECT_SCOPE.md** (+ `.ko` twin) records "Home has an Ask Andy button rather than a
  search bar" (day 5, and the Screens list). Its reason changed with free name and word
  search (2026-10-08), but reversing a recorded decision is the owner's edit to approve.
- **STYLE.md** says "This project has no icon set … revisit when one is chosen for some
  other reason". #3 is that reason: STYLE needs a line on SF Symbols via `expo-symbols`.
- A **native Liquid Glass** field would be the first glass in a paper-only system: the
  designer's visual-system call, but it needs a STYLE line.
- A **tab bar** would be a new IA layer and is out of scope unless approved.

### 13. [call] Open questions for the owner

1. **Model (a) or (b)?** Filter in place with Ask as a step, or a field that opens `ask`?
2. **Arrangement:** side by side in one bottom bar (Notes), stacked as today, or Record
   floating alone with search in the bar?
3. **Return key** in model (a): does it ask (a paid call on a key not labelled "Ask") or
   only dismiss the keyboard?
4. Does the field show when no one is in Andy yet?
5. Does `briefing-card` hide while searching (R6) or stay?
6. **Native iOS 26 search** (glass) or an Andy-drawn field (tokens, paper)?
7. **#4:** if the system back button keeps its bubble, accept it or use a custom item meeting R13?
8. **Left-handed reach:** Apple's default, or note it for later (Day One lets users move its button)?

### Sources

- Platform: [HIG Search fields](https://developerguidelines.com/human-interface-guidelines/version/10/search-fields/) · [LearnUI iOS 26 patterns](https://www.learnui.design/blog/ios-design-guidelines-templates.html) · [SlashGear](https://www.slashgear.com/1975163/can-you-move-search-bar-to-top-ios-26/) · [NN/G Liquid Glass](https://www.nngroup.com/articles/liquid-glass/) · [Hoober, Smashing](https://www.smashingmagazine.com/2016/09/the-thumb-zone-designing-for-mobile-users/)
- Apps: [9to5Mac Notes](https://9to5mac.com/2025/10/16/heres-everything-new-for-apple-notes-in-ios-26/) · [iOS 26 tab bar](https://ryanwesley.com/ios-26-tab-bar-beef/) · [Voice Memos search](https://support.apple.com/en-bh/guide/iphone/iph0e546e6ec/ios) · [Voice Memos iOS 26](https://www.igeeksblog.com/how-to-use-voice-memos-on-iphone-ipad/) · [Day One notes](https://dayoneapp.com/guides/release-notes/ios-release-notes/) · [Mesh/Clay](https://apps.apple.com/us/app/mesh-contacts-crm/id1463073824) · [Clay Nexus](https://uk.finance.yahoo.com/news/personal-crm-app-clay-introduces-154655909.html)
- Back button: [Apple forums 814816](https://developer.apple.com/forums/thread/814816) · [expo#40081](https://github.com/expo/expo/issues/40081) · [rn-screens #3303](https://github.com/software-mansion/react-native-screens/pull/3303) · [native stack options](https://reactnavigation.org/docs/native-stack-navigator/) · [compat key ignored from iOS 27](https://github.com/patrickserrano/lacquer/issues/517)

## Options

Three mocks, one phone frame each, interactive (tap the rig above the frame to
change state): `docs/design/mocks/home-actions-a.html`, `-b.html`, `-c.html`.
Each shows `home` at rest, typing (filtered list or Ask, per its model),
offline, keyboard-up, empty-home, the nav bar (title, `settings-button`
gearshape), and a "pushed screen" toggle that renders `nav-bar-back` so §6's
finding is visible rather than just described. All three reuse only existing
tokens — no `### Proposed tokens` needed.

### §6 feasibility, answered once (shared chrome, not an option difference)

Checked against `node_modules/react-native-screens` 4.26.2's own
`lib/typescript/types.d.ts` (not just the Apple forum thread):

- `ScreenStackHeaderSubviewProps.hidesSharedBackground` is documented in the
  types themselves as "Only applicable to type="right" and type="left"
  subviews" — the back button is neither; it is governed by `backButtonDisplayMode`,
  `hideBackButton`, `backTitleVisible` and friends, none of which touch its
  background. This matches the Apple forum report the brief cites: the prop
  has no path to the system back item at all, not merely "no effect in
  practice."
- A **custom left item** (`headerLeftBarButtonItems`, `hideBackButton: true` +
  a hand-built button) doesn't get around it either, for two independent
  reasons. First, `hidesSharedBackground` only stops *several adjacent items*
  from merging into *one shared* glass pill — it was never a way to strip an
  item's *own* background, and iOS 26 gives every bar button item, custom or
  system, its own glass by default; nothing in 4.26.2's `SharedHeaderBarButtonItem`
  type (`variant: 'plain' | 'done' | 'prominent'`) exposes a "no background"
  style. Second, and worse: the native long-press back menu R13 asks for is
  generated by `UINavigationController` from its own back item — swapping in a
  custom left item forfeits it outright, and hand-rebuilding it (walking the
  navigation stack, opening a menu, popping N screens) is a materially bigger
  build than this brief, for a worse result (one more thing to keep in sync
  with the real stack).
- The only other route is abandoning the native header for a fully
  custom-drawn top bar (`headerShown: false` + an app-drawn `View`,
  `headerTransparent` to let it paint over). The edge swipe-back gesture
  survives that (it's a `Screen`-level setting, not a header one), but the
  long-press menu and the native large-title/blur integration would all need
  hand-rebuilding, and "the same look on every pushed screen" (R13) becomes a
  discipline problem across every screen rather than one the system gives for
  free. That's a separate, larger decision than this brief, not a fix to fold
  in here.

**Answer: not achievable (iii).** Neither the system back button nor a
custom replacement can shed the iOS 26 glass circle without giving up
something R13 explicitly protects. `nav-bar-back--glass` (new state name) is
the name for what ships: the chevron alone (already won, copy-build-4) inside
the glass circle iOS draws unconditionally. All three mocks show this on the
"pushed screen" toggle, with the same note. If the owner wants the circle gone
badly enough to spend a custom header, that's a new, separate design pass —
not this brief's call to make unilaterally.

### Design read

`home` already has the pieces: `briefing-card`, `profile-list` with
`home-index`/`home-letter-heading` from ~20 people, and two stacked pills
(`ask-button`, `record-button`) at the bottom. The task is replacing those two
pills with a real field plus Record, in whichever shape keeps Record winning
any conflict for the thumb (R1) while search stays visibly secondary (R2).
Both axes the brief asks for — model (a) vs (b), and arrangement — are varied
across the three options below, not just colour or decoration.

### Option A — One bottom bar, Notes-style

**Model (a), filters in place.** `home-search-field` and `record-button` share
one `home-bottom-bar` row: field flexes, Record stays a fixed-width `moss`
pill carrying its own word. The exact chrome shape of iOS 26 Notes, Mail,
Messages and Contacts (brief §5).

- **Why it may work:** Jakob's law — this is the one option with a live,
  shipped analogue the person has almost certainly already used this week;
  nothing to learn. Von Restorff still holds Record apart (the one filled
  shape in a row of outlined/quiet ones), and Hick's law is satisfied at rest
  (exactly two choices).
- **Strengths:** lowest build cost (reuses the existing bottom-row layout
  pattern, no new floating or multi-row chrome); shortest bottom chrome of the
  three, so `home-index` keeps the most headroom against R7's "27 letters at
  largest Dynamic Type" check; typing and Ask are cleanly separated (R3/R4/R6)
  with a plain-text `home-ask-row`, never styled like the field itself (§4's
  "one action, one name" rule).
- **Weaknesses / risks:** at the largest accessibility size the row must wrap
  to two lines (shown in the mock) rather than clip — a real but
  well-understood Dynamic Type cost, not a layout dead end. Because the row
  holds two different jobs, a mis-tap between a wide Record pill and an
  adjacent field is a real (if standard, widely-shipped) risk at speed —
  nothing is novel, but nothing is unique to this option's *safety* either;
  it's the one every cited app above already accepted.
- **Design-system impact:** new — `home-bottom-bar`, `clear-search-button`,
  `cancel-search-button` (all generic, reusable shapes, not one-screen
  specials). Reuses `home-search-field`, `home-ask-row`, `record-button`,
  `settings-button` already named in the brief. No new tokens.
- [call] answers: **(1)** model a. **(2)** single row, Notes-style. **(3)**
  return key dismisses the keyboard only, does not Ask — a return key that
  silently started a paid, privacy-costed call would be the one keystroke-costs-a-call
  exception R3 is written to prevent, and nothing in this row visually marks
  the return key as different from every other field's return on the phone.
  **(4)** field hidden entirely when `profile-list` is empty — nothing to
  filter, and R11's invitation to record stays the only thing on screen.
  **(5)** `briefing-card` hides while searching, with everything else R6
  already lists — a person searching has moved on from "what's next," and
  showing both competes for the one row of attention. **(6)** Andy-drawn,
  paper, `edge`-ringed — both because STYLE.md already flags a glass field as
  "the first glass in a paper-only system" needing its own line, and because
  there is no supported native route to a *bottom*, off-nav-bar search field
  in react-native-screens 4.26.2 to begin with (`SearchBarProps.placement`'s
  `integrated`/`integratedButton`/`integratedCentered` are nav-bar/toolbar-area
  placements, not a free-floating bottom bar below scrollable content). **(7)**
  see §6 above — accept the bubble. **(8)** Apple's default, no handedness
  setting; Day One's movable button is a V1.1 idea at most, not Must/Should.

### Option B — Record is the room, search is the doorway

**Model (b), opens Ask.** `home-search-field` sits quiet, full-width and
inert above a dominant, full-width, 56pt `record-button`. Tapping the field
pushes `ask` with the keyboard already up and the typed text (if any) handed
off, nothing retyped (R9). Closest to Voice Memos' "capture is the point"
feel (brief §5).

- **Why it may work:** Fitts's law twice over — Record is not just
  differently coloured but the larger target, and it is first in thumb reach
  from a relaxed one-handed grip. Recognition over recall: the field's shape
  (an outlined pill with a magnifying glass) is the universally learned
  "search" affordance, so even though it does something different here
  (navigate, not filter), its *promise* — "tap this to look for someone" — is
  still honestly kept, it just completes one screen later.
- **Strengths:** no in-place filtering logic to build on `home` itself at all
  (the field is a single tap target, not a live `TextInput` driving a list);
  cleanly reuses `ask`'s existing empty/typing/offline states instead of
  inventing new ones; the tallest, most unmistakably primary Record control of
  the three.
- **Weaknesses / risks:** this is the shape day 5 rejected as "the field that
  only acts after you leave" before free name/word search existed — the
  *reason* for that rejection has changed (search is free now), but the
  *shape* on screen is the one already turned down once, and that should be
  named plainly rather than quietly reintroduced. It also costs the one thing
  Option A gets for free: a person who only wants to filter by name now always
  leaves `home` to do it, even though that part needs no connection and no
  paid call. Tallest bottom chrome of the three (field + button, stacked), so
  the least headroom for `home-index` against R7's largest-Dynamic-Type check
  — flagged in the mock as the one to re-verify on device first.
- **Design-system impact:** no new components — reuses `home-search-field`,
  `record-button`, and `ask`'s existing screen wholesale. Lowest *new-surface*
  cost of the three, at the cost of the open disagreement below.
- [call] answers: **(1)** model b. **(2)** stacked, Record dominant below.
  **(3)** not applicable — once inside `ask`, its return-key behaviour is
  whatever `ask-submit-button` already decided, not a new decision made here.
  **(4)** same as A: field hidden on empty home. **(5)** not applicable in the
  same way — there is no in-place search state on `home` to hide the card
  against; the card is simply unaffected until the person leaves for `ask`.
  **(6)** same reasoning as A: Andy-drawn field, not native glass. **(7)** see
  §6 — accept the bubble. **(8)** Apple's default, no handedness setting.

### Option C — Full-width find, Record floats

**Model (a), filters in place**, different arrangement from A: `home-search-field`
runs the full width of the very bottom edge (the iOS Contacts shape), and
`record-fab` (new) floats bottom-right, overlapping the content area instead
of sharing the field's row.

- **Why it may work:** progressive disclosure at its purest — the field reads
  as "the list, searchable," full stop, with Record deliberately kept as a
  separate, elevated gesture rather than a peer control in the same row
  (nothing to confuse it with). The floating placement is also the
  closest fit to Day One's "move the create button" precedent if left-handed
  reach is ever revisited (V1.1, not now — call 8).
- **Strengths:** the field alone, full width, is the most legible "this whole
  bar is for finding someone" read of the three, with no competing control in
  the same row to parse.
- **Weaknesses / risks:** R1 forbids an icon-only Record control, so
  `record-fab` has to be a pill carrying the word "Record," not the bare
  circular icon a FAB usually is (Material Design, Day One) — a deliberate
  break from the convention Jakob's law would otherwise favour, done because
  the business rule outranks the convention here. More seriously: a control
  that *floats over* scrolling content is the one failure mode the other two
  options don't have at all — R1 says Record must never be *covered by* the
  list, but says nothing about Record *covering* the list, and at rest this
  fab already sits where a 20th-plus row would be if the list ran longer, a
  risk that grows at the largest Dynamic Type size (shown in the mock). It
  also has to be checked against `home-index`, not just the list, since both
  live in the same corner.
- **Design-system impact:** new — `record-fab` (a text-bearing floating pill,
  a genuinely new primitive, not a one-off: if a floating primary action is
  ever wanted elsewhere it should be this component, not a fresh one).
  Reuses `home-search-field`, `home-ask-row`, `clear-search-button`,
  `cancel-search-button` from Option A otherwise.
- [call] answers: **(1)** model a. **(2)** full-width field, Record floating.
  **(3)** return key dismisses the keyboard only, same reasoning as A. **(4)**
  field hidden on empty home, fab hidden with it (nothing to record into a
  field for, but Record itself still needs its own big invitation in the
  empty state, same as today). **(5)** `briefing-card` hides while searching,
  same as A. **(6)** Andy-drawn, paper — same reasoning as A, and doubly true
  here since a *floating* native glass control has no supported path in
  react-native-screens 4.26.2 at all (there is no exposed floating-button
  primitive in this version; `ScreenFooter` exists but is marked unstable and
  is built around `formSheet` presentation, not a plain pushed screen like
  `home`). **(7)** see §6 — accept the bubble. **(8)** Apple's default; the
  float's corner is the one place a future handedness setting would have the
  most obvious effect, worth a one-line note for whoever picks this up in
  V1.1, not a reason to build it now.

### Recommendation

**Option A.** It is the only one of the three with zero open disagreement
attached (Option B reopens a rejected shape; Option C carries a real,
unresolved covering-the-list risk that needs device verification before it
could ship). It costs the least new design-system surface, keeps the most
`home-index` headroom for the hardest accessibility check in this brief (R7
at largest Dynamic Type with 27 letters), and is the strongest Jakob's-law
match to what the owner already named as precedent (brief §5's own table).
Hick's law, Fitts's law and the "zero paid calls while typing" rule (R3) are
satisfied identically by all three, so they don't separate the options —
arrangement and risk do, and A carries the least of both.

**Key interaction states** (all shown live in `home-actions-a.html`): resting
(field+Record side by side) → focus, empty (`home-ask-row` reads "Ask Andy in
your own words,” index/briefing hidden) → typing "Pri" (filtered to both
Priyas, `home-ask-row` reads `Ask Andy: "Pri"`) → offline (filtering unchanged,
`home-ask-row` reads the C6 sentence, not a dead button) → keyboard up
(Record steps aside for `cancel-search-button`, per R8) → empty home (field
hidden, R11's invitation alone) → pushed screen (chevron alone inside the
unremovable glass circle).

**Components/tokens reused:** `home-search-field`, `home-ask-row`,
`record-button`, `settings-button`, `nav-bar-back`, `profile-row`,
`home-index`, `home-letter-heading`, `briefing-card` — all existing or already
named in this brief. **New:** `home-bottom-bar`, `clear-search-button`,
`cancel-search-button`, `nav-bar-back--glass` (a state name, not a new
component). **Tokens:** none new — `edge`, `placeholder`, `moss`, `paper`,
`ink`, `line`, `space.*`, `radius.pill`, `textSize.*` only.

**Accessibility:** every control at or above 44×44pt; the field's only edge is
`colors.edge` on `paper` (3.2:1, WCAG 1.4.11, reused); placeholder text is
`colors.placeholder` on `paper` (5.0:1, reused); VoiceOver order is nav bar
(title, Settings) → list content → `home-search-field` → `home-ask-row` →
`record-button`, matching the brief's own §9 ordering; largest Dynamic Type
wraps the bottom row to two lines rather than truncating "Record"; Reduce
Motion crossfades the bar's contents when entering/leaving search mode rather
than sliding. **Open item, not a disagreement:** R7's "no letter sits under
the field or Record... check with 27 letters" needs a real-device pass with
the shipped `home-index` component — the mock approximates spacing but cannot
reproduce that component's own largest-type behaviour exactly.

### Open disagreements

None with the brief's business rules. One observation worth the owner seeing
plainly rather than buried in Option B's write-up: **Option B's shape is the
same one day 5 already rejected** ("the field that only acts after you
leave"), even though the reason for that rejection no longer holds now that
free name/word search exists. Recommending against it here is about the
shape reappearing without that history being visible at the point of
deciding, not about overriding a business rule — the owner may still prefer
it, with that history now in view.

### Option A variants — fixing "Record looks like the search button"

The owner chose Option A's model (field filters `profile-list` in place;
`Ask Andy: "{query}"` as the labelled question step) but flagged its original
chrome: **"Record on the right side of the search bar looks like Record is
the search button"** — proximity, a control attached to a field's trailing
edge borrows the field's "submit" meaning, independent of colour. Three
redesigns of Option A's bottom-chrome shape only (model, copy and R1–R13
unchanged), one interactive mock, a variant switcher:
`docs/design/mocks/home-actions-a-variants.html`.

- **A1 — stacked.** `record-button` takes its own full-width row, directly
  above `home-search-field` at the very bottom (the iOS 26 search position).
  Fixes the misreading completely — the two are no longer in the same row at
  any width or type size — at the cost of the tallest bottom chrome of the
  three (least `home-index` headroom against R7) and a VoiceOver-order
  override needed to keep §9's "search, then Record" (Record reads visually
  first here).
- **A2 — Record left.** One row, `record-button` fixed at the leading edge, a
  16pt gap, `home-search-field` flexing right. Fixes the misreading (a
  field's "go" control is conventionally trailing, never leading) without
  adding chrome height, but moves Record out of the bottom-right zone the
  brief's own Hoober citation (§5) calls easiest for a right-handed
  one-handed grip — a reach cost nothing asked for, and the same
  VoiceOver-order override as A1.
- **A3 — separated.** Same left-to-right order as the original mock, now with
  a visible `home-bottom-bar-divider` (new, decorative), a wider gap, and
  Record redrawn as a rounded rectangle (`radius.control`) instead of a pill.
  Graded, not absolute: the fix is real but smaller than A1's, so it is the
  one most worth confirming against the brief's own S4 ("did you know whether
  Andy would answer or just find names?") rather than treating as certain.
  Keeps Option A's chrome height, reach profile and VoiceOver order
  unchanged — the only variant whose visual order already satisfies §9
  without an override.

**Recommendation: A3**, with A1 as the fallback if the owner wants the
proximity question closed with certainty rather than reduced — see the
mock's side-by-side table and per-variant verdicts for the full trade-off.
A2 is not recommended: it trades the proximity worry for an uncredited reach
cost, when A3 reaches the same fix without moving Record at all. No new
tokens in any variant; `home-bottom-bar-divider` (A3) and
`home-bottom-bar-record-row` / `home-bottom-bar-search-row` (A1) are new
names, proposed for `docs/design/component-names.md` only if their variant
ships.

### Stacked explorations

The owner picked **A1 "stacked"** — `record-button` full-width, its own row,
directly above a full-width `home-search-field` at the very bottom — then
asked: *within this stacked idea, is there an even better design?* A1's own
write-up already names three costs: the tallest bottom chrome of the A-family
(least `home-index` headroom), Record reading visually before the field
(needing an explicit VoiceOver-order override to keep §9's "search, then
Record"), and the flat visual weight of two full-width bars stacked on each
other. Four redesigns of A1's shape, spacing, order or behaviour — not a
return to the single-row Option A family — each aimed at one or more of
those three costs, model/copy/R1–R13 unchanged, one interactive mock with a
variant switcher: `docs/design/mocks/home-actions-stacked.html`.

- **S1 — Oval Record.** Record stays its own row above the field, redrawn as
  a centred, content-width oval (`radius.pill`, `space.xl` horizontal
  padding, same 44pt height and `moss` fill) instead of a full-width pill —
  the Voice Memos / camera-shutter family, still carrying the word "Record"
  (R1). Von Restorff: a round shape breaks the field's rectangular rhythm, so
  it reads as *the one special action* rather than another bar. Fixes the
  "two full bars" weight by making one of the two stop reading as a bar at
  all; leaves the chrome-height and VoiceOver-order costs exactly as A1 left
  them. At the largest Dynamic Type size the oval grows to full width,
  converging on A1's own shape — a graceful fallback, not a second design to
  maintain. No new tokens, no new names, zero behaviour change.

- **S2 — Compact panel.** Same two full-width rows and order as A1, drawn as
  one panel: a flat 1pt hairline (`home-bottom-bar-divider`, already
  proposed for A3, laid horizontal here) replaces the open gap between rows,
  and the panel's padding moves from `space.sm` to `space.xs` at the top and
  around the divider — no new token, just the existing scale read more
  tightly. Gestalt common region: a shared background and edge read as one
  control, which is the more literal fix for "two bars." Computed from the
  mock's own CSS: A1 = 133pt total chrome (border + padding + two 44pt rows +
  gap + safe-area padding); S2 = 121pt — **12pt less** (~9%), handed back to
  `home-index` headroom for R7's largest-Dynamic-Type check. Approximate,
  to confirm against the shipped `home-index` component on device, same
  caveat as Option A's own recommendation. Doesn't touch the VoiceOver-order
  cost. Stacks with any of S1/S3/S4 — it's a spacing change, not a shape or
  order change.

- **S3 — Scroll-aware Record.** At rest, identical to A1. While the list is
  being actively scrolled (not searching), Record's row steps aside the same
  way it already does for typing, and returns once scrolling settles —
  reclaiming the full 52pt of its row as temporary `home-index` headroom
  during exactly the interaction most likely to need it. iOS Safari and Mail
  already compact or hide their bottom toolbar on scroll (Jakob's law): not a
  novel pattern. Disabled outright at the largest Dynamic Type size (a
  control that comes and goes is the wrong trade for someone relying on the
  largest text); never shrinks the 44pt target, only ever fully shows or
  fully hides it; Reduce Motion makes the hide/show instant rather than
  animated, matching the brief's own rule for the field's expand/collapse.
  **Risk, named plainly:** R1 says Record must be "visible without
  scrolling... at rest" — hiding it *while* scrolling is a reading of "at
  rest" this brief never tested, and it removes Record for the moment
  someone spots a name and might want to use it. Needs explicit sign-off
  from `product-strategist`/the owner on that reading of R1 before it's
  buildable, and carries real new build cost (a scroll listener, a
  settle-timeout, an accessibility-tree toggle) the other three variants
  don't. The most ambitious answer to the chrome-height cost; also the one
  that reopens a business rule's wording rather than only its layout.

- **S4 — Swapped rows.** The field's row moves above Record's, which becomes
  the very last, bottom-most control on the screen — same two rows, same
  heights, same hide-on-typing mechanism, only reordered. This makes the
  brief's required VoiceOver order ("list → search → Record") the *default*
  geometric one, removing A1's override outright rather than reducing it.
  It also surfaces an uncredited second win: the brief's own Hoober citation
  (§5) calls the screen's literal bottom edge the single easiest one-handed
  reach, in either hand — in A1 that edge belongs to the field, the free
  secondary action, while Record (which R1 says must win any conflict for
  the most reachable spot) sits one row above it. S4 puts Record on that
  literal edge instead, arguably closer to what R1 already asks for than A1
  itself is. Same 133pt chrome height as A1 — this variant trades on order,
  not height. **Named, not resolved here:** the field leaves the single
  "very bottom" position that was part of why the owner liked A1 over
  Option A's single-row shape (the iOS 26 Notes/Mail search placement cited
  in §5) — it stays part of the same unified bottom chrome, directly above
  Record, not buried, but it is one row higher. The owner's call, not a free
  win.

**Side-by-side** (full table and per-variant detail in the mock):

| | S1 oval | S2 compact panel | S3 scroll-aware | S4 swapped rows |
|---|---|---|---|---|
| Chrome height vs A1 (133pt) | same | **−12pt (121pt)** | same at rest; **−52pt mid-scroll** (81pt) | same |
| "Two bars" weight | fixed by shape | reduced, common-region | unchanged at rest | unchanged |
| VoiceOver order vs §9 | still needs override | still needs override | still needs override (when shown) | **no override needed** |
| Thumb reach | neutral, as A1 | neutral, as A1 | neutral at rest; absent mid-scroll | **best — Record on the literal edge** |
| New build cost | none | none | scroll listener, settle-timeout, a11y-tree toggle | none |
| Open question for the owner | none | none | does hiding mid-scroll fit R1's "at rest"? | accept the field leaving "the very bottom"? |

**Recommendation: S4, stacked with S2's tightened spacing** (121pt total, no
VoiceOver-order override) — together they close two of A1's three named
costs outright at zero behaviour, copy or business-rule change, only a
reorder and a spacing tighten. The one thing given up is named above: the
field leaves the exact "very bottom" position that was part of A1's original
appeal, flagged for the owner's eyes rather than decided here. If that
position is non-negotiable, **S1** is the safe fallback — zero behaviour
change, answers the "two heavy bars" read on its own, and also stacks with
S2. **S3** has the largest potential upside (headroom exactly when scrolling
needs it most) and the largest open question (a reading of R1 that needs
explicit sign-off, plus real new state to build) — a deliberate follow-up if
the owner wants to pursue it, not a default. **This is a design hypothesis,
not tested behaviour**: the brief's own S1 ("reach... without shifting
grip"), S4 ("did you know whether Andy would answer or just find names?")
and S5 ("no mis-taps") success criteria are what would actually confirm any
of this, on a device.

**Considered and set aside:** a secondary "Type" entry beside Record (a
direct shortcut to typing a note, skipping voice) was raised while exploring
this brief. Not designed as a fifth variant — it would add a second capture
entry point to `home`'s chrome that nothing in this brief's Must/Should asks
for, and works against R1's "Record is the one primary action at rest" and
Hick's law at the exact spot the brief asks to keep simplest. The `record`
screen already has `type-instead-button` one screen in. Flagged per this
project's Scope Discipline rule — it needs its own brief from
`product-strategist` before it's designed, not a quiet addition here.

**Tokens:** none new in any of S1–S4 — `moss`, `paper`, `edge`, `line`,
`placeholder`, `space.xs`/`sm`/`lg`/`xl`, `radius.pill`, `textSize.*` only.
**Names:** `home-bottom-bar-divider` (already proposed for A3, reused here
laid flat) is the only name any of S1–S4 would need if shipped; none
introduce a new component.

### S1 round — options

The owner chose **S1's geometry** — `record-button` centred above a
full-width `home-search-field`, the field at the very bottom — redrawn with
a **round** Record (not the oval S1 explored above), and asked to see the
most beautiful, efficient and effective ways to *draw* that same
arrangement. Four material options, same geometry, same model/copy/R1–R13,
one interactive mock: `docs/design/mocks/home-actions-s1-round.html`.

- **V-GLASS — Liquid Glass (the owner's first idea).** Round Record and the
  field are two independent `GlassView` surfaces (`expo-glass-effect`,
  already a dependency), floating free over `profile-list`, which runs to
  the screen's true bottom edge underneath — the iMessage search-bar /
  Instagram tab-bar family named in §5. Record is tinted with a proposed
  `colors.glassTintMoss` so it still signals "primary" (R2) as translucent
  material; the field uses a proposed, neutral `colors.glassTint`. Jakob's
  law: this is the platform's current default for bottom chrome, so nothing
  needs learning. **Risk, not resolved here:** a live `GlassView` blurs and
  samples whatever is actually behind it, so whether the placeholder and the
  word "Record" hold 4.5:1 over the darkest realistic row (a full-bleed
  photo avatar) cannot be proven in a mock — only measured on-device, after
  the tint opacity is tuned against real content. `home-actions.md` already
  flagged a glass field as "the first glass in a paper-only system,"
  needing its own STYLE.md line before it ships, and that line does not
  exist yet — STYLE's one deliberate risk today is the Briefing card's
  brass stripe alone. Reduce Transparency's fallback is pixel-identical to
  V-FLOATING below, so it is not a second thing to design. List inset
  (nothing reserves flex space for floating islands): `content`
  `padding-bottom: 152px` (Record 72 + gap 8 + field 44 + safe-area 20 + an
  8pt buffer), approximate, confirm against the shipped `home-index` on
  device, R7's usual caveat.
- **V-FADE — Paper panel, the list dissolves (no blur).** A fully opaque
  paper panel (same shape as the earlier A1/S1 family) holds Record and the
  field; the last 32pt of scrollable content fades to solid paper through a
  plain gradient mask (`home-list-fade`, new, decorative — no blur
  anywhere). Closest to STYLE's own marginalia grounding: content dissolves
  into the page rather than being clipped. Zero new contrast risk — every
  surface is opaque `paper`/`moss`, already-tested pairings. Tallest
  reserved chrome of the three opaque options: 160pt (in-flow, no inset math
  needed — `home-index`'s existing offsets keep working unchanged, same as
  A1).
- **V-NOTCHED — Solid bar, Record on the hairline (shutter).** A plain
  opaque bar with a 1px `colors.line` top hairline holds the field; Record's
  top half pokes above that hairline — Von Restorff by actual elevation
  rather than colour or shape alone. Smallest reserved footprint of all
  four: 77pt (vs. V-FADE's 160pt), because the 36pt overlap is drawn on top
  of content rather than inside the bar's own box — the same risk
  `home-actions.md`'s Option C named for `record-fab`, handled with a 36pt
  `content` padding-bottom buffer so the overlap only ever falls on dead
  paper space, approximate, confirm on device. Zero new contrast risk. Uses
  a proposed `shadow.float` token for the lift.
- **V-FLOATING — Free-floating, shadow only, no glass.** The same two
  floating islands as V-GLASS, but opaque (`moss` circle, `paper` pill, each
  lifted with `shadow.float` instead of blur) — this *is* V-GLASS's own
  Reduce Transparency fallback, judged here on its own merits too. Zero new
  contrast risk; same 152pt list-inset math and device-verification caveat
  as V-GLASS. The field keeps its `colors.edge` ring even with a shadow
  added — a shadow alone is not a reliable 3:1 boundary, so it is additive,
  never a replacement.

**Shared across all four, not a difference between them:** VoiceOver order
still needs the explicit "list → field → Record" override in every variant
(Record is drawn above the field in all four, the same cost the oval S1
explored above already named); the largest Dynamic Type size turns round
Record into a short stadium in all four (converging toward oval S1's own
"grows to full width" fallback); the hypothetical "recording" preview always
renders as a fully opaque `alert` fill with a pulsing dot (frozen under
Reduce Motion) and an elapsed time, in every material — including
V-GLASS — matching `mic-button--listening`'s existing convention rather than
inventing a translucent alert state; and this preview is shown for
visual-language consistency only — tapping Record still only ever navigates
to `record` (R1), nothing new is proposed on `home` itself.

**Recommendation: ranked V-NOTCHED, then V-FADE, then V-FLOATING, then
V-GLASS.** V-NOTCHED has the strongest beauty-to-risk ratio — smallest
reserved chrome, the most distinctive silhouette of the four, zero
accessibility risk, only a small and well-understood overlap buffer left to
verify. V-FADE is the safest and most on-brand if the owner would rather not
verify any overlap at all, at the cost of the tallest reserved chrome.
V-FLOATING is worth keeping specified regardless of the final pick, since it
is V-GLASS's own Reduce Transparency answer either way. **V-GLASS is the
most visually striking and the one the owner reached for first** — shown in
full, not ruled out — but it is the only one of the four whose central claim
(legible text over a system blur over the worst row this app will show)
cannot be proven in a mock, only on a device, and the only one STYLE.md
flagged in advance as needing a dedicated line before it spends the app's
second deliberate visual risk. If the owner wants to pursue it, the next
step is a real `GlassView` build against the actual worst-case row on a
device, not a further round of mocks.

### Proposed tokens

- `colors.glassTint` — `paper` (#E8E6DE) at ~0.85 opacity, the neutral glass
  tint (V-GLASS's field). Starting value only; the real alpha needs
  on-device tuning against the darkest realistic row before it is fixed.
- `colors.glassTintMoss` — `moss` (#5C6B4F) at ~0.84 opacity, so a
  translucent Record still signals "primary" (R2). Same on-device caveat.
- `shadow.float` — a single soft elevation shadow (offset 0/4, blur 14,
  `ink` at ~0.22) for any control that floats free of a panel (V-NOTCHED's
  lift, V-FLOATING's islands). `theme.ts` has no shadow/elevation concept
  today — this would be the first, and needs its own STYLE.md line
  regardless of which material option ships, since both V-NOTCHED and
  V-FLOATING use it.

STYLE.md change either glass token would need: a paragraph under "Color
Tokens" naming them as a second, narrowly-scoped departure from flat opaque
colour — after the Briefing card's brass stripe — confined to this one
chrome, with the same "don't spread this treatment elsewhere" discipline
brass already models.

**Names, if a variant ships:** `record-button--round` (the round shape of
the existing `record-button`, role unchanged); `home-bottom-bar--glass` /
`--fade` / `--notched` / `--floating` (material states of the existing
`home-bottom-bar` region — role, not look, per naming rule 6, even where
V-GLASS/V-FLOATING render it as two floating pieces rather than one visual
bar); `home-list-fade` (new, V-FADE's gradient mask); `home-search-field--glass`
(new, V-GLASS's material state).

## Final choice

Owner, 2026-10-12.

- **Model.** The search field filters home's list in place, free and offline. Asking a question is a labelled "Ask Andy: “…”" row.
- **Shape.** S1 with a **round Record** (72pt, the word "Record" in it) centred above a full-width `home-search-field` at the very bottom.
- **Material: V-NOTCHED.** An opaque paper bar with a hairline; the round Record sits across its top edge like a shutter. No glass and no new tokens. On a device, check that Record's overlap never covers the last row or the A–Z index.
- **#4.** The back bubble stays. It is iOS 26 glass, which react-native-screens 4.26.2 cannot remove from the system back button; #153's chevron-only rule keeps it small.
- **#3.** Settings becomes a gearshape SF Symbol via expo-symbols. STYLE.md needs a line allowing system symbols.
- **What Record does is not settled yet.** The owner has proposed a choice of capture doors (voice, write, photo/import). That is being briefed in `capture-doors.md`. Whether Record starts listening at once depends on it.
- **Mock fix.** The mock's "recording" toggle (Record turning red on home) only previews the colour. Home never records in place: Record opens the record screen, which transcribes live.
