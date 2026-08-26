// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // convex/_generated is machine-generated and ships its own /* eslint-disable */
    // headers; example/ is the archived create-expo-app scaffold, not built code.
    ignores: ["dist/*", "convex/_generated/*", "example/*"],
  }
]);
