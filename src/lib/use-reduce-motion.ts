import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Whether the person has asked for less motion. `null` until the system has
 * answered: guessing "no" and stopping once it says yes would hand somebody
 * who asked for no motion a moment of it.
 */
export function useReduceMotion(): boolean | null {
  const [reduce, setReduce] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (live) setReduce(on);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return reduce;
}
