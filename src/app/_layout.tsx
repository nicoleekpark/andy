import { useCallback, useEffect, useState } from "react";
import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { Stack } from "expo-router";
import { RetryConnectionContext } from "@/components/connecting";

/**
 * Missing config would otherwise surface much later as "signed out forever" or as
 * queries that never resolve, so fail at startup instead.
 *
 * Returns `string` rather than narrowing at the call site: a module-scope `const`
 * narrowed by an `if` doesn't stay narrowed inside the component closure below.
 * The `process.env.X` reference has to stay written out in full — Metro inlines
 * EXPO_PUBLIC_* by literal text substitution, so a computed lookup would come back
 * undefined in a real build.
 */
function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is missing from .env.local`);
  }
  return value;
}

const publishableKey = requireEnv(
  "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
);
const convexUrl = requireEnv(
  "EXPO_PUBLIC_CONVEX_URL",
  process.env.EXPO_PUBLIC_CONVEX_URL,
);

/**
 * One Convex client, alive for exactly as long as one signed-in identity.
 *
 * Convex caches query results under `serializePathAndArgs(path, args)` — the key
 * says which function and which arguments, and **nothing about who asked**
 * (convex/dist/esm/browser/sync/local_state.js). Signing out does not clear that
 * cache either: `clearAuth()` tells the server, it does not empty the client. And
 * `useQuery` reads the cache synchronously on its first render. So one long-lived
 * client would paint the previous account's rows for the next person to sign in,
 * before any request goes out. A server-side ownership filter cannot help: the
 * client is replaying its own memory.
 *
 * Convex documents no way to empty that cache, so the cache is replaced along
 * with the client that owns it. The client is created here rather than at module
 * scope so that a remount produces a genuinely new one — and closed on unmount,
 * so the old socket does not linger.
 *
 * Everything that reads user data has to sit *inside* this boundary, and must
 * not keep its own copy anywhere that survives the remount — a module-scope
 * cache, or a ref holding rows across identity change, would reopen exactly the
 * hole this closes while looking like it had nothing to do with Convex.
 *
 * NOTE: this is not the `key={sessionId}` workaround that circulates on GitHub.
 * That one keys the *provider* while reusing a single client, which re-sends the
 * token but leaves the cache exactly where it was. What makes this work is that
 * the keyed component owns the client: a new mount means a new cache.
 */
function ConvexSession({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new ConvexReactClient(convexUrl));

  useEffect(() => {
    return () => {
      // Deferred by a tick on purpose. React runs a deleted subtree's effect
      // cleanups parent-first, and this component is the parent of Convex's own
      // auth provider — whose cleanup calls `client.clearAuth()`, which reads
      // `client.sync` and throws "ConvexReactClient has already been closed."
      // if we closed it a moment earlier. Letting the children finish tearing
      // down first is the difference between a clean sign-out and a red screen.
      const closing = client;
      setTimeout(() => {
        void closing.close();
      }, 0);
    };
  }, [client]);

  return (
    <ConvexProviderWithClerk client={client} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}

/**
 * Keyed on the Clerk user id, so signing in as someone else tears the session
 * down and builds a fresh one. Signing out keys on a constant, which is still a
 * change of key and so still discards the cache — the point is that no two
 * identities ever share a client.
 *
 * Deliberately the user id and not the session id: re-authenticating as the same
 * person issues a new session, and throwing away their cache for that would cost
 * a reconnect and a blank screen to protect them from their own data.
 */
function ConvexScopedToIdentity({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();

  /**
   * The "Try again" on the connecting screen, wired to the only thing that can
   * actually help.
   *
   * Convex is already retrying its socket on its own, so a button that merely
   * restarted a timer would be decoration. What is not retried is everything
   * built once per client — the connection and the Clerk token fetch behind it
   * — and the way to redo that is the same remount this key already performs
   * for identity changes. Counting attempts reuses that machinery rather than
   * inventing a second one, and costs the query cache, which is exactly what a
   * caller who has reached this screen has none of.
   *
   * It cannot substitute for one identity's key: the attempt is appended to the
   * user id rather than replacing it, so no retry can ever land two identities
   * on the same client.
   */
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return (
    <RetryConnectionContext.Provider value={retry}>
      <ConvexSession key={`${userId ?? "signed-out"}:${attempt}`}>
        {children}
      </ConvexSession>
    </RetryConnectionContext.Provider>
  );
}

/**
 * ConvexProviderWithClerk is a thin wrapper over ConvexProviderWithAuth — it
 * adapts Clerk's useAuth into the shape Convex expects and requests the "convex"
 * JWT template, whose `aud` claim matches convex/auth.config.ts's applicationID.
 *
 * Clerk wraps Convex, not the other way round: Convex needs Clerk's session to
 * already be readable when it asks for a token.
 *
 * The two groups gate each other: (app) redirects a signed-out caller to
 * sign-in, (auth) redirects a signed-in one back. Both decide on Convex's auth
 * state, not Clerk's — see (app)/_layout.tsx.
 */
export default function RootLayout() {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ConvexScopedToIdentity>
        <Stack>
          <Stack.Screen name="(app)" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack>
      </ConvexScopedToIdentity>
    </ClerkProvider>
  );
}
