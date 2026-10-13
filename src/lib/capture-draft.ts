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
 * One draft at a time, tagged with the account it was written under; gone on
 * sign-out and deletion (`forgetOnThisPhone`). A note opened from the outbox is
 * not kept here — it is already kept there.
 */

export type CaptureDraft = {
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
  source: "voice" | "business_card" | "manual";
  /** Words in the editor, not yet read by Andy. */
  words?: string;
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
    typeof v.ownerId === "string" &&
    typeof v.keptAt === "number" &&
    typeof v.today === "string" &&
    (v.source === "voice" || v.source === "business_card" || v.source === "manual") &&
    (typeof v.words === "string" ||
      (typeof v.review === "object" &&
        v.review !== null &&
        typeof v.review.transcript === "string" &&
        typeof v.review.draft === "object" &&
        v.review.draft !== null))
  );
}

function read(): CaptureDraft | null {
  try {
    const raw = captureDraftStore.read();
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isDraft(parsed) ? parsed : null;
  } catch {
    // Unreadable is no draft: the worst case is a note to start again.
    return null;
  }
}

let current: CaptureDraft | null | undefined;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

// A sign-out removes the file; the next account must not inherit what is
// held here.
onForgetOnThisPhone(() => {
  current = undefined;
  notify();
});

/** This account's draft, or `null`. Another account's reads as none. */
export function captureDraftOf(ownerId: string | null | undefined): CaptureDraft | null {
  if (current === undefined) current = read();
  return current !== null && ownerId != null && current.ownerId === ownerId
    ? current
    : null;
}

/** Keep the draft, replacing whatever was kept before. */
export function keepCaptureDraft(draft: CaptureDraft): void {
  current = draft;
  try {
    captureDraftStore.write(JSON.stringify(draft));
  } catch {
    // Held for this session; only a kill now would lose it, as before.
  }
  notify();
}

/** Put the draft away — saved, kept offline, left, or discarded. */
export function dropCaptureDraft(): void {
  if (current === null) return;
  current = null;
  try {
    captureDraftStore.remove();
  } catch {
    // Owner-tagged, and offered again at worst.
  }
  notify();
}

/** The signed-in account's draft, kept current. */
export function useCaptureDraft(): {
  ownerId: string | null;
  draft: CaptureDraft | null;
  keep: (draft: Omit<CaptureDraft, "ownerId" | "keptAt">) => void;
  drop: () => void;
} {
  const ownerId = useAuth().userId ?? null;
  const draft = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => captureDraftOf(ownerId),
  );
  const keep = useCallback(
    (next: Omit<CaptureDraft, "ownerId" | "keptAt">) => {
      if (ownerId === null) return;
      keepCaptureDraft({ ...next, ownerId, keptAt: Date.now() });
    },
    [ownerId],
  );
  return { ownerId, draft, keep, drop: dropCaptureDraft };
}
