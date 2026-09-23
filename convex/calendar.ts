import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import { namesFoundIn } from "./calendarNames";
import { matchKey, namesOf } from "./naming";
import { getAuthenticatedUser } from "./users";

/**
 * Who, of the people you keep, is in your calendar.
 *
 * The events come from the device — EventKit is not reachable from a Convex
 * function, and `PROJECT_SCOPE.md`'s Reality Check 8 is that EventKit already
 * covers Apple, Google and CalDAV in one API, so there is no second
 * integration to build. The matching happens here because the *people* are
 * here, and because turning a name into a person is the one operation this
 * codebase insists on doing in exactly one way.
 *
 * That insistence is `CLAUDE.md`'s rule and it shapes this whole function:
 * every name is resolved through `namesOf` and `matchKey`, the same as
 * `notes.saveCapture` and `profiles.resolveNames`, and **a name that several
 * people answer to is never guessed**. Two Judys means two candidates, and the
 * screen says so; picking the one with more notes would be the app quietly
 * deciding which friend you are about to meet.
 *
 * A note on what is sent here: event titles are the user's own calendar,
 * travelling to the user's own backend, and nothing is stored — this is a
 * query. They are not sent to any model. The briefing is assembled from notes
 * the user already wrote.
 */

/**
 * How many events one call may ask about.
 *
 * Generous against what the feature needs and firm against what a broken
 * client can send. A briefing looks at a day; `CLAUDE.md` caps scheduled
 * notifications at the next ~20-25 matched events, so two hundred is an order
 * of magnitude of headroom — and the work here is roughly
 * `events × names × title length`, which is bounded by the caller's own data
 * and therefore unbounded in the way that matters: a calendar sync that
 * duplicates a recurring event ten thousand times is a plausible Tuesday, not
 * an attack, and it should get a sentence rather than a timed-out query.
 */
const MAX_EVENTS = 200;

/**
 * How much of a title is searched.
 *
 * Truncated rather than refused, because one odd event must not cost the whole
 * day's briefing — a description pasted into a title field is somebody's real
 * calendar, not misuse. Names live at the start of a title in every form this
 * has been seen in ("Coffee with Marcus", "지선이랑 점심"), so the cut is
 * generous enough that it should never reach a name.
 */
const MAX_TITLE_CHARS = 500;

const eventInput = v.object({
  /** EventKit's own identifier, kept so a later slice can link notifications. */
  eventId: v.string(),
  title: v.string(),
  startsAt: v.number(),
  endsAt: v.number(),
  /**
   * Names from the event's attendee list, already separated by the device.
   *
   * Sent apart from the title because they need no searching — an attendee
   * name is a name, so it is resolved directly, while a title is a sentence
   * that may happen to contain one.
   */
  attendeeNames: v.array(v.string()),
});

const matchedPerson = v.object({
  profileId: v.id("profiles"),
  name: v.string(),
  entityType: v.union(v.literal("person"), v.literal("animal")),
  /** Which name matched — the spelling the calendar used is not kept. */
  matchedAs: v.string(),
  /** Where it was found. An attendee is a stronger signal than a title. */
  via: v.union(v.literal("attendee"), v.literal("title")),
  noteCount: v.number(),
  lastNoteAt: v.union(v.number(), v.null()),
});

/**
 * Match a batch of calendar events against this user's people.
 *
 * Batched rather than one call per event: a week of calendar is dozens of
 * events, the profile list is read once for all of them, and a query per event
 * would be a round trip per event for an answer that changes together.
 */
export const matchEvents = query({
  args: { events: v.array(eventInput) },
  returns: v.array(
    v.object({
      eventId: v.string(),
      title: v.string(),
      startsAt: v.number(),
      endsAt: v.number(),
      /** Everybody this event might be with, in the order found. */
      people: v.array(matchedPerson),
      /**
       * Names the event says that more than one person answers to.
       *
       * Reported rather than resolved. `CLAUDE.md`: two people may share a
       * name, and refusing to guess is the rule — the alternative is a
       * briefing about the wrong friend, which reads as the app knowing
       * something it does not.
       */
      ambiguous: v.array(
        v.object({ matchedAs: v.string(), count: v.number() }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    if (args.events.length > MAX_EVENTS) {
      throw new ConvexError(
        "Andy looked at too many calendar events at once. Try a shorter range.",
      );
    }

    const owned = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Every name every profile answers to, folded once. Same construction as
    // `profiles.resolveNames`, for the reason that file gives: a screen asking
    // about a different set of names than the resolver acts on is how a note
    // gets filed against somebody nobody offered.
    const byName = new Map<string, typeof owned>();
    for (const profile of owned) {
      for (const key of new Set(namesOf(profile).map(matchKey))) {
        byName.set(key, [...(byName.get(key) ?? []), profile]);
      }
    }
    const knownNames = [...byName.keys()];

    // Read once and counted here rather than per match — the same trade as
    // `resolveNames`, revisited by pagination when a person has thousands.
    const stats = new Map<string, { noteCount: number; lastNoteAt: number }>();
    for (const note of await ctx.db
      .query("notes")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect()) {
      const seen = stats.get(note.profileId);
      stats.set(note.profileId, {
        noteCount: (seen?.noteCount ?? 0) + 1,
        lastNoteAt: Math.max(seen?.lastNoteAt ?? 0, note.createdAt),
      });
    }

    return args.events.map((event) => {
      // Attendees first, and their order is kept: a name on the invitation is
      // a stronger claim about who is coming than a word in the title.
      const hits: { key: string; via: "attendee" | "title" }[] = [];
      const seenKeys = new Set<string>();

      for (const raw of event.attendeeNames) {
        const key = matchKey(raw);
        // No separate empty check. `byName` cannot hold `""`: both write paths
        // refuse a blank name (`profiles.updateProfile`, `notes.saveCapture`)
        // and `cleanAliases` drops a blank alias, so an empty attendee name
        // falls out at `byName.has` like any other stranger. A second check
        // here read as caution and was unreachable — mutation testing removed
        // it and nothing went red, which is the whole tell.
        if (seenKeys.has(key) || !byName.has(key)) continue;
        seenKeys.add(key);
        hits.push({ key, via: "attendee" });
      }
      for (const key of namesFoundIn(
        matchKey(event.title.slice(0, MAX_TITLE_CHARS)),
        knownNames,
      )) {
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        hits.push({ key, via: "title" });
      }

      const people = [];
      const ambiguous = [];
      for (const hit of hits) {
        const matches = byName.get(hit.key) ?? [];
        if (matches.length > 1) {
          ambiguous.push({ matchedAs: hit.key, count: matches.length });
          continue;
        }
        const profile = matches[0];
        if (profile === undefined) continue;
        const seen = stats.get(profile._id);
        people.push({
          profileId: profile._id,
          name: profile.name,
          entityType: profile.entityType,
          matchedAs: hit.key,
          via: hit.via,
          noteCount: seen?.noteCount ?? 0,
          lastNoteAt: seen?.lastNoteAt ?? null,
        });
      }

      return {
        eventId: event.eventId,
        title: event.title,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        people,
        ambiguous,
      };
    });
  },
});
