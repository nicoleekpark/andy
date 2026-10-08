/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const ALICE = { subject: "alice", name: "Alice", email: "alice@example.com" };

test("should switch nothing off when there are no rows", async () => {
  const t = convexTest(schema, modules);
  expect(await t.withIdentity(ALICE).query(api.featureFlags.switchedOff, {})).toEqual([]);
});

test("should name only the features whose row says off", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("featureFlags", { key: "calendarBriefing", enabled: false, note: "QA" });
    await ctx.db.insert("featureFlags", { key: "somethingElse", enabled: true });
  });

  expect(await t.withIdentity(ALICE).query(api.featureFlags.switchedOff, {})).toEqual([
    "calendarBriefing",
  ]);
});

test("should tell nobody signed out", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("featureFlags", { key: "calendarBriefing", enabled: false });
  });

  expect(await t.query(api.featureFlags.switchedOff, {})).toEqual([]);
});
