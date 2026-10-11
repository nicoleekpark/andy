"use node";

import { createPrivateKey, sign } from "node:crypto";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";

/**
 * Sign in with Apple's tokens, so deleting an account can revoke them.
 *
 * Apple requires an app that offers Sign in with Apple to revoke the person's
 * tokens when they delete their account (App Review 5.1.1(v); TN3194). Clerk
 * does not, and its native Apple hook does not hand the app the authorization
 * code it would need — researched 2026-10-11, see `dev-reports`. So:
 * 1. at sign-in the app sends Apple's one-time authorization code here, and it
 *    is exchanged at once (it expires in five minutes) for a refresh token,
 *    kept in `appleTokens`;
 * 2. `deleteMyAccount` revokes that token before the data goes.
 *
 * **Inert until configured.** Without all four `APPLE_*` variables nothing is
 * exchanged and nothing revoked — the sign-in and the deletion work as before.
 * Setting them up: `docs/apple-token-revocation.md`.
 *
 * `"use node"` for `node:crypto`'s ES256 signing, so this file exports actions
 * only; the table is reached through `appleTokens.ts`.
 */

const APPLE = "https://appleid.apple.com";

/** Apple's authorization codes are short; anything longer is not one. */
const MAX_CODE_CHARS = 512;

type AppleConfig = { teamId: string; keyId: string; privateKey: string; clientId: string };

/** All four, or null — never a half-configured exchange. */
export function appleConfig(env: NodeJS.ProcessEnv = process.env): AppleConfig | null {
  const teamId = env.APPLE_TEAM_ID;
  const keyId = env.APPLE_KEY_ID;
  const privateKey = env.APPLE_PRIVATE_KEY;
  const clientId = env.APPLE_CLIENT_ID;
  if (!teamId || !keyId || !privateKey || !clientId) return null;
  // Convex env values are single-line; a pasted .p8 may carry literal "\n".
  return { teamId, keyId, privateKey: privateKey.replace(/\\n/g, "\n"), clientId };
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/**
 * The `client_secret` Apple's REST API asks for: a JWT signed ES256 with the
 * Sign in with Apple key. Short-lived (5 minutes) — it is made per call.
 */
export function appleClientSecret(config: AppleConfig, now = Date.now()): string {
  const header = { alg: "ES256", kid: config.keyId };
  const issuedAt = Math.floor(now / 1000);
  const claims = {
    iss: config.teamId,
    iat: issuedAt,
    exp: issuedAt + 300,
    aud: APPLE,
    sub: config.clientId,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signature = sign("sha256", Buffer.from(unsigned), {
    key: createPrivateKey(config.privateKey),
    dsaEncoding: "ieee-p1363",
  });
  return `${unsigned}.${base64url(signature)}`;
}

/**
 * Called by the app right after a Sign in with Apple, with Apple's
 * authorization code. Keeps the refresh token for this person; returns only
 * whether one was kept. Never throws at the person over Apple's side: a
 * sign-in must not fail because this did.
 */
export const rememberAppleSignIn = action({
  args: { authorizationCode: v.string() },
  returns: v.object({ kept: v.boolean() }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new ConvexError("You're signed out. Sign in to continue.");
    }
    const config = appleConfig();
    if (config === null) return { kept: false };
    const code = args.authorizationCode.trim();
    if (code === "" || code.length > MAX_CODE_CHARS) return { kept: false };

    try {
      const response = await fetch(`${APPLE}/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: appleClientSecret(config),
          code,
          grant_type: "authorization_code",
        }).toString(),
      });
      if (!response.ok) {
        console.error(`Apple token exchange failed: ${response.status}`);
        return { kept: false };
      }
      const body = (await response.json()) as { refresh_token?: unknown };
      if (typeof body.refresh_token !== "string" || body.refresh_token === "") {
        return { kept: false };
      }
      await ctx.runMutation(internal.appleTokens.keep, { refreshToken: body.refresh_token });
      return { kept: true };
    } catch (thrown) {
      // Never the token or the code in a log line — only that it failed.
      console.error("Apple token exchange failed", thrown instanceof Error ? thrown.name : "");
      return { kept: false };
    }
  },
});

/**
 * Revoke the signed-in person's Sign in with Apple token, if one is kept.
 * Called by `account.deleteMyAccount` before the data goes. Reports rather
 * than throws: Apple being unreachable must not block someone leaving.
 */
export const revokeForCurrentUser = internalAction({
  args: {},
  returns: v.object({ revoked: v.boolean() }),
  handler: async (ctx) => {
    const config = appleConfig();
    if (config === null) return { revoked: false };
    const token: string | null = await ctx.runQuery(internal.appleTokens.forCurrentUser, {});
    if (token === null) return { revoked: false };

    try {
      const response = await fetch(`${APPLE}/auth/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: appleClientSecret(config),
          token,
          token_type_hint: "refresh_token",
        }).toString(),
      });
      if (!response.ok) {
        console.error(`Apple token revocation failed: ${response.status}`);
        return { revoked: false };
      }
      return { revoked: true };
    } catch (thrown) {
      console.error("Apple token revocation failed", thrown instanceof Error ? thrown.name : "");
      return { revoked: false };
    }
  },
});
