/**
 * The embedding model, in one place — the same reason `extractionPrompt.ts` is
 * separate from `extraction.ts`.
 *
 * Two things have to agree about the size of a vector and they live in
 * different worlds: the vector index in `schema.ts`, which is declared once at
 * deploy time and cannot be changed without rebuilding, and the request body
 * the embedding action sends, which is written months later. Convex's own
 * guidance is blunt about the consequence — "`dimensions` must exactly match
 * the length of the vectors you store and search with" — and a mismatch does
 * not fail at the type level. So neither side gets to name the number.
 *
 * Nothing here calls an API. It is imported by `schema.ts`, which must stay
 * free of Convex functions.
 */

/**
 * OpenAI's `text-embedding-3-large`, shortened to 1024 dimensions.
 *
 * Chosen on day 4 over staying at the schema's original 1536 for a reason that
 * outlives V1: V1 ships English-only, but Korean is the first language V1.1
 * adds back (`PROJECT_SCOPE.md`, Could Have), and this model is multilingual.
 * Picking an English-only embedder now would mean re-embedding every note the
 * day Korean returns — the one migration that cannot be made additive, because
 * a vector index's `dimensions` is fixed at deploy and every stored vector
 * would be the wrong shape at once.
 *
 * Anthropic has no embeddings API, so this is the one place the pipeline
 * leaves Claude.
 */
export const EMBEDDING_MODEL = "text-embedding-3-large";

/**
 * 1024, not the model's native 3072.
 *
 * `text-embedding-3-large` is trained so that a prefix of the vector is itself
 * a usable embedding (Matryoshka representation learning), which is why the API
 * takes a `dimensions` parameter at all rather than making callers truncate.
 * A third of the storage and a third of the vector-index footprint, for a
 * retrieval-quality loss that is small at this size.
 *
 * The number is only free to change while no note carries a vector. Once notes
 * are embedded, changing it means re-embedding all of them — see the header.
 */
export const EMBEDDING_DIMENSIONS = 1024;

/**
 * How much of a note is sent to be embedded.
 *
 * OpenAI's ceiling is 8,192 *tokens* per input, and this is a character budget,
 * so the conversion has to assume the worst ratio rather than the average one.
 * Korean runs close to one token per character; English is nearer one per four.
 * Budgeting at the Korean ratio makes this safe in both languages, and V1.1
 * brings Korean back (`PROJECT_SCOPE.md`, Could Have) so that is not a
 * hypothetical margin.
 *
 * `MAX_TRANSCRIPT_CHARS` is 12,000 and key facts sit on top of it, so a note
 * *can* exceed this — the longest real note today is around 200 characters, so
 * in practice this never fires. It exists so that the day it does, the note is
 * embedded short rather than the request being rejected and the note dropping
 * out of search entirely.
 */
export const MAX_EMBEDDING_CHARS = 8_000;

/**
 * What a note actually becomes, as one string, for embedding.
 *
 * This lives here rather than beside the fetch call for the same reason the
 * dimension does: whatever re-embeds a note later has to compose the text the
 * identical way, or the new vector lands in a different part of the space than
 * every vector it will be compared against.
 *
 * **The facts and the words are both searched** (owner, 2026-10-19, device QA
 * B5-6). Facts first, so a note cut to the budget keeps what was checked.
 *
 * It used to be the facts alone, for a reason that held then: correct a fact
 * from "puppy" to "kitten" and the transcript, which could not be edited,
 * still said puppy — so searching "puppy" found the note against the user's
 * own correction. Since #160 the words themselves can be corrected, which
 * removed that reason, and the cost of facts-only had become the bigger one:
 * Brian's note said "friday we're gonna go get drinks with the team", none of
 * it became a fact, and "who did I plan to grab drinks with" found nothing.
 * Circumstance that was said but never written down as a fact is exactly what
 * people search for later.
 *
 * What remains of the old problem — a fact corrected while the words were
 * left alone — is handled where it can be: the answer is told that "what to
 * remember" is the correction and wins (`answerPrompt.ts`), and fixing the
 * words too fixes the search.
 *
 * **The subject's own name is deliberately not prepended.** Looking a person up
 * by name is `people.search`'s job (`convex/peopleSearch.ts`), a better tool for
 * it than a vector. Prepending it would make every note
 * about Priya retrievable by the token "Priya" and crowd out the nameless
 * queries this index exists for ("the person who runs a climbing gym").
 */
/**
 * The facts a note actually has — the single definition of "has facts".
 *
 * Two places branch on it: what gets embedded, and what gets put in front of
 * Claude. They have to agree, and a comment claiming they agree is not the same
 * as them agreeing. When this was two separate filters they had already drifted:
 * the embedder dropped whitespace-only facts and the prompt builder did not, so
 * a note with `keyFacts: ["   "]` was findable by its transcript and then handed
 * to the model as a note containing nothing.
 */
export function rememberedFacts(keyFacts?: string[]): string[] {
  return (keyFacts ?? []).filter((fact) => fact.trim() !== "");
}

export function embeddingTextFor(note: {
  text: string;
  keyFacts?: string[];
}): string {
  const facts = rememberedFacts(note.keyFacts);
  const words = note.text.trim();
  return [facts.join("\n"), words]
    .filter((part) => part !== "")
    .join("\n\n")
    .slice(0, MAX_EMBEDDING_CHARS);
}
