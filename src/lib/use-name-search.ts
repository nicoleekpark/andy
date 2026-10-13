import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { searchView } from "@convex/offlineViews";
import { useLiveOrCopy } from "./offline-copy";

/**
 * How long a pause counts as "stopped typing".
 *
 * `useQuery` resubscribes on every argument change, so without this "judy" is
 * four subscriptions. Short enough that the list feels live, long enough that
 * a word is one query rather than one per letter.
 */
export const TYPING_SETTLES_MS = 180;

/**
 * Finding people by name or by a word in what you kept about them — free,
 * instant, and offline from the phone's copy. The one matching rule for every
 * place that does it (`home-actions.md` R4): Ask's field and home's search
 * field both come here, never to a second matcher of their own.
 *
 * `"skip"` rather than an empty query: no subscription at all while the box
 * is empty, instead of one that asks the backend to confirm nothing matches
 * nothing.
 */
export function useNameSearch(text: string) {
  const [settled, setSettled] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSettled(text), TYPING_SETTLES_MS);
    return () => clearTimeout(timer);
  }, [text]);
  const query = settled.trim();
  const { data, takenAt } = useLiveOrCopy(
    useQuery(api.people.search, query === "" ? "skip" : { query }),
    (copy) => (query === "" ? undefined : searchView(query, copy.profiles, copy.notes, copy.links)),
  );
  return { results: data, takenAt, settled: query };
}
