# STYLE.md — Visual Direction

Lightweight on purpose (~10 min worth of decisions, not a full brand system). One deliberate risk, everything else quiet and disciplined.

## Grounding

The subject is _personal memory-keeping_ — closer to marginalia in a well-loved address book than a corporate CRM. Avoid the current AI-default looks: (1) cream background + high-contrast serif + terracotta accent, (2) near-black + neon accent, (3) broadsheet hairline-rule layout. None of these fit "someone privately keeping notes about people they care about."

## Color Tokens

| Token   | Hex       | Use                                                                      |
| ------- | --------- | ------------------------------------------------------------------------ |
| `ink`   | `#2A2622` | primary text                                                             |
| `paper` | `#E8E6DE` | background (warm stone, not cream)                                       |
| `moss`  | `#5C6B4F` | primary accent — buttons, active states                                  |
| `brass` | `#B8935A` | **The signature.** Inside the signed-in app: the Briefing card only. Before sign-in: the thread (icon, launch screen, name mark). Nowhere else |
| `line`  | `#B8B3A8` | dividers, borders                                                        |
| `alert` | `#A8503E` | errors only — muted, not a bright red                                    |

`src/constants/theme.ts` is the only place these hex values appear; screens
import `colors`. `alert` has exactly one non-error use — destructive controls:
deleting a note or a person on their edit screens, and deleting the whole
account in Settings. Each has earned the same weight as an error.

**Light only.** There is no dark palette, and `app.json` pins `userInterfaceStyle: "light"` so the OS setting can't half-apply one. A dark variant isn't a colour swap here — `brass` is the signature and it would need re-deciding against a dark ground, which is a real design pass this V1 timeline doesn't have. Not in PROJECT_SCOPE's Must/Should either. Reverting is one line in `app.json` plus six dark values in the table above.

## Typography

Built on day 3. The faces live in `assets/fonts/` with their licences beside
them, are registered in `src/app/_layout.tsx`, and are named by role in
`src/constants/theme.ts` — use `fonts.display` / `fonts.utility`, never a
family string in a screen.

- **Display (profile names, section headers only)**: **Lora**, a warm,
  low-contrast serif. Regular for list rows, Medium for a profile's own name.
  This is the one typographic flourish — don't extend it to body text or it
  stops being a signature.
- **Body/UI**: platform default (SF Pro / Roboto), which means **setting no
  `fontFamily` at all**. Deliberate choice, not a placeholder — a memory app
  should feel like it belongs on the phone, not like an imported web font.
  `fonts` has no `body` token on purpose: a token holding `"System"` would
  invite somebody to apply it, which is the same as not having decided.
- **Display italic (one line only)**: **Lora Italic**, for the tagline under
  the name mark on the sign-in screen and nowhere else (`fonts.displayItalic`).
- **Utility (dates, tags, note counts)**: **IBM Plex Mono** — a ledger reads as
  a record because its numbers line up, which a proportional face cannot do.

The splash is held until both load (`useFonts`), because swapping a face in
after first paint reflows every name and date on every cold start. A font that
fails to load falls through to the platform face rather than holding the splash
forever — an entire screen lost to a typeface is the worse failure.

## Signature Element — spend the one risk here

The **Briefing card** (pre-meeting digest / post-meeting nudge) is the single place that looks different from everything else — and it survived the day-4 scope cut precisely because it is the app's signature, not despite it: a `brass` left-edge accent stripe and a `brass` timestamp. Every other screen — profile list, search results, settings — stays plain and disciplined. Don't spread this treatment elsewhere or it stops being a signature.

**Dropped: the torn edge and the quiet icon.** The first version of this
section also asked for a soft dashed top border (a torn note edge) and a quiet
icon. Neither is in the app, on purpose.

- *The torn edge* never rendered. React Native does not draw a dashed border on
  one side only, and warns `Unsupported dashed / dotted border style`; found in
  live QA on 2026-09-27 (`QA.md` 18.3). Drawing it by hand was weighed against
  dropping it with mockups side by side, and dropped (2026-09-29): the stripe
  already sets the card apart from the plain rows below it.
- *The quiet icon* was never built. This project has no icon set, and adding one
  is choosing a dependency and a whole visual vocabulary, a larger decision than
  the slice that needed it. Revisit when an icon set is chosen for some other
  reason, not by inventing one here.

The stripe and the `brass` timestamp carry the signal on their own.

## App Icon — the Rising thread

Decided 2026-09-30. One brass thread climbs from bottom left to top right and
makes a single loop, lifted above the line, on the paper ground: the string you
tie so you don't forget. Source: `assets/expo.icon` (Icon Composer; paper/brass
in light, ink/lighter brass in dark, plain thread in tinted). The splash is the
loop alone, fading out at both ends.

What was tried and dropped, so it isn't re-proposed: a lowercase **a** (reads as
Amazon's logo), sound arcs **))** (Wi-Fi, a live mic: "sent", not "kept"), a plain
bookmark ribbon (Day One), dots on the thread or a loop hanging below it (odd,
sagging), and **two** loops in a row (every spacing reads as cursive *ll*/*el*/*ee*).
No letters in the icon: the name already sits under it, and text is unreadable
at 29 pt.

## Name Mark — the thread writes *andy*

Decided 2026-09-30, `src/components/name-mark.tsx`. The icon's thread, writing
the name: one hand-drawn path that enters from the left edge, writes *andy*
without lifting, makes the icon's loop above the line and rises off the right
edge. It sits where the screen edge can cut both ends (on sign-in it bleeds
past the padding), because a thread end on the page is what the icon avoids.
Not a font: a script typeface cannot enter and leave without a gap. Never
inside the icon, where it would be unreadable at 29 pt.

**Why brass is allowed here.** Brass is the signature, and the rule that keeps
it one is about the signed-in app, where the Briefing card has to be the only
thing that looks different. The icon, the launch screen and sign-in come before
any of that, and there brass is the thread: the same idea as the whisper, the
thing Andy keeps for you. Inside the app the rule is unchanged.

Kept plain on purpose. Yarn balls, spirals, wraps and knit textures were all
tried on 2026-09-30 and all read as odd; the thread says enough on its own.

## One Structural Idea

The per-profile **timeline** is genuinely sequential data (notes in time order), so a connected vertical thread between entries is justified — not decoration, actual information. Don't add numbered markers (01/02/03) anywhere else; nothing else in this app is a sequence.

## Copy Tone

Plain verbs, active voice, no filler. "Remember this," not "Submit." Empty states are invitations, not apologies: "No notes yet — tap record to remember your first person," not "No data available." Errors state what happened and what to do, in the interface's voice, never "Oops!"

## Voice — remembering, never collecting

Decided 2026-09-30. Andy holds notes about people who never signed up for it.
Read as "an app that collects information on people", it fails, with users and
at review. Read as "someone who remembers what you told them", the same
features are warm. The difference is where the information goes: what someone
told you, kept between the two of you, is care; the same words flowing anywhere
else are intrusion. So every screen, store line, README sentence and icon says
the first thing and never the second.

**The one line:** Andy is a private notebook that keeps the attention you already
gave people, so you remember what they told you.

**Words.** Never: *track, profile, data, database, intel, dossier, contacts,
leads, CRM, manage relationships, never forget a face, know everything about.*
Use: *remember, notes, the people you meet, what they told you, before you walk
in, ask about, only you.* "Profile" is the code's word for a person; it does not
belong on a screen.

**Andy's promises.** The same five lines everywhere they appear (the privacy
policy, the store listing, the README, onboarding). Only list what the code
already guarantees; a promise is added after the code keeps it, never before.

1. **Only you.** Your notes are never shared, sold or shown to anyone.
2. **Andy never reaches out.** It doesn't message anyone. Drafts stay with you.
3. **Quiet on the lock screen.** Reminders show a name, never what you wrote.
4. **No ads, no tracking.** Not now, not later.
5. **Gone when you say.** Delete a note, a person, or everything, in the app.

**The story the design tells.** The address-book marginalia in *Grounding*, plus
the friend at your shoulder who says the name just before you need it. Paper is
the notebook, ink is your own hand, brass is the whisper (the Briefing card, a
reminder), moss is a relationship growing. The icon is the first frame of that
story. When showing Andy anywhere, show the face of the person who was
remembered, never a screen full of what was written about someone.

## Guardrail for Claude Code

Before building any screen, check this file. If a color/font choice isn't listed here, don't invent one ad hoc — flag it and ask, or extend this file deliberately (and say why) rather than drifting screen by screen.
