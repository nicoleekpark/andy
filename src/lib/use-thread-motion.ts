import { useEffect, useState } from "react";
import { Animated, Easing } from "react-native";
import { useReduceMotion } from "@/lib/use-reduce-motion";

/**
 * How a thread moves (STYLE.md → Launch thread, Thread motion):
 * - `still`: drawn, not moving.
 * - `pass`: draws in, holds, leaves, again — only while something is being
 *   waited for (the connecting screen).
 * - `draw`: writes itself once and stays — a greeting (sign-in, the empty
 *   home), never a loop, so it does not keep pulling at the eye.
 *
 * Returns the dash offset to drive and whether to draw the animated version.
 * Under Reduce Motion everything is `still`. While the system has not said,
 * `pass` shows the still thread, and `draw` keeps the thread hidden (offset
 * at its full length) so it neither flashes in nor starts moving before the
 * answer.
 */
export type ThreadMotion = "still" | "pass" | "draw";

const DRAW_MS = 1080;
const HOLD_MS = 240;
const WRITE_MS = 1500;

export function useThreadMotion(motion: ThreadMotion, length: number) {
  const reduceMotion = useReduceMotion();
  // One Animated.Value for the component's life. State, not a ref: it is read
  // while rendering, which the compiler's rules forbid a ref for.
  const [offset] = useState(() => new Animated.Value(length));

  const animated =
    motion === "pass" ? reduceMotion === false : motion === "draw" ? reduceMotion !== true : false;
  const running = animated && reduceMotion === false;

  useEffect(() => {
    if (!running) {
      return;
    }
    offset.setValue(length);
    const ease = Easing.inOut(Easing.cubic);
    const run =
      motion === "pass"
        ? Animated.loop(
            Animated.sequence([
              Animated.timing(offset, { toValue: 0, duration: DRAW_MS, easing: ease, useNativeDriver: false }),
              Animated.delay(HOLD_MS),
              Animated.timing(offset, { toValue: -length, duration: DRAW_MS, easing: ease, useNativeDriver: false }),
              Animated.timing(offset, { toValue: length, duration: 0, useNativeDriver: false }),
            ]),
          )
        : Animated.timing(offset, { toValue: 0, duration: WRITE_MS, easing: ease, useNativeDriver: false });
    run.start();
    return () => run.stop();
  }, [running, motion, length, offset]);

  return { offset, animated, state: !animated ? "still" : motion === "pass" ? "moving" : "drawing" } as const;
}
