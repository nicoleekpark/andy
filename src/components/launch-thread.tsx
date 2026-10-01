import { useEffect, useId, useState } from "react";
import { AccessibilityInfo, Animated, Easing, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { colors } from "@/constants/theme";

/**
 * The icon's loop on the launch hand-over and the wait for Andy to connect.
 * Decided 2026-09-30/10-01 (STYLE.md → Launch thread).
 *
 * Drawn to sit exactly where the launch screen's own image does — centred,
 * 144pt wide, the same view of the same path — so the hand-over from the
 * still launch image to this screen is not a cut. While Andy is still
 * connecting it "passes through": the thread draws in from the left, holds
 * as the whole loop for a beat, then leaves to the right, and again. It never
 * rests on a finished state, so nobody mistakes it for done.
 */
const LOOP =
  "M-4 80 C 14 76, 28 68, 38 60 C 54 48, 64 26, 50 22 C 36 18, 30 38, 44 48 C 58 58, 80 44, 104 30";

/** The launch image is this crop of the loop at 432×280 (3× of 144pt). */
const VIEW = { x: -4, y: 14, width: 108, height: 70 };
export const LAUNCH_THREAD_WIDTH = 144;

/**
 * The curve, walked once: points with their distance along it. react-native-svg
 * has no `pathLength`, so the dash that draws the thread on needs the real
 * length, and the twist's dashes need to know where along it they sit.
 */
function walk(points: number[][], samples = 120): { x: number; y: number; at: number }[] {
  const out = [{ x: points[0][0], y: points[0][1], at: 0 }];
  for (let s = 0; s + 3 < points.length; s += 3) {
    const [p0, p1, p2, p3] = points.slice(s, s + 4);
    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      const u = 1 - t;
      const x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0];
      const y = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1];
      const last = out[out.length - 1];
      out.push({ x, y, at: last.at + Math.hypot(x - last.x, y - last.y) });
    }
  }
  return out;
}

const WALK = walk(
  (LOOP.match(/-?\d+(\.\d+)?/g) ?? []).reduce<number[][]>((pairs, n, i, all) => {
    if (i % 2 === 0) pairs.push([Number(n), Number(all[i + 1])]);
    return pairs;
  }, []),
);
const LENGTH = WALK[WALK.length - 1].at;

/** The twist's pattern: 2.5 on, 3.9 off, as on the icon and the launch image. */
const TWIST_ON = 2.5;
const TWIST_OFF = 3.9;

/**
 * The twist as separate dashes, each knowing where along the thread it sits.
 * A dash pattern cannot also be the dash that draws the thread on, so while it
 * moves each dash appears only once the thread has been drawn past it, and goes
 * once the thread has left it.
 */
const TWIST = (() => {
  const dashes: { d: string; at: number }[] = [];
  for (let start = 0; start < LENGTH; start += TWIST_ON + TWIST_OFF) {
    const end = Math.min(start + TWIST_ON, LENGTH);
    const pts = WALK.filter((p) => p.at >= start && p.at <= end);
    // Away from the very ends, where the fade has them invisible anyway and
    // their visibility window would run off the animation's range.
    const at = (start + end) / 2;
    if (pts.length > 1 && at > 1 && at < LENGTH - 1) {
      dashes.push({
        d: pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" "),
        at,
      });
    }
  }
  return dashes;
})();

const DRAW_MS = 1080;
const HOLD_MS = 240;

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * Reduce Motion is honoured by hand: the platform spinner this replaces did it
 * for free, and that was one of the reasons it was chosen. The answer arrives
 * asynchronously, so the thread holds still until it does.
 */
function useReduceMotion(): boolean | null {
  // `null` until the system has answered: moving first and stopping once it
  // says no would hand somebody who asked for no motion a moment of it.
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

export function LaunchThread({ moving }: { moving: boolean }) {
  const reduceMotion = useReduceMotion();
  const animate = moving && reduceMotion === false;
  // One Animated.Value for the component's life. State, not a ref: it is read
  // while rendering (it drives the dash), which the compiler's rules forbid a
  // ref for.
  const [offset] = useState(() => new Animated.Value(LENGTH));
  // Per instance: SVG gradient ids are document-wide, and two threads on
  // screen at once would otherwise paint with each other's gradient.
  const id = useId().replace(/:/g, "");
  const fade = `fade${id}`;
  const fadeTwist = `fadeTwist${id}`;

  useEffect(() => {
    if (!animate) {
      return;
    }
    offset.setValue(LENGTH);
    const pass = Animated.loop(
      Animated.sequence([
        Animated.timing(offset, {
          toValue: 0,
          duration: DRAW_MS,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.delay(HOLD_MS),
        Animated.timing(offset, {
          toValue: -LENGTH,
          duration: DRAW_MS,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(offset, { toValue: LENGTH, duration: 0, useNativeDriver: false }),
      ]),
    );
    pass.start();
    return () => pass.stop();
  }, [animate, offset]);

  return (
    // Decorative: the words beside it say what is happening, and a focus stop
    // that only draws would make a screen reader slower without saying more.
    <View
      testID={animate ? "launch-thread-moving" : "launch-thread-still"}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: LAUNCH_THREAD_WIDTH, aspectRatio: VIEW.width / VIEW.height }}
    >
      <Svg width="100%" height="100%" viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.width} ${VIEW.height}`}>
        <Defs>
          {/* The same fade at both ends as the launch image, so no thread
              end is ever drawn. */}
          <LinearGradient id={fade} x1={VIEW.x} y1="0" x2={VIEW.x + VIEW.width} y2="0" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={colors.brass} stopOpacity="0" />
            <Stop offset="0.22" stopColor={colors.brass} stopOpacity="1" />
            <Stop offset="0.8" stopColor={colors.brass} stopOpacity="1" />
            <Stop offset="1" stopColor={colors.brass} stopOpacity="0" />
          </LinearGradient>
          <LinearGradient id={fadeTwist} x1={VIEW.x} y1="0" x2={VIEW.x + VIEW.width} y2="0" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={colors.ink} stopOpacity="0" />
            <Stop offset="0.22" stopColor={colors.ink} stopOpacity="0.18" />
            <Stop offset="0.8" stopColor={colors.ink} stopOpacity="0.18" />
            <Stop offset="1" stopColor={colors.ink} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        {animate ? (
          <AnimatedPath
            d={LOOP}
            fill="none"
            stroke={`url(#${fade})`}
            strokeWidth={6.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={[LENGTH, LENGTH]}
            strokeDashoffset={offset}
          />
        ) : (
          <Path
            d={LOOP}
            fill="none"
            stroke={`url(#${fade})`}
            strokeWidth={6.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {/* The twist, as on the icon, the launch image and the name mark: ink
            over brass rather than a seventh colour, faded at the ends with the
            thread so no dash outlives it. The same dashes still or moving, so
            nothing changes look at the moment it starts. */}
        {TWIST.map((dash) =>
          animate ? (
            <AnimatedPath
              key={dash.at}
              d={dash.d}
              fill="none"
              stroke={`url(#${fadeTwist})`}
              strokeWidth={1.4}
              strokeLinecap="round"
              // Drawn while the thread covers it: the offset runs LENGTH → 0
              // (drawing in) → −LENGTH (leaving), and the thread covers the
              // point `at` exactly while −at < offset < LENGTH − at.
              opacity={offset.interpolate({
                inputRange: [-LENGTH, -dash.at - 0.5, -dash.at + 0.5, LENGTH - dash.at - 0.5, LENGTH - dash.at + 0.5, LENGTH],
                outputRange: [0, 0, 1, 1, 0, 0],
                extrapolate: "clamp",
              })}
            />
          ) : (
            <Path
              key={dash.at}
              d={dash.d}
              fill="none"
              stroke={`url(#${fadeTwist})`}
              strokeWidth={1.4}
              strokeLinecap="round"
            />
          ),
        )}
      </Svg>
    </View>
  );
}
