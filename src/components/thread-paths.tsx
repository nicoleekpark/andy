import { Animated } from "react-native";
import { Path } from "react-native-svg";
import type { ThreadGeometry } from "@/lib/thread-geometry";

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * A thread and its twist, still or drawn on by `offset`. Goes inside an
 * <Svg>; the caller owns the frame, the colours and any fade.
 *
 * Drawing on is one dash the length of the thread, its offset running
 * length → 0 (drawing in) and on to −length (leaving). The twist cannot be a
 * dash pattern as well, so it is separate dashes, each shown while the thread
 * covers the point it sits at: −at < offset < length − at. The same dashes
 * are drawn still, so nothing changes look when motion starts or stops.
 */
export function ThreadPaths({
  d,
  geometry,
  offset,
  width,
  stroke,
  twistWidth,
  twistStroke,
  twistOpacity = 1,
}: {
  d: string;
  geometry: ThreadGeometry;
  /** null draws it still. */
  offset: Animated.Value | null;
  width: number;
  stroke: string;
  twistWidth: number;
  twistStroke: string;
  twistOpacity?: number;
}) {
  const { length, dashes } = geometry;
  const base = {
    d,
    fill: "none",
    stroke,
    strokeWidth: width,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <>
      {offset ? (
        <AnimatedPath {...base} strokeDasharray={[length, length]} strokeDashoffset={offset} />
      ) : (
        <Path {...base} />
      )}
      {dashes.map((dash) => {
        const twist = {
          d: dash.d,
          fill: "none",
          stroke: twistStroke,
          strokeWidth: twistWidth,
          strokeLinecap: "round" as const,
        };
        return offset ? (
          <AnimatedPath
            key={dash.at}
            {...twist}
            opacity={offset.interpolate({
              inputRange: [-length, -dash.at - 0.5, -dash.at + 0.5, length - dash.at - 0.5, length - dash.at + 0.5, length],
              outputRange: [0, 0, twistOpacity, twistOpacity, 0, 0],
              extrapolate: "clamp",
            })}
          />
        ) : (
          <Path key={dash.at} {...twist} opacity={twistOpacity} />
        );
      })}
    </>
  );
}
