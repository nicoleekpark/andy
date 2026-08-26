/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { getAuthenticatedUser } from "./users";

const modules = import.meta.glob("./**/*.ts");

test("should create exactly one users row and return the same id when ensureUser is called twice with the same identity", async () => {
  const t = convexTest(schema, modules);
  const identity = { subject: "user_1", name: "Alice", email: "alice@example.com" };
  const asAlice = t.withIdentity(identity);

  const firstId = await asAlice.mutation(api.users.ensureUser, {});
  const secondId = await asAlice.mutation(api.users.ensureUser, {});

  expect(secondId).toBe(firstId);

  await t.run(async (ctx) => {
    const rows = await ctx.db.query("users").collect();
    expect(rows).toHaveLength(1);
  });
});

test("should throw when ensureUser is called while signed out", async () => {
  const t = convexTest(schema, modules);
  await expect(t.mutation(api.users.ensureUser, {})).rejects.toThrow();
});

test("should update name and email without creating a second row when the identity's values changed since the row was created", async () => {
  const t = convexTest(schema, modules);
  const firstId = await t
    .withIdentity({ subject: "user_1", name: "Old Name", email: "old@example.com" })
    .mutation(api.users.ensureUser, {});

  const secondId = await t
    .withIdentity({ subject: "user_1", name: "New Name", email: "new@example.com" })
    .mutation(api.users.ensureUser, {});

  expect(secondId).toBe(firstId);

  await t.run(async (ctx) => {
    const rows = await ctx.db.query("users").collect();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "New Name", email: "new@example.com" });
  });
});

test("should return null from current when signed out and the caller's own row when signed in", async () => {
  const t = convexTest(schema, modules);
  const signedOut = await t.query(api.users.current, {});
  expect(signedOut).toBeNull();

  const asAlice = t.withIdentity({ subject: "user_1", name: "Alice", email: "alice@example.com" });
  const userId = await asAlice.mutation(api.users.ensureUser, {});

  const signedIn = await asAlice.query(api.users.current, {});
  expect(signedIn?._id).toBe(userId);
  expect(signedIn).toMatchObject({ name: "Alice", email: "alice@example.com" });
});

test("should never return user B's row from current when queried as user A", async () => {
  const t = convexTest(schema, modules);
  const asAlice = t.withIdentity({ subject: "user_a", name: "Alice", email: "alice@example.com" });
  const asBob = t.withIdentity({ subject: "user_b", name: "Bob", email: "bob@example.com" });

  const aliceId = await asAlice.mutation(api.users.ensureUser, {});
  const bobId = await asBob.mutation(api.users.ensureUser, {});

  const currentAsAlice = await asAlice.query(api.users.current, {});
  const currentAsBob = await asBob.query(api.users.current, {});

  expect(currentAsAlice?._id).toBe(aliceId);
  expect(currentAsBob?._id).toBe(bobId);
  expect(currentAsAlice?._id).not.toBe(currentAsBob?._id);
});

test("should throw when getAuthenticatedUser is called while signed out", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await expect(getAuthenticatedUser(ctx)).rejects.toThrow();
  });
});

test("should throw when getAuthenticatedUser is called with an identity that has no bootstrapped users row", async () => {
  const t = convexTest(schema, modules);
  const asAlice = t.withIdentity({ subject: "user_1", name: "Alice", email: "alice@example.com" });

  await asAlice.run(async (ctx) => {
    await expect(getAuthenticatedUser(ctx)).rejects.toThrow();
  });
});

test("should return the caller's own bootstrapped row from getAuthenticatedUser", async () => {
  const t = convexTest(schema, modules);
  const asAlice = t.withIdentity({
    subject: "user_1",
    name: "Alice",
    email: "alice@example.com",
  });

  const aliceId = await asAlice.mutation(api.users.ensureUser, {});

  await asAlice.run(async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    expect(user._id).toBe(aliceId);
    expect(user.name).toBe("Alice");
  });
});
