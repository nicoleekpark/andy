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
