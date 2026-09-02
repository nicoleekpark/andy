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
   * The signature colour, reserved for the Briefing card alone. Using it
   * anywhere else is what would stop it being a signature.
   */
  brass: "#B8935A",
  /** dividers, borders */
  line: "#B8B3A8",
  /** errors only — muted, deliberately not a bright red */
  alert: "#A8503E",
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
   * Dates, tags and metrics. A ledger reads as a record because its numbers
   * line up, which a proportional face cannot do.
   */
  utility: "IBMPlexMono",
} as const;
