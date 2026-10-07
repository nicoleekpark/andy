import { Directory, File, Paths } from "expo-file-system";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

/**
 * Notes kept on this phone until Andy can read them.
 *
 * Andy reads a note on the server — the extraction is a Claude call — so with
 * no connection there is nothing to read it with. Losing what someone told you
 * at a convention because the hall had no signal is the failure this exists
 * for (decided 2026-10-07, `PROJECT_SCOPE.md` → Offline notes). A note made
 * offline is kept here, word for word, and read once Andy is back online.
 *
 * Only what the person said or typed is kept — never anything Andy worked out,
 * because offline it has worked nothing out — in one file in the app's own
 * documents folder. iOS keeps that sandbox private to Andy and encrypted at
 * rest. Every note carries the signed-in account it was written under, so the
 * next person to sign in on this phone never sees it; signing out on purpose
 * removes them all (`forgetOutbox`).
 */

export type OutboxNote = {
  id: string;
  /** The Clerk user id it was written under. */
  ownerId: string;
  /** When it was kept, ms since epoch. */
  keptAt: number;
  /**
   * The day it was said, as the extraction expects (`localToday()`), so
   * "yesterday" is read against the day it was said, not the day Andy is
   * back online.
   */
  today: string;
  text: string;
  /** Spoken and checked, or typed: decides "What you said" / "What you wrote". */
  kind: "spoken" | "typed";
  /** Recorded from someone's page: the note is about them. */
  aboutProfileId?: string;
};

/** Where the outbox lives. A seam so tests use memory instead of the disk. */
export type OutboxStore = {
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
 * One folder of Andy's own, so "remove everything" is one delete and a file
 * set aside is never left behind by sign-out.
 */
export function fileStore(): OutboxStore {
  const folder = () => new Directory(Paths.document, "outbox");
  const notes = () => new File(folder(), "notes.json");
  const pending = () => new File(folder(), "notes.next.json");
  return {
    read() {
      if (notes().exists) return notes().textSync();
      // Killed between the two steps of `write` below: the new contents are
      // complete in `pending`, and nothing else has them.
      if (pending().exists) return pending().textSync();
      return null;
    },
    write(contents) {
      const dir = folder();
      if (!dir.exists) dir.create({ intermediates: true });
      // Written whole to a second file, then swapped in — so a write cut off
      // halfway leaves the previous notes intact rather than a half-written
      // file that reads as nothing.
      const next = pending();
      next.write(contents);
      const current = notes();
      if (current.exists) current.delete();
      next.rename("notes.json");
    },
    setAside() {
      for (const file of [notes(), pending()]) {
        if (file.exists) file.rename(`unreadable-${Date.now()}-${file.name}`);
      }
    },
    remove() {
      const dir = folder();
      if (dir.exists) dir.delete();
    },
  };
}

/** The one outbox on this phone. */
export const outboxStore = fileStore();

/**
 * Remove every note kept on this phone. Called on a sign-out the person chose
 * (and account deletion) — never on Clerk merely reporting signed-out, which
 * also happens when a session expires on its own, and must not cost anyone
 * the words they kept. Notes left behind that way still carry their owner and
 * are never shown to another account (`loadOutbox`).
 *
 * Best effort: a failure to delete must not stop the sign-out itself.
 */
export function forgetOutbox(store: OutboxStore = outboxStore): void {
  try {
    store.remove();
  } catch {
    // Still owner-tagged; the next account to load it removes it.
  }
}

function isNote(value: unknown): value is OutboxNote {
  const v = value as Partial<OutboxNote> | null;
  return (
    typeof v === "object" &&
    v !== null &&
    typeof v.id === "string" &&
    typeof v.ownerId === "string" &&
    typeof v.keptAt === "number" &&
    typeof v.today === "string" &&
    typeof v.text === "string" &&
    (v.kind === "spoken" || v.kind === "typed")
  );
}

/**
 * Everything in the store, whoever wrote it — or `unreadable` when the file is
 * there but cannot be read as notes. The two must not be confused: treated as
 * empty, an unreadable file would be overwritten by the very next note.
 */
function readAll(store: OutboxStore): { notes: OutboxNote[]; unreadable: boolean } {
  let raw: string | null;
  try {
    raw = store.read();
  } catch {
    return { notes: [], unreadable: true };
  }
  if (raw === null) return { notes: [], unreadable: false };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { notes: [], unreadable: true };
    return { notes: parsed.filter(isNote), unreadable: false };
  } catch {
    return { notes: [], unreadable: true };
  }
}

/**
 * This account's notes.
 *
 * Anyone else's found in the file are removed on the spot — they can only be
 * there if their owner's session ended without a sign-out, and the person now
 * holding the phone is not who wrote them. A file that cannot be read is set
 * aside, not overwritten. Neither clean-up may take the app down: it runs as
 * the app opens.
 */
export function loadOutbox(store: OutboxStore, ownerId: string): OutboxNote[] {
  const { notes: all, unreadable } = readAll(store);
  try {
    if (unreadable) {
      store.setAside();
      return [];
    }
    const mine = all.filter((note) => note.ownerId === ownerId);
    if (mine.length !== all.length) {
      if (mine.length === 0) store.remove();
      else store.write(JSON.stringify(mine));
    }
    return mine;
  } catch {
    return all.filter((note) => note.ownerId === ownerId);
  }
}

type Outbox = {
  notes: OutboxNote[];
  keep: (note: Omit<OutboxNote, "id" | "ownerId" | "keptAt">) => OutboxNote;
};

const OutboxContext = createContext<Outbox | null>(null);

export function OutboxProvider({
  ownerId,
  store,
  children,
}: {
  ownerId: string;
  store: OutboxStore;
  children: React.ReactNode;
}) {
  const [notes, setNotes] = useState<OutboxNote[]>(() => loadOutbox(store, ownerId));

  const keep = useCallback<Outbox["keep"]>(
    (note) => {
      const kept: OutboxNote = {
        ...note,
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        ownerId,
        keptAt: Date.now(),
      };
      // Written before state changes, so what the screen says is kept is
      // already on disk if the app is closed the next moment.
      const next = [...loadOutbox(store, ownerId), kept];
      store.write(JSON.stringify(next));
      setNotes(next);
      return kept;
    },
    [ownerId, store],
  );

  const value = useMemo(() => ({ notes, keep }), [notes, keep]);
  return <OutboxContext.Provider value={value}>{children}</OutboxContext.Provider>;
}

/**
 * The outbox, or an empty one outside the provider — so a screen rendered on
 * its own (in a test, or before the gate) shows nothing waiting rather than
 * crashing.
 */
export function useOutbox(): Outbox & { available: boolean } {
  const outbox = useContext(OutboxContext);
  if (outbox === null) {
    return {
      notes: [],
      keep: () => {
        throw new Error("No outbox: OutboxProvider is missing above this screen");
      },
      available: false,
    };
  }
  return { ...outbox, available: true };
}
