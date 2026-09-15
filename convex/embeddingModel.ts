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
