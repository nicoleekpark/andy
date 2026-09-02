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
| `brass` | `#B8935A` | **"Briefing" accent only** — the one signature color, not used elsewhere |
| `line`  | `#B8B3A8` | dividers, borders                                                        |
| `alert` | `#A8503E` | errors only — muted, not a bright red                                    |

`src/constants/theme.ts` is the only place these hex values appear; screens
import `colors`. `alert` has exactly one non-error use — the destructive
controls on the note and profile edit screens, which have earned the same
weight as an error.

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
- **Utility (dates, tags, pet metrics)**: **IBM Plex Mono** — a ledger reads as
  a record because its numbers line up, which a proportional face cannot do.

The splash is held until both load (`useFonts`), because swapping a face in
after first paint reflows every name and date on every cold start. A font that
fails to load falls through to the platform face rather than holding the splash
forever — an entire screen lost to a typeface is the worse failure.

## Signature Element — spend the one risk here

The **Briefing card** (pre-meeting digest / post-meeting nudge) is the single place that looks different from everything else: a `brass` left-edge accent stripe, a soft dashed top border (evokes a torn note edge), quiet icon. Every other screen — profile list, search results, settings — stays plain and disciplined. Don't spread this treatment elsewhere or it stops being a signature.

## One Structural Idea

The per-profile **timeline** is genuinely sequential data (notes in time order), so a connected vertical thread between entries is justified — not decoration, actual information. Don't add numbered markers (01/02/03) anywhere else; nothing else in this app is a sequence.

## Copy Tone

Plain verbs, active voice, no filler. "Save note," not "Submit." Empty states are invitations, not apologies: "No notes yet — tap record to remember your first person," not "No data available." Errors state what happened and what to do, in the interface's voice, never "Oops!"

## Guardrail for Claude Code

Before building any screen, check this file. If a color/font choice isn't listed here, don't invent one ad hoc — flag it and ask, or extend this file deliberately (and say why) rather than drifting screen by screen.
