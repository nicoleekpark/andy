/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  EMBEDDING_DIMENSIONS,
  MAX_EMBEDDING_CHARS,
  embeddingTextFor,
} from "./embeddingModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const ALICE = { subject: "alice", name: "Alice", email: "alice@example.com" };

/**
 * There is no SDK here to mock — the OpenAI call is a bare `fetch` — so the
 * seam is the global itself. `extraction.test.ts` mocks at the module boundary
 * for the same reason in reverse: mock the thing the code actually reaches for.
 */
const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

/** A response in the shape the real API returns, one vector per input. */
function embeddingsResponse(
  vectors: number[][],
  options: { shuffle?: boolean } = {},
) {
  const data = vectors.map((embedding, index) => ({
    object: "embedding",
    index,
    embedding,
  }));
  return {
    ok: true,
    status: 200,
    json: async () => ({
      object: "list",
      // The API documents input order but also sends `index`. Shuffling here is
      // how the tests hold us to using `index`.
      data: options.shuffle ? [...data].reverse() : data,
      model: "text-embedding-3-large",
      usage: { prompt_tokens: 8, total_tokens: 8 },
    }),
    text: async () => "",
  };
}

/** A distinct, valid-length vector, so tests can tell one note's from another's. */
function vectorFor(seed: number): number[] {
  return Array.from(
    { length: EMBEDDING_DIMENSIONS },
    (_, i) => (seed + i) / 10_000,
  );
}

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "sk-proj-test-key");
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

/**
 * Run the jobs the capture path scheduled.
 *
 * `finishInProgressScheduledFunctions()` alone is not enough here and the
 * difference is worth naming: it waits for jobs already *running*, and a
 * `runAfter(0, ...)` job has not started yet. Used on its own it returns
 * immediately, the assertions run against a note with no vector, and the job
 * then fails after the test has ended — by which point `afterEach` has removed
 * the fake API key, so the logged reason is a missing key rather than the real
 * one. `finishAllScheduledFunctions` drains them properly.
 */
async function drainScheduled(t: ReturnType<typeof convexTest>) {
  vi.useFakeTimers();
  try {
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  } finally {
    vi.useRealTimers();
  }
}

async function seedNote(
  t: ReturnType<typeof convexTest>,
  overrides: { text?: string; keyFacts?: string[] } = {},
) {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { tokenIdentifier: "alice" });
    const profileId = await ctx.db.insert("profiles", {
      userId,
      name: "Priya",
      entityType: "person",
      tags: [],
      autoCreated: false,
    });
    const noteId = await ctx.db.insert("notes", {
      userId,
      profileId,
      text: overrides.text ?? "Priya runs a climbing gym in Oakland.",
      keyFacts: overrides.keyFacts,
      source: "voice" as const,
      createdAt: Date.UTC(2026, 8, 10, 12),
    });
    return { userId, profileId, noteId };
  });
}

// ---------------------------------------------------------------------------
// What gets embedded
// ---------------------------------------------------------------------------

test("should put the confirmed key facts ahead of the raw transcript, because those are the version the user endorsed", () => {
  const composed = embeddingTextFor({
    text: "she is moving to seattle next month",
    keyFacts: ["Moving to Seattle in October 2026"],
  });

  expect(composed).toBe(
    "Moving to Seattle in October 2026\nshe is moving to seattle next month",
  );
});

test("should embed a note that has no key facts at all, since a typed note never had an extraction step", () => {
  expect(embeddingTextFor({ text: "지선이 이사감" })).toBe("지선이 이사감");
});

test("should cut a note down to the character budget rather than let the request be refused whole", () => {
  const composed = embeddingTextFor({ text: "가".repeat(MAX_EMBEDDING_CHARS * 2) });
  expect(composed).toHaveLength(MAX_EMBEDDING_CHARS);
});

// ---------------------------------------------------------------------------
// The request, and the response
// ---------------------------------------------------------------------------

test("should ask OpenAI for the model and width the schema was built for, and store what comes back", async () => {
  const t = convexTest(schema, modules);
  const { noteId } = await seedNote(t);
  fetchMock.mockResolvedValueOnce(embeddingsResponse([vectorFor(1)]));

  const result = await t.action(internal.embeddings.embedNotes, {
    noteIds: [noteId],
  });

  expect(result).toEqual({ embedded: 1, skipped: 0 });

  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://api.openai.com/v1/embeddings");
  expect(init.headers.Authorization).toBe("Bearer sk-proj-test-key");
  const body = JSON.parse(init.body);
  expect(body.model).toBe("text-embedding-3-large");
  expect(body.dimensions).toBe(EMBEDDING_DIMENSIONS);
  expect(body.input).toEqual(["Priya runs a climbing gym in Oakland."]);

  const stored = await t.run(async (ctx) => ctx.db.get("notes", noteId));
  expect(stored?.embedding).toEqual(vectorFor(1));
});

test("should pair each vector with the note it belongs to by the response's own index, not by array position", async () => {
  const t = convexTest(schema, modules);
  const first = await seedNote(t, { text: "First note about climbing." });
  const second = await t.run(async (ctx) =>
    ctx.db.insert("notes", {
      userId: first.userId,
      profileId: first.profileId,
      text: "Second note about robotics.",
      source: "voice" as const,
      createdAt: Date.UTC(2026, 8, 10, 12),
    }),
  );

  // Same vectors, delivered in the reverse order. Trusting array position here
  // would give each note the other's vector — a mis-assignment that shows up
  // only as search results that are subtly, unaccountably wrong.
  fetchMock.mockResolvedValueOnce(
    embeddingsResponse([vectorFor(1), vectorFor(2)], { shuffle: true }),
  );

  await t.action(internal.embeddings.embedNotes, {
    noteIds: [first.noteId, second],
  });

  const stored = await t.run(async (ctx) => ({
    first: await ctx.db.get("notes", first.noteId),
    second: await ctx.db.get("notes", second),
  }));
  expect(stored.first?.embedding).toEqual(vectorFor(1));
  expect(stored.second?.embedding).toEqual(vectorFor(2));
});

test("should refuse a vector of the wrong width rather than store one the index will reject at search time", async () => {
  const t = convexTest(schema, modules);
  const { noteId } = await seedNote(t);
  fetchMock.mockResolvedValueOnce(
    embeddingsResponse([Array.from({ length: 1536 }, () => 0.01)]),
  );

  await expect(
    t.action(internal.embeddings.embedNotes, { noteIds: [noteId] }),
  ).rejects.toThrow();

  const stored = await t.run(async (ctx) => ctx.db.get("notes", noteId));
  expect(stored?.embedding).toBeUndefined();
});

test("should leave the note unembedded and never call OpenAI when the deployment has no key", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  const t = convexTest(schema, modules);
  const { noteId } = await seedNote(t);

  await expect(
    t.action(internal.embeddings.embedNotes, { noteIds: [noteId] }),
  ).rejects.toThrow();

  // The point of the check being first: a missing key must not become a
  // half-formed request that still costs a round trip.
  expect(fetchMock).not.toHaveBeenCalled();
  const stored = await t.run(async (ctx) => ctx.db.get("notes", noteId));
  expect(stored?.embedding).toBeUndefined();
});

test("should surface a refused request as an error and store nothing", async () => {
  const t = convexTest(schema, modules);
  const { noteId } = await seedNote(t);
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 429,
    text: async () => '{"error":{"message":"Rate limit reached"}}',
    json: async () => ({}),
  });

  await expect(
    t.action(internal.embeddings.embedNotes, { noteIds: [noteId] }),
  ).rejects.toThrow();
  const stored = await t.run(async (ctx) => ctx.db.get("notes", noteId));
  expect(stored?.embedding).toBeUndefined();
});

test("should log why a request failed without writing the note's contents into the logs", async () => {
  const t = convexTest(schema, modules);
  const { noteId } = await seedNote(t, {
    text: "Priya's mother is unwell and she is struggling.",
  });
  const logged: string[] = [];
  const consoleError = vi
    .spyOn(console, "error")
    .mockImplementation((...args: unknown[]) => {
      logged.push(args.join(" "));
    });

  // A validation failure of the shape that quotes the offending input back.
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 400,
    json: async () => ({
      error: {
        message:
          "$.input is invalid: 'Priya's mother is unwell and she is struggling.'",
        type: "invalid_request_error",
        code: "string_above_max_length",
      },
    }),
    text: async () => "",
  });

  await expect(
    t.action(internal.embeddings.embedNotes, { noteIds: [noteId] }),
  ).rejects.toThrow();
  consoleError.mockRestore();

  const all = logged.join("\n");
  // Enough to act on: which kind of failure this was.
  expect(all).toContain("400");
  expect(all).toContain("invalid_request_error");
  expect(all).toContain("string_above_max_length");
  // And nothing about the person the note is about. Convex logs are
  // operator-only, but that is a weaker promise than never being written down,
  // and none of this is needed to diagnose the failure.
  expect(all).not.toContain("Priya");
  expect(all).not.toContain("mother");
});

// ---------------------------------------------------------------------------
// The race
// ---------------------------------------------------------------------------

test("should drop a vector that was computed for text the note no longer has", async () => {
  const t = convexTest(schema, modules);
  const { noteId } = await seedNote(t);

  // Exactly the shape of two fast edits: this job embedded the old text, and
  // the note has since moved on. Landing this write would leave the note
  // ranking as though it still said the old thing — invisible on every screen,
  // because the screen renders the note's live text.
  const written = await t.mutation(internal.embeddings.writeEmbedding, {
    noteId,
    embeddedText: "some text this note has never had",
    embedding: vectorFor(3),
  });

  expect(written).toBe(false);
  const stored = await t.run(async (ctx) => ctx.db.get("notes", noteId));
  expect(stored?.embedding).toBeUndefined();
});

test("should store a vector that was computed for the text the note still has", async () => {
  const t = convexTest(schema, modules);
  const { noteId } = await seedNote(t);

  const written = await t.mutation(internal.embeddings.writeEmbedding, {
    noteId,
    embeddedText: "Priya runs a climbing gym in Oakland.",
    embedding: vectorFor(4),
  });

  expect(written).toBe(true);
  const stored = await t.run(async (ctx) => ctx.db.get("notes", noteId));
  expect(stored?.embedding).toEqual(vectorFor(4));
});

test("should skip a note deleted between being scheduled and being embedded, rather than failing the batch", async () => {
  const t = convexTest(schema, modules);
  const { noteId } = await seedNote(t);
  await t.run(async (ctx) => ctx.db.delete("notes", noteId));

  const result = await t.action(internal.embeddings.embedNotes, {
    noteIds: [noteId],
  });

  expect(result).toEqual({ embedded: 0, skipped: 1 });
  expect(fetchMock).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------------------
// The wiring — saving and editing a note
// ---------------------------------------------------------------------------

test("should give a note saved through the capture path a vector without the user asking", async () => {
  const t = convexTest(schema, modules);
  const asAlice = t.withIdentity(ALICE);
  await asAlice.mutation(api.users.ensureUser, {});
  fetchMock.mockResolvedValueOnce(embeddingsResponse([vectorFor(5)]));

  const { noteId } = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "Priya is moving to Seattle next month.",
    source: "voice",
    draft: {
      primary: {
        name: "Priya",
        entityType: "person",
        relationshipContext: null,
        tags: [],
        firstMetDate: null,
        keyFacts: ["Moving to Seattle in October 2026"],
      },
      mentions: [],
    },
  });

  // The mutation returns before the job runs — that is the point of scheduling
  // it. A note the user confirmed is saved whether or not OpenAI is reachable.
  await drainScheduled(t);

  const stored = await t.run(async (ctx) => ctx.db.get("notes", noteId));
  expect(stored?.embedding).toEqual(vectorFor(5));
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(body.input[0]).toBe(
    "Moving to Seattle in October 2026\nPriya is moving to Seattle next month.",
  );
});

test("should re-embed a note after a correction, so a fixed fact reaches search and not only the screen", async () => {
  const t = convexTest(schema, modules);
  const asAlice = t.withIdentity(ALICE);
  await asAlice.mutation(api.users.ensureUser, {});
  fetchMock.mockResolvedValueOnce(embeddingsResponse([vectorFor(6)]));

  const { noteId } = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "Ran into Mr. Park at the gym.",
    source: "voice",
    draft: {
      primary: {
        name: "Mr. Park",
        entityType: "person",
        relationshipContext: null,
        tags: [],
        firstMetDate: null,
        keyFacts: ["Teaches high school physics"],
      },
      mentions: [],
    },
  });
  await drainScheduled(t);

  fetchMock.mockResolvedValueOnce(embeddingsResponse([vectorFor(7)]));
  await asAlice.mutation(api.notes.updateNote, {
    noteId,
    text: "Ran into Mr. Park at the gym.",
    keyFacts: ["Teaches high school chemistry"],
  });
  await drainScheduled(t);

  const stored = await t.run(async (ctx) => ctx.db.get("notes", noteId));
  expect(stored?.embedding).toEqual(vectorFor(7));
  const body = JSON.parse(fetchMock.mock.calls[1][1].body);
  expect(body.input[0]).toContain("chemistry");
});

test("should keep the note saved when embedding fails, because search is a consequence of saving and not a condition of it", async () => {
  const t = convexTest(schema, modules);
  const asAlice = t.withIdentity(ALICE);
  await asAlice.mutation(api.users.ensureUser, {});
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 500,
    text: async () => "upstream exploded",
    json: async () => ({}),
  });

  const { noteId } = await asAlice.mutation(api.notes.saveCapture, {
    transcript: "Saw Sarah Huang today.",
    source: "voice",
    draft: {
      primary: {
        name: "Sarah Huang",
        entityType: "person",
        relationshipContext: null,
        tags: [],
        firstMetDate: null,
        keyFacts: [],
      },
      mentions: [],
    },
  });
  await drainScheduled(t);

  // The job ran and failed. What matters is what survived that.
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const stored = await t.run(async (ctx) => ctx.db.get("notes", noteId));
  expect(stored).not.toBeNull();
  expect(stored?.text).toBe("Saw Sarah Huang today.");
  expect(stored?.embedding).toBeUndefined();
});

// ---------------------------------------------------------------------------
// Repair
// ---------------------------------------------------------------------------

test("should give every note without a vector one, and leave the notes that already have theirs alone", async () => {
  const t = convexTest(schema, modules);
  const { userId, profileId, noteId } = await seedNote(t, {
    text: "Already embedded.",
  });
  const alreadyEmbedded = vectorFor(8);
  await t.run(async (ctx) =>
    ctx.db.patch("notes", noteId, { embedding: alreadyEmbedded }),
  );

  const missing: Id<"notes">[] = await t.run(async (ctx) =>
    Promise.all(
      ["Needs one.", "Needs one too."].map((text) =>
        ctx.db.insert("notes", {
          userId,
          profileId,
          text,
          source: "voice" as const,
          createdAt: Date.UTC(2026, 8, 10, 12),
        }),
      ),
    ),
  );

  fetchMock.mockResolvedValueOnce(
    embeddingsResponse([vectorFor(9), vectorFor(10)]),
  );

  const result = await t.action(internal.embeddings.backfillEmbeddings, {});

  expect(result).toEqual({ embedded: 2, remaining: 0, passes: 2 });
  // One request, not one per note — the backfill batches.
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const stored = await t.run(async (ctx) => ({
    untouched: await ctx.db.get("notes", noteId),
    first: await ctx.db.get("notes", missing[0]),
    second: await ctx.db.get("notes", missing[1]),
  }));
  expect(stored.untouched?.embedding).toEqual(alreadyEmbedded);
  expect(stored.first?.embedding).toEqual(vectorFor(9));
  expect(stored.second?.embedding).toEqual(vectorFor(10));
});

test("should stop rather than loop forever on a note it can never embed", async () => {
  const t = convexTest(schema, modules);
  // Whitespace once trimmed: there is nothing to send, so this note will be
  // handed back by the "missing a vector" query on every pass, for ever.
  await seedNote(t, { text: "   " });

  const result = await t.action(internal.embeddings.backfillEmbeddings, {});

  // One pass, not a hundred. Without the early break the counts below would be
  // identical and only the wasted round trips would differ, which is exactly
  // the kind of thing a passing test hides.
  expect(result).toEqual({ embedded: 0, remaining: 1, passes: 1 });
  expect(fetchMock).not.toHaveBeenCalled();
});
