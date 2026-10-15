import type { TestConvex } from "convex-test";
import type schema from "../convex/schema";
import { AI_PERMISSION_FLAG } from "../convex/aiPermission";

/**
 * Switch the AI go-ahead off for one test deployment, as production runs it
 * until build 6 (`convex/aiPermission.ts`). For suites about something else —
 * extraction, search, follow-ups — whose callers are not the point. The
 * go-ahead itself is tested, switch on, in `convex/aiPermission.test.ts`.
 */
export async function aiNotEnforced<T extends TestConvex<typeof schema>>(t: T): Promise<T> {
  await t.run(async (ctx) => {
    await ctx.db.insert("featureFlags", { key: AI_PERMISSION_FLAG, enabled: false });
  });
  return t;
}
