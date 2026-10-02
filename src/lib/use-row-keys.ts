import { useCallback, useState } from "react";

let issued = 0;

function issue(): number {
  issued += 1;
  return issued;
}

/**
 * A key per row of an editable list that stays with the row, not its position.
 *
 * Keyed by position, deleting a row from the middle shifts every row below it
 * up one, and React reuses the wrong on-screen field for each: the line being
 * typed in is torn down and the keyboard closes mid-sentence. These keys live
 * only on screen. The list itself stays a plain array of strings, so nothing
 * sent to the server changes.
 *
 * Rows added at the end get a fresh key on their own; rows dropped from the
 * end lose theirs. A removal from the middle has to say which row went, so call
 * `removeKey(index)` in the same handler that removes it from the list.
 */
export function useRowKeys(length: number): {
  keys: number[];
  removeKey: (index: number) => void;
} {
  const [keys, setKeys] = useState<number[]>(() =>
    Array.from({ length }, issue),
  );

  // Brought into line during render rather than in an effect, so a row never
  // renders even once without its key (React's "adjusting state when a prop
  // changes" pattern).
  let current = keys;
  if (keys.length !== length) {
    current =
      keys.length > length
        ? keys.slice(0, length)
        : [...keys, ...Array.from({ length: length - keys.length }, issue)];
    setKeys(current);
  }

  const removeKey = useCallback((index: number) => {
    setKeys((all) => all.filter((_, i) => i !== index));
  }, []);

  return { keys: current, removeKey };
}
