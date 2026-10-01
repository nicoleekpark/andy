import { useEffect, useState } from "react";

const seen = new Set<string>();

/**
 * True the first time a screen with this key mounts in this run of the app,
 * false after. For motion that greets you once: the empty home draws its thread
 * the first time, not every time you come back to it.
 */
export function useOncePerSession(key: string): boolean {
  const [first] = useState(() => !seen.has(key));
  useEffect(() => {
    seen.add(key);
  }, [key]);
  return first;
}

/** Tests only: start a fresh session. */
export function forgetSession(): void {
  seen.clear();
}
