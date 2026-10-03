import { ConvexError } from "convex/values";

/**
 * What to show a person when something failed: the server's own words if it
 * wrote them for a person, otherwise `fallback`.
 *
 * A `ConvexError` carries its sentence in `data`. Its `message` is transport
 * text, and showing it was the bug (REFACTOR.md → K). Measured against the
 * deployments on 2026-10-02:
 * - dev: "[Request ID: …] Server Error\nUncaught ConvexError: You're signed
 *   out…\n    at getAuthenticatedUser (../../convex/users.ts:21:15)…"
 * - prod: "[Request ID: …] Server Error". The sentence is gone entirely.
 *
 * So `e.message` is never shown, for any kind of error. A validator failure
 * dumps the arguments it was given, and a dropped connection says
 * "fetch failed". Neither was written for a person.
 */
export function userMessage(error: unknown, fallback: string): string {
  if (
    error instanceof ConvexError &&
    typeof error.data === "string" &&
    error.data.trim() !== ""
  ) {
    return error.data;
  }
  return fallback;
}
