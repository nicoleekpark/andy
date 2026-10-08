import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import { matchEventsIn } from "./calendarMatch";
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
 * **Kept only for app builds up to TestFlight build 4.** From build 5 the
 * phone matches against its own copy (`calendarMatch.ts`), so the calendar
 * never leaves it (`docs/design/decisions/calendar-connection.md` #5).
 * Removing this before every tester is past build 4 would break their
 * briefing — the README's "backend first" rule, the other way round. Delete
 * it, with its tests, once build 4 is retired.
 *
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
        v.object({
          /**
           * The name as one of those people is filed under, not the folded
           * key it was matched by. `matchKey` lowercases for comparison and
           * `CLAUDE.md` is explicit that names are always *stored* as the user
           * wrote them — showing the key put "judy" on screen for somebody
           * filed as "Judy".
           */
          name: v.string(),
          count: v.number(),
        }),
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

    // Note counts and dates for whoever matches. Read once for all events.
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    return matchEventsIn(owned, notes, args.events);
  },
});
