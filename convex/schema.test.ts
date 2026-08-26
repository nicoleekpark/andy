/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("should round-trip mentionedEntityIds as an array of profile ids when a note mentions several profiles", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { tokenIdentifier: "user_1" });
    const mainProfileId = await ctx.db.insert("profiles", {
      userId,
      name: "Alice",
      entityType: "person",
      tags: [],
      isStub: false,
    });
    const mentionedA = await ctx.db.insert("profiles", {
      userId,
      name: "Bob",
      entityType: "person",
      tags: [],
      isStub: true,
    });
    const mentionedB = await ctx.db.insert("profiles", {
      userId,
      name: "Rex",
      entityType: "animal",
      tags: [],
      isStub: true,
    });

    const noteId = await ctx.db.insert("notes", {
      userId,
      profileId: mainProfileId,
      mentionedEntityIds: [mentionedA, mentionedB],
      text: "Had coffee with Bob and his dog Rex.",
      source: "manual",
      createdAt: Date.now(),
    });

    const note = await ctx.db.get(noteId);
    expect(note?.mentionedEntityIds).toEqual([mentionedA, mentionedB]);
  });
});

test("should round-trip mentionedEntityIds as an empty array when a note has no mentions", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { tokenIdentifier: "user_1" });
    const profileId = await ctx.db.insert("profiles", {
      userId,
      name: "Alice",
      entityType: "person",
      tags: [],
      isStub: false,
    });

    const noteId = await ctx.db.insert("notes", {
      userId,
      profileId,
      mentionedEntityIds: [],
      text: "Solo journal entry.",
      source: "manual",
      createdAt: Date.now(),
    });

    const note = await ctx.db.get(noteId);
    expect(note?.mentionedEntityIds).toEqual([]);
  });
});

test("should insert a note with no embedding when the embedding pipeline has not run yet", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { tokenIdentifier: "user_1" });
    const profileId = await ctx.db.insert("profiles", {
      userId,
      name: "Alice",
      entityType: "person",
      tags: [],
      isStub: false,
    });

    const noteId = await ctx.db.insert("notes", {
      userId,
      profileId,
      mentionedEntityIds: [],
      text: "Manual note, no vector yet.",
      source: "manual",
      createdAt: Date.now(),
    });

    const note = await ctx.db.get(noteId);
    expect(note?.embedding).toBeUndefined();
  });
});

test("should accept both a numeric metric shape and a non-numeric metric shape", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { tokenIdentifier: "user_1" });
    const profileId = await ctx.db.insert("profiles", {
      userId,
      name: "Rex",
      entityType: "animal",
      tags: [],
      isStub: false,
    });

    const weightId = await ctx.db.insert("metrics", {
      userId,
      profileId,
      date: "2026-08-25",
      metricType: "weight",
      value: 4.2,
      unit: "kg",
    });
    const vetVisitId = await ctx.db.insert("metrics", {
      userId,
      profileId,
      date: "2026-08-25",
      metricType: "vet_visit",
      note: "Annual checkup, all clear.",
    });

    const weight = await ctx.db.get(weightId);
    const vetVisit = await ctx.db.get(vetVisitId);

    expect(weight).toMatchObject({ metricType: "weight", value: 4.2, unit: "kg" });
    expect(vetVisit).toMatchObject({
      metricType: "vet_visit",
      note: "Annual checkup, all clear.",
    });
    expect(vetVisit?.value).toBeUndefined();
    expect(vetVisit?.unit).toBeUndefined();
  });
});

test("should only return user A rows when querying profiles, notes, metrics, and calendarLinks by_user for user A", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const userA = await ctx.db.insert("users", { tokenIdentifier: "user_a" });
    const userB = await ctx.db.insert("users", { tokenIdentifier: "user_b" });

    const profileA = await ctx.db.insert("profiles", {
      userId: userA,
      name: "Alice's Contact",
      entityType: "person",
      tags: [],
      isStub: false,
    });
    const profileB = await ctx.db.insert("profiles", {
      userId: userB,
      name: "Bob's Contact",
      entityType: "person",
      tags: [],
      isStub: false,
    });

    await ctx.db.insert("notes", {
      userId: userA,
      profileId: profileA,
      mentionedEntityIds: [],
      text: "User A's note",
      source: "manual",
      createdAt: Date.now(),
    });
    await ctx.db.insert("notes", {
      userId: userB,
      profileId: profileB,
      mentionedEntityIds: [],
      text: "User B's note",
      source: "manual",
      createdAt: Date.now(),
    });

    await ctx.db.insert("metrics", {
      userId: userA,
      profileId: profileA,
      date: "2026-08-25",
      metricType: "weight",
      value: 1,
      unit: "kg",
    });
    await ctx.db.insert("metrics", {
      userId: userB,
      profileId: profileB,
      date: "2026-08-25",
      metricType: "weight",
      value: 2,
      unit: "kg",
    });

    await ctx.db.insert("calendarLinks", {
      userId: userA,
      profileId: profileA,
      calendarEventId: "event_a",
      meetingStart: 1,
      meetingEnd: 2,
    });
    await ctx.db.insert("calendarLinks", {
      userId: userB,
      profileId: profileB,
      calendarEventId: "event_b",
      meetingStart: 1,
      meetingEnd: 2,
    });

    const profilesForA = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userA))
      .collect();
    const notesForA = await ctx.db
      .query("notes")
      .withIndex("by_user", (q) => q.eq("userId", userA))
      .collect();
    const metricsForA = await ctx.db
      .query("metrics")
      .withIndex("by_user", (q) => q.eq("userId", userA))
      .collect();
    const calendarLinksForA = await ctx.db
      .query("calendarLinks")
      .withIndex("by_user", (q) => q.eq("userId", userA))
      .collect();

    expect(profilesForA).toHaveLength(1);
    expect(profilesForA.every((p) => p.userId === userA)).toBe(true);

    expect(notesForA).toHaveLength(1);
    expect(notesForA.every((n) => n.userId === userA)).toBe(true);

    expect(metricsForA).toHaveLength(1);
    expect(metricsForA.every((m) => m.userId === userA)).toBe(true);

    expect(calendarLinksForA).toHaveLength(1);
    expect(calendarLinksForA.every((c) => c.userId === userA)).toBe(true);
  });
});

test("should reject an invalid entityType value on profiles", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { tokenIdentifier: "user_1" });
      await ctx.db.insert("profiles", {
        userId,
        name: "Not a person or animal",
        // @ts-expect-error - intentionally invalid to assert schema validation rejects it
        entityType: "robot",
        tags: [],
        isStub: false,
      });
    }),
  ).rejects.toThrow();
});

test("should return the matching user for a given tokenIdentifier via by_token", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("users", { tokenIdentifier: "other_user" });
    const targetUserId = await ctx.db.insert("users", {
      tokenIdentifier: "target_user",
      name: "Target",
    });

    const found = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", "target_user"))
      .unique();

    expect(found?._id).toBe(targetUserId);
  });
});
