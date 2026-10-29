/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { AI_NOT_ALLOWED, AI_PERMISSION_FLAG } from "./aiPermission";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "./embeddingModel";
import schema from "./schema";

/**
 * The go-ahead before anything a person wrote reaches Anthropic or OpenAI
 * (`aiPermission.ts`; App Review 5.1.2(i)). Every other suite runs with the
 * switch off, as production does until build 6; this one runs with it on.
 */

const modules = import.meta.glob("./**/*.ts");

const ALICE = { subject: "alice", name: "Alice", email: "alice@example.com" };
const BOB = { subject: "bob", name: "Bob", email: "bob@example.com" };

const { fetchMock, createMessage } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  createMessage: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  class MockAnthropic {
    static AuthenticationError = actual.AuthenticationError;
    static RateLimitError = actual.RateLimitError;
    static APIConnectionError = actual.APIConnectionError;
    messages = { create: createMessage };
  }
  return { ...actual, default: MockAnthropic };
});

function embeddings(count: number) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      object: "list",
      data: Array.from({ length: count }, (_, index) => ({
        object: "embedding",
        index,
        embedding: Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (index + i) / 10_000),
      })),
      model: EMBEDDING_MODEL,
      usage: { prompt_tokens: 8, total_tokens: 8 },
    }),
    text: async () => "",
  };
}

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-key");
  vi.stubEnv("OPENAI_API_KEY", "sk-proj-test-key");
  vi.stubGlobal("fetch", fetchMock);
  // Past the guard is all these tests need to see; what comes after has its own suites.
  createMessage.mockRejectedValue(new Error("not under test"));
  fetchMock.mockRejectedValue(new Error("not under test"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  createMessage.mockReset();
  fetchMock.mockReset();
});

/** Alice, with one person and a note with a fact — enough for every action to want to call out. */
async function seed(t: ReturnType<typeof convexTest>) {
  const userId = await t.withIdentity(ALICE).mutation(api.users.ensureUser, {});
  const { profileId, noteId } = await t.run(async (ctx) => {
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
      text: "Priya runs a climbing gym in Oakland.",
      keyFacts: ["Runs a climbing gym in Oakland"],
      source: "voice",
      createdAt: Date.UTC(2026, 8, 10, 12),
    });
    return { profileId, noteId };
  });
  return { userId, profileId, noteId };
}

const IMAGE = { imageBase64: "aGVsbG8=", mediaType: "image/jpeg" as const };

/** Every public action that sends what a person wrote to an AI service. */
function everyAiAction(as: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>, profileId: string) {
  return {
    fromTranscript: () => as.action(api.extraction.fromTranscript, { text: "Met Priya.", today: "2026-10-14" }),
    fromPhoto: () => as.action(api.extraction.fromPhoto, IMAGE),
    fromBusinessCard: () => as.action(api.extraction.fromBusinessCard, IMAGE),
    recall: () => as.action(api.search.recall, { query: "who runs a climbing gym" }),
    followUp: () => as.action(api.followUp.draft, { profileId, today: "2026-10-14" }),
  };
}

async function drainScheduled(t: ReturnType<typeof convexTest>) {
  vi.useFakeTimers();
  try {
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  } finally {
    vi.useRealTimers();
  }
}

test("should refuse every AI action until the person says yes, before anything is sent", async () => {
  const t = convexTest(schema, modules);
  const { profileId } = await seed(t);

  for (const [name, call] of Object.entries(everyAiAction(t.withIdentity(ALICE), profileId))) {
    await expect(call(), name).rejects.toThrow(AI_NOT_ALLOWED);
  }
  expect(createMessage).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("should let every AI action through once the person says yes", async () => {
  const t = convexTest(schema, modules);
  const { profileId } = await seed(t);
  const asAlice = t.withIdentity(ALICE);
  await asAlice.mutation(api.aiPermission.allow, {});
  // The catch-up that yes schedules, out of the way first.
  await drainScheduled(t);
  fetchMock.mockClear();

  for (const [name, call] of Object.entries(everyAiAction(asAlice, profileId))) {
    // Past the guard, each fails on the stubbed provider instead.
    await expect(call(), name).rejects.not.toThrow(AI_NOT_ALLOWED);
  }
  // The four Claude calls, and the question's embedding.
  expect(createMessage).toHaveBeenCalledTimes(4);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("should hold one person's yes to that person alone", async () => {
  const t = convexTest(schema, modules);
  const { profileId } = await seed(t);
  await t.withIdentity(ALICE).mutation(api.aiPermission.allow, {});
  await t.withIdentity(BOB).mutation(api.users.ensureUser, {});

  await expect(
    t.withIdentity(BOB).action(api.extraction.fromTranscript, { text: "Met Priya.", today: "2026-10-14" }),
  ).rejects.toThrow(AI_NOT_ALLOWED);
  // Bob reaching for Alice's person learns only that he has not said yes.
  await expect(everyAiAction(t.withIdentity(BOB), profileId).followUp()).rejects.toThrow(AI_NOT_ALLOWED);
  expect(createMessage).not.toHaveBeenCalled();
});

test("should stop again once the yes is withdrawn, and keep the notes", async () => {
  const t = convexTest(schema, modules);
  const { profileId, noteId } = await seed(t);
  const asAlice = t.withIdentity(ALICE);
  await asAlice.mutation(api.aiPermission.allow, {});
  await drainScheduled(t);
  createMessage.mockClear();

  await asAlice.mutation(api.aiPermission.withdraw, {});

  for (const [name, call] of Object.entries(everyAiAction(asAlice, profileId))) {
    await expect(call(), name).rejects.toThrow(AI_NOT_ALLOWED);
  }
  expect(createMessage).not.toHaveBeenCalled();
  const user = await asAlice.query(api.users.current, {});
  expect(user?.aiAllowedAt).toBeUndefined();
  expect(await t.run((ctx) => ctx.db.get("notes", noteId))).not.toBeNull();
});

test("should not send a note to be indexed for someone who has not said yes", async () => {
  const t = convexTest(schema, modules);
  const { noteId } = await seed(t);

  const result = await t.action(internal.embeddings.embedNotes, { noteIds: [noteId] });

  expect(result).toEqual({ embedded: 0, skipped: 1 });
  expect(fetchMock).not.toHaveBeenCalled();
});

test("should index everything the person already has once they say yes", async () => {
  const t = convexTest(schema, modules);
  const { noteId } = await seed(t);
  fetchMock.mockResolvedValue(embeddings(1));

  await t.withIdentity(ALICE).mutation(api.aiPermission.allow, {});
  await drainScheduled(t);

  const note = await t.run((ctx) => ctx.db.get("notes", noteId));
  expect(note?.embedding).toHaveLength(EMBEDDING_DIMENSIONS);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("should keep the first yes, and index nothing again, when yes is said twice", async () => {
  const t = convexTest(schema, modules);
  await seed(t);
  fetchMock.mockResolvedValue(embeddings(1));
  const asAlice = t.withIdentity(ALICE);
  await asAlice.mutation(api.aiPermission.allow, {});
  await drainScheduled(t);
  const first = (await asAlice.query(api.users.current, {}))?.aiAllowedAt;

  await asAlice.mutation(api.aiPermission.allow, {});
  await drainScheduled(t);

  expect((await asAlice.query(api.users.current, {}))?.aiAllowedAt).toBe(first);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("should ask nothing of anyone with the switch off, as production runs until build 6", async () => {
  const t = convexTest(schema, modules);
  const { noteId } = await seed(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("featureFlags", { key: AI_PERMISSION_FLAG, enabled: false });
  });
  fetchMock.mockResolvedValue(embeddings(1));

  await expect(
    t.withIdentity(ALICE).action(api.extraction.fromTranscript, { text: "Met Priya.", today: "2026-10-14" }),
  ).rejects.not.toThrow(AI_NOT_ALLOWED);
  expect(createMessage).toHaveBeenCalledTimes(1);
  expect(await t.action(internal.embeddings.embedNotes, { noteIds: [noteId] })).toEqual({
    embedded: 1,
    skipped: 0,
  });
});

test("should still refuse a signed-out caller, switch on or off", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.action(api.extraction.fromTranscript, { text: "Met Priya.", today: "2026-10-14" }),
  ).rejects.toThrow("You're signed out");
  await t.run(async (ctx) => {
    await ctx.db.insert("featureFlags", { key: AI_PERMISSION_FLAG, enabled: false });
  });
  await expect(
    t.action(api.extraction.fromTranscript, { text: "Met Priya.", today: "2026-10-14" }),
  ).rejects.toThrow("You're signed out");
  await expect(t.mutation(api.aiPermission.allow, {})).rejects.toThrow("You're signed out");
  expect(createMessage).not.toHaveBeenCalled();
});

test("should remember a Not now, and forget it on a yes", async () => {
  const t = convexTest(schema, modules);
  await seed(t);
  const asAlice = t.withIdentity(ALICE);

  await asAlice.mutation(api.aiPermission.decline, {});
  const declined = await asAlice.query(api.users.current, {});
  expect(declined?.aiDeclinedAt).toEqual(expect.any(Number));
  expect(declined?.aiAllowedAt).toBeUndefined();
  // A no is not a yes: still refused.
  await expect(
    asAlice.action(api.extraction.fromTranscript, { text: "Met Priya.", today: "2026-10-14" }),
  ).rejects.toThrow(AI_NOT_ALLOWED);

  await asAlice.mutation(api.aiPermission.allow, {});
  const allowed = await asAlice.query(api.users.current, {});
  expect(allowed?.aiAllowedAt).toEqual(expect.any(Number));
  expect(allowed?.aiDeclinedAt).toBeUndefined();
});

test("should not let a stray Not now undo a yes, and count stopping as a no", async () => {
  const t = convexTest(schema, modules);
  await seed(t);
  const asAlice = t.withIdentity(ALICE);
  await asAlice.mutation(api.aiPermission.allow, {});
  await drainScheduled(t);

  await asAlice.mutation(api.aiPermission.decline, {});
  expect((await asAlice.query(api.users.current, {}))?.aiAllowedAt).toEqual(expect.any(Number));

  await asAlice.mutation(api.aiPermission.withdraw, {});
  const stopped = await asAlice.query(api.users.current, {});
  expect(stopped?.aiAllowedAt).toBeUndefined();
  expect(stopped?.aiDeclinedAt).toEqual(expect.any(Number));
});

test("should refuse a signed-out Not now", async () => {
  const t = convexTest(schema, modules);
  await expect(t.mutation(api.aiPermission.decline, {})).rejects.toThrow("You're signed out");
});
