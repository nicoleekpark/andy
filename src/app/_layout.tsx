import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { Stack } from "expo-router";

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

// Module scope on purpose: building the client inside the component would
// reconnect to Convex on every render.
const convex = new ConvexReactClient(convexUrl);

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
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <Stack>
          <Stack.Screen name="(app)" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
