# Draft editing: write it, change it, hand it back

Status: **decided, 2026-10-30 — owner chose option F ("Ask, then edit", the owner's own sketch). See `## Final design` at the end; it overrides anything above that disagrees.** Nothing built yet. Options A–E are kept as the record of what was considered.
Screens: `write-to` and `draft`. Part names come from `component-names.md`. Anything new is marked **(new)**.

## Brief

### 1. The problem

Today the words get written in two places. You type what you want in `draft-say-field` on `reach-out-compose`. Andy's text then appears on a second face of the sheet, in `draft-message-field`. You can edit that text by hand, but nothing reads your edits back. The only way to ask for another pass is `draft-regenerate-button`, and it throws your edits away (`draft-replace-alert`). So the person ends up choosing between their own wording and Andy's help, and can't have both. The rejected round tried to fix this by adding a third place to type (an instruction field next to the draft). The owner's direction is the opposite: **one piece of text that both you and Andy work on.**

### 2. The job, in the person's words

- "Here's roughly what I want to say. Make it read well." (starting from their own draft)
- "Write me a note that thanks her for the intro." (starting from a request)
- "That's close. I fixed the second line. Tidy it up, but keep my fix." (sending their edited text back, with or without a word of instruction)
- "The last one was better. Go back." (stepping to an earlier version)

The smallest useful outcome is **one** text you can type into, one way to hand it to Andy, and a copy button. If someone can't see how to do any of the four jobs above within a few seconds, without being told, the design has failed.

### 3. Rules the design must keep

1. **The text on screen is the draft.** Whatever is in the field, whether the person typed it or Andy wrote it, is what goes to Andy next and what Copy takes. There is no hidden second copy.
2. **Their words win.** A pass keeps every part of their text that the instruction doesn't ask to change: their facts, plans, names and anything they just fixed by hand. Prompt rule 1 (widened on 10-21) applies: a plan, date or offer comes from their text or instruction, never from nowhere. Rules 0 and 2–5 apply unchanged. Their draft is data, so a line in it that addresses Andy is still part of the message, not an order.
3. **Nothing typed is ever lost.** Before a pass, whatever is on screen is kept as a version, so stepping back always finds the person's own edit. That generalises the 10-21 rule "every version kept, never deletes" to the person's text as well as Andy's. Versions last until the sheet closes. Closing throws them away, as it does today, and nothing is written to the phone, so `forgetOnThisPhone` is unchanged.
4. **Copy-only output. Andy sends nothing (promise 2).** No control is called Send, Submit or Reply, and none shows an arrow-send icon (reference pattern avoid-2). The owner's "send it to Andy" has to be worded as Andy doing something to the text, not as sending a message. `copy-message-button` stays the strongest control on the sheet (pattern 9).
5. **Nothing is written until the person asks** (pattern avoid-1). There is no writing on open and no writing as you type.
6. **What leaves the phone, and to whom:** the text in the field, the instruction if there is one, format and tone, the person's name, and the reviewed details of the chosen notes (never a note's own wording). These go through the Convex action to Anthropic (Haiku 4.5) and nowhere else. They are not stored on the server, not logged (no `console.log` of action arguments), and not kept on the phone after the sheet closes. `requireAiAllowed` gates the first call as it does today. `promptBoundary` applies: `neutralizeTags` for the draft and the instruction, each in its own block.
7. **Limits stay as decided:**
   - at most **10 passes after the first** per sheet, then `draft-refine-cap-line`;
   - the instruction is capped at 500 characters (`MAX_INSTRUCTION_CHARS`);
   - the draft gets its own server-side cap (proposed 4,000 characters, the same as a paste).
   Offline, while writing, and on failure, the rules in 10-21 §3 apply: every control that writes waits, and a failed pass keeps the text on screen and the instruction.
8. **The lines under the draft stay true.** `draft-intent-line` says what the pass did, for example "Kept your opening; made it shorter." `draft-sources-line` says only what was actually used. When the draft came from the person's own words with no notes used, it reads "Written from your words." Neither line is ever copied.
9. **Tokens only, WCAG 2.2 AA, Dynamic Type, 44pt targets.** The version stepper reads "Version 2 of 3".

### 4. Success (hypotheses, checked without analytics)

- **Self-explanatory.** The owner, plus 3 TestFlight testers who are given no explanation, each do all four jobs in §2 on first sight. *Kill signal:* anyone asks "how do I send my changes back?" or retypes their edit as an instruction.
- **Never lost.** QA row: edit, do a pass, step back. The edit is there, word for word, every time.
- **Intent caught.** Same as 10-21: on average 2 passes or fewer before Copy. If people routinely do 4 or more, Andy isn't keeping their words.
- *Principles behind these predictions, not proof:* Fogg ability (one surface, one action), loss aversion (nothing typed is ever lost, so editing feels safe), and ownership (their words lead, so the result sounds like them).

### 5. Conflicts with follow-up-redesign.md: owner to decide

- **Q1. Does one surface replace the two faces?** Today `reach-out-compose` (say-field, notes, tone) leads to `draft`. *My recommendation:* merge them. The field you type your request or rough draft into is the field Andy's text comes back into. Notes, tone and format stay as settings around it. Reply (not built yet) uses the same surface, with `reply-their-message` above it.
- **Q2. Retire `draft-replace-alert` and `draft-regenerate-button`?** With rule 3 nothing can be lost, so the "Your edits will be replaced" question has no reason to exist. Tone or format changes become passes on the current text. *My recommendation:* retire both. The cost: a fresh draft from the notes alone goes away, and "Start over" (10-21) covers that.
- **Q3. Keep the five `refine-chip`s (Shorter · Warmer · More formal · Less pushy · Add a question)?** They were decided on 10-21. *My recommendation:* keep them, but only as ready-made instructions for the same single action, not as a second way to rewrite. The designer may argue for fewer.
- **Q4. When the person starts from their own draft, does Andy read their notes?** *My recommendation:* yes, as background, under 10-21's R-reply rule. Their text leads, and a detail from a note goes in only where it fits. The notes can be switched off for that sheet.
- **Q5. Scope.** Starting from your own draft is a new input. The follow-up Must Have in `PROJECT_SCOPE.md` and `PROJECT_SCOPE.ko.md` needs a clause ("…or the person's own draft, improved in place; every pass keeps the text it started from as a version") in the build PR. *Needs the owner's approval.*

### 6. Out of scope

- Grammar or feedback comments on the text (the rejected "Andy's take on what you changed"). Andy returns text, not a review.
- Chat history on screen, and drafts saved after the sheet closes.
- Sending anything, reading the clipboard without being asked, reading an inbox.
- Writing as you type, or suggesting before you ask.
- Rating buttons, AI sparkle, a cost meter.
- Share to Andy, a home entry point, and the widget.

## Options

Written by `product-designer`, 2026-10-30. Mocks (seven or eight phone frames each, side by side): [A](../mocks/draft-editing-a.html) · [B](../mocks/draft-editing-b.html) · [C](../mocks/draft-editing-c.html) · [D](../mocks/draft-editing-d.html). HTML approximations, not production code.

### Design read

**Preserve.** `draft-message-field` as the place the words live; `copy-message-button` as the strongest control; `draft-intent-line` and `draft-sources-line` under the text; moss pills, `edge` field outlines, sentence case, Lora only for the name in the title.

**The user's task** is the four jobs in §2. Underneath them is one question the person never says out loud: *is what I typed an instruction to Andy, or is it the message?* Rule 2 (their draft is data, never an order) means the app cannot guess. Every option answers that question in a different place:

| | where "is this a request or my draft?" is answered |
|---|---|
| A | at the door you open (Write it myself / Ask Andy to write it), and by selecting vs not selecting |
| B | at the door, then the button is the same every time |
| C | by the text itself: words in a pill are the request, everything else is the message |
| D | at the door, then the bar under the page is the only request field |

**Shared parts (new, in every option).**
- `draft-start-doors` (new): two doors on the empty sheet, `draft-door-write` ("Write it myself") and `draft-door-ask` ("Ask Andy to write it"). Replaces the old `draft-say-field` first screen. C does not need it (see C). Both doors lead to the same page; the second opens it with the request marked as a request.
- `draft-page` (new): the one field. It is today's `draft-message-field` taking input from the first moment.
- `draft-settings-line` (new): "Friendly · Message · 1 note", one quiet 44pt row replacing `reach-out-format-picker`, `reach-out-tone-chip` and the note list as first-screen content; tapping opens them (Q1). Collapsing them is what lets the page lead.
- `draft-version-stepper` (new, A–C): "‹ Version 3 of 4 · yours ›". Appears at 2 versions. The word after the dot (yours / Andy's) is what makes stepping back self-explanatory.
- Retired by Q2: `draft-regenerate-button`, `draft-replace-alert`, `draft-back`.

**UX risks.** (1) The one-field model hides *which words are mine and which are Andy's* once edits mix. (2) Pass-time: a Haiku call takes a few seconds, and the page must stay readable and not look lost while it runs. (3) The keyboard takes 250 of 700pt; anything docked above it eats the page. (4) A person who edits Andy's text and then taps the main Andy control may fear "will it keep my fix?". Every option answers with the intent line ("kept your Thursday") and the version they can step back to.

**Hypotheses, not research.** I have not tested any of these with people. Each option's "why it may work" is a prediction with the test named in §4.

---

### Option A - Point and ask

**Idea.** One page. To change just a piece, select it the way you already select text. A bar appears on the keyboard: "Ask Andy about this part". With nothing selected, "Ask Andy" works on the whole message. Selection scoping is the strongest possible form of rule 2: Andy returns a replacement for the selected span only; the rest is not rewritten, so it cannot drift. [Mock](../mocks/draft-editing-a.html)

**The jobs, in taps.**
- *Own draft.* Door 1 "Write it myself" (1 tap) → type → "Ask Andy" (1 tap) → Andy's text in the same page.
- *Ask Andy to write.* Door 2 (1 tap) → type "Thank her for introducing me to Dev" → Ask Andy (1 tap).
- *Send my edit back.* Edit by typing, tap "Ask Andy" (whole), or select a part and tap "Ask Andy about this part" (2 taps incl. selecting). Optional word: chips (Shorter, Warmer, Plainer) or the field in `draft-selection-bar`.
- *Step back.* ‹ in `draft-version-stepper` (1 tap per version).

**Principles (hypotheses).** Jakob's law: selecting text then acting on it is how Apple Writing Tools, Notes and every editor works, so no new vocabulary. Recognition over recall: the action appears where the eye already is. Fitts: the bar sits above the keyboard in thumb reach.

**Pros.**
- Least new UI: one bar, shown only while there is a selection.
- Partial edits are cheap and safe: "just fix this sentence" is the commonest real need after a first pass.
- Their words win by construction when scoped (only the span returns).
- No instruction field on screen when you are not using it.

**Cons.**
- Discoverability of selection is the weak point: someone who doesn't think to select never meets the best feature. Mitigation: after Andy's first text, the quiet line "Select any part to change just that." in `draft-hint-line` (new), once per sheet.
- Selecting precisely with a thumb is fiddly for long text (double-tap selects a word, triple-tap a paragraph).
- Two Andy buttons (whole, part) can confuse.

**Accessibility.** The selection bar is a standard keyboard accessory, 44pt rows, labelled "Ask Andy about the selected text". Selection works with VoiceOver's rotor and Select commands. Chips are 44pt tall. Changed span is underlined for 2s then fades (underline plus the intent line, never colour alone); with Reduce Motion it stays and does not fade. Contrast: all existing pairs (ink/paper, paper/moss, edge/paper). The selection tint is the iOS system one; no new colour.

**Build cost: M.**
- `write-to-sheet.tsx` / `draft-sheet.tsx`: merge the two faces into one (shared by all options, the bulk), `onSelectionChange` on the multiline TextInput, a keyboard accessory (`InputAccessoryView`), range bookkeeping across edits.
- `convex/followUp.ts` `draft`: new args `text`, `instruction?`, `span?: {start,end}` (or the selected string with its before/after context). Returns replacement for the span, or whole text. Validation of range against text length. Draft cap 4,000 server-side.
- Version stack in client state (all options).

**Assumes.** Q1 merge: yes. Q2 retire: yes. Q3 keep chips but only three (Shorter, Warmer, Plainer) in the selection bar; the full five on whole-text asks. Q4 notes as background. Q5 needs the scope clause.

**References.**
- *Apple Writing Tools* (iOS 18+): select text in any text field, Writing Tools in the edit menu offers Proofread / Rewrite / Friendly / Professional / Concise, replacing in place with an undo. Confident.
- *Notion AI*: select text, an AI menu offers improve, shorten, change tone. Confident.
- *Grammarly mobile keyboard*: acts on text you have selected or the whole field. Reasonably confident.

---

### Option B - Show what changed

**Idea.** Andy's pass returns in the same field, with each changed sentence underlined and a line "3 changes". Tap an underline to see what you wrote there and put it back. The page is never frozen into "accept or reject": changes are already applied; the underlines are information, and an undo that is one tap away is local to each change. Asking again is one button that opens a short list (`ask-andy-list`): Tidy it up, the five old chips, and "Something else…" which swaps the list for a one-line field. [Mock](../mocks/draft-editing-b.html)

**The jobs, in taps.**
- *Own draft.* Door 1 → type → Ask Andy → "Tidy it up" (3 taps).
- *Ask Andy to write.* Door 2 → type → Ask Andy (2 taps after typing; no list because there is no text yet).
- *Send my edit back.* Edit, Ask Andy, pick a row, or "Something else…" and type a word (3 taps for a chip, +typing for free text).
- *Step back.* Version stepper, or "Put mine back" for one sentence only.

**Principles (hypotheses).** Visible system status: you see exactly what a pass did, which is the strongest answer to "did it keep my fix?". Recognition over recall: tracked changes are a pattern from Docs and Word. Loss aversion: a per-change restore makes accepting Andy's text feel reversible.

**Pros.**
- Best answer to rule 2: the person can *see* their words survived (no underline on Thursday).
- Fine-grained recovery without leaving the page: "I like my wording in this line".
- The list teaches what Andy can do with no placeholder text.

**Cons.**
- More to look at after every pass; adds a "3 changes" line, popover and list. Most complex of the four to read.
- Underlined text is harder to read, and the diff on a rewrite that changed everything is noisy (every sentence underlined). Mitigation: above ~70% changed, collapse to "Rewritten" and no marks.
- Needs a client word/sentence diff; inconsistent diffs would feel buggy.
- Ask Andy → list → pick is an extra tap compared with A/C/D for the common case.

**Accessibility.** Marks are underline (2pt, moss) plus the count line, not colour-only. Each mark is a VoiceOver link: "Changed by Andy. You wrote: We talked yesterday and he is keen. Put mine back." The popover and list are native-feeling bottom surfaces with 44pt rows; the list traps focus and closes on Escape/scrub. Contrast: moss/paper underline 3:1 non-text is satisfied (moss on paper over 4.5:1 already used for text); `scrim` as existing. No new token.

**Build cost: M–L.**
- Client: sentence diff against the version before the pass; marked-text rendering inside an editable TextInput is the hard part: RN TextInput can't underline arbitrary spans while editable, so render marks in a read-only view and swap to the input on first tap (a known trick, with a cost: a visible mode swap). Popover and bottom list are new.
- Convex: same as A minus span (whole text in, whole text out).

**Assumes.** Q1 yes, Q2 yes, Q3 keep all five as list rows, Q4 yes, Q5 needs clause.

**References.**
- *Google Docs suggesting mode / Word Track Changes*: edits shown inline and reversible per change. Confident.
- *Grammarly*: underlined spans you tap to inspect and accept; the inverse flow, but the same tapped-underline idea. Confident.
- *Gmail Help me write*: result with Refine menu (Formalize, Elaborate, Shorten) and undo/redo. Confident about the menu, not about exact current labels.

---

### Option C - Ask in the page

**Idea.** There is no instruction field anywhere. If you want Andy's hand on a spot, you add an ask there: a small pill inside the text, typed in your own words ("thank her for the intro to Dev"). One button then reads "Fill in 1 ask". With no asks in the page the same slot reads "Tidy it up" and works on everything. Writing from a request is an ask that is the whole page. Because the pill *is* the delimited instruction, rule 2 stays clean in the simplest way: text outside pills is the message, text inside is the order. [Mock](../mocks/draft-editing-c.html)

**The jobs, in taps.**
- *Own draft.* Type → "Tidy it up" (1 tap).
- *Ask Andy to write.* The page opens focused with "+ Ask Andy here" on the keyboard; tap it, type the request, tap "Fill in 1 ask" (2 taps).
- *Send my edit back.* Edit; optionally "+ Ask" and type a word at the spot; tap the button (1–2 taps).
- *Step back.* Version stepper. Filled asks come back as pills in older versions.

**Principles (hypotheses).** Proximity (Gestalt): the instruction lives next to the words it is about. Direct manipulation: no separate place to type. Progressive disclosure: the ask exists only when you add one.

**Pros.**
- Truly one surface: no doors, no instruction field, no sheet, no menu.
- Can mix "mine" and "Andy's job" in one sentence, which is how people actually draft.
- The strongest rule-2 story and the cleanest prompt (`<draft>` and `<asks>` are separate blocks, positions known).
- Fewest taps for own-draft tidy.

**Cons.**
- Novel interaction; nothing in iOS looks like it. It leans on one rule ("an ask on the first line applies to the whole page") that must be learned. This is the riskiest for the "obvious without explanation" test.
- Hardest build: an inline non-text token inside an editable field.
- The text has hidden structure: Copy must refuse or warn while an ask remains unfilled ("1 ask still to fill in") so a pill never gets copied.
- Mixed with Q: it needs a copy rule so the unfilled pill is not copied as text.

**Accessibility.** Each pill is a VoiceOver element: "Ask to Andy: thank her for the intro. Double-tap to edit." Pill outline in `edge` 3.2:1, text `ink`; label word "Ask Andy" in moss bold on paper (existing pair). Pills wrap with the text under large Dynamic Type; each remains a 44pt-high hit target (line height 1.9 gives room, as mocked). Reduce Motion: no animation involved except a brief underline on filled text, which stays static.

**Build cost: L.**
- `draft-sheet.tsx`: replace the TextInput with a rich-text editor or a block model (array of text and ask segments) rendered as inline views; caret handling, selection and deletion of a pill, VoiceOver. Likely a small dependency or a native text attachment. This is the risk.
- Convex: `text`, `asks: {position, text}[]` or a marker string; prompt rewrite so asks fill in place.
- Version model must store segments.

**Assumes.** Q1 yes (no doors needed), Q2 yes, Q3 the five chips become suggestions inside a pill ("Shorter" inserts an ask), Q4 yes, Q5 clause plus "asks" wording.

**References.**
- *Notion AI* inline at the cursor ("Ask AI to write…" on a line) with the result inserted there. Confident.
- *Cursor / VS Code inline edit (Cmd-K)*: an instruction typed at the spot you're editing. Confident.
- *Roam / Obsidian-style templates & mentions*: tokens inside text. Weak analogy; mention only as inspiration.

---

### Option D - Pages

**Idea.** Every version is a page in a small deck. A new pass never writes over a page; it adds a page to the right and turns to it. You see the edge of the neighbour, dots with 44pt targets, and a caption "Yours · page 3 of 4". Going back is a swipe, a tap on the edge, or a tap on a dot. A single bar under the page always holds the optional instruction and the Ask Andy button. This is the nearest to the rejected round's A; the difference is that "history" is the page itself, not a panel or a button. [Mock](../mocks/draft-editing-d.html)

**The jobs, in taps.**
- *Own draft.* Door 1 → type → Ask Andy (1 tap, bar always visible).
- *Ask Andy to write.* Door 2 → type the request in the bar → Ask Andy.
- *Send my edit back.* Edit the page, type an optional word in the bar, tap Ask Andy.
- *Step back.* Swipe right (1 gesture).

**Principles (hypotheses).** Spatial memory: versions as places, not lists. Recognition over recall: the peeking edge says "more here". Photo/Notes pagers have taught the swipe.

**Pros.**
- Back is as obvious as it gets, and it can't be missed: you see there are other pages.
- Nothing is ever overwritten; comparing "mine" and "Andy's" is a swipe.
- Instruction is always one visible field: no hidden affordance, no menu.

**Cons.**
- Two writing surfaces again (page + bar), the exact thing the owner turned down. The bar is small, but a person may type a message in it. Door 2 puts the request in the bar, which reinforces that the bar means "tell Andy".
- Edge-swipe conflicts: the sheet's own dismiss-down gesture and horizontal text-selection handles. Needs a deck that only pages from its edges or the dots.
- More pages than needed: every pass adds one, up to 11 (cap). Dots stop being useful above ~6; falls back to "page 7 of 11".
- The bar uses ~44pt above the keyboard.

**Accessibility.** Page is `accessibilityRole="adjustable"` with increment/decrement; dots are 44pt buttons labelled "Page 2 of 4, Andy's". Caption is readable text, so meaning never depends on dots alone. Reduce Motion: the page change is a cross-fade. Contrast: dots `edge` outline 3.2:1, selected filled moss.

**Build cost: M.**
- `draft-sheet.tsx`: horizontal `FlatList` pager with `pagingEnabled`, dots, caption; the bar. No rich text.
- Convex: whole text and optional instruction. The smallest backend change of the four.

**Assumes.** Q1 yes, Q2 yes, Q3 chips fold into the placeholder or are dropped (suggested: drop them, free text only), Q4 yes, Q5 clause.

**References.**
- *Apple Notes / Photos / Safari tab pager*: dots and swipe between pages. Confident.
- *ChatGPT and Gemini regenerate*: the response carries "< 2/3 >" to flip between alternatives. Confident for ChatGPT; Gemini shows "drafts" similarly (reasonably confident).
- *Gmail Help me write*: undo/redo arrows beside the result. Confident.

---

### Comparison

| | A Point and ask | B Show what changed | C Ask in the page | D Pages |
|---|---|---|---|---|
| Surfaces to type in | 1 (+ small bar on selection) | 1 (+ list/field on demand) | 1 | 1 + the bar |
| Own draft → Andy | 2 taps | 3 taps | 1 tap | 2 taps |
| Ask Andy to write | 2 doors + 1 | 2 doors + 1 | add ask + 1 | 2 doors + 1 |
| Edit, send back | select or whole, 1–2 taps | 3 taps | 1–2 taps | 1–2 taps |
| Step back | stepper | stepper + per-change | stepper | swipe |
| "Did it keep my fix?" | intent line, scoped span | **you see it** | intent line, outside pills untouched | swipe to compare |
| Obvious unbriefed | medium (selection hidden) | high for marks, medium for list | **lowest** (novel) | high |
| Rule 2 strength | high (span) | medium | **highest** (pill) | medium |
| Build | M | M-L | **L** | M |
| Closest to rejected A/B/C | none | B (history) a little | none | A |

### Recommendation

**Option A, with D's step-back affordance kept out and one B idea borrowed.** Concretely: A's single page, the two doors, the version stepper, and selection-scoped asks. From B, borrow only the **"Put mine back"** feel as a plain line on the intent ("Kept your Thursday") rather than the marked-up diff.

Why A:
1. It is the only option where the thing that goes to Andy is scoped by something the person already does (select text). That makes "keep my fix" true by construction for the cases that need it, without a new concept.
2. It adds nothing to the screen at rest: page, one Andy button, Copy message. Selection is progressive disclosure.
3. It is M, not L, and does not need a rich-text editor (C) or a diff-over-editable-text trick (B).
4. It can grow: B's marks or D's pages could be added later without changing the model.

The trade-off I'm accepting: **discoverability of selection.** Someone who never selects loses the best feature, and the "Ask Andy" whole-page button covers the main job anyway. The hint line after the first pass is the mitigation; if testers don't find selection in the §4 test, the fallback is D (the bar exists, nothing hidden) as the simplest upgrade.

If you want the most original idea and are willing to pay the build, C is the one with the highest ceiling and the highest risk; test it on paper first.

**Key states (A).** Empty: two doors. Typing: Ask Andy appears when there is text. Waiting: page stays readable, Ask Andy and Copy disabled, "Andy is writing…". Error: page and instruction kept, "That didn't work. Try again." Offline: Ask Andy disabled, "Andy needs a connection to write." Cap reached: `draft-refine-cap-line`. Permission (`requireAiAllowed`): the existing `ai-permission-sheet` on the first Ask Andy.

### Proposed tokens

None. Every colour, spacing and size above exists in `theme.ts`. The pale selection tint in the mocks is the iOS system selection, not an app colour.

### Open disagreements

1. **Q3 chips.** I'd cut to three (Shorter, Warmer, Plainer) on the selection bar and keep five only in the whole-text list if B is chosen. "More formal" and "Less pushy" can be said in a word.
2. **Q2 "Start over".** With a version stepper, "Start over" is just going to Version 1. I'd not build a separate control.
3. **The rule 3 snapshot cap.** 10 passes means up to 21 versions (pass + edit snapshots). Suggest counting only Andy's passes against the cap, and not keeping a snapshot when nothing changed since the last one.

### Questions for the owner
- Which of the four do you want tested on TestFlight with unbriefed people (§4)? My suggestion: A, with D as the fallback.
- Q1 to Q5 as in §5, unchanged by this section.

## Strategist review

Written by `product-strategist`, 2026-10-30, against §3 rules 1-9 and §4. I read the four mocks. Everything below about how people will behave is a hypothesis; the §4 TestFlight test with unbriefed testers is what settles it. I don't choose for the owner. Where I disagree with the designer, I say so, and the disagreement stays open.

### Checked against the brief

| | A Point and ask | B Show what changed | C Ask in the page | D Pages |
|---|---|---|---|---|
| Clear on first sight (§4) | **Mostly.** Doors, one page and "Ask Andy" are plain. Selecting part of the text is hidden, but the main jobs don't need it. | **Partly.** The underlines are clear. Ask Andy → list → pick adds a step before every pass. | **No.** It's a new interaction, and "an ask at the top applies to the whole message" has to be learned. Fails the §4 test as written. | **Yes for going back.** The bar is clear, but it is the second place to type that the owner turned down. |
| Their words win (rule 2) | **Strong.** When part is selected, only that part comes back, so the rest can't drift. A whole-text pass relies on the prompt, like every option. | **Visible but not enforced.** You can see the drift and undo it, but the pass can still drift. | **Strongest.** Text outside pills is the message and is never rewritten. | **Prompt only.** Same as today, plus the ability to swipe back. |
| Nothing typed is lost (rule 3) | Meets it with the stepper and "· yours". | Meets it, but adds a second undo ("Put mine back" on each sentence) next to the stepper. That is two ways to go back. | Meets it, but each version has to store pills as well as text. | Meets it best. Every version stays on screen as a page. |
| Copy only, nothing called Send (rule 4) | Meets it. "Ask Andy" describes Andy doing something to the text, and Copy message is still the strongest control. | Meets it. | **Strains it.** Copy has to refuse or warn while a pill is unfilled, so the strongest control is sometimes blocked. | Meets it, but the bar plus "Ask Andy" looks the most like a chat composer with a send button. That's a risk to the promise in how it looks, not in what it says. |
| What leaves the phone (rule 6) | The whole text, which part is selected, the instruction, the settings, and reviewed note details. **The whole text has to go even for a selected-part pass, because Andy needs the sentence around it.** The disclosure stays the same. | The whole text and the instruction. The comparison happens on the phone. | The text plus the asks with their positions. Two blocks, both through `neutralizeTags`. | The whole text and the instruction. Smallest change on the server. |
| Biggest product risk | People never discover selection, so the feature that sets A apart goes unused. The fallback is still a working whole-text pass. | Too much to read after every pass, and a comparison that looks different from pass to pass reads as a bug and erodes trust. | Someone copies an unfilled pill into a real message to a real person, or never works out what a pill is. | It brings back the "message vs instruction" confusion the owner rejected. §4 kill signal: someone types the message into the bar. |

### Recommendation

**A, with the rules below.** I agree with the designer's choice. My reasons are partly the same and partly different. A is the only option where "keep my fix" is guaranteed by how it's built, without asking the person to learn anything new (Jakob's law: selecting text is how every iOS editor already works). It adds nothing to the screen when idle (Fogg ability: one page, one Andy action, one Copy). Its fallback is the same model with less in it, not a different model.

**Where I disagree with the designer: the fallback.** If testers don't find selection, the designer would fall back to D. I would fall back to **A without selection**: one page, Ask Andy on the whole text, the optional word, and the stepper. D's bar is a second place to type, which is the shape the owner turned down on 10-29. Not finding a feature calls for removing it, not for bringing back a rejected layout. *What would settle it:* if testers type an instruction into the page itself in A-without-selection (which would show they need a separate field), D gets stronger.

**Rules A needs before it's built** (business rules I own; the designer owns how they look):

1. **A selected-part pass splices on the phone.** Andy returns only the replacement for the selected part, and the app swaps it into the text. "Nothing else changed" in `draft-intent-line` may only be shown when that is literally true. If the person edits the text while the pass is running, the pass is thrown away. The text on screen and the instruction stay, and the line reads "Your text changed while Andy was writing. Ask again." A replacement is never spliced into text that has moved.
2. **Editing an older version doesn't delete newer ones.** If you step back to Version 2 of 4, edit it and ask Andy, the result is added as Version 6 (5 is the snapshot of your edit). Versions only grow, until the sheet closes.
3. **What counts as "yours".** A version is marked "· yours" if the person typed anything into it after Andy's last pass; otherwise it's "· Andy's". When nothing has changed since the last version, no new snapshot is taken (this matches the designer's disagreement 3).
4. **`draft-hint-line` (new)** shows once per sheet, after Andy's first text, and is never stored. "Once ever" would need a preference on the phone and a new entry in `forgetOnThisPhone`. That isn't worth it for a hint, so it stays once per sheet.
5. **Cancel and Done (in every mock).** Both close the sheet, and closing throws the versions away. Two names for one action breaks the voice rule (one action, one name), and "Done" suggests something was saved. **This needs a decision from the owner and the designer, not from me alone:** either keep only "Close", or (my recommendation) ask before closing when the sheet holds text that hasn't been copied: "Close without copying? Your text won't be kept." with **Keep writing** / **Close**. That's a plain question with both options equal, not a guilt trip. It extends rule 3 ("nothing typed is lost") to the one place where it currently isn't true.

**Copy in the A mock that I'd keep, and one thing I'd change.** I'd keep "Write it myself / Type your message. Andy can tidy it.", "Ask Andy to write it / Say what it should say.", "What should it say?", "Ask Andy about this part", "Or say what to change (optional)", "Back to your edit, word for word.", "Shortened the part you picked. Nothing else changed." and "Version 3 of 4 · yours". I'd change "You changed Tuesday to Thursday. That stays." (frame 4). It describes what Andy will do before Andy has done it. Show that line only after the pass, as the intent line ("Kept your Thursday."), never as a promise beforehand.

### The designer's open disagreements

1. **Chips cut to three (Shorter, Warmer, Plainer).** **I partly disagree.** I agree that five is too many on a keyboard bar. I also agree that cutting "More formal" is right, for a different reason than the designer gives: it overlaps with the tone setting in `draft-settings-line`, so it is a second control for the same thing. I disagree on two points:
   - **"Plainer" is a new word,** and in practice it is what "Tidy it up" already does. I would keep **"Less pushy"** instead. For a reach-out, sounding too pushy is the failure the 10-21 chips were chosen to fix (that's a hypothesis, not research).
   - **The set should be the same everywhere.** The designer's §A text puts three chips on a selected part and five on whole-text asks. Two different sets for one action breaks "one action, one name".

   My proposal is **Shorter · Warmer · Less pushy**, in both places. "Add a question" can be said in a word. *What would settle it:* in the §4 test, which instructions testers type into the free field. If they keep typing "simpler" or "plainer", the designer is right.
2. **No separate Start over.** **I agree, and I'm withdrawing my own Q2 note.** With the stepper, Version 1 is where the person started: their own draft, or their request. Stepping there and asking Andy again gives a fresh pass, and rule 2 above means nothing later is lost. The only thing that goes away is "a fresh draft from the notes alone, ignoring my request", and I don't think anyone needs that.
3. **Only Andy's passes count toward the 10.** **I agree.** That's what §3 rule 7 meant: a pass is a call to Andy, and a snapshot isn't a call. I also agree with skipping identical snapshots. The worst case is 21 versions, kept in memory only and thrown away on close, so it adds no cost or privacy exposure. The stepper reads "Version 14 of 21 · yours", and that's fine.

### Decisions for the owner

1. **Which option goes to the TestFlight test (§4)?** The designer and I both recommend **A**. *We disagree on the fallback:* the designer says D, and I say A without selection.
2. **Q1: Merge the request screen and Andy's text into one page?** Recommended: **yes**. Tone, format and notes go behind `draft-settings-line`.
3. **Q2: Remove "Write another" and the "Your edits will be replaced" alert?** Recommended: **yes**, with no separate Start over control. Version 1 covers it (the designer and I agree).
4. **Q3: Which quick-change chips?** The designer recommends Shorter · Warmer · Plainer on a selected part and five on the whole text. I recommend **Shorter · Warmer · Less pushy, the same set in both places**. *Open between us.*
5. **Q4: When you write your own draft, does Andy still read your notes about the person?** Recommended: **yes, as background**. Your text leads, and the notes can be switched off for that sheet.
6. **Q5: Approve the scope change?** The follow-up Must Have in `PROJECT_SCOPE.md` and `PROJECT_SCOPE.ko.md` gains "…or the person's own draft, improved in place; every pass keeps the text it started from as a version". Recommended: **yes**, in the build PR. *This is a scope change and needs your approval.*
7. **New: what happens when you close a sheet you haven't copied from?** Recommended: one Close control plus the question "Close without copying? Your text won't be kept." (Keep writing / Close). Alternatives: close silently as today, or keep the two words Cancel and Done. *I'm raising this. The designer hasn't weighed in yet.*

## Final design (owner, 2026-10-30)

Mock: `docs/design/mocks/draft-editing-f.html`. Option F, the owner's sketch, refined over three rounds in conversation. **Not chosen:** A (point and ask), B (show what changed — "B is out"), C (ask in the page), D (pages), E (receipt — "too complex"). The two-door start ("Write it myself / Ask Andy to write it") is removed everywhere: one page, one entrance.

### Layout — one sheet, `write-to`

Every screen has the same layout; the keyboard opening or closing is the only difference.

| Part (new) | What it is |
|---|---|
| `write-to-close-button` | Close, top left. Title "Write to {name}" centred. |
| `write-to-ask-box` | Box A, before Andy's first answer. Placeholder: "Write what you want to say to {name}, or tell Andy what to write, or both. Replying to a message from another app? Add a screenshot of it." then "e.g. Do you want to hang out and talk about our new product? Make it sound casual but still professional." |
| `write-to-screenshot-button` | Photo icon, bottom-left of box A (VoiceOver "Add a screenshot"). Opens Apple's photo picker for one picture — no photo-library permission. |
| `write-to-quote` | Their message, read from the screenshot, as a quiet quote at the top of box A ("{name} wrote"). Tap to fix a misread word; ✕ removes it. While reading: a thumbnail and "Reading {name}'s message…", box size unchanged. |
| `write-to-arrow` | The only button that asks Andy: a round arrow icon in the box's bottom-right corner, and at the end of the chat line. VoiceOver: "Ask Andy". Becomes a spinner while Andy writes ("Andy is writing…"). |
| `write-to-draft-box` | Box B, Andy's answer. An ordinary editable text field. **Same size as box A on every screen** (sized so that box B, the hint, the chat line and Open Messages all fit with the keyboard up; with the keyboard down the space below stays empty). |
| `write-to-copy-button` | Copy icon, top right inside box B. On tap: becomes a check and says "Copied" for a moment. |
| `write-to-version-stepper` | "‹ 2 of 3 ›", bottom left inside box B. |
| `write-to-edited-tag` | "Edited", top left inside box B, while the text differs from Andy's last answer. |
| `write-to-hint` | Under box B: "Edit the text above, or tell Andy what to change." |
| `write-to-chat-line` | Under the hint. Placeholder: "Anything else? (optional) e.g. Warmer but simpler." |
| `write-to-open-messages-button` | Directly under the chat line, always. Opens Apple's Messages with box B's text filled in; the person adds the number and sends it themselves. |
| `write-to-close-alert` | "Close without copying? Your text won't be kept." — Keep writing / Close. Shown when there is any text (box A before an answer included) and nothing was copied or opened in Messages. |

**Removed** (vs 10-21 and the brief): the Reply / Reach out choice (one entrance — owner: "i don't want to separate reply/reach out"), tone and format controls ("technically user can ask Andy to draft this in email format"), the notes picker, refine chips, `draft-regenerate-button`, `draft-replace-alert`, `draft-intent-line` and `draft-sources-line` (no "Kept your Thursday" — Andy keeps key details without announcing it).

### Behaviour

1. **Box A → arrow.** On once box A has text. What's in it may be a message, an instruction, or both; Andy works out which. While Andy writes, box A keeps its size, its text dimmed and locked.
2. **Box B is the draft.** Whatever is in box B when the arrow is tapped is what goes to Andy — edited or not.
3. **The arrow is on when there is something new:** box B differs from Andy's last answer, or the chat line has text, or both. Otherwise it is greyed and the hint says what to do. The server refuses an identical resend too.
4. **Swiping the sheet down only tucks it away** — it does not delete. Opening Write to for the same person again brings back box B, every version and the chat line. Kept per person, **in memory only**, until the Close button (after the alert), sign-out, or iOS ending Andy (then it is simply gone — consistent with nothing kept). Coming back from Messages finds the sheet as it was.
5. **Versions.** Every Andy answer, and the person's edited text when they ask again, is a version. ‹ › steps through them; editing an older one and asking again adds a new version at the end — nothing is cut off. **Versions live only until Close. Close deletes all of them** — nothing kept on the phone, nothing stored on the server, nothing cached.
6. **Copy** takes box B as it is (and records the same clipboard fingerprint as today, so sign-out clears it — `forgetOnThisPhone`). **Open Messages** opens Messages with box B's text, and counts as copied; hidden where the device can't send texts. Andy never sends anything.
7. **Stepping back:** the arrow and the Edited tag compare box B with **the version shown**, not the newest — an untouched older version is not "something new".
8. **Reply with a screenshot:** pick one screenshot; Andy reads their message into `write-to-quote` (one extra ask, not counted against the 10); the picture is never kept, only the words, as with Photo notes. Covered by the AI permission sheet.
9. **Limits** (counted on the phone — the server keeps nothing to count with; it still refuses an identical resend it is handed): 10 asks after the first per sheet (unchanged from 10-21), then the arrow stops: "That's the most Andy can do in one go. Copy it, or close and start again." Chat line ≤ 500 characters (`MAX_INSTRUCTION_CHARS`); box text ≤ 4,000 characters.

### What is sent to Andy (prompt)

| Ask | Sent |
|---|---|
| First (box A) | Box A's text; the person's name; today's date; **the saved details (never the wording) of the newest 3 notes in which they are the person written about — all of them if there are 3 or fewer**; never notes where they only came up; picked automatically with today's recency rules (past plans are past; a newest note older than 90 days isn't news). |
| Screenshot | The picture, once, to read their message into `write-to-quote`. The quote then travels with box A's text. |
| Every later ask | The first request (box A, with the quote if any); **every chat line sent so far** in this sheet; Andy's last answer **only when box B differs from it** (so Andy can see what the person changed); box B as it is; the new chat line if any; the same notes. |

Andy's rules for a later ask: box B is the base. The person's changes are a direction — carry them through the rest, never undo or reword them. **Never change a day, date, time, number, name, place or link the person wrote.** With only a chat line, change nothing it didn't ask for. Return only the message; if the person asks for an email, put a "Subject: …" line first, in the same text. **Tone and format:** with no instruction about them, Andy uses the person's saved default; each answer also labels its own tone and format, and the label of the text the person copies or opens in Messages becomes their new default (owner: "whatever the final tone for the message before"). A mention-only person gets no notes attached. "Today" is the phone's local date, sent as an argument.

**Key details are checked in code**, not only asked for: after Andy answers, the server checks that every day, date, time, number and link in the text it was sent is still in the answer. If one is missing, it asks Andy once more to keep it exactly; if it is still missing, the answer is returned as is (the person sees it and can fix it). Names are protected by the prompt rule only.

Unchanged from the brief: everything goes through the Convex action to Anthropic (Haiku 4.5), never from the phone; not stored, not logged; `requireAiAllowed` gates it; user text goes through `promptBoundary.ts`.

### Owner decisions, 2026-10-30 (the questions above, answered)

- Option: **F**. Brief Q1 (one surface): **yes**, one entrance. Q2 (retire Write another and the replace alert): **yes**. Q3 (chips): **none**. Q4 (notes on own draft): **yes, newest 4, automatic**, no switch. Q5 (scope change): **approved** — the follow-up Must Have is rewritten in `PROJECT_SCOPE.md` / `.ko.md`, including Open Messages.
- Prompt: D1 **(c)** every chat line + only the latest text; D2 **(a)** newest notes automatically; D3 **(b)** prompt rule + code check; D4 **keep 10**; D5 **Subject line when an email is asked for**.
- Close without copying: **ask first**, including box A before any answer; **swipe-down keeps everything**, per person, until Close / sign-out / iOS ending Andy. Box text cap: **4,000 characters**.
- Notes: **newest 3, or all if ≤ 3**, saved details only, never mention-only. Write to is offered to everyone; a mention-only person gets no notes. Tone/format default: **learned from the last finished message** (saved field kept and used). Off switch: `writeTo` off = **no Write to button**; old sheets and `followUpTones` are removed in the build. No-SMS devices: Open Messages hidden. Stepping back compares with the shown version. Limits counted on the phone. A kill by iOS loses the sheet. Missing strings (offline, failed ask, after Not now, greyed arrow, stepper VoiceOver): drafted by product-strategist for the owner in the scope PR.
- **Reply with a screenshot: yes (a)** — photo icon bottom-left of box A; placeholder tells people they can.
- **Overrides of the brief, by the owner:** rule 4 — an arrow icon asks Andy (labelled "Ask Andy" for VoiceOver; it sends to Andy, never to the person) and Open Messages opens Apple's Messages; rule 8 — no intent or sources lines.

## Strings (owner-approved, 2026-10-30)

Written by `product-strategist` for the build. Nothing above is reopened; these fill the gaps the final design left. Patterns follow `docs/copy-deck.md` ("…needs a connection.", "Andy couldn't … just now. Try again.", "That photo didn't come through. Try again."). The calls marked for the owner were all answered "as recommended" on 2026-10-30 and are noted inline.

**One new part:** `write-to-status-line` (new, to be added to `component-names.md` in the build PR). One short line for the states below. Before Andy's first answer it sits under `write-to-ask-box`; after, it takes the place of `write-to-hint` while it shows. Only one shows at a time. The designer owns where and how it looks.

**Rules behind the strings:**

- **Offline: the arrow does not wait.** It dims, and nothing is queued. A pass sent later without a fresh tap would arrive when the person has moved on, and the sheet is kept in memory only. When the connection comes back, the line goes away and the arrow turns on again; the person taps it. Typing, the stepper, Copy and Open Messages all keep working offline.
- **A failed ask changes nothing.** Box A or box B and the chat line stay exactly as they were. No version is added, and it does not count toward the 10 (owner: yes). All server failures (timeout, Claude unreachable, busy) show the one line below rather than the server's own message.
- **After Not now on `ai-permission-sheet`:** nothing was sent, all text stays, and the arrow stays on. Tapping it again opens the permission sheet again, which matches its footnote ("unless you reach for something it reads").
- **Over a length cap, nothing is cut.** No `maxLength`: a paste that is cut short silently loses text, which breaks "nothing typed is lost". The arrow dims and the line says by how much to shorten. Copy and Open Messages still work on long text, because it's the person's own message.
- **While Andy writes, box B and the chat line are locked and dimmed like box A** (owner: yes). Then no "your text changed while Andy was writing" string is needed.

| Part | When it shows | Proposed text | VoiceOver label if different |
|---|---|---|---|
| `write-to-close-button` | Always | Close | Close |
| Title | Always | Write to {name} | Write to {name} (header) |
| `write-to-ask-box` | Before the first answer | (placeholder as in the final design) | Label: What to write to {name}. The placeholder is read as the hint. |
| `write-to-draft-box` | After an answer | (Andy's text) | Label: Message to {name}. If `write-to-edited-tag` shows: Message to {name}, edited |
| `write-to-edited-tag` | Box B differs from the version shown | Edited | Read as part of the box B label, not as its own element |
| `write-to-chat-line` | After an answer | (placeholder as in the final design) | Label: Anything else for Andy? Optional |
| `write-to-arrow`, on | Something new to ask | (icon) | Ask Andy |
| `write-to-arrow`, writing | Andy is writing | (spinner) | Label: Andy is writing. Announced when it starts. |
| Announcement | Andy's answer arrives | (none visible) | Andy's answer is ready. Version {n} of {n}. |
| `write-to-status-line`, writing | Andy is writing | Andy is writing… (shown, beside the spinner — owner) | (the arrow carries it) |
| `write-to-arrow`, dimmed (box A empty) | Box A has no text | (dimmed icon) | Ask Andy, dimmed. Hint: Write something first. |
| `write-to-arrow`, dimmed (nothing new) | Box B matches the version shown and the chat line is empty | (dimmed icon). Nothing new needed on screen: `write-to-hint` already says it. | Ask Andy, dimmed. Hint: Edit the text above, or tell Andy what to change. |
| `write-to-status-line`, identical resend refused by the server | Should not happen (the arrow is dimmed), but if it does | Edit the text above, or tell Andy what to change. | — |
| `write-to-status-line`, offline | No connection, before or after the first answer | You're offline. Asking Andy needs a connection — your text stays here. | — |
| `write-to-arrow`, dimmed (offline) | Offline | (dimmed icon) | Ask Andy, dimmed. Hint: Asking Andy needs a connection. |
| `write-to-status-line`, failed ask | The call failed or timed out, including a connection lost mid-ask | Andy couldn't write that just now. Your text is still here. Try again. | — |
| `write-to-status-line`, after Not now | Person chose Not now on `ai-permission-sheet` | Nothing was sent. Tap the arrow when you want Andy to write it. | Nothing was sent. Tap Ask Andy when you want Andy to write it. |
| `write-to-status-line`, after Not now on a screenshot | Not now after picking a screenshot | Nothing was sent, and the picture wasn't kept. (owner: the build guarantees the picture is not kept, and a test proves it) | — |
| `write-to-status-line`, 10-ask cap | The 10th ask after the first has been answered | That's the most Andy can do in one go. Copy it, or close and start again. (Kept as the owner wrote it. It fits the Voice rules: plain, no guilt, and both ways forward named. "Copy" and "close" are the names of the controls.) | — |
| `write-to-arrow`, dimmed (cap) | After the cap | (dimmed icon) | Ask Andy, dimmed. Hint: That's the most Andy can do in one go. |
| `write-to-status-line`, box too long | Box A or box B is over 4,000 characters | That's too long for Andy to read at once. Shorten it by {n} characters to ask. | — |
| `write-to-status-line`, chat line too long | Chat line is over 500 characters | Shorten this by {n} characters. | — |
| `write-to-arrow`, dimmed (too long) | Either cap is passed | (dimmed icon) | Ask Andy, dimmed. Hint: Shorten the text to ask Andy. |
| `write-to-screenshot-button` | Box A, before the first answer | (photo icon) | Label: Add a screenshot. Hint: Andy reads their message from it. The picture isn't kept. (owner: kept — the build guarantees it) |
| `write-to-screenshot-button`, offline | Offline | (dimmed icon) | Add a screenshot, dimmed. Hint: Reading a screenshot needs a connection. |
| `write-to-quote`, reading | While reading | Reading {name}'s message… | (same) |
| `write-to-quote`, read | After reading | {name} wrote | Label: {name} wrote: {text}. Hint: Double-tap to fix a word. |
| `write-to-quote` ✕ | After reading | (✕) | Remove {name}'s message |
| `write-to-status-line`, screenshot didn't load or upload | Picking or sending the picture failed | That screenshot didn't come through. Try again. | — |
| `write-to-status-line`, no message found | Andy read the picture and found no message | Andy couldn't find a message in that screenshot. Try another, or type what they said. | — |
| `write-to-status-line`, screenshot too large | The server refuses the size | That screenshot is too large for Andy to read. Try another. | — |
| `write-to-version-stepper` ‹ | More than one version | ‹ | Previous version |
| `write-to-version-stepper` › | More than one version | › | Next version |
| `write-to-version-stepper` readout | More than one version | 2 of 3 | Version 2 of 3 (announced after each step) |
| `write-to-copy-button` | Box B has text | (copy icon) | Copy the message |
| `write-to-copy-button`, done | For a moment after the tap | Copied | Announced: Copied |
| `write-to-copy-button`, dimmed | Box B is empty | (dimmed icon) | Copy the message, dimmed. Hint: The box is empty. |
| `write-to-status-line`, clipboard failed | Copy could not write to the clipboard | Andy couldn't reach the clipboard. Your text is still here — select it to copy it by hand. | — |
| `write-to-open-messages-button` | After an answer, on devices that can send texts | Open Messages | Label: Open Messages. Hint: Opens Messages with this text. You choose who it goes to and send it. |
| `write-to-open-messages-button`, dimmed | Box B is empty | Open Messages (dimmed) | Hint: The box is empty. |
| `write-to-status-line`, Messages didn't open | The open call failed | Messages didn't open. Copy the text instead. | — |
| `write-to-close-alert` | Close tapped with any text, nothing copied or opened in Messages | Title: Close without copying? Message: Your text won't be kept. Buttons: Keep writing / Close | (same) |

Checked against Voice: no "send" on any control that Andy acts on (the arrow is "Ask Andy"; the only "send" is in the Open Messages hint, and the person does it); no "data", "saved", "stored" or "collect"; sentence case; one name per action: Close is the button and the alert's button, and "Copy" is the label, the cap line and "Copied".
