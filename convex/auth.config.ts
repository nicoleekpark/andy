/**
 * Clerk ↔ Convex JWT verification.
 *
 * Without this file `ctx.auth.getUserIdentity()` returns null on every call,
 * and every `by_user` filter would then quietly match zero rows instead of
 * failing — so a missing issuer must be loud, not silent.
 *
 * `domain` is the Clerk instance's issuer URL; `applicationID` must match the
 * `aud` claim of Clerk's "convex" JWT template. Read from the deployment's env
 * so dev and production can point at different Clerk instances without a code
 * change: `npx convex env set CLERK_JWT_ISSUER_DOMAIN https://...`
 */
// Convex's default runtime is V8, not Node, so convex/tsconfig.json deliberately
// has no Node types. Declaring just the one thing we use keeps it that way —
// pulling in @types/node would make fs/path/Buffer look available to every
// Convex function here and fail only at runtime.
declare const process: { env: Record<string, string | undefined> };

const issuerDomain = process.env.CLERK_JWT_ISSUER_DOMAIN;

if (!issuerDomain) {
  throw new Error(
    "CLERK_JWT_ISSUER_DOMAIN is not set on this Convex deployment. " +
      "Set it to the Clerk instance's issuer URL: " +
      "npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<instance>.clerk.accounts.dev",
  );
}

// A typo'd value passes the check above but fails only later, per request, as
// `getUserIdentity()` returning null — the silent failure this file exists to
// prevent. Convex fetches {domain}/.well-known/openid-configuration, so a value
// that isn't an https origin cannot possibly work.
if (!issuerDomain.startsWith("https://")) {
  throw new Error(
    `CLERK_JWT_ISSUER_DOMAIN must be an https URL, got: ${issuerDomain}`,
  );
}

export default {
  providers: [
    {
      domain: issuerDomain,
      applicationID: "convex",
    },
  ],
};
