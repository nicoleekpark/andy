import { readFileSync } from "node:fs";

/**
 * The copy deck (`npm run copy-deck`) lists every sentence a person reads. A
 * server sentence kept in a constant and thrown later — `new ConvexError(NAME)`
 * — is one of them; a prompt, a schema description or a log label is not.
 * Read from the committed deck, so a generator change that drops either kind
 * shows up the moment the deck is regenerated.
 */
const deck = readFileSync("docs/copy-deck.md", "utf8");

test("should list server sentences thrown from a constant", () => {
  expect(deck).toContain("| That's too long for Andy to read at once. | server error |");
  expect(deck).toContain("| Edit the text above, or tell Andy what to change. | server error |");
});

test("should not list what only a model or a log reads", () => {
  expect(deck).not.toContain("You help the sender write a message");
  expect(deck).not.toContain("| Write to screenshot | server error |");
});
