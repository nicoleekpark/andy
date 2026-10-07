import { useQuery } from "convex/react";
import { useOffline } from "./connection";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import type { NoteRow } from "@convex/offlineViews";
import { offlineCopyStore, type PhoneStore } from "./on-phone";

/**
 * A copy of everyone and every note, kept on this phone so they can still be
 * read with no connection (decided 2026-10-07: at a convention the hall often
 * has no signal, and that is when you want to look someone up).
 *
 * Refreshed from `offline.snapshot` whenever Andy is online — the subscription
 * is live, so the copy follows every change. Read-only: offline, screens build
 * themselves from it with the server's own functions (`convex/offlineViews.ts`),
 * and changing things offline is a later decision. Photos are not kept yet.
 *
 * Same rules as the notes kept while offline (`outbox.tsx`): tagged with the
 * account it belongs to, never shown to another, removed on a sign-out the
 * person chose (`forgetOnThisPhone`), and behind the app lock like everything
 * else.
 */

export type OfflineCopy = {
  ownerId: string;
  /** When the copy was taken, ms since epoch — for "showing what Andy had at…". */
  takenAt: number;
  profiles: Doc<"profiles">[];
  notes: NoteRow[];
  links: Doc<"noteMentions">[];
};

function isCopy(value: unknown): value is OfflineCopy {
  const v = value as Partial<OfflineCopy> | null;
  return (
    typeof v === "object" &&
    v !== null &&
    typeof v.ownerId === "string" &&
    typeof v.takenAt === "number" &&
    Array.isArray(v.profiles) &&
    Array.isArray(v.notes) &&
    Array.isArray(v.links)
  );
}

/**
 * This account's copy, or `null`. Someone else's is removed on the spot; an
 * unreadable one is simply replaced by the next refresh — unlike waiting
 * notes, nothing here exists only on the phone. Never throws: it runs as the
 * app opens.
 */
export function loadOfflineCopy(store: PhoneStore, ownerId: string): OfflineCopy | null {
  try {
    const raw = store.read();
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isCopy(parsed)) return null;
    if (parsed.ownerId !== ownerId) {
      store.remove();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

type Context = { copy: OfflineCopy | null; online: boolean };

const OfflineCopyContext = createContext<Context>({ copy: null, online: true });

export function OfflineCopyProvider({
  ownerId,
  store = offlineCopyStore,
  children,
}: {
  ownerId: string;
  store?: PhoneStore;
  children: React.ReactNode;
}) {
  const online = !useOffline();
  // What was on the phone when Andy opened — read once.
  const [onDisk] = useState<OfflineCopy | null>(() => loadOfflineCopy(store, ownerId));
  const fresh = useQuery(api.offline.snapshot);
  // The server's latest answer (stamped `takenAt` by the server). Convex keeps
  // the last answer after the connection drops, so this is also the copy for
  // a drop in the middle of a session.
  const latest = useMemo<OfflineCopy | null>(
    () => (fresh === undefined ? null : { ownerId, ...fresh }),
    [fresh, ownerId],
  );
  const copy = latest ?? onDisk;

  // Every new answer replaces the copy on disk. A failed write keeps it in
  // memory for this session; the next answer tries again.
  useEffect(() => {
    if (latest === null) return;
    try {
      store.write(JSON.stringify(latest));
    } catch {
      // Reading offline falls back to an older copy, or none; nothing is lost.
    }
  }, [latest, store]);

  return (
    <OfflineCopyContext.Provider value={{ copy, online }}>{children}</OfflineCopyContext.Provider>
  );
}

/**
 * The live answer when there is one; offline, the same screen built from the
 * phone's copy. `takenAt` is set only when the copy is what is showing, for
 * the "Offline — showing what Andy had at…" line.
 */
export function useLiveOrCopy<T>(
  live: T | undefined,
  fromCopy: (copy: OfflineCopy) => T,
): { data: T | undefined; takenAt: number | null } {
  const { copy, online } = useContext(OfflineCopyContext);
  if (live !== undefined) return { data: live, takenAt: null };
  if (!online && copy !== null) return { data: fromCopy(copy), takenAt: copy.takenAt };
  return { data: undefined, takenAt: null };
}

/** Whether Andy can reach the server right now. */
export function useOnline(): boolean {
  return useContext(OfflineCopyContext).online;
}

/**
 * Offline with nothing kept on the phone yet — a first session, or a fresh
 * install — so a screen has nothing to show and must say why rather than
 * wait on "Loading…" for an answer that cannot come.
 */
export function useNothingKeptOffline(): boolean {
  const { copy, online } = useContext(OfflineCopyContext);
  return !online && copy === null;
}

/** What a screen says in that case. */
export const NOTHING_KEPT_OFFLINE =
  "You're offline, and nothing has been kept on this phone yet — Andy keeps a copy the next time you're online.";
