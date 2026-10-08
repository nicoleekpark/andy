/**
 * The palette from STYLE.md. These six are the whole set.
 *
 * STYLE.md's guardrail: if a colour a screen needs isn't here, don't invent one
 * inline — extend STYLE.md deliberately first, then add it here.
 */
export const colors = {
  /** primary text */
  ink: "#2A2622",
  /** background — warm stone, not cream */
  paper: "#E8E6DE",
  /** primary accent — buttons, active states */
  moss: "#5C6B4F",
  /**
   * The signature colour. Inside the signed-in app it is the Briefing card's
   * alone; using it on any other screen there is what would stop it being a
   * signature. Before sign-in it is also the thread: the icon, the launch
   * screen and the name mark on sign-in. See STYLE.md.
   */
  brass: "#B8935A",
  /** dividers, borders */
  line: "#B8B3A8",
  /**
   * errors only — muted, deliberately not a bright red. #9F4C3B rather than the
   * first #A8503E: that one reached 4.33:1 against `paper`, under WCAG AA's
   * 4.5:1, both as text on paper and as paper text on a red button (2026-10-08).
   */
  alert: "#9F4C3B",
  /**
   * The dim behind a dialog: `ink` at 42%, not a new hue. The screen behind
   * stays readable as where you are (`confirm-dialog`, 2026-10-08).
   */
  scrim: "rgba(42, 38, 34, 0.42)",
} as const;

export type ColorToken = keyof typeof colors;

/**
 * The three type roles from STYLE.md, as the names `useFonts` registers in
 * `src/app/_layout.tsx`.
 *
 * `body` is deliberately absent: STYLE.md picks the platform typeface for it —
 * "a memory app should feel like it belongs on the phone, not like an imported
 * web font" — and the way to get that is to set no `fontFamily` at all. A token
 * holding "System" would invite someone to apply it, which is the same as not
 * having made the decision.
 */
export const fonts = {
  /**
   * Profile names and section headers, nowhere else. STYLE.md calls this the
   * one typographic flourish, and a flourish applied to body text stops being
   * one.
   */
  display: "Lora",
  displayMedium: "Lora-Medium",
  /**
   * The one line under the name mark on the sign-in screen, and nowhere else.
   * The italic keeps the pen that drew it, which is the point there.
   */
  displayItalic: "Lora-Italic",
  /**
   * Dates, tags and metrics. A ledger reads as a record because its numbers
   * line up, which a proportional face cannot do.
   */
  utility: "IBMPlexMono",
} as const;

/**
 * The spacing scale, in points. Taken from what the screens already use most
 * (8, 24, 12, 16, 4, 32, 48 — counted on 2026-10-01), so adopting it changes
 * nothing that already looks right. New layout reaches for these; existing
 * screens move over as they are touched, not in one sweep.
 */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/**
 * Text sizes, in points. Taken from what the screens already use (12 to 18,
 * counted on 2026-10-08: 14 ×30, 15 ×27, 16 ×19, 13 ×14, 12 ×14, 18 ×7,
 * 17 ×7). Existing screens move over as they are touched.
 */
export const textSize = {
  xs: 12,
  sm: 13,
  md: 14,
  base: 15,
  lg: 16,
  xl: 17,
  xxl: 18,
} as const;

/** Corner radii. `pill` is the app's button shape; `card` a floating card. */
export const radius = {
  card: 16,
  pill: 999,
} as const;

/**
 * How far `ink` text may be dimmed. WCAG 2.2 AA needs 4.5:1 on `paper`: 0.8
 * gives 6.8:1 and 0.7 gives 5.0:1, the floor. Below 0.7 text fails — 0.6 is
 * 3.8:1 — so lighter is for disabled controls only, never for text someone
 * needs to read. Checked in `__tests__/contrast.test.ts`.
 */
export const textOpacity = {
  secondary: 0.8,
  quiet: 0.7,
} as const;
