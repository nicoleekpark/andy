/// <reference types="vite/client" />
import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { appleClientSecret, appleConfig } from "./appleSignIn";
import schema from "./schema";

/**
 * Sign in with Apple token revocation (App Review 5.1.1(v)): the code is
 * exchanged for a refresh token at sign-in and revoked when the account is
 * deleted. Apple and Clerk are faked at `fetch`.
 */
const modules = import.meta.glob("./**/*.ts");
const ALICE = { subject: "alice", name: "Alice", email: "alice@example.com" };

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

/** Apple (and Clerk) answering every call with this. */
function servers(appleTokenBody: unknown = { refresh_token: "r-secret" }, appleStatus = 200) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
    url.includes("appleid.apple.com/auth/token")
      ? new Response(JSON.stringify(appleTokenBody), { status: appleStatus })
      : new Response("{}", { status: url.includes("/auth/revoke") ? appleStatus : 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function configured() {
  vi.stubEnv("APPLE_TEAM_ID", "TEAM123456");
  vi.stubEnv("APPLE_KEY_ID", "KEY1234567");
  vi.stubEnv("APPLE_PRIVATE_KEY", PEM.replace(/\n/g, "\\n"));
  vi.stubEnv("APPLE_CLIENT_ID", "com.houseofhuynh.andy");
}

async function signedIn() {
  const t = convexTest(schema, modules);
  await t.withIdentity(ALICE).mutation(api.users.ensureUser, {});
  return t;
}

async function keptTokens(t: Awaited<ReturnType<typeof signedIn>>) {
  return t.run(async (ctx) => ctx.db.query("appleTokens").collect());
}

beforeEach(() => {
  vi.stubEnv("APPLE_TEAM_ID", "");
  vi.stubEnv("APPLE_KEY_ID", "");
  vi.stubEnv("APPLE_PRIVATE_KEY", "");
  vi.stubEnv("APPLE_CLIENT_ID", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("should do nothing at all until it is configured", async () => {
  const fetchMock = servers();
  const t = await signedIn();

  expect(
    await t.withIdentity(ALICE).action(api.appleSignIn.rememberAppleSignIn, { authorizationCode: "c" }),
  ).toEqual({ kept: false });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(await keptTokens(t)).toEqual([]);
});

test("should exchange the code at once and keep only the refresh token, returning none of it", async () => {
  configured();
  const fetchMock = servers();
  const t = await signedIn();

  const result = await t
    .withIdentity(ALICE)
    .action(api.appleSignIn.rememberAppleSignIn, { authorizationCode: "one-time-code" });

  expect(result).toEqual({ kept: true });
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(url).toBe("https://appleid.apple.com/auth/token");
  const body = new URLSearchParams(String(init?.body));
  expect(body.get("grant_type")).toBe("authorization_code");
  expect(body.get("code")).toBe("one-time-code");
  expect(body.get("client_id")).toBe("com.houseofhuynh.andy");
  expect((await keptTokens(t)).map((row) => row.refreshToken)).toEqual(["r-secret"]);
});

test("should refuse someone signed out", async () => {
  configured();
  servers();
  const t = convexTest(schema, modules);

  await expect(
    t.action(api.appleSignIn.rememberAppleSignIn, { authorizationCode: "c" }),
  ).rejects.toThrow(/signed out/);
});

test("should not fail a sign-in when Apple refuses the code", async () => {
  configured();
  servers({ error: "invalid_grant" }, 400);
  const t = await signedIn();

  expect(
    await t.withIdentity(ALICE).action(api.appleSignIn.rememberAppleSignIn, { authorizationCode: "c" }),
  ).toEqual({ kept: false });
  expect(await keptTokens(t)).toEqual([]);
});

test("should sign the client secret the way Apple checks it (ES256, team, key, app)", () => {
  configured();
  const config = appleConfig()!;
  const jwt = appleClientSecret(config, 1_700_000_000_000);
  const [header, claims, signature] = jwt.split(".");

  expect(JSON.parse(Buffer.from(header!, "base64url").toString())).toEqual({ alg: "ES256", kid: "KEY1234567" });
  expect(JSON.parse(Buffer.from(claims!, "base64url").toString())).toEqual({
    iss: "TEAM123456",
    iat: 1_700_000_000,
    exp: 1_700_000_300,
    aud: "https://appleid.apple.com",
    sub: "com.houseofhuynh.andy",
  });
  const valid = verify(
    "sha256",
    Buffer.from(`${header}.${claims}`),
    { key: createPublicKey(publicKey.export({ type: "spki", format: "pem" })), dsaEncoding: "ieee-p1363" },
    Buffer.from(signature!, "base64url"),
  );
  expect(valid).toBe(true);
});

test("should revoke the kept token when the account is deleted, before the data goes", async () => {
  configured();
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_secret");
  const fetchMock = servers();
  const t = await signedIn();
  await t.withIdentity(ALICE).action(api.appleSignIn.rememberAppleSignIn, { authorizationCode: "c" });

  await t.withIdentity(ALICE).action(api.account.deleteMyAccount, {});

  const revoke = fetchMock.mock.calls.find(([url]) => url === "https://appleid.apple.com/auth/revoke");
  expect(revoke).toBeDefined();
  const body = new URLSearchParams(String(revoke![1]?.body));
  expect(body.get("token")).toBe("r-secret");
  expect(body.get("token_type_hint")).toBe("refresh_token");
  // And the token itself goes with the account.
  expect(await keptTokens(t)).toEqual([]);
});

test("should still delete the account when Apple cannot be reached", async () => {
  configured();
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_secret");
  const t = await signedIn();
  servers();
  await t.withIdentity(ALICE).action(api.appleSignIn.rememberAppleSignIn, { authorizationCode: "c" });
  // Apple down for the revoke; Clerk fine.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.includes("appleid.apple.com") ? new Response("", { status: 503 }) : new Response("{}", { status: 200 }),
    ),
  );

  await t.withIdentity(ALICE).action(api.account.deleteMyAccount, {});

  expect(await keptTokens(t)).toEqual([]);
  const users = await t.run(async (ctx) => ctx.db.query("users").collect());
  expect(users).toEqual([]);
});
