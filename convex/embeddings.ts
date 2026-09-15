import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  embeddingTextFor,
} from "./embeddingModel";

/**
 * Turning a note into a vector, and keeping that vector honest.
 *
 * Every function here is **internal**. Nothing on this file is reachable from a
 * client: embedding is a consequence of saving or editing a note, never a thing
 * a user asks for, and an exposed action that spends money per call with a
 * caller-supplied string would be a bill waiting to be run up. The capture path
 * schedules these; the client never names one.
 *
 * Not `"use node"`. `fetch()` exists in Convex's default runtime
 * (`_generated/ai/guidelines.md`), and OpenAI's embeddings endpoint is a plain
 * POST, so there is no Node built-in in reach and no reason to pay for the
 * heavier runtime. `convex/extraction.ts` is `"use node"` only because the
 * Anthropic SDK needs it.
 */

// The one thing we read from the environment. Declared at module scope rather
// than pulled in via `@types/node`, which would hand `fs`/`Buffer`/`process` to
// every V8-runtime file in this directory and fail only at runtime.
//
// `auth.config.ts` writes the same line, but it is not the precedent it looks
// like: that file is deploy-time configuration evaluated outside any request,
// while this is a real V8 action. What carries over is the narrow declaration,
// not the runtime — `process.env` is populated in both Convex runtimes for
// variables set with `npx convex env set`, which is what makes this work here.
declare const process: { env: Record<string, string | undefined> };

const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";

/**
 * How many notes go in one request.
 *
 * OpenAI accepts up to 2,048 inputs and 300,000 tokens across them. The token
 * ceiling binds first: 64 notes at the `MAX_EMBEDDING_CHARS` worst case is
 * ~512,000 characters, which is over the limit — but only if every note in a
 * batch is simultaneously at a ceiling no real note has come close to. Held at
 * 64 because it keeps a backfill to a handful of requests while leaving the
 * failure mode "one batch is refused and retried smaller" rather than "the
 * whole backfill dies".
 */
const EMBED_BATCH = 64;

/**
 * Ask OpenAI for one vector per input, in input order.
 *
 * Returns them ordered to match `inputs`, keyed off the response's own `index`
 * field rather than array position. The documentation says order is preserved;
 * relying on that instead of on `index` would mean a silent mis-assignment —
 * every note holding its neighbour's vector — which no test and no screen would
 * show as anything but slightly wrong search results.
 */
/**
 * Why a failed request is logged by kind and not by message.
 *
 * OpenAI's `error.message` is the human-readable field and the obvious thing to
 * log — and on a validation failure it can quote the offending input back. The
 * input here is a note somebody wrote about another person, which is the exact
 * data this app exists to hold carefully. Convex's logs are operator-only, but
 * "operator-only" is a weaker promise than "never written down", and nothing in
 * the message is needed to act on the failure.
 *
 * `type` and `code` are enough to tell a bad key from a rate limit from an
 * oversized input, and neither can contain note text.
 */
async function failureKind(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { type?: string; code?: string };
    };
    return `${body.error?.type ?? "unknown"}/${body.error?.code ?? "none"}`;
  } catch {
    // A response that is not JSON at all — a gateway error page, usually.
    return "unparseable";
  }
}

async function fetchEmbeddings(inputs: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Loud in the logs, vague to the client — the pattern `extraction.ts` set.
    // A missing key is our misconfiguration, not something a user can act on.
    console.error(
      "OPENAI_API_KEY is not set on this Convex deployment. Notes will save " +
        "but will not be searchable. Set it with: " +
        "npx convex env set OPENAI_API_KEY sk-proj-...",
    );
    throw new ConvexError("Andy couldn't index that note for search.");
  }

  const response = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: inputs,
      // Asking the API to shorten is not the same as shortening the response
      // ourselves. OpenAI re-normalises server-side after truncating; a vector
      // sliced by hand afterwards is no longer unit length, and cosine
      // similarity against a mix of the two would be quietly wrong.
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    console.error(
      `OpenAI embeddings failed: ${response.status} ${await failureKind(response)}`,
    );
    throw new ConvexError("Andy couldn't index that note for search.");
  }

  const body = (await response.json()) as {
    data?: { index: number; embedding: number[] }[];
  };
  const data = body.data;
  if (!Array.isArray(data) || data.length !== inputs.length) {
    console.error(
      `OpenAI returned ${data?.length ?? "no"} embeddings for ${inputs.length} inputs.`,
    );
    throw new ConvexError("Andy couldn't index that note for search.");
  }

  const ordered: number[][] = new Array(inputs.length);
  for (const item of data) {
    if (item.embedding.length !== EMBEDDING_DIMENSIONS) {
      // The vector index refuses a wrong-length vector at search time with a
      // message about the *query*, which points at the wrong end of the
      // pipeline. Catching it here names the real culprit.
      console.error(
        `OpenAI returned a ${item.embedding.length}-dimension vector; the ` +
          `index expects ${EMBEDDING_DIMENSIONS}.`,
      );
      throw new ConvexError("Andy couldn't index that note for search.");
    }
    ordered[item.index] = item.embedding;
  }
  return ordered;
}

/**
 * The text of specific notes, for embedding.
 *
 * Takes ids rather than reading a range, because the caller is a scheduled job
 * that already knows which notes changed. Missing notes are skipped rather than
 * throwing: a note deleted between being scheduled and being embedded is an
 * ordinary race, not an error.
 */
export const notesForEmbedding = internalQuery({
  args: { noteIds: v.array(v.id("notes")) },
  returns: v.array(
    v.object({ noteId: v.id("notes"), text: v.string() }),
  ),
  handler: async (ctx, args) => {
    const out: { noteId: Id<"notes">; text: string }[] = [];
    for (const noteId of args.noteIds) {
      const note = await ctx.db.get("notes", noteId);
      if (note === null) continue;
      out.push({ noteId, text: embeddingTextFor(note) });
    }
    return out;
  },
});

/**
 * Write a vector onto a note — unless the note has moved on since.
 *
 * Two edits in quick succession schedule two jobs, and the scheduler does not
 * promise the later one finishes last. Without this check the older job can land
 * second and leave the note carrying a vector for text that no longer exists,
 * which nothing on any screen would reveal: the note reads correctly and simply
 * ranks as though it still said something else.
 *
 * So the write re-derives the note's embedding text and compares it to the text
 * that was actually sent. If they differ, this job has been overtaken and drops
 * its result; the job that embedded the current text writes the right vector.
 */
export const writeEmbedding = internalMutation({
  args: {
    noteId: v.id("notes"),
    embeddedText: v.string(),
    embedding: v.array(v.float64()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const note = await ctx.db.get("notes", args.noteId);
    if (note === null) return false;
    if (embeddingTextFor(note) !== args.embeddedText) return false;

    await ctx.db.patch("notes", args.noteId, { embedding: args.embedding });
    return true;
  },
});

/**
 * Embed a set of notes and store the results.
 *
 * Scheduled by the capture and edit paths, and looped over by the backfill.
 * Throwing here means the notes keep whatever vector they had — for a new note
 * that is none, and it stays out of search until a backfill picks it up. That is
 * the deliberate failure mode; see `backfillEmbeddings`.
 */
export const embedNotes = internalAction({
  args: { noteIds: v.array(v.id("notes")) },
  returns: v.object({ embedded: v.number(), skipped: v.number() }),
  // The return type is annotated rather than inferred, and so is `notes` below.
  // This action calls other functions in its own module through `internal`,
  // whose type is `typeof embeddings` — so inferring this handler's type
  // requires this handler's type. TypeScript reports that as everything nearby
  // going `any` (TS7022/TS7023), not as a cycle. Naming the shape breaks it.
  handler: async (
    ctx,
    args,
  ): Promise<{ embedded: number; skipped: number }> => {
    if (args.noteIds.length === 0) return { embedded: 0, skipped: 0 };

    const notes: { noteId: Id<"notes">; text: string }[] = await ctx.runQuery(
      internal.embeddings.notesForEmbedding,
      { noteIds: args.noteIds },
    );
    // A note whose text is empty has nothing to embed and would make OpenAI
    // reject the whole batch on behalf of its neighbours.
    const embeddable = notes.filter((note) => note.text.trim() !== "");
    if (embeddable.length === 0) {
      return { embedded: 0, skipped: args.noteIds.length };
    }

    let embedded = 0;
    for (let from = 0; from < embeddable.length; from += EMBED_BATCH) {
      const batch = embeddable.slice(from, from + EMBED_BATCH);
      const vectors = await fetchEmbeddings(batch.map((note) => note.text));
      for (const [index, note] of batch.entries()) {
        const written = await ctx.runMutation(
          internal.embeddings.writeEmbedding,
          {
            noteId: note.noteId,
            embeddedText: note.text,
            embedding: vectors[index],
          },
        );
        if (written) embedded += 1;
      }
    }

    return { embedded, skipped: args.noteIds.length - embedded };
  },
});

/**
 * Notes with no vector at all, oldest first.
 *
 * Deliberately not scoped to one user: this is the repair path, run by hand from
 * the CLI or the dashboard, and a note missing from search is missing whoever
 * owns it. Being internal is what keeps that safe — there is no client route to
 * this, and nothing here returns note content.
 */
export const notesMissingEmbedding = internalQuery({
  args: { limit: v.number() },
  returns: v.array(v.id("notes")),
  handler: async (ctx, args) => {
    const notes = await ctx.db
      .query("notes")
      .filter((q) => q.eq(q.field("embedding"), undefined))
      .take(args.limit);
    return notes.map((note) => note._id);
  },
});

/**
 * Give every note that lacks a vector one.
 *
 * This is the whole of the retry story, and that is a decision rather than an
 * omission. Day 4 left the question open: when a scheduled embed fails, do we
 * retry, or recompute lazily at search time?
 *
 * Neither. A failed embed leaves a note with no vector, and a failed *re*-embed
 * leaves it with a stale one — and this one action repairs the first case
 * whatever caused it, including causes a retry ladder would not survive (the key
 * unset, OpenAI down for an hour, a note that predates this pipeline entirely).
 * One mechanism instead of a policy per failure.
 *
 * A stale vector is left alone on purpose and is the milder problem: search
 * results are hydrated live, so the reader always sees the note's current text.
 * Only its ranking was computed from the old text. Findable and ranked slightly
 * wrong beats invisible — which is exactly why the edit path does not clear the
 * vector before replacing it.
 *
 *     npx convex run embeddings:backfillEmbeddings '{}'
 */
export const backfillEmbeddings = internalAction({
  args: {},
  // `passes` is not decoration: it is how many batches this took, which is the
  // number an operator wants after running it ("16 notes, one request") and the
  // only way from outside to tell a backfill that stopped early from one that
  // spun against a note it can never embed.
  returns: v.object({
    embedded: v.number(),
    remaining: v.number(),
    passes: v.number(),
  }),
  handler: async (
    ctx,
  ): Promise<{ embedded: number; remaining: number; passes: number }> => {
    let embedded = 0;
    let passes = 0;

    // Bounded rather than `while (true)`: a note that cannot be embedded — text
    // that is whitespace once trimmed, say — would otherwise be handed back by
    // the query forever and spin this action until Convex killed it.
    for (let pass = 0; pass < 100; pass += 1) {
      passes = pass + 1;
      const noteIds: Id<"notes">[] = await ctx.runQuery(
        internal.embeddings.notesMissingEmbedding,
        { limit: EMBED_BATCH },
      );
      if (noteIds.length === 0) break;

      const result = await ctx.runAction(internal.embeddings.embedNotes, {
        noteIds,
      });
      embedded += result.embedded;
      // Nothing was written, so the next pass would ask the same question and
      // get the same answer. Stop and let the counts show it.
      if (result.embedded === 0) break;
    }

    const remaining: Id<"notes">[] = await ctx.runQuery(
      internal.embeddings.notesMissingEmbedding,
      { limit: 1_000 },
    );
    return { embedded, remaining: remaining.length, passes };
  },
});
