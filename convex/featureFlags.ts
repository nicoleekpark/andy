import { v } from "convex/values";
import { query } from "./_generated/server";

/**
 * More rows than this is not a kill switch any more, it is a configuration
 * system, and INFRA.md #6 says to revisit the design before that point.
 */
const MAX_FLAGS = 100;

/**
 * The features switched off right now, by key — the remote kill switch
 * (INFRA.md #6). Turning one off is inserting `{ key, enabled: false, note }`
 * in the Convex dashboard; the app hears it live, without an update.
 *
 * Returns only the keys that are off, because a missing row means on: a typo
 * in the dashboard, or a key the app has never heard of, can then only fail
 * to switch something off — never switch off something nobody meant to.
 *
 * Signed in only. The rows say nothing about anyone, but nothing signed out
 * has a use for them either.
 */
export const switchedOff = query({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return [];
    const flags = await ctx.db.query("featureFlags").take(MAX_FLAGS);
    return flags.filter((flag) => !flag.enabled).map((flag) => flag.key);
  },
});
