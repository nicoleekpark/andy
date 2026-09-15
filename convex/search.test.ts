/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { EMBEDDING_DIMENSIONS } from "./embeddingModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const ALICE = { subject: "alice", name: "Alice", email: "alice@example.com" };
const BOB = { subject: "bob", name: "Bob", email: "bob@example.com" };

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

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
 * A one-hot vector.
 *
 * `convex-test` computes real cosine similarity, so these give exact,
 * predictable scores: identical axes score 1, different axes score 0. A note on
 * axis 0 and a query on axis 0 is "this note answers this question" with no
 * arithmetic to reason about.
 */
function axis(index: number, magnitude = 1): number[] {
  const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  vector[index] = magnitude;
  return vector;
}

/** What OpenAI returns for the search query itself. */
function queryVector(vector: number[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: [{ index: 0, embedding: vector }] }),
    text: async () => "",
  };
}

async function seedUser(
  t: ReturnType<typeof convexTest>,
  identity: { subject: string; name: string; email: string },
) {
  const userId = await t
    .withIdentity(identity)
    .mutation(api.users.ensureUser, {});
  return userId as Id<"users">;
}

async function seedNote(
  t: ReturnType<typeof convexTest>,
  args: {
    userId: Id<"users">;
    profileId?: Id<"profiles">;
    profileName?: string;
    text: string;
    embedding: number[];
    keyFacts?: string[];
    createdAt?: number;
  },
) {
  return t.run(async (ctx) => {
    const profileId =
      args.profileId ??
      (await ctx.db.insert("profiles", {
        userId: args.userId,
        name: args.profileName ?? "Marcus",
        entityType: "person",
        tags: [],
        autoCreated: false,
      }));
    const noteId = await ctx.db.insert("notes", {
      userId: args.userId,
      profileId,
      text: args.text,
      keyFacts: args.keyFacts,
      source: "voice" as const,
      createdAt: args.createdAt ?? Date.UTC(2026, 8, 10, 12),
      embedding: args.embedding,
    });
    return { profileId, noteId };
  });
}

// ---------------------------------------------------------------------------
// Finding things
// ---------------------------------------------------------------------------

test("should return the note that answers the question and leave out the one that does not", async () => {
  const t = convexTest(schema, modules);
  const alice = await seedUser(t, ALICE);
  const climbing = await seedNote(t, {
    userId: alice,
    profileName: "Marcus",
    text: "Marcus runs a climbing gym in Oakland.",
    embedding: axis(0),
  });
  const robotics = await seedNote(t, {
    userId: alice,
    profileName: "Priya",
    text: "Priya is moving to Seattle for a robotics job.",
    embedding: axis(1),
  });
  fetchMock.mockResolvedValueOnce(queryVector(axis(0)));

  const { results } = await t
    .withIdentity(ALICE)
    .action(api.search.recall, { query: "who runs a climbing gym" });

  expect(results).toHaveLength(1);
  expect(results[0].noteId).toBe(climbing.noteId);
  expect(results[0].profile.name).toBe("Marcus");
  expect(results[0].score).toBeCloseTo(1);
  // The robotics note scores 0 against this axis and falls under the floor.
  expect(results.map((r) => r.noteId)).not.toContain(robotics.noteId);
});

test("should keep the index's ranking rather than re-sorting the results into some other order", async () => {
  const t = convexTest(schema, modules);
  const alice = await seedUser(t, ALICE);
  // Three notes on the same axis at decreasing magnitudes would all score 1 —
  // cosine ignores length — so they are tilted off-axis by different amounts.
  //
  // The dates deliberately match neither the score order nor its reverse
  // (June, September, January against a ranking of near, middle, far). That
  // shape was arrived at by breaking the code three times:
  //
  //   all three dates equal    -> sorting by date is a no-op, test stayed green
  //   dates ascending w/ score -> date order == score order, still green
  //   dates reversed           -> caught ascending, but *descending* stayed green
  //
  // Only an order that agrees with no date sort in either direction actually
  // asserts that the ranking is the index's.
  const near = await seedNote(t, {
    userId: alice,
    profileName: "Near",
    text: "Nearest.",
    embedding: axis(0),
    createdAt: Date.UTC(2026, 5, 1, 12),
  });
  const middle = await seedNote(t, {
    userId: alice,
    profileName: "Middle",
    text: "Middling.",
    embedding: [1, 0.5, ...Array(EMBEDDING_DIMENSIONS - 2).fill(0)],
    createdAt: Date.UTC(2026, 8, 1, 12),
  });
  const far = await seedNote(t, {
    userId: alice,
    profileName: "Far",
    text: "Furthest.",
    embedding: [1, 1.6, ...Array(EMBEDDING_DIMENSIONS - 2).fill(0)],
    createdAt: Date.UTC(2026, 0, 1, 12),
  });
  fetchMock.mockResolvedValueOnce(queryVector(axis(0)));

  const { results } = await t
    .withIdentity(ALICE)
    .action(api.search.recall, { query: "anything" });

  expect(results.map((r) => r.noteId)).toEqual([
    near.noteId,
    middle.noteId,
    far.noteId,
  ]);
  expect(results[0].score).toBeGreaterThan(results[1].score);
  expect(results[1].score).toBeGreaterThan(results[2].score);
});

test("should carry who else came up in a note, so a person who only exists as a mention can still be found", async () => {
  const t = convexTest(schema, modules);
  const alice = await seedUser(t, ALICE);
  const { noteId, profileId } = await seedNote(t, {
    userId: alice,
    profileName: "Amy",
    text: "Amy's birthday. Met a software developer from Meta there.",
    embedding: axis(0),
  });
  const john = await t.run(async (ctx) => {
    const johnId = await ctx.db.insert("profiles", {
      userId: alice,
      name: "John",
      entityType: "person",
      tags: [],
      autoCreated: true,
    });
    await ctx.db.insert("noteMentions", {
      userId: alice,
      noteId,
      profileId: johnId,
      name: "John",
      quote: "a software developer from Meta",
    });
    return johnId;
  });
  fetchMock.mockResolvedValueOnce(queryVector(axis(0)));

  const { results } = await t
    .withIdentity(ALICE)
    .action(api.search.recall, { query: "the Meta developer at a birthday" });

  expect(results[0].profile.profileId).toBe(profileId);
  expect(results[0].mentions).toEqual([
    {
      // The actual id, not `expect.anything()`. That matcher accepts any
      // non-null value, so it would pass while pointing at the wrong person —
      // which is the whole property this test exists to assert.
      profileId: john,
      name: "John",
      quote: "a software developer from Meta",
      exists: true,
    },
  ]);
});

test("should keep a deleted person's name on the note that mentioned them, and mark them as no longer there", async () => {
  const t = convexTest(schema, modules);
  const alice = await seedUser(t, ALICE);
  const { noteId } = await seedNote(t, {
    userId: alice,
    profileName: "Amy",
    text: "Amy's birthday, 지선 was there.",
    embedding: axis(0),
  });
  await t.run(async (ctx) => {
    const jiseon = await ctx.db.insert("profiles", {
      userId: alice,
      name: "지선",
      entityType: "person",
      tags: [],
      autoCreated: true,
    });
    await ctx.db.insert("noteMentions", {
      userId: alice,
      noteId,
      profileId: jiseon,
      name: "지선",
      quote: "지선 was there",
    });
    // Deleting somebody must not rewrite everyone else's notes.
    await ctx.db.delete("profiles", jiseon);
  });
  fetchMock.mockResolvedValueOnce(queryVector(axis(0)));

  const { results } = await t
    .withIdentity(ALICE)
    .action(api.search.recall, { query: "the birthday" });

  expect(results[0].mentions[0].name).toBe("지선");
  expect(results[0].mentions[0].exists).toBe(false);
  // No id at all once they are gone — nothing for a screen to make tappable.
  expect(results[0].mentions[0].profileId).toBeNull();
});

test("should return nothing rather than a page of confident citations when the question has no answer here", async () => {
  const t = convexTest(schema, modules);
  const alice = await seedUser(t, ALICE);
  await seedNote(t, {
    userId: alice,
    text: "Marcus runs a climbing gym.",
    embedding: axis(0),
  });
  // Orthogonal to everything stored: the shape of "what is the capital of
  // France", which measured 0.115 against the real notes.
  fetchMock.mockResolvedValueOnce(queryVector(axis(900)));

  const { results } = await t
    .withIdentity(ALICE)
    .action(api.search.recall, { query: "what is the capital of France" });

  expect(results).toEqual([]);
});

// ---------------------------------------------------------------------------
// The join site — CLAUDE.md names this as one of two places ownership leaks
// ---------------------------------------------------------------------------

test("should never return another user's note, even when it is a better answer than anything the caller owns", async () => {
  const t = convexTest(schema, modules);
  const alice = await seedUser(t, ALICE);
  const bob = await seedUser(t, BOB);

  const bobsNote = await seedNote(t, {
    userId: bob,
    profileName: "Bob's Marcus",
    text: "Bob's private note about a climbing gym.",
    embedding: axis(0),
  });
  const alicesNote = await seedNote(t, {
    userId: alice,
    profileName: "Alice's Marcus",
    text: "Alice's note, a worse match.",
    embedding: [1, 1.2, ...Array(EMBEDDING_DIMENSIONS - 2).fill(0)],
  });
  fetchMock.mockResolvedValueOnce(queryVector(axis(0)));

  const { results } = await t
    .withIdentity(ALICE)
    .action(api.search.recall, { query: "climbing gym" });

  expect(results.map((r) => r.noteId)).toEqual([alicesNote.noteId]);
  expect(results.map((r) => r.noteId)).not.toContain(bobsNote.noteId);
  expect(results[0].text).not.toContain("Bob's private");
});

test("should refuse to hydrate another user's note id even when handed one directly", async () => {
  const t = convexTest(schema, modules);
  await seedUser(t, ALICE);
  const bob = await seedUser(t, BOB);
  const bobsNote = await seedNote(t, {
    userId: bob,
    text: "Bob's private note.",
    embedding: axis(0),
  });

  // Straight past the vector index and its filter, which is the point: the
  // filter is an optimisation and this is the boundary.
  const results = await t
    .withIdentity(ALICE)
    .query(internal.search.hydrate, {
      hits: [{ noteId: bobsNote.noteId, score: 0.99 }],
    });

  expect(results).toEqual([]);
});

test("should drop a note whose subject profile belongs to somebody else, rather than reading across the join", async () => {
  const t = convexTest(schema, modules);
  const alice = await seedUser(t, ALICE);
  const bob = await seedUser(t, BOB);

  // Convex has no referential integrity, so a note's `profileId` is a claim,
  // not a guarantee. Nothing writes this today; if anything ever did, the join
  // is where it would become a cross-account read.
  const bobsProfile = await t.run(async (ctx) =>
    ctx.db.insert("profiles", {
      userId: bob,
      name: "Bob's person",
      entityType: "person",
      tags: [],
      autoCreated: false,
    }),
  );
  const noteId = await t.run(async (ctx) =>
    ctx.db.insert("notes", {
      userId: alice,
      profileId: bobsProfile,
      text: "Alice's note pointing at Bob's profile.",
      source: "voice" as const,
      createdAt: Date.UTC(2026, 8, 10, 12),
      embedding: axis(0),
    }),
  );
  fetchMock.mockResolvedValueOnce(queryVector(axis(0)));

  const { results } = await t
    .withIdentity(ALICE)
    .action(api.search.recall, { query: "anything" });

  expect(results.map((r) => r.noteId)).not.toContain(noteId);
  expect(results).toEqual([]);
});

test("should refuse a note owned by somebody else even when it points at the caller's own profile", async () => {
  const t = convexTest(schema, modules);
  const alice = await seedUser(t, ALICE);
  const bob = await seedUser(t, BOB);

  // The mirror of the test above, and the only shape in which the note's own
  // owner check is what stands in the way: every other case is caught by the
  // subject profile's check instead, which is how removing the note check
  // originally left the whole suite green.
  const alicesProfile = await t.run(async (ctx) =>
    ctx.db.insert("profiles", {
      userId: alice,
      name: "Alice's person",
      entityType: "person",
      tags: [],
      autoCreated: false,
    }),
  );
  const bobsNote = await t.run(async (ctx) =>
    ctx.db.insert("notes", {
      userId: bob,
      profileId: alicesProfile,
      text: "Bob's private note, filed against Alice's person.",
      source: "voice" as const,
      createdAt: Date.UTC(2026, 8, 10, 12),
      embedding: axis(0),
    }),
  );

  const results = await t
    .withIdentity(ALICE)
    .query(internal.search.hydrate, {
      hits: [{ noteId: bobsNote, score: 0.99 }],
    });

  expect(results).toEqual([]);
});

test("should never read another user's profile name through a mention link, even one recorded on the caller's own note", async () => {
  const t = convexTest(schema, modules);
  const alice = await seedUser(t, ALICE);
  const bob = await seedUser(t, BOB);

  // The guard this covers was invisible to the suite until `security-reviewer`
  // bypassed *only this call site* — leaving the subject-profile check intact,
  // so every other ownership test still passed — and got Bob's live profile
  // name back in Alice's results. Mutating the shared helper was not enough;
  // the mention path needed its own witness.
  const { noteId } = await seedNote(t, {
    userId: alice,
    profileName: "Amy",
    text: "Amy's birthday.",
    embedding: axis(0),
  });
  await t.run(async (ctx) => {
    const bobsPerson = await ctx.db.insert("profiles", {
      userId: bob,
      name: "BOBS-SECRET-CONTACT",
      entityType: "person",
      tags: [],
      autoCreated: false,
    });
    await ctx.db.insert("noteMentions", {
      userId: alice,
      noteId,
      profileId: bobsPerson,
      name: "someone Alice wrote down",
      quote: "they were there too",
    });
  });
  fetchMock.mockResolvedValueOnce(queryVector(axis(0)));

  const { results } = await t
    .withIdentity(ALICE)
    .action(api.search.recall, { query: "the birthday" });

  const mention = results[0].mentions[0];
  // Alice's own recorded name, never Bob's current one.
  expect(mention.name).toBe("someone Alice wrote down");
  expect(mention.name).not.toBe("BOBS-SECRET-CONTACT");
  expect(mention.exists).toBe(false);
  expect(mention.profileId).toBeNull();
  expect(JSON.stringify(results)).not.toContain("BOBS-SECRET-CONTACT");
});

test("should not let another user's notes crowd the caller's own out of the result window", async () => {
  const t = convexTest(schema, modules);
  const alice = await seedUser(t, ALICE);
  const bob = await seedUser(t, BOB);

  // Twenty notes for Bob, every one a better match than Alice's, against a
  // window of twelve. Without the index-level `userId` filter all twelve slots
  // go to Bob, hydration correctly discards all twelve, and Alice is told there
  // is nothing — the filter is not a security control, but dropping it turns a
  // working search into an empty one.
  const bobsProfile = await t.run(async (ctx) =>
    ctx.db.insert("profiles", {
      userId: bob,
      name: "Bob's person",
      entityType: "person",
      tags: [],
      autoCreated: false,
    }),
  );
  await t.run(async (ctx) => {
    for (let i = 0; i < 20; i += 1) {
      await ctx.db.insert("notes", {
        userId: bob,
        profileId: bobsProfile,
        text: `Bob's note ${i}.`,
        source: "voice" as const,
        createdAt: Date.UTC(2026, 8, 10, 12),
        embedding: axis(0),
      });
    }
  });
  const alicesNote = await seedNote(t, {
    userId: alice,
    text: "Alice's only note, a slightly worse match.",
    embedding: [1, 0.4, ...Array(EMBEDDING_DIMENSIONS - 2).fill(0)],
  });
  fetchMock.mockResolvedValueOnce(queryVector(axis(0)));

  const { results } = await t
    .withIdentity(ALICE)
    .action(api.search.recall, { query: "anything" });

  expect(results.map((r) => r.noteId)).toEqual([alicesNote.noteId]);
});

// ---------------------------------------------------------------------------
// Refusals — every one of these must happen before the embedding call
// ---------------------------------------------------------------------------

test("should refuse a signed-out search without spending anything on it", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.action(api.search.recall, { query: "who runs a climbing gym" }),
  ).rejects.toThrow();

  // The order is the security property: identity is resolved before the query
  // is embedded, so a signed-out caller cannot run up a bill.
  expect(fetchMock).not.toHaveBeenCalled();
});

test("should refuse an empty question without spending anything on it", async () => {
  const t = convexTest(schema, modules);
  await seedUser(t, ALICE);

  await expect(
    t.withIdentity(ALICE).action(api.search.recall, { query: "   " }),
  ).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("should refuse a question that is really a pasted document", async () => {
  const t = convexTest(schema, modules);
  await seedUser(t, ALICE);

  await expect(
    t
      .withIdentity(ALICE)
      .action(api.search.recall, { query: "a".repeat(501) }),
  ).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
});
