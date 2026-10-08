import { getFunctionName } from "convex/server";

/**
 * Shared ways to stand in for Convex and for the confirmation dialog in
 * screen tests. Eight test files each wrote their own version of these
 * (REFACTOR.md → H); a change to how a screen asks Convex now has one place
 * to land.
 */

/**
 * The name Convex gives a function reference, for example "notes:byId".
 *
 * Mocks route by name, not by `===`: the generated `api` is a Proxy that makes
 * a fresh object on every property access, so `api.notes.byId` taken twice is
 * never the same reference, only the same name.
 */
export function nameOf(reference: unknown): string {
  return getFunctionName(reference as never);
}

/**
 * Answer a mocked Convex hook (`useQuery`, `useMutation`, `useAction`) by the
 * function it was called with.
 *
 * `answers` is keyed by function name. A key that is present answers with its
 * value, even `undefined` (a query still loading). Anything not listed gets
 * `otherwise()`, called fresh each time, so two unlisted calls never share
 * one `jest.fn`.
 *
 * Routing by name, rather than one blanket `mockReturnValue`, is what pins a
 * test to the function it means: `(app)/_layout.tsx` calls
 * `useMutation(api.users.ensureUser)` on every signed-in mount, and a blanket
 * mock would hand it the screen's own mutation.
 */
export function answerByName(
  hook: unknown,
  answers: Record<string, unknown>,
  otherwise: () => unknown = () => undefined,
): void {
  (hook as jest.Mock).mockImplementation((reference: unknown) => {
    const name = nameOf(reference);
    return Object.prototype.hasOwnProperty.call(answers, name)
      ? answers[name]
      : otherwise();
  });
}

/** A mutation or action nobody in the test is watching. */
export const quietCall = () => jest.fn(async () => undefined);

/**
 * Only the handlers that were given. Lets a helper take optional handlers
 * (`{ update?, remove? }`) and leave the missing ones to `otherwise`.
 */
export function given(
  handlers: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(handlers).filter(([, handler]) => handler !== undefined),
  );
}
