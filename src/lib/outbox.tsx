import { jsonFileStore, outboxStore, type PhoneStore } from "./on-phone";
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
 * removes them all (`forgetOnThisPhone` in `on-phone.ts`).
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

/** Where the outbox lives (`on-phone.ts`). */
export type OutboxStore = PhoneStore;

/** The outbox's own file — kept for tests that exercise the real file layout. */
export function fileStore(): OutboxStore {
  return jsonFileStore("outbox", "notes.json");
}

export { outboxStore };

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
  /** Drop one note — once Andy has it for good. */
  done: (id: string) => void;
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

  const done = useCallback<Outbox["done"]>(
    (id) => {
      const next = loadOutbox(store, ownerId).filter((note) => note.id !== id);
      try {
        if (next.length === 0) store.remove();
        else store.write(JSON.stringify(next));
      } catch {
        // The note is saved on the server already; failing to drop the copy
        // here only means it is offered again, and a second save would be a
        // duplicate the person can see and delete — not a loss.
      }
      setNotes(next);
    },
    [ownerId, store],
  );

  const value = useMemo(() => ({ notes, keep, done }), [notes, keep, done]);
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
      done: () => {},
      available: false,
    };
  }
  return { ...outbox, available: true };
}
