import { useAuth } from "@clerk/expo";
import { useCallback, useSyncExternalStore } from "react";
import type { Draft } from "@convex/extractionPrompt";
import { captureDraftStore, onForgetOnThisPhone } from "./on-phone";

/**
 * The note being written, kept on this phone until it is saved or put away
 * (device QA #52, owner's decision 2026-10-12).
 *
 * iOS takes a backgrounded app out of memory whenever it needs the room, and
 * until this existed everything on the capture screen went with it: words
 * typed, the transcript, every correction made to what Andy read. Coming back
 * found an empty home and no sign anything had been there.
 *
 * So the screen writes what it holds here as it changes, and removes it when
 * it is left on purpose — saved, kept for later offline, or backed out of.
 * Only a screen that never got to close leaves it behind, and home then offers
 * it: Continue or Discard.
 *
 * Up to `MAX_DRAFTS` at a time (owner's decision 2026-10-13), each tagged
 * with the account it was written under; gone on sign-out and deletion
 * (`forgetOnThisPhone`). When all are taken, a further note is not kept — one
 * already kept is never thrown away to make room, because that would lose it
 * without a word. A note opened from the outbox is not kept here — it is
 * already kept there.
 */

/** How many half-written notes are kept at once. */
export const MAX_DRAFTS = 3;

export type CaptureDraft = {
  /** Which capture screen wrote it — one per note being written. */
  id: string;
  /** The Clerk user id it was written under. */
  ownerId: string;
  /** When it was last written, ms since epoch. */
  keptAt: number;
  /**
   * The day it was begun, as extraction expects (`localToday()`), so words
   * read the next morning still mean *that* day's "yesterday".
   */
  today: string;
  /** Recorded from someone's page: Continue goes back there. */
  profileId?: string;
  /** Who it is about, as far as it is known — for home's line only. */
  aboutName?: string;
  source: "voice" | "business_card" | "photo" | "manual";
  /** Words in the editor, not yet read by Andy. */
  words?: string;
  /**
   * The photo whose words these are (Photo door), and the name read off it as
   * corrected — so Continue brings back the check step, not a bare editor.
   * The picture itself stays in iOS's picker cache, gone with sign-out.
   */
  photo?: { uri: string; from: "camera" | "library"; about: string };
  /** Or a note Andy has read, under review. */
  review?: {
    transcript: string;
    readTranscript: string;
    draft: Draft;
    extracted: Draft;
    resolutions: Record<string, string | null>;
  };
};

function isDraft(value: unknown): value is CaptureDraft {
  const v = value as Partial<CaptureDraft> | null;
  return (
    typeof v === "object" &&
    v !== null &&
    typeof v.id === "string" &&
    typeof v.ownerId === "string" &&
    typeof v.keptAt === "number" &&
    typeof v.today === "string" &&
    (v.source === "voice" || v.source === "business_card" || v.source === "photo" || v.source === "manual") &&
    (typeof v.words === "string" ||
      (typeof v.review === "object" &&
        v.review !== null &&
        typeof v.review.transcript === "string" &&
        typeof v.review.draft === "object" &&
        v.review.draft !== null))
  );
}

function read(): CaptureDraft[] {
  try {
    const raw = captureDraftStore.read();
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter(isDraft);
    // One draft on its own, as #159 first wrote it: kept, under an id of its
    // own, rather than lost on the first launch after an update.
    if (typeof parsed === "object" && parsed !== null) {
      const single = { id: "kept", ...(parsed as object) };
      return isDraft(single) ? [single] : [];
    }
    return [];
  } catch {
    // Unreadable is no drafts: the worst case is a note to start again.
    return [];
  }
}

let current: CaptureDraft[] | undefined;
const listeners = new Set<() => void>();
/** The last answer per account, so a hook gets the same array until it changes. */
let mineCache: { ownerId: string | null; all: CaptureDraft[]; mine: CaptureDraft[] } | null = null;

function notify() {
  for (const listener of listeners) listener();
}

function save(next: CaptureDraft[]) {
  current = next;
  try {
    if (next.length === 0) captureDraftStore.remove();
    else captureDraftStore.write(JSON.stringify(next));
  } catch {
    // Held for this session; only a kill now would lose it, as before.
  }
  notify();
}

// A sign-out removes the file; the next account must not inherit what is
// held here.
onForgetOnThisPhone(() => {
  current = undefined;
  mineCache = null;
  notify();
});

/** This account's drafts, newest first. Another account's read as none. */
export function captureDraftsOf(ownerId: string | null | undefined): CaptureDraft[] {
  if (current === undefined) current = read();
  const owner = ownerId ?? null;
  if (mineCache !== null && mineCache.all === current && mineCache.ownerId === owner) {
    return mineCache.mine;
  }
  const mine =
    owner === null
      ? []
      : current
          .filter((draft) => draft.ownerId === owner)
          .sort((a, b) => b.keptAt - a.keptAt);
  mineCache = { ownerId: owner, all: current, mine };
  return mine;
}

/**
 * Keep a draft, replacing the earlier copy with the same id. A new one is
 * kept only while there is room: returns `false` when all `MAX_DRAFTS` are
 * taken, and changes nothing.
 */
export function keepCaptureDraft(draft: CaptureDraft): boolean {
  const all = current ?? read();
  const others = all.filter((kept) => kept.id !== draft.id);
  const isNew = others.length === all.length;
  if (isNew && others.filter((kept) => kept.ownerId === draft.ownerId).length >= MAX_DRAFTS) {
    return false;
  }
  save([...others, draft]);
  return true;
}

/** Put one draft away — saved, kept offline, left, or discarded. */
export function dropCaptureDraft(id: string): void {
  const all = current ?? read();
  const next = all.filter((kept) => kept.id !== id);
  if (next.length !== all.length) save(next);
}

/** The signed-in account's drafts, kept current. */
export function useCaptureDrafts(): {
  ownerId: string | null;
  drafts: CaptureDraft[];
  /** `false` when it could not be kept: all `MAX_DRAFTS` are taken. */
  keep: (draft: Omit<CaptureDraft, "ownerId" | "keptAt">) => boolean;
  drop: (id: string) => void;
} {
  const ownerId = useAuth().userId ?? null;
  const drafts = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => captureDraftsOf(ownerId),
  );
  const keep = useCallback(
    (next: Omit<CaptureDraft, "ownerId" | "keptAt">) => {
      if (ownerId === null) return false;
      return keepCaptureDraft({ ...next, ownerId, keptAt: Date.now() });
    },
    [ownerId],
  );
  return { ownerId, drafts, keep, drop: dropCaptureDraft };
}
