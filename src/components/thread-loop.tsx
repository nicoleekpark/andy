import { useId } from "react";
import { View } from "react-native";
import Svg, { Defs, LinearGradient, Stop } from "react-native-svg";
import { ThreadPaths } from "@/components/thread-paths";
import { colors } from "@/constants/theme";
import { threadGeometry } from "@/lib/thread-geometry";
import { useThreadMotion, type ThreadMotion } from "@/lib/use-thread-motion";

/**
 * The icon's loop, faded at both ends the way the launch image is, so no end
 * of the thread is ever drawn (STYLE.md → Launch thread, Thread motion).
 *
 * At its default 144pt it sits exactly where the launch screen's own image
 * does — same view of the same path — so the hand-over from the still launch
 * image is not a cut. It moves the way the motion says: `pass` on the
 * connecting screen, `draw` once to greet (the empty home), `still` otherwise.
 */
const LOOP =
  "M-4 80 C 14 76, 28 68, 38 60 C 54 48, 64 26, 50 22 C 36 18, 30 38, 44 48 C 58 58, 80 44, 104 30";

/** The launch image is this crop of the loop at 432×280 (3× of 144pt). */
const VIEW = { x: -4, y: 14, width: 108, height: 70 };
const LAUNCH_THREAD_WIDTH = 144;

/**
 * Drawing the loop once (the empty home): ~1.2 s, the pace the developer
 * picked from the presence mock (option E's draw-in, 45% of a 2.6 s pass),
 * 2026-10-01. The loop is a short line; the name's 4 s would crawl here.
 */
export const LOOP_WRITE_MS = 1200;

/** The twist's pattern: 2.5 on, 3.9 off, as on the icon and the launch image. */
const GEOMETRY = threadGeometry(LOOP, { on: 2.5, off: 3.9 });

export function ThreadLoop({
  motion,
  width = LAUNCH_THREAD_WIDTH,
}: {
  motion: ThreadMotion;
  width?: number;
}) {
  const { offset, state } = useThreadMotion(motion, GEOMETRY.length, LOOP_WRITE_MS);
  // Per instance: SVG gradient ids are document-wide, and two threads on
  // screen at once would otherwise paint with each other's gradient.
  const id = useId().replace(/:/g, "");
  const fade = `fade${id}`;
  const fadeTwist = `fadeTwist${id}`;

  return (
    // Decorative: the words beside it say what is happening, and a focus stop
    // that only draws would make a screen reader slower without saying more.
    <View
      testID={`thread-loop-${state}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width, aspectRatio: VIEW.width / VIEW.height }}
    >
      <Svg width="100%" height="100%" viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.width} ${VIEW.height}`}>
        <Defs>
          <LinearGradient id={fade} x1={VIEW.x} y1="0" x2={VIEW.x + VIEW.width} y2="0" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={colors.brass} stopOpacity="0" />
            <Stop offset="0.22" stopColor={colors.brass} stopOpacity="1" />
            <Stop offset="0.8" stopColor={colors.brass} stopOpacity="1" />
            <Stop offset="1" stopColor={colors.brass} stopOpacity="0" />
          </LinearGradient>
          {/* The twist: ink over brass rather than a seventh colour, faded with
              the thread so no dash outlives it. */}
          <LinearGradient id={fadeTwist} x1={VIEW.x} y1="0" x2={VIEW.x + VIEW.width} y2="0" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={colors.ink} stopOpacity="0" />
            <Stop offset="0.22" stopColor={colors.ink} stopOpacity="0.18" />
            <Stop offset="0.8" stopColor={colors.ink} stopOpacity="0.18" />
            <Stop offset="1" stopColor={colors.ink} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <ThreadPaths
          d={LOOP}
          geometry={GEOMETRY}
          offset={offset}
          width={6.4}
          stroke={`url(#${fade})`}
          twistWidth={1.4}
          twistStroke={`url(#${fadeTwist})`}
        />
      </Svg>
    </View>
  );
}
