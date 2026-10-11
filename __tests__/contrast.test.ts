import { colors, textOpacity } from "../src/constants/theme";

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

/** `ink` drawn at this opacity over `paper`, as the eye receives it. */
function dimmed(opacity: number): string {
  const channel = (i: number) => {
    const ink = parseInt(colors.ink.slice(i, i + 2), 16);
    const paper = parseInt(colors.paper.slice(i, i + 2), 16);
    return Math.round(ink * opacity + paper * (1 - opacity))
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

test.each([
  ["ink text on paper", colors.ink, colors.paper],
  ["paper text on a moss button", colors.paper, colors.moss],
  ["moss text on paper", colors.moss, colors.paper],
  ["alert text on paper (errors, Delete links)", colors.alert, colors.paper],
  ["paper text on an alert button (Delete, Stop)", colors.paper, colors.alert],
  ["secondary (dimmed) ink text on paper", dimmed(textOpacity.secondary), colors.paper],
  ["quiet (most dimmed) ink text on paper", dimmed(textOpacity.quiet), colors.paper],
  ["placeholder text on paper", colors.placeholder, colors.paper],
])("%s meets 4.5:1", (_name, foreground, background) => {
  expect(contrast(foreground, background)).toBeGreaterThanOrEqual(TEXT);
});

/** The edges of controls and fields: WCAG 1.4.11, 3:1. */
test("a field's edge on paper meets 3:1", () => {
  expect(contrast(colors.edge, colors.paper)).toBeGreaterThanOrEqual(3);
});

/**
 * Text dimmed below `textOpacity.quiet` fails AA on paper (0.6 is 3.8:1). This
 * reads every style in `src/` so a new one cannot slip back under it. Only a
 * disabled or busy control may go lower — WCAG exempts those.
 */
test("no style in src/ dims below textOpacity.quiet except a disabled control", () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  /* eslint-enable @typescript-eslint/no-require-imports */
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) files.push(full);
    }
  };
  walk(path.join(__dirname, "..", "src"));

  const offenders: string[] = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      const dim = /opacity: 0\.(\d+)/.exec(line);
      if (dim === null || Number(`0.${dim[1]}`) >= textOpacity.quiet) return;
      // The style this line belongs to.
      let j = i;
      while (j > 0 && !/^\s+\w+: \{/.test(lines[j]!)) j--;
      if (/disabled|busy/i.test(lines[j] ?? "")) return;
      offenders.push(`${path.relative(process.cwd(), file)}:${i + 1}`);
    });
  }
  expect(offenders).toEqual([]);
});

test("measures the way WCAG does", () => {
  // Black on white is the scale's ceiling.
  expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
});
