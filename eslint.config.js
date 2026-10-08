// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

// A colour written out in a screen instead of taken from `colors`
// (src/constants/theme.ts). STYLE.md's guardrail, enforced: every colour is a
// design token, so the palette — and its WCAG contrast, checked in
// __tests__/contrast.test.ts — cannot drift one screen at a time.
const RAW_COLOUR =
  "/^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla)\\(.*\\)|white|black|red|green|blue|gray|grey|transparent)$/";
const RAW_COLOUR_MESSAGE =
  "Use a design token from `colors` (src/constants/theme.ts), not a raw colour. A colour the app needs and lacks is added there and in STYLE.md first, and must meet WCAG 2.2 AA.";

module.exports = defineConfig([
  expoConfig,
  {
    // convex/_generated is machine-generated and ships its own /* eslint-disable */
    // headers; example/ is the archived create-expo-app scaffold, not built code.
    ignores: ["dist/*", "convex/_generated/*", "example/*"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    // The one place colours are allowed to be written down.
    ignores: ["src/constants/theme.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: `Literal[value=${RAW_COLOUR}]`, message: RAW_COLOUR_MESSAGE },
        { selector: `TemplateElement[value.raw=${RAW_COLOUR}]`, message: RAW_COLOUR_MESSAGE },
      ],
      // iOS draws a native alert above the whole app, where the app lock
      // cannot cover it (device QA build 4 #51). Ask with `useConfirm`.
      "no-restricted-properties": [
        "error",
        {
          object: "Alert",
          property: "alert",
          message: "Use useConfirm() from src/components/confirm-dialog.tsx: a native alert sits above the app lock.",
        },
      ],
    },
  },
]);
