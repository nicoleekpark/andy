import { useCallback, useState } from "react";

/**
 * Focus the line an "Add …" button just made, once.
 *
 * Without it the button produced an empty field and nothing else — a second
 * tap on a blank line was the only way to type in it. `autoFocus` only acts
 * when an input mounts, so typing in other lines never steals focus back.
 *
 * Cleared the moment the line takes focus. Left set, it outlived its job: the
 * list remounting later (Edit after a save, a second recording) put the same
 * key on a different, already-saved line, and that line grabbed the keyboard
 * though nobody had pressed Add.
 */
export function useJustAdded<K extends string | number>(): {
  markAdded: (key: K) => void;
  focusProps: (key: K) => { autoFocus: boolean; onFocus: () => void };
} {
  const [justAdded, setJustAdded] = useState<K | null>(null);
  const markAdded = useCallback((key: K) => setJustAdded(key), []);
  const focusProps = useCallback(
    (key: K) => ({
      autoFocus: justAdded === key,
      onFocus: () => setJustAdded(null),
    }),
    [justAdded],
  );
  return { markAdded, focusProps };
}
