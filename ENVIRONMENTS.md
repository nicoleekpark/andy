# ENVIRONMENTS.md — where every key lives, and why

This file is the reference for which key goes where, what it is restricted to, and what to do when one leaks. It holds **names, places and reasons only — never a value.** The values live in the dashboards named below, and nowhere else.

Set up on 2026-10-01, for the designer and QA TestFlight hand-off. Its history is in `dev-reports/day-10.dev.md`, which is local and gitignored.

---

## 1. The environments

| | Local dev | QA (TestFlight), until launch | Launch (App Store) |
|---|---|---|---|
| **Who** | The developer, plus Claude Code on the simulator | Designer and QA, on their own iPhones | Real users |
| **App build** | Development client + Metro (`npm run dev`) | EAS `production` profile → TestFlight | EAS `production` profile → App Store |
| **Convex backend** | **Development**: `adept-hedgehog-824` | **Production**: `agile-dogfish-759` | **Production**: `agile-dogfish-759` |
| **Clerk instance** | Development (`pk_test` / `sk_test`) | Development (`pk_test` / `sk_test`) | **Production** (`pk_live` / `sk_live`). Not created yet; see §6 |
| **How backend code arrives** | Automatically, while `npm run dev` runs | Only when someone runs `npm run deploy:backend` | Same |

**Why QA uses the Production deployment (option b, decided 2026-10-01).**
- There are no real users before launch, so Production doubles as staging.
- QA data stays separate from the developer's own test data.
- QA's backend changes only when someone deploys on purpose, never mid-test.
- The cost: tester data must be cleared before launch, and Clerk switches to its Production instance (§6).
- Rejected alternatives:
  - testers sharing Development: their backend changes on every save
  - a separate staging Convex project: one more set of keys to keep in step

**Why "Development" and "Production" don't line up across services.** Convex's pair is two **backends**. Clerk's pair is two **sign-in systems**. Until launch, both Convex backends use the one Clerk Development instance.

---

## 2. Every key

**Secret?** means "would do damage if it leaked". A secret is only ever stored in a **Convex deployment's** environment variables.

| Name | What it does | Secret? | Read by (code) | Local dev | QA / Launch |
|---|---|---|---|---|---|
| `ANTHROPIC_API_KEY` | Claude Haiku 4.5: reading a note or card, Ask Andy's answer, follow-up drafts | **Yes** | `convex/claude.ts` (`askClaude`) | Convex Development | Convex Production: **its own key** (`andy-convex-prod`) |
| `OPENAI_API_KEY` | `text-embedding-3-large` vectors: indexing notes on save/edit, embedding a search question | **Yes** | `convex/embeddings.ts` | Convex Development | Convex Production: **its own key** (`andy-convex-prod`) |
| `CLERK_SECRET_KEY` | Removes the person's Clerk sign-in when they delete their account | **Yes** | `convex/account.ts` | Convex Development (`sk_test`) | Convex Production: `sk_test` until launch, `sk_live` after |
| `CLERK_JWT_ISSUER_DOMAIN` | Lets Convex verify a Clerk sign-in token | No | `convex/auth.config.ts` | Convex Development | Convex Production: the same URL until launch |
| `EXPO_PUBLIC_CONVEX_URL` | Which backend the app talks to | No, it's baked into the app | `src/app/_layout.tsx` | `.env.local` | EAS `preview` + `production` env: `https://agile-dogfish-759.convex.cloud` |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Which Clerk instance the app signs in to | No, public by design | `src/app/_layout.tsx` | `.env.local` | EAS `preview` + `production` env: `pk_test` until launch, `pk_live` after |
| `CONVEX_DEPLOYMENT` | Where `npx convex dev` pushes | No | Convex CLI | `.env.local` | — |

**Three Clerk values must come from the same Clerk instance:** the publishable key in the build, and the issuer and secret key on the backend that build talks to. If they don't match, sign-in fails ("You're signed out") or account deletion fails at its last step.

**What reaches each provider.** Voice is transcribed **on the iPhone**, so no audio is ever sent to either company.
- **Anthropic** receives:
  - note text
  - a business-card photo, when one is scanned
  - search questions together with up to 12 retrieved notes
  - a person's saved facts, for a follow-up draft

  It is always wrapped by `convex/promptBoundary.ts`.
- **OpenAI** receives:
  - a note's facts, or its text when it has no facts
  - search questions

---

## 3. Restrictions and spend limits, per provider

| Provider | Where the prod key lives | Restriction | Spend limit | Why |
|---|---|---|---|---|
| **Anthropic** | Workspace **`andy-prod`**; key `andy-convex-prod` | Scoped to its workspace; usable for nothing outside it | Monthly limit on the `andy-prod` workspace. **Recommended about $20/month during QA.** Record the actual figure: `$____` | Haiku is cheap, but a loop or abuse should hit a ceiling rather than a bill. The workspace keeps prod spend separate from development |
| **OpenAI** | Project **`andy`**; key `andy-convex-prod`, **owned by a service account** | **Restricted: Embeddings (`/v1/embeddings`) = Request; everything else None**, List models included | Monthly budget on the `andy` project. **Recommended $5–10.** Record the actual figure: `$____` | Andy only ever calls `/v1/embeddings` (`OPENAI_EMBEDDINGS_URL` in `convex/embeddings.ts`), so a leaked key can do nothing else. A service account isn't tied to a person's membership. Embeddings are cheap, so a low budget is enough |
| **Clerk** | Development instance (Configure → API keys) | Development instances allow at most 100 users and no custom domain | — (free tier) | Enough for QA. Production needs a domain and Sign in with Apple credentials (§6) |
| **Convex** | — (no key in the app) | Secrets exist only in deployment env vars | Free plan | — |
| **EAS** | `preview` / `production` env vars (plaintext) | Public values only: they end up inside the app anyway | Free plan: **15 iOS builds/month**, so batch fixes into one build | — |

**Not used: Anthropic workload identity federation.** It needs the calling server to present an identity token from its platform, and Convex functions have none. An API key, scoped and capped as above, is the option that works.

**Shared for now, worth splitting at launch:** OpenAI dev and prod keys share the `andy` project, so their usage and budget are combined. When launching, create an `andy-prod` project, move the prod key there, and replace one value in Convex Production.

**Development keys** were created before 2026-10-01. If either one has full ("All") permissions or no spend cap, give it the same restrictions as above: create a new key, save it to Convex Development, then revoke the old one.

---

## 4. Rules for handling a secret

1. **Enter values in the Convex dashboard**: dashboard.convex.dev → andy → choose the deployment (**check its name**) → Settings → Environment Variables. Not `npx convex env set NAME value`, which leaves the value in `~/.zsh_history`. (`env set` is fine for a non-secret, such as the issuer URL.)
2. **Never** put a secret in this chat or any chat, Slack, notes, screenshots, `.env.local`, `app.json`, `eas.json`, or anything named `EXPO_PUBLIC_*`. Anything `EXPO_PUBLIC_*` is compiled into the app and readable by anyone who has it.
3. **Copy it once, paste it once.** A provider shows a new key only once. Paste it straight into Convex; there's no need to keep a copy. If you must keep one, use a password manager only. Afterwards, copy something else to clear the clipboard.
4. **One key per environment.** Revoking one key never breaks the other environment, and spend stays traceable.
5. **To check, read names, not values:** `npx convex env list | sed 's/=.*//'` (add `--prod` for Production). A bare `npx convex env list` prints every value in full.
6. **This repo is public.** On 2026-10-01 the git history was searched for real key formats (`sk_test_…`, `sk_live_…`, `sk-ant-…`, `sk-proj-…`). There were none. Only the Clerk publishable key appears, which is public by design.

---

## 5. If a key leaks, rotate it

Order: **create the new key → save it in Convex → revoke the old one.** The app keeps working throughout.

| Key | Create a new one | Revoke the old one |
|---|---|---|
| Anthropic | console.anthropic.com → API keys → Create key (`andy-prod` workspace) | Same page, the old key → Delete/Disable |
| OpenAI | platform.openai.com → project `andy` → API keys → Create (service account, Restricted as in §3) | Same page → Revoke |
| Clerk secret | dashboard.clerk.com → Configure → API keys → roll the secret key | Rolling it invalidates the old one. **Update Convex Development and Production in the same sitting**, because both use the same key until launch |

Then check the provider's usage page for spend you don't recognise.

---

## 6. Before App Store launch

1. Create a **Clerk Production instance**. It needs Andy's own domain with DNS records, and Sign in with Apple using Andy's own Service ID and key.
2. Swap three values **together**:
   - Convex Production `CLERK_SECRET_KEY` → `sk_live_…`
   - Convex Production `CLERK_JWT_ISSUER_DOMAIN` → the Production instance's issuer
   - EAS `production` `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` → `pk_live_…`
3. Clear tester data from the Production deployment.
4. Optional: move the OpenAI prod key into its own `andy-prod` project (§3).
5. Run the `eas-release-checklist` skill and the `app-store-reviewer` subagent, as `CLAUDE.md` requires.

---

## 7. Checking that everything is in place

```bash
npx convex env list | sed 's/=.*//'          # Development: four names
npx convex env list --prod | sed 's/=.*//'   # Production: the same four names
npx eas-cli env:list --environment preview    # two EXPO_PUBLIC_ names, public values
npx eas-cli env:list --environment production
```

Expected on each Convex deployment: `ANTHROPIC_API_KEY`, `CLERK_JWT_ISSUER_DOMAIN`, `CLERK_SECRET_KEY`, `OPENAI_API_KEY`. And `.env.local` holds no `CLERK_SECRET_KEY` line.
