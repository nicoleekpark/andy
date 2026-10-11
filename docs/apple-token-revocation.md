# Sign in with Apple — revoking tokens on account deletion

Apple requires an app that offers Sign in with Apple to **revoke the person's
Apple tokens when they delete their account** (App Review Guideline 5.1.1(v);
technote TN3194, Oct 2025). Clerk deletes its own user but does not do this,
and its native Apple hook does not give the app the authorization code it
would need (researched 2026-10-11).

## What is built (server)

- `convex/appleSignIn.ts`
  - `rememberAppleSignIn({ authorizationCode })` — exchanges Apple's one-time
    code (valid 5 minutes) at `appleid.apple.com/auth/token` for a refresh
    token.
  - `revokeForCurrentUser` — called by `account.deleteMyAccount` **before**
    the data is deleted; posts the refresh token to `/auth/revoke`. Apple
    being down never blocks a deletion.
- `appleTokens` table — the refresh token only, read and written by internal
  functions, never returned to the app, deleted with the account.
- **Inert until configured:** without all four variables below nothing is
  exchanged or revoked, and sign-in and deletion behave as before.

## What you set up (once)

1. developer.apple.com → Certificates, IDs & Profiles → **Keys** → **+**.
   Name it (e.g. "Andy Sign in with Apple"), tick **Sign in with Apple**,
   **Configure** → primary App ID **`com.houseofhuynh.andy`** → Save →
   Continue → Register.
2. **Download** the `.p8` file — Apple lets you do this only once. Keep it
   out of the repo.
3. Note the **Key ID** (on the key's page) and your **Team ID** (Membership
   details, top right of the developer site).
4. Set the four variables on **both** deployments (dev, then `--prod`):

   ```sh
   npx convex env set APPLE_TEAM_ID <TEAM_ID>
   npx convex env set APPLE_KEY_ID <KEY_ID>
   npx convex env set APPLE_CLIENT_ID com.houseofhuynh.andy
   npx convex env set APPLE_PRIVATE_KEY "$(awk '{printf "%s\\n", $0}' AuthKey_<KEY_ID>.p8)"
   ```

   The last line stores the key on one line with literal `\n`s, which the
   code turns back into line breaks. Repeat each with `--prod` before the
   build that uses it (README → "backend first").

## What is not built yet (app)

The app does not send the authorization code yet. That needs device testing,
because the sign-in flow has to change:

1. **At sign-in:** get Apple's `authorizationCode` and call
   `rememberAppleSignIn` right away. `useSignInWithApple` from `@clerk/expo`
   does not expose it, so the native sheet must be called directly
   (`expo-apple-authentication`'s `signInAsync`) and its identity token handed
   to Clerk. Check first that this does not show the Apple sheet twice.
2. **People who signed in before this ships** have no kept token. On
   **Delete account**, if nothing is kept, ask them to confirm with Apple
   once (a fresh code), exchange and revoke in one pass.

Both go through `security-reviewer` and `app-store-reviewer`.
