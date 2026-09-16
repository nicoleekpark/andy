import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalQuery } from "./_generated/server";
import { embedQuery } from "./embeddings";
import { MAX_ANSWER_NOTES, MAX_QUESTION_CHARS } from "./answerPrompt";
import { getAuthenticatedUser } from "./users";

/**
 * Recall — finding a note by what it was about, not by what it was called.
 *
 * `CLAUDE.md` names two places ownership leaks in this codebase, and this file
 * is the second one: **vector search hydration**. It is worth being precise
 * about why, because the shape of the danger is unusual.
 *
 * `ctx.vectorSearch` runs only in an action, and actions have no `ctx.db`. So a
 * search returns `{_id, _score}` and nothing else, and the ids have to be turned
 * back into documents somewhere that *does* have a database. That handoff is the
 * join: on one side a list of bare ids produced by a similarity computation, on
 * the other a query that will happily fetch any row it is given.
 *
 * The vector index carries `filterFields: ["userId"]`, and it would be easy to
 * read that as the check. It is not — it is an optimisation, the same way
 * `by_user_and_profile_and_createdAt` is. The authorization boundary is here,
 * in `hydrate`, which derives the caller from `ctx.auth` itself and refuses to
 * accept an id for who is asking. There is no argument through which one user
 * could be hydrated as another.
 */

/**
 * How many notes come back from the index.
 *
 * Generous on purpose. These are candidates, not answers: the screen groups
 * them by person and the answer step reads them, and both do better with a few
 * near-misses than with a short list that dropped the right note at rank 9.
 */
const SEARCH_LIMIT = 12;

/**
 * The floor, and why it is this low.
 *
 * Measured against the real notes on 2026-09-10. A correct cross-lingual match —
 * an English query finding a Korean note — scored **0.388**. A query with no
 * real answer in the data at all ("my dentist appointment on Thursday") scored
 * **0.324**. Those bands overlap, so no cutoff drawn between them separates
 * relevant from irrelevant; it would only choose which mistake to make, and
 * dropping real Korean matches is the worse one.
 *
 * What the score *can* do is recognise noise. "What is the capital of France"
 * topped out at **0.115**, far below anything real. So this sits just above that
 * and does one job: stop a question this app has no business answering from
 * producing a page of confident citations.
 *
 * Deciding actual relevance is left to the step that can read the notes.
 */
const MIN_SCORE = 0.15;

// The question's length ceiling is owned by `answerPrompt.ts`: the same string
// is the thing being embedded and the thing being answered, and two ceilings
// would let one path accept what the other refuses.


const resultValidator = v.object({
  noteId: v.id("notes"),
  score: v.number(),
  text: v.string(),
  keyFacts: v.optional(v.array(v.string())),
  createdAt: v.number(),
  source: v.union(
    v.literal("voice"),
    v.literal("manual"),
    v.literal("business_card"),
    v.literal("calendar_nudge"),
  ),
  // Who the note is about. Always present: a note cannot exist without one.
  profile: v.object({
    profileId: v.id("profiles"),
    name: v.string(),
    entityType: v.union(v.literal("person"), v.literal("animal")),
    relationshipContext: v.optional(v.string()),
  }),
  // Whether the written answer above actually drew on this note. Not decoration:
  // `PROJECT_SCOPE.md` asks the answer to "show the notes it used", and a list
  // of everything retrieved would show the notes it *might* have used, which is
  // a different and weaker claim.
  used: v.boolean(),
  // Who else came up in it. This is what makes a mention-only person findable:
  // "the software developer I met at Amy's birthday" matches Amy's note, and
  // the developer is standing right here in its mentions.
  mentions: v.array(
    v.object({
      // Null once the person is gone, rather than an id that opens nothing.
      // Two reasons, and the second is the one that bites: a dead mention with
      // an id invites a screen to make it tappable, which is exactly the bug
      // day 3 shipped and had to fix. And in the case this file guards against —
      // a link pointing at somebody else's row — an id here would be a foreign
      // document id handed to a caller who may not read it.
      profileId: v.union(v.id("profiles"), v.null()),
      name: v.string(),
      quote: v.string(),
      exists: v.boolean(),
    }),
  ),
});

/** One hydrated hit, named so the action can break its own inference cycle. */
type Result = Infer<typeof resultValidator>;

/**
 * The caller's own `users` row id, for the vector index filter.
 *
 * An action cannot call `getAuthenticatedUser` — that helper needs `ctx.db`, and
 * actions have none. It also cannot be handed the id by the client, which is the
 * whole point. So it asks, through a query, and the identity travels with the
 * call rather than in an argument.
 */
export const callerUserId = internalQuery({
  args: {},
  returns: v.id("users"),
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    return user._id;
  },
});

/**
 * Turn similarity hits back into notes the caller is allowed to read.
 *
 * Takes no `userId`. It derives the caller itself, so the only way to hydrate
 * as somebody is to be signed in as them — an argument would have to be trusted,
 * and this is the one place in the codebase where the ids being fetched did not
 * come from a query already scoped to an owner.
 *
 * Every join is re-checked, not just the note: the note's own owner, the subject
 * profile's owner, and each mentioned profile's owner. Convex has no referential
 * integrity, so a `profileId` on a note is a claim rather than a guarantee, and
 * a bug elsewhere that ever wrote a foreign id would otherwise become a
 * cross-account read here rather than a broken link.
 *
 * A hit that fails any of those checks is dropped silently rather than raising.
 * A search is not the place to tell somebody that a note they cannot see exists.
 *
 * **Never reach this from `ctx.scheduler`.** Convex propagates auth into a query
 * called from an action, which is what makes deriving the caller here work at
 * all — but it explicitly does *not* propagate auth into a scheduled function.
 * A scheduled caller would arrive with no identity and `getAuthenticatedUser`
 * would throw, which is the safe direction, but the reason is worth writing
 * down before the calendar briefing goes looking for a way to reuse this.
 */
export const hydrate = internalQuery({
  args: {
    hits: v.array(v.object({ noteId: v.id("notes"), score: v.number() })),
  },
  returns: v.array(resultValidator),
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    // Profiles are re-read per hit, so cache them: several notes about the same
    // person is the common case, not the exception.
    const profileCache = new Map<Id<"profiles">, Doc<"profiles"> | null>();
    const ownedProfile = async (profileId: Id<"profiles">) => {
      const cached = profileCache.get(profileId);
      if (cached !== undefined) return cached;
      const profile = await ctx.db.get("profiles", profileId);
      const owned =
        profile !== null && profile.userId === user._id ? profile : null;
      profileCache.set(profileId, owned);
      return owned;
    };

    const results = [];
    // Whatever order these arrived in is the ranking — the action sorted them.
    // Rebuilding the list preserves it rather than re-sorting.
    for (const hit of args.hits) {
      const note = await ctx.db.get("notes", hit.noteId);
      if (note === null || note.userId !== user._id) continue;

      const profile = await ownedProfile(note.profileId);
      // A note whose subject cannot be resolved has nothing to be tapped
      // through to, so it is not a result. This should be unreachable — deleting
      // a profile deletes its notes — and is here because "should be" is not a
      // check.
      if (profile === null) continue;

      const links = await ctx.db
        .query("noteMentions")
        .withIndex("by_user_and_note", (q) =>
          q.eq("userId", user._id).eq("noteId", note._id),
        )
        .collect();

      const mentions = [];
      for (const link of links) {
        const mentioned = await ownedProfile(link.profileId);
        mentions.push({
          profileId: mentioned === null ? null : mentioned._id,
          // The live name while the person exists, so a rename shows everywhere;
          // the name as recorded once they are gone, because deleting somebody
          // must not rewrite the notes of everyone who mentioned them.
          name: mentioned?.name ?? link.name,
          quote: link.quote,
          exists: mentioned !== null,
        });
      }

      results.push({
        noteId: note._id,
        score: hit.score,
        // Filled in by the action once the answer says so. Hydration has no
        // opinion about it and no way to form one.
        used: false,
        text: note.text,
        keyFacts: note.keyFacts,
        createdAt: note.createdAt,
        source: note.source,
        profile: {
          profileId: profile._id,
          name: profile.name,
          entityType: profile.entityType,
          relationshipContext: profile.relationshipContext,
        },
        mentions,
      });
    }

    return results;
  },
});

/**
 * Ask in your own words; get back the notes that answer it.
 *
 * An action rather than a query, because `ctx.vectorSearch` is action-only and
 * the question has to be embedded over the network first. The consequence is
 * that the screen cannot subscribe to this — which is the right shape anyway. A
 * search is a question asked once, not a view that should quietly change under
 * the reader while they are looking at it.
 */
export const recall = action({
  args: { query: v.string() },
  returns: v.object({
    query: v.string(),
    // Empty string when nothing was retrieved at all — there is nothing to
    // write an answer over, and paying Claude to say so would be spending money
    // to reach a conclusion already in hand.
    answer: v.string(),
    results: v.array(resultValidator),
  }),
  // Annotated, not inferred. This handler reaches its own module through
  // `internal`, whose type is `typeof search` — so inferring this type needs
  // this type. TypeScript reports that as everything nearby going `any`.
  handler: async (
    ctx,
    args,
  ): Promise<{ query: string; answer: string; results: Result[] }> => {
    const query = args.query.trim();
    if (query === "") {
      throw new ConvexError("Ask Andy something first.");
    }
    // This is embedded, so its cost is a network call on somebody else's meter.
    // A question is a sentence; anything past this is a paste.
    if (query.length > MAX_QUESTION_CHARS) {
      throw new ConvexError("That's a long question. Try a shorter one.");
    }

    // Before the embedding call, so a signed-out caller cannot spend money.
    // Same ordering, and the same reason, as `extraction.ts`.
    const userId: Id<"users"> = await ctx.runQuery(
      internal.search.callerUserId,
      {},
    );

    const vector = await embedQuery(query);

    const hits = await ctx.vectorSearch("notes", "by_embedding", {
      vector,
      limit: SEARCH_LIMIT,
      // The first cut, not the check. `hydrate` re-derives the caller and
      // verifies every document it returns.
      filter: (q) => q.eq("userId", userId),
    });

    const relevant = hits
      .filter((hit) => hit._score >= MIN_SCORE)
      // Sorted here rather than trusted. Convex documents that `vectorSearch`
      // returns `{_id, _score}` pairs; it does not document that they arrive in
      // score order on the real backend, and `convex-test` has already been
      // caught twice today behaving differently from the deployment — vector
      // length, and this. Ranking is the whole product, so it is made true by
      // construction instead of assumed.
      .sort((a, b) => b._score - a._score)
      // Bounded before it crosses into a transaction. `vectorSearch` already
      // caps at `SEARCH_LIMIT`; this says so at the boundary rather than
      // relying on the call above staying that way.
      .slice(0, SEARCH_LIMIT)
      .map((hit) => ({ noteId: hit._id, score: hit._score }));

    const results: Result[] = await ctx.runQuery(internal.search.hydrate, {
      hits: relevant,
    });

    if (results.length === 0) {
      return { query, answer: "", results };
    }

    // The model is shown exactly the notes the screen will show, indexed by
    // position, so a citation always points at something the reader can tap.
    // Recall is the Must-have; the written answer is what sits on top of it. So
    // a Claude outage must not take the search down with it — the caller's own
    // notes were already found, and handing back nothing because a third party
    // is rate-limiting us would fail the important half for the sake of the
    // optional one. The empty answer is the signal: the screen shows results
    // with no answer block above them.
    let answer: { answer: string; usedNotes: number[] };
    try {
      answer = await ctx.runAction(internal.answer.write, {
        question: query,
        notes: results.slice(0, MAX_ANSWER_NOTES).map((result, index) => ({
          index,
          aboutName: result.profile.name,
          createdAt: new Date(result.createdAt).toISOString().slice(0, 10),
          keyFacts: result.keyFacts,
          text: result.text,
        })),
      });
    } catch (error) {
      console.error("Ask Andy could not write an answer:", error);
      return { query, answer: "", results };
    }

    const used = new Set(answer.usedNotes);
    return {
      query,
      answer: answer.answer,
      results: results.map((result, index) => ({
        ...result,
        used: used.has(index),
      })),
    };
  },
});
