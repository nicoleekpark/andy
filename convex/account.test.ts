/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { OWNED_TABLES } from "./account";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const ALICE = { subject: "alice", name: "Alice", email: "alice@example.com" };
const BOB = { subject: "bob", name: "Bob", email: "bob@example.com" };

type T = ReturnType<typeof convexTest>;

/** One of everything a user can own, plus a stored profile photo. */
async function seedEverything(t: T, who: typeof ALICE, notes = 1) {
  const userId = await t.withIdentity(who).mutation(api.users.ensureUser, {});
  return t.run(async (ctx) => {
    const photo = await ctx.storage.store(new Blob([`${who.subject}'s face`]));
    const profileId = await ctx.db.insert("profiles", {
      userId,
      name: "Nina",
      entityType: "person",
      tags: [],
      autoCreated: false,
      photoStorageId: photo,
    });
    const mentioned = await ctx.db.insert("profiles", {
      userId,
      name: "Marcus",
      entityType: "person",
      tags: [],
      autoCreated: true,
    });
    let noteId: Id<"notes"> | null = null;
    for (let i = 0; i < notes; i++) {
      noteId = await ctx.db.insert("notes", {
        userId,
        profileId,
        text: `Note ${i}.`,
        source: "manual",
        createdAt: i,
      });
    }
    await ctx.db.insert("noteMentions", {
      userId,
      noteId: noteId!,
      profileId: mentioned,
      name: "Marcus",
      quote: "Marcus was there",
    });
    await ctx.db.insert("metrics", {
      userId,
      profileId,
      date: "2026-09-01",
      metricType: "weight",
      value: 4.2,
      unit: "kg",
    });
    await ctx.db.insert("calendarLinks", {
      userId,
      profileId,
      calendarEventId: "event-1",
      meetingStart: 0,
      meetingEnd: 1,
    });
    return { userId, photo };
  });
}

/** Runs the batches the way `deleteMyAccount` does, without its Clerk half. */
async function deleteDataAs(t: T, who: typeof ALICE) {
  for (let i = 0; i < 100; i++) {
    const { done } = await t.withIdentity(who).mutation(internal.account.deleteBatch, {});
    if (done) return i + 1;
  }
  throw new Error("never finished");
}

async function countOwnedBy(t: T, userId: Id<"users">) {
  return t.run(async (ctx) => {
    let total = 0;
    for (const table of OWNED_TABLES) {
      // Read whole and filtered here: test data is small, and it keeps the
      // count independent of the index the code under test uses.
      const rows = await ctx.db.query(table as "notes").collect();
      total += rows.filter((row) => row.userId === userId).length;
    }
    return total;
  });
}

// This test counts through OWNED_TABLES, so it proves the deletion is right for
// the tables on that list, not that the list is complete. Completeness is the
// job of "should cover every table that belongs to a user" below, which reads
// the schema instead.
test("should delete every row the caller owns, their user row, and their profile photo", async () => {
  const t = convexTest(schema, modules);
  const { userId, photo } = await seedEverything(t, ALICE);
  expect(await countOwnedBy(t, userId)).toBeGreaterThan(0);

  await deleteDataAs(t, ALICE);

  expect(await countOwnedBy(t, userId)).toBe(0);
  await t.run(async (ctx) => {
    expect(await ctx.db.get("users", userId)).toBeNull();
    // Outside every table, and the one a hand-written cascade forgets.
    expect(await ctx.storage.getUrl(photo)).toBeNull();
  });
});

test("should leave somebody else's account exactly as it was", async () => {
  const t = convexTest(schema, modules);
  await seedEverything(t, ALICE);
  const bob = await seedEverything(t, BOB);
  const before = await countOwnedBy(t, bob.userId);

  await deleteDataAs(t, ALICE);

  expect(await countOwnedBy(t, bob.userId)).toBe(before);
  await t.run(async (ctx) => {
    expect(await ctx.db.get("users", bob.userId)).not.toBeNull();
    expect(await ctx.storage.getUrl(bob.photo)).not.toBeNull();
  });
});

test("should finish an account too big for one transaction", async () => {
  const t = convexTest(schema, modules);
  // More notes than one batch deletes, so it takes more than one pass.
  const { userId } = await seedEverything(t, ALICE, 450);

  const passes = await deleteDataAs(t, ALICE);

  expect(passes).toBeGreaterThan(2);
  expect(await countOwnedBy(t, userId)).toBe(0);
});

test("should cover every table that belongs to a user", () => {
  // Convex has no cascading delete. A table added later with a `userId` and
  // left off OWNED_TABLES would survive every account deletion, silently.
  const owned = Object.entries(schema.tables)
    .filter(([name, table]) => {
      const fields = (table as unknown as { validator: { fields: Record<string, unknown> } }).validator.fields;
      return name !== "users" && "userId" in fields;
    })
    .map(([name]) => name)
    .sort();
  expect([...OWNED_TABLES].sort()).toEqual(owned);
});

test("should refuse when signed out", async () => {
  const t = convexTest(schema, modules);
  await expect(t.mutation(internal.account.deleteBatch, {})).rejects.toThrow(/signed out/);
});

// ---------------------------------------------------------------------------
// The whole action: data, then the sign-in account
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function clerkAnswers(status: number) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}", { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

test("should delete the data, then the Clerk user behind this sign-in", async () => {
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_secret");
  const fetchMock = clerkAnswers(200);
  const t = convexTest(schema, modules);
  const { userId } = await seedEverything(t, ALICE);

  await t.withIdentity(ALICE).action(api.account.deleteMyAccount, {});

  expect(await countOwnedBy(t, userId)).toBe(0);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0]!;
  // `subject` is the Clerk user id; deleting anybody else's would be the bug.
  expect(url).toBe("https://api.clerk.com/v1/users/alice");
  expect(init?.method).toBe("DELETE");
  expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer sk_test_secret");
});

test("should delete nothing at all when the deployment cannot delete sign-ins", async () => {
  vi.stubEnv("CLERK_SECRET_KEY", "");
  const fetchMock = clerkAnswers(200);
  const t = convexTest(schema, modules);
  const { userId } = await seedEverything(t, ALICE);
  const before = await countOwnedBy(t, userId);

  await expect(t.withIdentity(ALICE).action(api.account.deleteMyAccount, {})).rejects.toThrow(
    /Nothing was deleted/,
  );

  // Otherwise: the data gone and the sign-in kept, an account that looks
  // deleted and isn't.
  expect(await countOwnedBy(t, userId)).toBe(before);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("should say so when Clerk refuses, and finish on a retry", async () => {
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_secret");
  clerkAnswers(500);
  const t = convexTest(schema, modules);
  const { userId } = await seedEverything(t, ALICE);

  await expect(t.withIdentity(ALICE).action(api.account.deleteMyAccount, {})).rejects.toThrow(
    /couldn't finish removing your sign-in/,
  );
  expect(await countOwnedBy(t, userId)).toBe(0);

  // Still signed in, with the user row already gone. The retry has to reach
  // Clerk rather than stop at "your account isn't set up".
  const retry = clerkAnswers(200);
  await t.withIdentity(ALICE).action(api.account.deleteMyAccount, {});
  expect(retry).toHaveBeenCalledTimes(1);
});

test("should count an already-deleted Clerk user as done", async () => {
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_secret");
  clerkAnswers(404);
  const t = convexTest(schema, modules);
  await seedEverything(t, ALICE);

  await expect(t.withIdentity(ALICE).action(api.account.deleteMyAccount, {})).resolves.toBeNull();
});
