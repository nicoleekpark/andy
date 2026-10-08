import { useConvex } from "convex/react";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useConfirm } from "@/components/confirm-dialog";
import { api } from "@convex/_generated/api";
import type { OfflineCopy } from "./offline-copy";
import { cleanAliases, mergeTags } from "@convex/naming";
import { pendingStore, type PhoneStore } from "./on-phone";
import { userMessage } from "./user-message";

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

/** What the person edit screen changes — `updateProfile`'s arguments. */
export type PersonFields = {
  name: string;
  entityType: "person" | "animal";
  relationshipContext: string;
  firstMetDate: string;
  tags: string[];
  aliases: string[];
};

export type PendingChange =
  | { id: string; kind: "updateNote"; noteId: string; keyFacts: string[]; base: Facts; madeAt: number }
  | { id: string; kind: "removeNote"; noteId: string; base: Facts; madeAt: number }
  | {
      id: string;
      kind: "updateProfile";
      profileId: string;
      fields: PersonFields;
      base: PersonFields;
      madeAt: number;
    }
  | { id: string; kind: "removeProfile"; profileId: string; base: PersonFields; madeAt: number };

/** The note or person a change is about — one waiting change per target. */
export function targetOf(change: PendingChange | NewChange): string {
  return change.kind === "updateNote" || change.kind === "removeNote"
    ? `note:${change.noteId}`
    : `person:${change.profileId}`;
}

/**
 * A person's fields as the server will store them — the same tidying
 * `profiles.updateProfile` does, with the same functions (`convex/naming.ts`):
 * trimmed, tags merged case-insensitively, aliases cleaned of the name itself.
 * Used for what the phone shows before Sync and for what a change is compared
 * against after one, so neither disagrees with the server about what was saved.
 */
export function storedPerson(fields: PersonFields): PersonFields {
  const name = fields.name.trim();
  return {
    name,
    entityType: fields.entityType,
    relationshipContext: fields.relationshipContext.trim(),
    firstMetDate: fields.firstMetDate.trim(),
    tags: mergeTags([], fields.tags),
    aliases: cleanAliases(name, fields.aliases),
  };
}

/** A person's fields as the edit screen holds them. */
export function personFields(profile: {
  name: string;
  entityType: "person" | "animal";
  relationshipContext?: string;
  firstMetDate?: string;
  tags: string[];
  aliases?: string[];
}): PersonFields {
  return {
    name: profile.name,
    entityType: profile.entityType,
    relationshipContext: profile.relationshipContext ?? "",
    firstMetDate: profile.firstMetDate ?? "",
    tags: profile.tags,
    aliases: profile.aliases ?? [],
  };
}

/** A change as a screen hands it in — Andy stamps `id` and `madeAt`. */
export type NewChange = PendingChange extends infer C
  ? C extends PendingChange
    ? Omit<C, "id" | "madeAt">
    : never
  : never;

type Stored = { ownerId: string; changes: PendingChange[] };

function isChange(value: unknown): value is PendingChange {
  const v = value as Record<string, unknown> | null;
  if (typeof v !== "object" || v === null || typeof v.id !== "string") return false;
  const base = v.base as Record<string, unknown> | null;
  if (typeof base !== "object" || base === null) return false;
  if (v.kind === "updateNote" || v.kind === "removeNote") {
    return typeof v.noteId === "string" && Array.isArray(base.keyFacts);
  }
  if (v.kind === "updateProfile" || v.kind === "removeProfile") {
    return typeof v.profileId === "string" && typeof base.name === "string";
  }
  return false;
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
  const target = targetOf(next);
  const earlier = changes.find((change) => targetOf(change) === target);
  const kept = changes.filter((change) => targetOf(change) !== target);
  return [
    ...kept,
    earlier === undefined ? next : ({ ...next, base: earlier.base } as PendingChange),
  ];
}

/** The phone's copy, as it will be once these changes are saved. */
export function applyPending(copy: OfflineCopy, changes: PendingChange[]): OfflineCopy {
  if (changes.length === 0) return copy;
  const gonePeople = new Set(
    changes.flatMap((c) => (c.kind === "removeProfile" ? [c.profileId] : [])),
  );
  const editedPeople = new Map(
    changes.flatMap((c) => (c.kind === "updateProfile" ? [[c.profileId, c.fields] as const] : [])),
  );
  // A person's own notes go with them; their name in other people's notes
  // stays, only no longer opening anything (the server's rule, CLAUDE.md).
  const goneNotes = new Set([
    ...changes.flatMap((c) => (c.kind === "removeNote" ? [c.noteId] : [])),
    ...copy.notes.filter((note) => gonePeople.has(note.profileId)).map((note) => note._id as string),
  ]);
  const editedNotes = new Map(
    changes.flatMap((c) => (c.kind === "updateNote" ? [[c.noteId, c.keyFacts] as const] : [])),
  );
  return {
    ...copy,
    profiles: copy.profiles
      .filter((profile) => !gonePeople.has(profile._id))
      .map((profile) => {
        const fields = editedPeople.get(profile._id);
        if (fields === undefined) return profile;
        const stored = storedPerson(fields);
        return {
          ...profile,
          ...stored,
          relationshipContext: stored.relationshipContext || undefined,
          firstMetDate: stored.firstMetDate || undefined,
        };
      }),
    notes: copy.notes
      .filter((note) => !goneNotes.has(note._id))
      .map((note) =>
        editedNotes.has(note._id) ? { ...note, keyFacts: editedNotes.get(note._id) } : note,
      ),
    links: copy.links.filter((link) => !goneNotes.has(link.noteId)),
  };
}

type Context = {
  changes: PendingChange[];
  /** Keep a change on the phone. Throws if it cannot be written — say so, don't leave. */
  add: (change: NewChange) => void;
  /** Whether a note or person (by id) has a change waiting. */
  touches: (id: string) => boolean;
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

/** Whether the server still holds what the change was made against. */
function same(now: Facts | PersonFields, base: Facts | PersonFields): boolean {
  return JSON.stringify(now) === JSON.stringify(base);
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
  const confirm = useConfirm();
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
    (id: string) =>
      changes.some((change) => targetOf(change) === `note:${id}` || targetOf(change) === `person:${id}`),
    [changes],
  );

  const send = useCallback(
    async (change: PendingChange) => {
      switch (change.kind) {
        case "updateNote":
          await convex.mutation(api.notes.updateNote, { noteId: change.noteId, keyFacts: change.keyFacts });
          return;
        case "removeNote":
          await convex.mutation(api.notes.remove, { noteId: change.noteId });
          return;
        case "updateProfile":
          await convex.mutation(api.profiles.updateProfile, { profileId: change.profileId, ...change.fields });
          return;
        case "removeProfile":
          await convex.mutation(api.profiles.remove, { profileId: change.profileId });
          return;
      }
    },
    [convex],
  );

  /**
   * What the note or person is on the server now, in the shape `base` holds —
   * or `null` when it is gone.
   */
  const current = useCallback(
    async (change: PendingChange): Promise<Facts | PersonFields | null> => {
      if (change.kind === "updateNote" || change.kind === "removeNote") {
        const now = await convex.query(api.notes.byId, { noteId: change.noteId });
        return now === null ? null : { keyFacts: now.note.keyFacts ?? [] };
      }
      const now = await convex.query(api.profiles.withNotes, { profileId: change.profileId });
      return now === null ? null : personFields(now.profile);
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
      const next = loadPending(store, ownerId).flatMap((change): PendingChange[] => {
        const sent = saved.get(targetOf(change));
        if (sent === undefined) return [change];
        if (sent.id === change.id) return [];
        // Saved as deleted: nothing left for a newer change to apply to.
        if (sent.kind === "removeNote" || sent.kind === "removeProfile") return [];
        // What the server now holds: notes keep details verbatim; a person is
        // tidied on the way in, so compare against the tidied version.
        const base = sent.kind === "updateNote" ? { keyFacts: sent.keyFacts } : storedPerson(sent.fields);
        return [{ ...change, base } as PendingChange];
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
    // The server's own words for the first refusal ("That's longer than a
    // name"), so a change that can never be saved says why.
    let reason: string | null = null;
    for (const change of toSend) {
      try {
        const now = await current(change);
        if (now === null) {
          // Gone on the server (deleted elsewhere): nothing left to change.
          const gone = change.kind === "updateNote" || change.kind === "removeNote" ? "removeNote" : "removeProfile";
          saved.set(targetOf(change), { ...change, kind: gone } as PendingChange);
          continue;
        }
        if (!same(now, change.base)) {
          conflicts.push(change);
          continue;
        }
        await send(change);
        saved.set(targetOf(change), change);
      } catch (e) {
        // Kept for the next Sync; nothing is lost.
        failed += 1;
        reason ??= userMessage(e, "");
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
        confirm(
          "Some changes didn't sync",
          `${failed === 1 ? "1 change is" : `${failed} changes are`} still on this phone.${
            reason ? ` ${reason}` : " Try Sync again in a moment."
          }`,
        );
      }
      return;
    }

    // One question, not two: this one needs an answer, so failures are said
    // inside it rather than queued behind it. No Cancel — one of the two has
    // to be chosen. Still syncing until it is answered.
    const count =
      conflicts.length === 1 ? "Something you changed here was" : `${conflicts.length} things you changed here were`;
    const finish = () => {
      inFlight.current = false;
      setSyncing(false);
    };
    confirm(
      "Changed somewhere else",
      `${count} also changed on another device. Which should Andy keep?${stillWaiting}`,
      [
        {
          text: "Keep theirs",
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
                  kept.set(targetOf(change), change);
                } catch {
                  // Stays waiting — and said, below.
                }
              }
              settle(kept);
              finish();
              if (kept.size < conflicts.length) {
                confirm(
                  "Didn't save",
                  "Andy couldn't save your version just now. It's still on this phone — try Sync again.",
                );
              }
            })();
          },
        },
      ],
    );
  }, [confirm, current, ownerId, send, settle, store, write]);

  const value = useMemo(
    () => ({ changes, add, touches, sync, syncing, available: true }),
    [changes, add, touches, sync, syncing],
  );
  return <PendingContext.Provider value={value}>{children}</PendingContext.Provider>;
}

export function usePending(): Context {
  return useContext(PendingContext);
}
