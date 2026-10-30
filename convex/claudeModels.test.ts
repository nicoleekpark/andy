/// <reference types="vite/client" />
import { readdirSync, readFileSync } from "node:fs";

import { expect, test } from "vitest";
import { ANSWER_MODEL } from "./answerPrompt";
import { CLAUDE_MODELS } from "./claudeModels";
import { EMAIL_MODEL } from "./emailPrompt";
import { EXTRACTION_MODEL } from "./extractionPrompt";

/**
 * A model id is a token: written once in `claudeModels.ts`, named everywhere
 * else. This reads the sources as text for the same reason `schema.test.ts`
 * does — the thing being guarded is that the string is not written twice.
 */
const MODEL_ID = /claude-(haiku|sonnet|opus|fable|\d)/;

test("should spell a Claude model id only in claudeModels.ts", () => {
  const dir = new URL("./", import.meta.url);
  const offenders = readdirSync(dir)
    .filter((file) => file.endsWith(".ts"))
    .filter((file) => file !== "claudeModels.ts" && file !== "claudeModels.test.ts")
    .filter((file) => MODEL_ID.test(readFileSync(new URL(file, dir), "utf8")));

  expect(offenders).toEqual([]);
});

test("should pin each feature's tier and the id behind it, so changing either is a deliberate act", () => {
  // Each feature picks its own tier; today all three are Haiku. Moving one is
  // a product decision (cost, and what the answer reads like), so it should
  // turn this red rather than slip through.
  expect(EXTRACTION_MODEL).toBe(CLAUDE_MODELS.haiku);
  expect(ANSWER_MODEL).toBe(CLAUDE_MODELS.haiku);
  expect(EMAIL_MODEL).toBe(CLAUDE_MODELS.haiku);
  expect(CLAUDE_MODELS.haiku).toBe("claude-haiku-4-5");
});
