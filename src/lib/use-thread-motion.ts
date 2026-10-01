import { useEffect, useState } from "react";
import { useReduceMotion } from "@/lib/use-reduce-motion";

/**
 * How a thread moves (STYLE.md → Launch thread, Thread motion):
 * - `still`: drawn, not moving.
 * - `pass`: draws in, holds, leaves, again — only while something is being
 *   waited for (the connecting screen).
 * - `draw`: writes itself once and stays — a greeting (sign-in, the empty
 *   home), never a loop, so it does not keep pulling at the eye.
 *
 * Returns the dash offset to draw with (null = drawn still) and the state.
 * Under Reduce Motion everything is still. While the system has not said,
 * `pass` shows the still thread and `draw` keeps the thread hidden, so it
 * neither flashes in nor starts moving before the answer.
 *
 * Driven frame by frame with requestAnimationFrame and plain state, not
 * Animated: under the new architecture a JS-driven Animated value on an SVG
 * dash offset committed only its final value, so `draw` sat blank for its
 * whole duration and then appeared at once (seen on the simulator,
 * 2026-10-01). Re-rendering a few dozen paths a frame for a second or two is
 * cheap, and it is the same on every renderer and in tests.
 */
export type ThreadMotion = "still" | "pass" | "draw";

export const DRAW_MS = 1080;
export const HOLD_MS = 240;
/**
 * Writing the name once: 4 s, so it reads as written rather than flashed
 * (developer, 2026-10-01). The default for `draw`; shorter lines pass their own.
 */
export const WRITE_MS = 4000;

const ease = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

/** Where the dash sits `elapsed` ms into a motion; `length` = hidden, 0 = drawn. */
export function offsetAt(
  motion: "pass" | "draw",
  elapsed: number,
  length: number,
  writeMs: number = WRITE_MS,
): number {
  if (motion === "draw") {
    return length * (1 - ease(Math.min(elapsed / writeMs, 1)));
  }
  const t = elapsed % (DRAW_MS + HOLD_MS + DRAW_MS);
  if (t < DRAW_MS) return length * (1 - ease(t / DRAW_MS));
  if (t < DRAW_MS + HOLD_MS) return 0;
  return -length * ease((t - DRAW_MS - HOLD_MS) / DRAW_MS);
}

/**
 * `writeMs` is how long `draw` takes: a long line (the name) needs longer than
 * a short one (the loop) to read as written at the same pace.
 */
export function useThreadMotion(motion: ThreadMotion, length: number, writeMs: number = WRITE_MS) {
  const reduceMotion = useReduceMotion();
  const [offset, setOffset] = useState(length);

  const animated =
    motion === "pass"
      ? reduceMotion === false
      : motion === "draw"
        ? reduceMotion !== true
        : false;
  const running = animated && reduceMotion === false;

  useEffect(() => {
    if (!running || motion === "still") {
      return;
    }
    let frame = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      start ??= now;
      const elapsed = now - start;
      setOffset(offsetAt(motion, elapsed, length, writeMs));
      // `draw` stops when written; `pass` goes on until unmounted or stilled.
      if (motion === "pass" || elapsed < writeMs) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running, motion, length, writeMs]);

  return {
    offset: animated ? offset : null,
    state: !animated ? "still" : motion === "pass" ? "moving" : "drawing",
  } as const;
}
