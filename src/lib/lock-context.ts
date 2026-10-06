import { createContext, useContext } from "react";

/**
 * True while the app lock covers the screen (locked, or still checking).
 *
 * The lock is drawn *over* the navigator rather than in place of it, so every
 * screen underneath keeps its state through a trip to another app. The one
 * thing an overlay cannot cover is a native modal — iOS presents it in its own
 * view controller above the whole React tree — so anything that opens a
 * `<Modal>` hides it while this is true and shows it again on unlock.
 */
export const LockedContext = createContext(false);

export function useLocked(): boolean {
  return useContext(LockedContext);
}
