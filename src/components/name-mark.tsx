import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg from "react-native-svg";
import { ThreadPaths } from "@/components/thread-paths";
import { colors } from "@/constants/theme";
import { threadGeometry } from "@/lib/thread-geometry";
import { useThreadMotion } from "@/lib/use-thread-motion";

/**
 * "andy", written in one brass thread — the app icon's thread, spelling the
 * name. Decided 2026-09-30; see STYLE.md → App Icon and Name Mark.
 *
 * One hand-drawn path, not a script font: a font cannot enter from the edge,
 * write the word without lifting and leave again, which is the whole point.
 * It comes in from the left edge, writes the name, makes the icon's loop above
 * the line, and rises off the right edge, so the path deliberately runs past
 * both sides of its 400×150 box. Place it where the screen edge can cut it:
 * a thread end on the page is exactly what the icon avoids.
 *
 * Landmarks, for editing it by hand: the first segment is the lead-in from the
 * edge; the a's bowl closes at x≈85, the n runs to x≈150, the d's ascender
 * peaks at (190, 20), the y's descender loop bottoms out at y≈146, and the last
 * four segments (from x≈270) are the icon's loop and the exit.
 */
const NAME_MARK_PATH =
  "M-4 118 C 24 114, 36 90, 46 74 C 54 60, 72 56, 84 64 C 70 56, 56 66, 56 82 C 56 100, 80 100, 85 68 C 84 84, 86 96, 94 98 C 100 96, 104 72, 106 62 C 108 80, 108 94, 108 100 C 110 80, 118 60, 128 62 C 138 64, 134 88, 138 98 C 140 102, 146 100, 150 92 C 153 72, 160 56, 174 56 C 180 56, 184 60, 185 64 C 172 58, 158 68, 158 84 C 158 100, 184 100, 188 70 C 190 50, 192 32, 190 20 C 188 40, 186 80, 192 98 C 194 102, 202 102, 206 94 C 208 86, 210 72, 212 62 C 212 80, 214 96, 224 96 C 234 96, 236 78, 238 62 C 238 90, 238 120, 232 136 C 226 150, 208 146, 216 130 C 224 116, 252 104, 270 96 C 288 90, 300 84, 312 76 C 328 64, 338 42, 324 38 C 310 34, 304 54, 318 64 C 332 74, 356 60, 404 46";

const WIDTH = 400;
const HEIGHT = 150;

/** The twist as on the icon: 1.8 on, 2.6 off at this scale. */
const GEOMETRY = threadGeometry(NAME_MARK_PATH, { on: 1.8, off: 2.6 });

/**
 * `draw` writes the name once when the mark appears — a greeting, not a loop
 * (STYLE.md → Thread motion). Without it the mark is simply there.
 */
export function NameMark({ style, draw = false }: { style?: StyleProp<ViewStyle>; draw?: boolean }) {
  const { offset, state } = useThreadMotion(draw ? "draw" : "still", GEOMETRY.length);
  return (
    // One element to assistive tech: the app's name as the screen's heading.
    // The drawing inside says nothing a screen reader could use.
    <View
      testID={`name-mark-${state}`}
      accessible
      accessibilityRole="header"
      accessibilityLabel="Andy"
      style={[styles.box, style]}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        {/* The twist: ink over brass rather than a seventh colour. */}
        <ThreadPaths
          d={NAME_MARK_PATH}
          geometry={GEOMETRY}
          offset={offset}
          width={4.4}
          stroke={colors.brass}
          twistWidth={1}
          twistStroke={colors.ink}
          twistOpacity={0.18}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  // Stretched, not `width: "100%"`: a percentage is of the parent's content
  // box, so a caller's negative margins only moved it left and the thread
  // stopped short of the right edge (seen on the simulator, 2026-09-30).
  box: { alignSelf: "stretch", aspectRatio: WIDTH / HEIGHT },
});
