import { Directory, File, Paths } from "expo-file-system";

/**
 * What Andy keeps on this phone, and how it is written.
 *
 * Two things live here, each in a folder of its own inside Andy's documents
 * folder (private to Andy, encrypted at rest by iOS): notes kept while offline
 * (`outbox.tsx`) and the copy of everyone and every note for reading offline
 * (`offline-copy.tsx`). Both are owner-tagged by their own code and both go on
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

/**
 * Remove everything Andy keeps on this phone. Called on a sign-out the person
 * chose (and account deletion) — never on Clerk merely reporting signed-out,
 * which also happens when a session expires on its own, and must not cost
 * anyone the words they kept. What is left behind that way still carries its
 * owner and is never shown to another account.
 *
 * Best effort: a failure to delete must not stop the sign-out itself.
 */
export function forgetOnThisPhone(): void {
  for (const store of [outboxStore, offlineCopyStore]) {
    try {
      store.remove();
    } catch {
      // Still owner-tagged; the next account to load it removes it.
    }
  }
}
