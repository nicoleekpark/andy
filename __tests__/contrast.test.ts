import { colors } from "../src/constants/theme";

/**
 * WCAG 2.2 AA for the colour pairs Andy draws text with (STYLE.md →
 * Accessibility). Contrast is a property of two tokens, so a token change that
 * pushes a pair under the line fails here rather than on somebody's eyes.
 * `alert` sat at 4.33:1 until 2026-10-08.
 */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear(r!) + 0.7152 * linear(g!) + 0.0722 * linear(b!);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

const TEXT = 4.5;

test.each([
  ["ink text on paper", colors.ink, colors.paper],
  ["paper text on a moss button", colors.paper, colors.moss],
  ["moss text on paper", colors.moss, colors.paper],
  ["alert text on paper (errors, Delete links)", colors.alert, colors.paper],
  ["paper text on an alert button (Delete, Stop)", colors.paper, colors.alert],
])("%s meets 4.5:1", (_name, foreground, background) => {
  expect(contrast(foreground, background)).toBeGreaterThanOrEqual(TEXT);
});

test("measures the way WCAG does", () => {
  // Black on white is the scale's ceiling.
  expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
});
