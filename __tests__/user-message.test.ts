import { ConvexError } from "convex/values";
import { userMessage } from "@/lib/user-message";

/**
 * src/lib/user-message.ts — the server's sentence, or a plain fallback.
 *
 * Measured on 2026-10-02: a ConvexError's `message` is transport text. Prod
 * sends "[Request ID: …] Server Error" with the sentence only in `data`, so a
 * screen that showed `message` showed that line (REFACTOR.md → K).
 */
const FALLBACK = "Andy couldn't save that change. Try again.";

describe("userMessage", () => {
  test("should show the sentence the server wrote for a person", () => {
    const error = new ConvexError("That's longer than a fact. Try splitting it up.");
    expect(userMessage(error, FALLBACK)).toBe(
      "That's longer than a fact. Try splitting it up.",
    );
  });

  test("should never show an error's own message, which is transport text", () => {
    expect(userMessage(new Error("[Request ID: 1a2b] Server Error"), FALLBACK)).toBe(FALLBACK);
    expect(userMessage(new TypeError("fetch failed"), FALLBACK)).toBe(FALLBACK);
  });

  test("should fall back when the server's words are empty or not a sentence", () => {
    expect(userMessage(new ConvexError("   "), FALLBACK)).toBe(FALLBACK);
    expect(userMessage(new ConvexError({ code: 409 }), FALLBACK)).toBe(FALLBACK);
    expect(userMessage("a thrown string", FALLBACK)).toBe(FALLBACK);
  });
});
