import { Directory, File, Paths } from "expo-file-system";
import { Image } from "expo-image";
import { hasNativeModule } from "./native";
import { forgetBriefings } from "./notifications";

/**
 * What Andy keeps on this phone, and how it is written.
 *
 * Three things live here, each in a folder of its own inside Andy's documents
 * folder (private to Andy, encrypted at rest by iOS): notes kept while offline
 * (`outbox.tsx`), the copy of everyone and every note for reading offline
 * (`offline-copy.tsx`), and changes made offline waiting for Sync
 * (`pending-changes.tsx`). Both are owner-tagged by their own code and both go on
 * a sign-out the person chose (`forgetOnThisPhone`).
 */

/** One JSON file, written safely. A seam so tests use memory instead of disk. */
export type PhoneStore = {
  /** The file's contents, or `null` when there is none. */
  read(): string | null;
  /** Replace the contents — completely, or not at all. */
  write(contents: string): void;
  /**
   * Move contents that cannot be read out of the way, kept rather than
   * deleted: they may be someone's notes, and the next `write` must not land
   * on top of them.
   */
  setAside(): void;
  /** Remove everything, set-aside files included. */
  remove(): void;
};

/**
 * One folder per thing kept, so "remove everything" is one delete and a file
 * set aside is never left behind by sign-out.
 */
export function jsonFileStore(folderName: string, fileName: string): PhoneStore {
  const nextName = fileName.replace(/\.json$/, ".next.json");
  const folder = () => new Directory(Paths.document, folderName);
  const current = () => new File(folder(), fileName);
  const pending = () => new File(folder(), nextName);
  return {
    read() {
      if (current().exists) return current().textSync();
      // Killed between the two steps of `write` below: the new contents are
      // complete in `pending`, and nothing else has them.
      if (pending().exists) return pending().textSync();
      return null;
    },
    write(contents) {
      const dir = folder();
      if (!dir.exists) dir.create({ intermediates: true });
      // Written whole to a second file, then swapped in — so a write cut off
      // halfway leaves the previous contents intact rather than a half-written
      // file that reads as nothing.
      const next = pending();
      next.write(contents);
      const now = current();
      if (now.exists) now.delete();
      next.rename(fileName);
    },
    setAside() {
      for (const file of [current(), pending()]) {
        if (file.exists) file.rename(`unreadable-${Date.now()}-${file.name}`);
      }
    },
    remove() {
      const dir = folder();
      if (dir.exists) dir.delete();
    },
  };
}

/** Notes kept while offline. */
export const outboxStore = jsonFileStore("outbox", "notes.json");
/** The copy of everyone and every note, for reading offline. */
export const offlineCopyStore = jsonFileStore("offline-copy", "copy.json");
/** Changes made offline, waiting for Sync. */
export const pendingStore = jsonFileStore("pending", "changes.json");
/**
 * A fingerprint of the last text Andy put on the clipboard (`clipboard.ts`) —
 * never the text — so a sign-out can tell Andy's copy from anything copied
 * since, and clear only its own.
 */
export const copiedStore = jsonFileStore("clipboard", "copied.json");

/**
 * A short, one-way fingerprint (32-bit FNV-1a, hex): enough to recognise the
 * same text again, not enough to read anything back out of.
 */
export function fingerprintOf(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Clear the clipboard if what is on it is still what Andy copied (a follow-up
 * draft about somebody). Anything copied since, in any app, is the person's
 * and is left alone — the owner's decision, 2026-10-11. Reading another app's
 * copy makes iOS ask "Allow Paste?"; "Don't Allow" leaves it, which is right.
 */
async function forgetAndysCopy(): Promise<void> {
  let copied: { fingerprint?: unknown } | null = null;
  try {
    const raw = copiedStore.read();
    copied = raw === null ? null : (JSON.parse(raw) as { fingerprint?: unknown });
  } catch {
    copied = null;
  }
  try {
    copiedStore.remove();
  } catch {
    // Only a fingerprint; harmless if it stays.
  }
  if (typeof copied?.fingerprint !== "string" || !hasNativeModule("ExpoClipboard")) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const clipboard = require("expo-clipboard") as typeof import("expo-clipboard");
  const now = await clipboard.getStringAsync();
  if (now !== "" && fingerprintOf(now) === copied.fingerprint) {
    await clipboard.setStringAsync("");
  }
}

/**
 * Leave nothing of this account on the phone, as if Andy had never been used
 * on it. Called on a sign-out the person chose and on account deletion —
 * never on Clerk merely reporting signed-out, which also happens when a
 * session expires on its own, and must not cost anyone the words they kept.
 * After a sign-out everything comes back from the server on the next sign-in;
 * after a deletion there is nothing left to come back.
 *
 * What it covers, and **what anything new that keeps data on the phone must
 * add here** (CLAUDE.md → "Sign-out and account deletion leave nothing"):
 * - the stores in this file (notes waiting offline, the offline copy, changes
 *   waiting for Sync);
 * - this app's reminders — pending, and already delivered in Notification
 *   Center (`forgetBriefings`) — which carry a person's name;
 * - photos: `expo-image`'s memory and disk caches (profile photos), and the
 *   copies `expo-image-picker` makes in `Caches/ImagePicker` (profile photos
 *   and business cards);
 * - the clipboard, only while it still holds what Andy copied there
 *   (`forgetAndysCopy`).
 *
 * Not here, on purpose: Clerk's own caches. On sign-out Clerk removes its
 * session token and re-saves its client as signed out (read in
 * `@clerk/expo` 4.6.8, `createClerkInstance.js`); re-check on an upgrade. The
 * in-memory Convex cache goes with the per-account client (`_layout.tsx`).
 * Permissions (calendar, notifications, microphone) belong to iOS, not to
 * Andy's data, and an app cannot reset them.
 *
 * Best effort: a failure to delete must not stop the sign-out itself.
 */
export function forgetOnThisPhone(): void {
  for (const store of [outboxStore, offlineCopyStore, pendingStore]) {
    try {
      store.remove();
    } catch {
      // Still owner-tagged; the next account to load it removes it.
    }
  }
  try {
    const picked = new Directory(Paths.cache, "ImagePicker");
    if (picked.exists) picked.delete();
  } catch {
    // iOS clears Caches on its own when space runs low.
  }
  // Not awaited: the sign-out these belong to must not wait on the native
  // bridge, and a failure leaves nothing worse than before.
  for (const forget of [
    forgetAndysCopy,
    forgetBriefings,
    () => Image.clearMemoryCache(),
    () => Image.clearDiskCache(),
  ]) {
    try {
      void forget().catch(() => undefined);
    } catch {
      // A native module missing from this build throws before it returns.
    }
  }
}
