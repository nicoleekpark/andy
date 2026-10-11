/** What `withTimeout` rejects with once the wait runs out. */
export class TimedOut extends Error {}

/**
 * `work`, or a `TimedOut` rejection after `ms` — whichever comes first.
 *
 * The timer is cleared as soon as the race settles either way, so a wait that
 * was answered in a second does not stay scheduled for the rest of its `ms`.
 * The work itself is not cancelled; whatever it resolves to later is ignored.
 */
export async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimedOut()), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
