import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { Stack } from "expo-router";

// Missing config would otherwise surface much later as "signed out forever" or
// as queries that never resolve, so fail at startup instead.
const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;

if (!publishableKey) {
  throw new Error("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is missing from .env.local");
}
if (!convexUrl) {
  throw new Error("EXPO_PUBLIC_CONVEX_URL is missing from .env.local");
}

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
 * Auth gating lands in the next slice: an (auth) group beside (app), and a
 * redirect between them.
 */
export default function RootLayout() {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <Stack>
          <Stack.Screen name="(app)" options={{ headerShown: false }} />
        </Stack>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
