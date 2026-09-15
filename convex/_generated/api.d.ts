/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as answer from "../answer.js";
import type * as answerPrompt from "../answerPrompt.js";
import type * as claude from "../claude.js";
import type * as cleanup from "../cleanup.js";
import type * as embeddingModel from "../embeddingModel.js";
import type * as embeddings from "../embeddings.js";
import type * as extraction from "../extraction.js";
import type * as extractionPrompt from "../extractionPrompt.js";
import type * as naming from "../naming.js";
import type * as notes from "../notes.js";
import type * as profiles from "../profiles.js";
import type * as search from "../search.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  answer: typeof answer;
  answerPrompt: typeof answerPrompt;
  claude: typeof claude;
  cleanup: typeof cleanup;
  embeddingModel: typeof embeddingModel;
  embeddings: typeof embeddings;
  extraction: typeof extraction;
  extractionPrompt: typeof extractionPrompt;
  naming: typeof naming;
  notes: typeof notes;
  profiles: typeof profiles;
  search: typeof search;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
