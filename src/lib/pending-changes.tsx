import { useConvex } from "convex/react";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";
import { api } from "@convex/_generated/api";
import type { OfflineCopy } from "./offline-copy";
import { pendingStore, type PhoneStore } from "./on-phone";

/**
 * Changes made offline, kept on this phone until Sync (decided 2026-10-08:
 * "save edits on the phone, and let me press Sync to save them for good").
 *
 * Each change records what the person wanted *and* what the thing looked like
 * before they changed it (`base`). Sync uses that to notice the same note
 * having been changed somewhere else in the meantime, and asks instead of
 * silently overwriting it. Until Sync, every screen shows the phone's copy
 * with these changes applied (`applyPending`), online too — so an edit never
 * seems to have vanished just because the connection came back first.
 *
 * Same rules as the other things kept on the phone (`on-phone.ts`): tagged
 * with the account, never shown to another, removed on a chosen sign-out.
 */

type Facts = { keyFacts: string[] };

export type PendingChange =
  | { id: string; kind: "updateNote"; noteId: string; keyFacts: string[]; base: Facts; madeAt: number }
  | { id: string; kind: "removeNote"; noteId: string; base: Facts; madeAt: number };

/** A change as a screen hands it in — Andy stamps `id` and `madeAt`. */
export type NewChange = PendingChange extends infer C
  ? C extends PendingChange
    ? Omit<C, "id" | "madeAt">
    : never
  : never;

type Stored = { ownerId: string; changes: PendingChange[] };

function isChange(value: unknown): value is PendingChange {
  const v = value as Partial<PendingChange> | null;
  return (
    typeof v === "object" &&
    v !== null &&
    typeof v.id === "string" &&
    (v.kind === "updateNote" || v.kind === "removeNote") &&
    typeof v.noteId === "string" &&
    typeof v.base === "object" &&
    v.base !== null &&
    Array.isArray(v.base.keyFacts)
  );
}

/**
 * This account's waiting changes. Someone else's are removed; a file that
 * cannot be read is set aside, never overwritten — like notes kept offline,
 * these exist nowhere else. Never throws: it runs as the app opens.
 */
export function loadPending(store: PhoneStore, ownerId: string): PendingChange[] {
  try {
    const raw = store.read();
    if (raw === null) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      store.setAside();
      return [];
    }
    const stored = parsed as Partial<Stored> | null;
    if (stored === null || typeof stored !== "object" || !Array.isArray(stored.changes)) {
      store.setAside();
      return [];
    }
    if (stored.ownerId !== ownerId) {
      store.remove();
      return [];
    }
    return stored.changes.filter(isChange);
  } catch {
    return [];
  }
}

/**
 * One waiting change per note: the newest wins, and a delete replaces an edit.
 * The `base` stays the *first* one — what the note was on the server before
 * any of these changes — which is what Sync must compare against.
 */
export function collapse(changes: PendingChange[], next: PendingChange): PendingChange[] {
  const earlier = changes.find((change) => change.noteId === next.noteId);
  const kept = changes.filter((change) => change.noteId !== next.noteId);
  return [...kept, earlier === undefined ? next : { ...next, base: earlier.base }];
}

/** The phone's copy, as it will be once these changes are saved. */
export function applyPending(copy: OfflineCopy, changes: PendingChange[]): OfflineCopy {
  if (changes.length === 0) return copy;
  const removed = new Set(changes.filter((c) => c.kind === "removeNote").map((c) => c.noteId));
  const edited = new Map(
    changes.flatMap((c) => (c.kind === "updateNote" ? [[c.noteId, c.keyFacts] as const] : [])),
  );
  return {
    ...copy,
    notes: copy.notes
      .filter((note) => !removed.has(note._id))
      .map((note) =>
        edited.has(note._id) ? { ...note, keyFacts: edited.get(note._id) } : note,
      ),
    links: copy.links.filter((link) => !removed.has(link.noteId)),
  };
}

type Context = {
  changes: PendingChange[];
  /** Keep a change on the phone. Throws if it cannot be written — say so, don't leave. */
  add: (change: NewChange) => void;
  /** Whether a note has a change waiting. */
  touches: (noteId: string) => boolean;
  /** Send every waiting change, asking about any changed elsewhere since. */
  sync: () => Promise<void>;
  syncing: boolean;
  available: boolean;
};

const PendingContext = createContext<Context>({
  changes: [],
  add: () => {
    throw new Error("No PendingProvider above this screen");
  },
  touches: () => false,
  sync: async () => {},
  syncing: false,
  available: false,
});

function sameFacts(a: string[] | undefined, b: string[]): boolean {
  const left = a ?? [];
  return left.length === b.length && left.every((fact, i) => fact === b[i]);
}

export function PendingProvider({
  ownerId,
  store = pendingStore,
  children,
}: {
  ownerId: string;
  store?: PhoneStore;
  children: React.ReactNode;
}) {
  const convex = useConvex();
  const [changes, setChanges] = useState<PendingChange[]>(() => loadPending(store, ownerId));
  const [syncing, setSyncing] = useState(false);
  // A lock, not state: two presses can land before `syncing` re-renders, and
  // two Syncs at once would each write the list they began with.
  const inFlight = useRef(false);

  const write = useCallback(
    (next: PendingChange[]) => {
      if (next.length === 0) store.remove();
      else store.write(JSON.stringify({ ownerId, changes: next } satisfies Stored));
      setChanges(next);
    },
    [ownerId, store],
  );

  const add = useCallback<Context["add"]>(
    (change) => {
      const full = {
        ...change,
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        madeAt: Date.now(),
      } as PendingChange;
      // Re-read first, so a change made on another screen a moment ago is
      // never dropped; written before the screen moves on.
      write(collapse(loadPending(store, ownerId), full));
    },
    [ownerId, store, write],
  );

  const touches = useCallback(
    (noteId: string) => changes.some((change) => change.noteId === noteId),
    [changes],
  );

  const send = useCallback(
    async (change: PendingChange) => {
      if (change.kind === "updateNote") {
        await convex.mutation(api.notes.updateNote, { noteId: change.noteId, keyFacts: change.keyFacts });
      } else {
        await convex.mutation(api.notes.remove, { noteId: change.noteId });
      }
    },
    [convex],
  );

  /**
   * What is on disk now, minus what was just saved. Re-read rather than kept
   * from the start of a Sync: an edit made while Sync was working must not be
   * written over by the list Sync began with (code-reviewer, 2026-10-08). A
   * newer change to a note that was just saved now compares against what was
   * saved, not against what the note was before — so it is not mistaken for
   * a change made somewhere else.
   */
  const settle = useCallback(
    (saved: Map<string, PendingChange>) => {
      const next = loadPending(store, ownerId).flatMap((change) => {
        const sent = saved.get(change.noteId);
        if (sent === undefined) return [change];
        if (sent.id === change.id) return [];
        // Saved as deleted: nothing left for a newer change to apply to.
        if (sent.kind === "removeNote") return [];
        return [{ ...change, base: { keyFacts: sent.keyFacts } }];
      });
      write(next);
    },
    [ownerId, store, write],
  );

  const sync = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSyncing(true);
    const toSend = loadPending(store, ownerId);
    const saved = new Map<string, PendingChange>();
    const conflicts: PendingChange[] = [];
    let failed = 0;
    for (const change of toSend) {
      try {
        const now = await convex.query(api.notes.byId, { noteId: change.noteId });
        if (now === null) {
          // Gone on the server (deleted elsewhere): nothing left to change.
          saved.set(change.noteId, { ...change, kind: "removeNote" } as PendingChange);
          continue;
        }
        if (!sameFacts(now.note.keyFacts, change.base.keyFacts)) {
          conflicts.push(change);
          continue;
        }
        await send(change);
        saved.set(change.noteId, change);
      } catch {
        // Kept for the next Sync; nothing is lost.
        failed += 1;
      }
    }
    settle(saved);

    const stillWaiting =
      failed === 0
        ? ""
        : ` ${failed === 1 ? "1 other change" : `${failed} other changes`} couldn't be sent and ${failed === 1 ? "is" : "are"} still on this phone.`;

    if (conflicts.length === 0) {
      inFlight.current = false;
      setSyncing(false);
      if (failed > 0) {
        Alert.alert(
          "Some changes didn't sync",
          `${failed === 1 ? "1 change is" : `${failed} changes are`} still on this phone. Try Sync again in a moment.`,
        );
      }
      return;
    }

    // One alert, not two: iOS can drop a second one presented while the
    // first is still appearing, and this one needs an answer. Failures are
    // said inside it. Still syncing until it is answered.
    const count = conflicts.length === 1 ? "1 note was" : `${conflicts.length} notes were`;
    const finish = () => {
      inFlight.current = false;
      setSyncing(false);
    };
    Alert.alert(
      "Changed somewhere else",
      `${count} changed on another device since you changed ${conflicts.length === 1 ? "it" : "them"} here. Which should Andy keep?${stillWaiting}`,
      [
        {
          text: "Keep theirs",
          style: "destructive",
          onPress: () => {
            write(loadPending(store, ownerId).filter((c) => !conflicts.some((x) => x.id === c.id)));
            finish();
          },
        },
        {
          text: "Keep mine",
          onPress: () => {
            void (async () => {
              const kept = new Map<string, PendingChange>();
              for (const change of conflicts) {
                try {
                  await send(change);
                  kept.set(change.noteId, change);
                } catch {
                  // Stays waiting — and said, below.
                }
              }
              settle(kept);
              finish();
              if (kept.size < conflicts.length) {
                Alert.alert(
                  "Didn't save",
                  "Andy couldn't save your version just now. It's still on this phone — try Sync again.",
                );
              }
            })();
          },
        },
      ],
      // Dismissed without an answer: the changes stay waiting, asked again
      // on the next Sync.
      { cancelable: true, onDismiss: finish },
    );
  }, [convex, ownerId, send, settle, store, write]);

  const value = useMemo(
    () => ({ changes, add, touches, sync, syncing, available: true }),
    [changes, add, touches, sync, syncing],
  );
  return <PendingContext.Provider value={value}>{children}</PendingContext.Provider>;
}

export function usePending(): Context {
  return useContext(PendingContext);
}
