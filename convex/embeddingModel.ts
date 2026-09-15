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
 * **The facts are what is searched. The transcript is not.**
 *
 * It was both, until using it showed why that is wrong. Correct a note from
 * "puppy" to "kitten" and searching "puppy" still found it — because the
 * transcript still said puppy, and the transcript was in the vector. That is the
 * app contradicting the user's own correction, and no amount of ranking fixes
 * it: the old wording is simply still in there.
 *
 * Day 2 already named these as two different truths — `text` is what the
 * recogniser heard, `keyFacts` is what the user read back and endorsed. Searching
 * the endorsed one is the only version where editing a note means anything.
 *
 * The cost is real and worth stating rather than hiding: circumstance that was
 * said but never written down as a fact stops being findable. "오늘 지선 만났는데
 * 민호네 집들이서 봤어" has facts about her job and her cats; "민호네 집들이"
 * lives only in the transcript, and searching for the housewarming will now miss
 * it. That is the trade — search what you curated, not everything you said.
 *
 * **The fallback exists so nothing goes invisible.** A note can have no facts at
 * all: extraction sometimes finds none, and `updateNote` lets every fact be
 * blanked. With facts-only and no fallback such a note would be unsearchable for
 * ever, silently, which is a worse failure than an imprecise match. So when there
 * are no facts, the transcript is used — it is the only text the note has.
 *
 * **The subject's own name is deliberately not prepended.** `profiles` already
 * carries a `search_name` full-text index for looking a person up by name —
 * a better tool for that job than a vector. Prepending it would make every note
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
  const source = facts.length > 0 ? facts.join("\n") : note.text;
  return source.slice(0, MAX_EMBEDDING_CHARS);
}
