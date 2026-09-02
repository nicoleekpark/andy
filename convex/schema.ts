import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Andy — core data model.
 *
 * The central entity is deliberately NOT called "contact": the same object
 * represents people, clients, and foster animals (PROJECT_SCOPE.md, Data Model Note).
 *
 * Every table that holds user data carries `userId` and a `by_user` index.
 * Convex has no row-level security, so ownership filtering is the app's job on
 * every single read and write — see CLAUDE.md and the `security-reviewer` gate.
 */
export default defineSchema({
  // Owner of everything else. Keyed by Clerk's identity, not by Clerk's raw
  // `subject`: convex/_generated/ai/guidelines.md requires `tokenIdentifier`
  // as the canonical stable identity key.
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
  }).index("by_token", ["tokenIdentifier"]),

  profiles: defineTable({
    userId: v.id("users"),
    name: v.string(),
    entityType: v.union(v.literal("person"), v.literal("animal")),
    /**
     * Other names this person answers to — a nickname, a fuller name, what
     * their family calls them.
     *
     * Matching a spoken name against `name` alone is wrong in the direction
     * opposite to two people sharing one: it splits a single person across
     * "John", "John Maxwell" and "Mr. Maxwell", each a separate profile whose
     * notes never meet. `PROJECT_SCOPE.md` calls for a low-confidence match to
     * ask rather than guess; this is the half that stops the question being
     * asked over and over about the same person.
     *
     * Stored as written and compared the way names are, so 지수 and JISOO are
     * one alias rather than two.
     */
    aliases: v.optional(v.array(v.string())),
    relationshipContext: v.optional(v.string()), // "client" | "friend" | "networking" | "foster" | ...
    tags: v.array(v.string()),
    firstMetDate: v.optional(v.string()),
    contactId: v.optional(v.string()), // linked iOS Contacts identifier
    photoStorageId: v.optional(v.id("_storage")),
    /**
     * True when Andy created this row rather than the user choosing to keep
     * the person: somebody named in passing inside a note about somebody else.
     *
     * It is not "has no notes of their own", which is what the old name
     * `isStub` described and what could simply be counted. Deleting a note
     * removes the people it invented and leaves the people who were chosen,
     * and editing a profile by hand clears this even while the person still
     * has no notes — so two rows with zero notes can differ, and nothing in
     * the notes table can tell them apart.
     *
     */
    autoCreated: v.boolean(),
  })
    .index("by_user", ["userId"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["userId"],
    }),

  // Indexed per-note, never collapsed into a per-profile blob — that is what
  // makes cross-profile mention search possible (CLAUDE.md, a Must-have).
  notes: defineTable({
    userId: v.id("users"),
    profileId: v.id("profiles"), // primary profile this note is about
    text: v.string(),
    // The distilled facts Claude pulled out of `text`, as of this note's
    // `createdAt`. Stored per-note, never accumulated onto the profile: an
    // unbounded array inside one document would hit Convex's 1MB document
    // limit and rewrite the whole document on every save (guidelines.md), and
    // more importantly it would be the wrong shape — a fact is an observation
    // made on a date, not a claim about the present. "2026년 9월에 이사 간다"
    // does not become false in October, it becomes dated, and it can only be
    // read correctly next to the date it was recorded.
    // Optional because a manually typed note has no extraction step.
    keyFacts: v.optional(v.array(v.string())),
    // Written by the Day 4 embedding pipeline; notes created before then, or by
    // manual entry, simply have no vector yet.
    embedding: v.optional(v.array(v.float64())),
    // Which front door this note came through. Additive: a new channel adds a
    // literal, existing rows keep whatever they already had.
    source: v.union(
      v.literal("voice"),
      v.literal("manual"),
      v.literal("business_card"),
      v.literal("calendar_nudge"),
    ),
    // Explicit, so a note can be backdated to when the interaction actually
    // happened rather than when it was captured. Distinct from `_creationTime`.
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_profile_and_createdAt", [
      "userId",
      "profileId",
      "createdAt",
    ])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["userId"],
    }),

  // Who came up in a note without it being about them.
  //
  // A separate row rather than an array on the note, for three reasons. Convex
  // cannot index inside an array, so "every note mentioning X" would be a scan
  // of the caller's whole history. Deleting a note has to delete its mentions,
  // and rows make that a query rather than a search through arrays. And the
  // quote belongs *to the link* — it is the span of that note where that person
  // came up — which an array of bare ids has nowhere to put.
  //
  // Indexed both ways on purpose: a note asks "who came up in me", a profile
  // asks "where was I mentioned", and both are screens.
  noteMentions: defineTable({
    userId: v.id("users"),
    noteId: v.id("notes"),
    profileId: v.id("profiles"),
    /**
     * The name as it stood when the link was written.
     *
     * Duplicated from the profile on purpose, and only used when that profile
     * is gone. Deleting somebody must not quietly edit the notes of everyone
     * who ever mentioned them — "지선을 민호네 집들이에서 만났다" is what
     * happened, and a note that loses a name it recorded is a note that has
     * been rewritten. So the link outlives the person: the name still shows, it
     * simply stops opening anything.
     *
     * While the profile exists its current name wins, so a rename is reflected
     * everywhere rather than leaving old spellings scattered across links.
     */
    name: v.string(),
    // Copied verbatim out of the note's text. Not a summary: it is what was
    // actually said, which is the only version worth showing next to a name
    // that transcription may have got wrong.
    quote: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_note", ["userId", "noteId"])
    .index("by_user_and_profile", ["userId", "profileId"]),

  // Structured time-series for animal/health tracking, kept separate from the
  // free-text notes. `value`/`unit` are optional so a non-numeric event
  // ("vet_visit") is the same shape as a numeric one ("weight", 4.2, "kg").
  metrics: defineTable({
    userId: v.id("users"),
    profileId: v.id("profiles"),
    date: v.string(),
    metricType: v.string(), // "weight" | "vet_visit" | ...
    value: v.optional(v.number()),
    unit: v.optional(v.string()),
    note: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_profile_and_date", ["userId", "profileId", "date"]),

  // Calendar event ↔ profile match, plus the local notification ids scheduled
  // for it, so they can be cancelled/rescheduled against the iOS 64-pending cap.
  calendarLinks: defineTable({
    userId: v.id("users"),
    profileId: v.id("profiles"),
    calendarEventId: v.string(), // EventKit event identifier
    meetingStart: v.number(),
    meetingEnd: v.number(),
    briefingNotificationId: v.optional(v.string()),
    nudgeNotificationId: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_profile", ["userId", "profileId"])
    .index("by_user_and_event", ["userId", "calendarEventId"]),
});
