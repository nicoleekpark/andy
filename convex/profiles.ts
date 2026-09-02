import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { removeOrphanedAutoCreated } from "./cleanup";
import { cleanAliases, matchKey, mergeTags, namesOf } from "./naming";
import schema from "./schema";
import { getAuthenticatedUser } from "./users";

/**
 * How many "mentioned in" entries a profile shows before the rest are only a
 * count. Enough to see the shape of who brings this person up, short enough
 * that it does not push the timeline off the screen.
 */
const MENTIONED_IN_SHOWN = 5;

/**
 * TODO(when a single profile passes ~10 notes): an "often with" summary.
 *
 * Mentions are shown per note, which answers "who was at this one" and stops
 * answering "who does this person usually come up with" the moment a profile
 * has a hundred notes and fifty different names scattered through them — the
 * question you cannot answer by scrolling. The data is already here: group the
 * links on this profile's notes by `profileId` and count. It is perhaps thirty
 * minutes of work.
 *
 * It is deliberately not built yet, and the reason is not the work. Ranking
 * (frequency or recency), how many to show, and whether a single mention counts
 * are all display decisions with no basis until a real profile has repeat
 * mentions to look at — with two notes it would render "often with 민호 1",
 * which is noise. Build it against real data, not a guess.
 *
 * Recorded in PROJECT_SCOPE.md's Could Have alongside the graph view, which is
 * the same data drawn instead of listed.
 */

/**
 * Reading a profile and its timeline.
 *
 * This is the first place an id arrives *from the client* — the route param in
 * `/profile/[id]`. `saveCapture` deliberately never accepts one, resolving
 * people by name against the caller's own rows instead, so there was nothing to
 * check. Here there is: an id in a URL is a guess anyone can edit, so the row it
 * names has to be proven to belong to the caller before a single field of it is
 * returned. This is one of the two join sites this project has flagged as where
 * ownership leaks in practice.
 */
export const withNotes = query({
  // A plain string, not `v.id("profiles")`: the value comes out of a URL, where
  // a typo is ordinary. `v.id` would reject it with a validation error before
  // the handler ever ran, and the screen would show a crash instead of "we
  // couldn't find them".
  args: { profileId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      profile: schema.doc("profiles"),
      /** This person's own notes, newest first, each with who came up in it. */
      notes: v.array(
        v.object({
          note: schema.doc("notes"),
          mentions: v.array(
            v.object({
              profileId: v.id("profiles"),
              name: v.string(),
              quote: v.string(),
              /**
               * False once that person has been deleted. The name stays on the
               * note — removing it would rewrite what this note recorded — but
               * there is no longer anywhere for it to lead.
               */
              exists: v.boolean(),
            }),
          ),
        }),
      ),
      /**
       * Where this person came up in somebody else's note. The other half of
       * the link, and the only thing a profile with no notes of its own has to
       * show — which is most of them, since a mention is how they got here.
       */
      mentionedIn: v.array(
        v.object({
          noteId: v.id("notes"),
          createdAt: v.number(),
          quote: v.string(),
          aboutProfileId: v.id("profiles"),
          aboutName: v.string(),
        }),
      ),
      /**
       * How many there are in total, since `mentionedIn` is only the most
       * recent few. Someone who comes up in fifty conversations should say so
       * rather than quietly showing five.
       */
      mentionedInTotal: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    const profileId = ctx.db.normalizeId("profiles", args.profileId);
    if (profileId === null) {
      return null;
    }

    const profile = await ctx.db.get("profiles", profileId);
    // One `null` for "no such profile" and for "not yours". Distinguishing them
    // would let anyone with a valid id discover whether it exists.
    if (profile === null || profile.userId !== user._id) {
      return null;
    }

    // Both `userId` and `profileId` are pinned, so this check stands on its own
    // rather than leaning on the ownership check above — a note would have to
    // fail both to be returned. Worth keeping that way: Convex has no foreign
    // keys, so "a note's userId always matches its profile's owner" is an
    // invariant every future write path has to keep, not something the database
    // enforces.
    //
    // Ordered by the index rather than sorted afterwards, and reversed so the
    // newest note is first — the timeline reads down into the past.
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_user_and_profile_and_createdAt", (q) =>
        q.eq("userId", user._id).eq("profileId", profileId),
      )
      .order("desc")
      .collect();

    // Every link this user owns, read once and split two ways rather than
    // queried per note. Same trade as `recent` below: one read while a person
    // has hundreds of notes, revisited with pagination when that stops holding.
    const links = await ctx.db
      .query("noteMentions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Names for display. Scoped to this user, so a link can never resolve to
    // someone else's row even if one somehow pointed there.
    const names = new Map<string, string>();
    for (const owned of await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect()) {
      names.set(owned._id, owned.name);
    }

    const byNote = new Map<
      string,
      { profileId: Id<"profiles">; name: string; quote: string; exists: boolean }[]
    >();
    const mentionedIn = [];
    const noteById = new Map(notes.map((note) => [note._id as string, note]));

    for (const link of links) {
      if (link.profileId === profileId) {
        // Somebody else's note that names this person. Notes about *them* are
        // the timeline; this is the other direction.
        const source = await ctx.db.get("notes", link.noteId);
        if (source !== null && source.profileId !== profileId) {
          mentionedIn.push({
            noteId: link.noteId,
            createdAt: source.createdAt,
            quote: link.quote,
            aboutProfileId: source.profileId,
            aboutName: names.get(source.profileId) ?? "",
          });
        }
      }
      if (noteById.has(link.noteId)) {
        const list = byNote.get(link.noteId) ?? [];
        // The profile's current name while it exists, so a rename shows
        // everywhere; the name the link recorded once it does not.
        const current = names.get(link.profileId);
        list.push({
          profileId: link.profileId,
          name: current ?? link.name,
          quote: link.quote,
          exists: current !== undefined,
        });
        byNote.set(link.noteId, list);
      }
    }

    mentionedIn.sort((a, b) => b.createdAt - a.createdAt);

    return {
      profile,
      notes: notes.map((note) => ({
        note,
        mentions: byNote.get(note._id) ?? [],
      })),
      mentionedIn: mentionedIn.slice(0, MENTIONED_IN_SHOWN),
      mentionedInTotal: mentionedIn.length,
    };
  },
});

/**
 * The people you have actually recorded, most recently written about first.
 *
 * Someone who only ever appeared inside a note about somebody else is left out.
 * They are a real row — that is what makes "who was at that dinner" answerable
 * later — but the home screen is a list of people you keep, and after fifty
 * notes it would otherwise fill with names you heard once and never chose.
 *
 * Membership is derived from the notes rather than from `autoCreated`, and the
 * two are not the same question. `autoCreated` says who invented the row; this
 * list is about who has been written about, which the recency ordering has to
 * count anyway. Reading the flag instead would answer a different question and
 * go stale the first time a note was deleted.
 */
export const recent = query({
  args: {},
  returns: v.array(
    v.object({
      profile: schema.doc("profiles"),
      lastNoteAt: v.number(),
      noteCount: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);

    // Every note this user owns, in one read. Fine while a person has hundreds
    // rather than tens of thousands; when that stops being true the fix is a
    // paginated home, not a denormalised counter.
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const byProfile = new Map<string, { lastNoteAt: number; noteCount: number }>();
    for (const note of notes) {
      const seen = byProfile.get(note.profileId);
      byProfile.set(note.profileId, {
        lastNoteAt: Math.max(seen?.lastNoteAt ?? 0, note.createdAt),
        noteCount: (seen?.noteCount ?? 0) + 1,
      });
    }

    const profiles = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    return profiles
      .flatMap((profile) => {
        const stats = byProfile.get(profile._id);
        return stats === undefined ? [] : [{ profile, ...stats }];
      })
      .sort((a, b) => b.lastNoteAt - a.lastNoteAt);
  },
});


/** A name has to fit on a screen and in a person's head. */
const MAX_NAME_CHARS = 120;
/** Enough to describe anyone; past this it is a filing system, not a label. */
const MAX_TAGS = 24;
const MAX_TAG_CHARS = 60;
/** Relationship is a short phrase — "client", "친구", "foster since March". */
const MAX_RELATIONSHIP_CHARS = 120;

/**
 * Correcting the person, as opposed to correcting a note about them.
 *
 * PROJECT_SCOPE.md has had "manual profile create/edit" in Must Have from the
 * start, and the gap showed the moment a business card was read as `JOE KING`:
 * the name went straight to `profiles.name`, which is what every screen shows
 * *and* what `notes.saveCapture` matches the next capture against, and there
 * was no way to touch it short of the Convex dashboard.
 *
 * Two people may share a name, and this does not stand in the way of it. An
 * address book that refuses the second 치선 is telling the user their friend
 * does not exist, and the case that forces it is ordinary: a name saved by ear
 * turns out to be spelled the way somebody else's already is.
 *
 * What that costs is paid where it can be paid. A spoken name that matches two
 * profiles is not an answer, so `notes.saveCapture` asks which one rather than
 * taking the first — see `resolveNames` below, and the check the capture
 * screen runs before saving.
 */
export const updateProfile = mutation({
  args: {
    profileId: v.string(),
    name: v.string(),
    entityType: v.union(v.literal("person"), v.literal("animal")),
    /** Empty string clears it — the table spells "not known" as an absent field. */
    relationshipContext: v.string(),
    /** ISO `YYYY-MM-DD`, or empty to clear. */
    firstMetDate: v.string(),
    tags: v.array(v.string()),
    /** Other names this person answers to. Empty entries are dropped. */
    aliases: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    const profileId = ctx.db.normalizeId("profiles", args.profileId);
    if (profileId === null) {
      throw new ConvexError("Andy couldn't find that person.");
    }

    const profile = await ctx.db.get("profiles", profileId);
    if (profile === null || profile.userId !== user._id) {
      // One message for "no such profile" and "not yours", so a guessed id
      // cannot be used to find out which.
      throw new ConvexError("Andy couldn't find that person.");
    }

    const name = args.name.trim();
    if (name === "") {
      throw new ConvexError("A person needs a name.");
    }
    if (name.length > MAX_NAME_CHARS) {
      throw new ConvexError("That name is longer than Andy can store.");
    }

    const firstMetDate = args.firstMetDate.trim();
    if (firstMetDate !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(firstMetDate)) {
      throw new ConvexError("A first-met date looks like 2026-08-31.");
    }

    // Deduplicated the same way a capture merges them, so editing tags by hand
    // and gaining them from a note cannot produce different results.
    const tags = mergeTags([], args.tags);
    if (tags.length > MAX_TAGS) {
      throw new ConvexError("That is more tags than Andy can keep on one person.");
    }
    if (tags.some((tag) => tag.length > MAX_TAG_CHARS)) {
      throw new ConvexError("That's longer than a tag. Try a shorter one.");
    }

    const aliases = cleanAliases(name, args.aliases);
    if (aliases.length > MAX_TAGS) {
      throw new ConvexError("That is more names than Andy can keep for one person.");
    }
    if (aliases.some((alias) => alias.length > MAX_NAME_CHARS)) {
      throw new ConvexError("That name is longer than Andy can store.");
    }

    const relationshipContext = args.relationshipContext.trim();
    if (relationshipContext.length > MAX_RELATIONSHIP_CHARS) {
      throw new ConvexError("That's longer than a relationship. Try a shorter one.");
    }

    await ctx.db.patch("profiles", profileId, {
      name,
      entityType: args.entityType,
      // `undefined` rather than an empty string, matching what `saveCapture`
      // writes: the table spells "the note didn't say" as an absent field, and
      // a stored "" would be a third state nothing else knows how to read.
      relationshipContext: relationshipContext === "" ? undefined : relationshipContext,
      firstMetDate: firstMetDate === "" ? undefined : firstMetDate,
      tags,
      // Absent rather than an empty array, so a person with no other names
      // looks the same as one written before aliases existed.
      aliases: aliases.length > 0 ? aliases : undefined,
      // Editing a person by hand is choosing to keep them, which is exactly
      // what `autoCreated` means. Left true, they would vanish the moment the note
      // that first named them was deleted.
      autoCreated: false,
    });

    return null;
  },
});

/**
 * Who each of these names would resolve to, if the note were saved now.
 *
 * The capture screen asks before saving, and both answers matter. Several
 * matches is a question only the person who was in the room can settle, so it
 * is put to them rather than decided by whichever row happens to be older. No
 * match at all is the opposite failure and the more common one: recognition
 * hears "조 킹" as "조깅", nothing answers to it, and a new person is created
 * in silence. Neither is visible unless the screen says what saving will do.
 *
 * So names that match nobody are returned too, with an empty candidate list —
 * the absence is the information. The screen decides what to render; this
 * decides nothing.
 *
 * Each candidate carries enough to tell two people apart at a glance — how the
 * user knows them, how much is recorded, when it was last added to. A list of
 * identical names is not a choice.
 */
export const resolveNames = query({
  args: { names: v.array(v.string()) },
  returns: v.array(
    v.object({
      name: v.string(),
      candidates: v.array(
        v.object({
          profileId: v.id("profiles"),
          name: v.string(),
          relationshipContext: v.optional(v.string()),
          entityType: v.union(v.literal("person"), v.literal("animal")),
          noteCount: v.number(),
          lastNoteAt: v.union(v.number(), v.null()),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    const owned = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const byName = new Map<string, typeof owned>();
    for (const profile of owned) {
      // Every name they answer to, matching how `saveCapture` resolves one.
      // A screen that asked about a different set of names than the mutation
      // acts on would ask the wrong questions and miss the right ones.
      for (const key of new Set(namesOf(profile).map(matchKey))) {
        byName.set(key, [...(byName.get(key) ?? []), profile]);
      }
    }

    // Read once and counted here rather than per candidate: the same trade as
    // `recent`, and revisited by pagination when a person has thousands.
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const stats = new Map<string, { noteCount: number; lastNoteAt: number }>();
    for (const note of notes) {
      const seen = stats.get(note.profileId);
      stats.set(note.profileId, {
        noteCount: (seen?.noteCount ?? 0) + 1,
        lastNoteAt: Math.max(seen?.lastNoteAt ?? 0, note.createdAt),
      });
    }

    const asked = new Set<string>();
    const out = [];
    for (const raw of args.names) {
      const key = matchKey(raw);
      if (key === "" || asked.has(key)) {
        continue;
      }
      asked.add(key);

      const matches = byName.get(key) ?? [];

      out.push({
        name: raw.trim(),
        candidates: matches.map((profile) => ({
          profileId: profile._id,
          name: profile.name,
          relationshipContext: profile.relationshipContext,
          entityType: profile.entityType,
          noteCount: stats.get(profile._id)?.noteCount ?? 0,
          lastNoteAt: stats.get(profile._id)?.lastNoteAt ?? null,
        })),
      });
    }

    return out;
  },
});

/**
 * Deleting a person, and everything that was only about them.
 *
 * A profile is the most connected row in this database, and Convex has no
 * cascading delete, so every direction has to be walked by hand:
 *
 *   - their notes, and the mention links inside those notes
 *   - metrics and calendar links filed against them
 *   - a stored photo, which lives outside the tables entirely
 *
 * Missing any one of them leaves a row that renders on a screen and opens
 * nothing. And people Andy invented, whose only reason to exist was a note that
 * is going now, go too — the same rule note deletion follows, shared rather
 * than restated.
 *
 * This is the one irreversible thing in the app. It is why the screen asks
 * first, and why the answer counts what is about to be lost.
 */
export const remove = mutation({
  args: { profileId: v.string() },
  returns: v.object({
    removedNoteCount: v.number(),
    /** People who were only ever mentioned inside the notes just deleted. */
    removedAutoCreatedCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    const profileId = ctx.db.normalizeId("profiles", args.profileId);
    if (profileId === null) {
      throw new ConvexError("Andy couldn't find that person.");
    }

    const profile = await ctx.db.get("profiles", profileId);
    if (profile === null || profile.userId !== user._id) {
      throw new ConvexError("Andy couldn't find that person.");
    }

    const notes = await ctx.db
      .query("notes")
      .withIndex("by_user_and_profile_and_createdAt", (q) =>
        q.eq("userId", user._id).eq("profileId", profileId),
      )
      .collect();

    // Collected before anything is deleted: these are the people who might be
    // left stranded, and after the links are gone there is no way to find them.
    const mentionedInTheirNotes = new Set<Id<"profiles">>();
    for (const note of notes) {
      const links = await ctx.db
        .query("noteMentions")
        .withIndex("by_user_and_note", (q) =>
          q.eq("userId", user._id).eq("noteId", note._id),
        )
        .collect();
      for (const link of links) {
        mentionedInTheirNotes.add(link.profileId);
        await ctx.db.delete("noteMentions", link._id);
      }
      await ctx.db.delete("notes", note._id);
    }

    // The other direction is deliberately left alone: this person named inside
    // somebody else's note. Deleting those links would quietly rewrite every
    // note that ever mentioned them — "지선을 민호네 집들이에서 만났다" is what
    // happened, and a note that loses a name it recorded is a different note.
    // The link keeps the name it was written with, and `withNotes` reports it
    // as no longer existing so the screen stops offering to open it.

    for (const metric of await ctx.db
      .query("metrics")
      .withIndex("by_user_and_profile_and_date", (q) =>
        q.eq("userId", user._id).eq("profileId", profileId),
      )
      .collect()) {
      await ctx.db.delete("metrics", metric._id);
    }

    // Nothing writes these two tables yet. Handled anyway, because the day
    // something does is not the day anybody will remember this function exists.
    for (const link of await ctx.db
      .query("calendarLinks")
      .withIndex("by_user_and_profile", (q) =>
        q.eq("userId", user._id).eq("profileId", profileId),
      )
      .collect()) {
      await ctx.db.delete("calendarLinks", link._id);
    }

    if (profile.photoStorageId !== undefined) {
      // Storage is not a table and no schema check would ever notice this one
      // being skipped — it would just quietly cost the user money forever.
      await ctx.storage.delete(profile.photoStorageId);
    }

    await ctx.db.delete("profiles", profileId);

    // Last, so it sees the links already gone. `profileId` is deleted by now,
    // so it cannot be a candidate for its own cleanup.
    const removedAutoCreatedCount = await removeOrphanedAutoCreated(
      ctx,
      user._id,
      mentionedInTheirNotes,
    );

    return { removedNoteCount: notes.length, removedAutoCreatedCount };
  },
});
