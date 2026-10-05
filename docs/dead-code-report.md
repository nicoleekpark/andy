# Dead code report — 2026-10-02

REFACTOR.md → **G**. A report only: **nothing has been deleted.** Each row needs a decision first.

**How it was made.**
- Ran `npx knip@5 --reporter compact` on `main` at `ed28302`.
- Checked every finding by hand: searched the code, checked `app.json` and `npm ls` for who depends on it.
- knip doesn't understand Expo config plugins, CLI tools started from scripts, or Convex schema, so several of its findings are false. They are marked as such below.

To rerun: `npx knip@5 --reporter compact`.

---

## 1. Packages nobody uses — removed (2)

Leftovers from the `create-expo-app` template. Nothing in `src/`, `convex/`, `__tests__/` or `app.json` imports them, and no other package depends on them.

| Package | What it is |
|---|---|
| `expo-device` | Device information |
| `expo-status-bar` | Status bar control. Nothing sets the status bar, so the system default ships either way |

**Decided 2026-10-04: removed** in the PR "remove expo-device and expo-status-bar", going into the next build.

## 2. Looks unused, but needed — keep (4)

knip calls these unused because the app's own code doesn't import them. Checked with each package's `package.json`, which is what decides:

| Package | Who needs it |
|---|---|
| `@expo/ui` | `expo-router` (a dependency) |
| `expo-glass-effect` | `expo-router` (a dependency) |
| `expo-symbols` | `expo-router` (a dependency) |
| `react-native-worklets` | `react-native-reanimated`, which `expo-router`'s drawer needs |

Removing any of them from `package.json` would not remove it: the router would still install it. It would only lose the declaration that keeps its version pinned to the SDK, the same reason `expo-file-system` was declared (§4).

## 3. False positives — no action (5)

| Finding | Why it's fine |
|---|---|
| `expo-mcp` (dev) "unused" | Started by `npm run dev:mcp` through an environment variable, not an import |
| `eas` "unlisted binary" | The EAS CLI runs through `npx eas-cli` / global install. It isn't a project dependency |
| `vite` "unlisted" in every `convex/*.test.ts` | Only a type reference (`vite/client`, for `import.meta.glob`). `vitest` brings vite with it |
| `expo-modules-core` "unlisted" | Comes with `expo`. Andy only reads one helper from it (`src/lib/native.ts`) |
| `expo-updates` "unlisted" in `app.json` | Andy doesn't use EAS Update; `app.json` has no `updates` block. Knip's Expo plugin assumes it |

## 4. Imported but not declared — recommend adding (1)

| Package | Where it's used | Why add it |
|---|---|---|
| `expo-file-system` | `src/app/(app)/profile/[id]/index.tsx`, and its test | It works today only because `expo` installs it for itself. Declaring it with `npx expo install expo-file-system` pins it to the SDK's version, so an `expo` upgrade can't quietly move it |

## 5. Exported but used only in their own file (6) — recommend un-exporting

| Name | File |
|---|---|
| `useRetryConnection` | `src/components/connecting.tsx` |
| `NAME_MARK_PATH` | `src/components/name-mark.tsx` |
| `LAUNCH_THREAD_WIDTH` | `src/components/thread-loop.tsx` |
| `DRAW_MS`, `HOLD_MS`, `offsetAt` | `src/lib/use-thread-motion.ts` |

An `export` invites another file to depend on it. Removing the keyword is a one-word change each, with no behaviour change. Low value, so do it if a file is being touched anyway.

The 8 unused exported **types** (`BriefingState`, `LockState` and others) are harmless and document each module's shape. **Leave them.**

## 6. Backend leftovers (knip can't see these)

| Item | State | Recommendation |
|---|---|---|
| `profiles.search_name` (full-text index) | `schema.ts` itself says **"Unused"**: measured on day 7 as the wrong tool for names. No function queries it | **Remove.** Removing an index needs no data migration (CLAUDE.md: only dropping *fields* does). It costs index storage on every profile write. Needs `security-reviewer` (it's a `convex/` change) and a deploy |
| `metrics` table | Cut to V1.1 (pet metrics). Nothing writes it; the account and profile deletes still clean it up | **Keep.** The deletes walking it are correct for V1.1, and dropping the table and adding it back would be churn |
| `profiles.contactId` | Cut to V1.1 (contacts sync). Never set | **Keep.** Optional field, no cost, and removing a field is the five-step migration |

---

## Decisions needed

1. ~~§1 + §2~~ **Decided:** remove `expo-device` and `expo-status-bar`; keep the three `expo-router` needs.
2. ~~§4~~ **Decided:** declared (#100).
3. ~~§5~~ **Decided:** un-export now, in one small PR.
4. ~~§6~~ **Decided:** remove it.
