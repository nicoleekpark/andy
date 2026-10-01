import { Path } from "react-native-svg";
import type { ThreadGeometry } from "@/lib/thread-geometry";

/**
 * A thread and its twist, still or drawn on by `offset`. Goes inside an
 * <Svg>; the caller owns the frame, the colours and any fade.
 *
 * Drawing on is one dash the length of the thread, its offset running
 * length → 0 (drawing in) and on to −length (leaving). The twist cannot be a
 * dash pattern as well, so it is separate dashes, each drawn while the thread
 * covers the point it sits at: −at < offset < length − at. The same dashes are
 * drawn still, so nothing changes look when motion starts or stops.
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
  offset: number | null;
  width: number;
  stroke: string;
  twistWidth: number;
  twistStroke: string;
  twistOpacity?: number;
}) {
  const { length, dashes } = geometry;
  const covered = (at: number) => offset === null || (-at < offset && offset < length - at);
  return (
    <>
      <Path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...(offset === null ? {} : { strokeDasharray: [length, length], strokeDashoffset: offset })}
      />
      {dashes
        .filter((dash) => covered(dash.at))
        .map((dash) => (
          <Path
            key={dash.at}
            d={dash.d}
            fill="none"
            stroke={twistStroke}
            strokeWidth={twistWidth}
            strokeLinecap="round"
            opacity={twistOpacity}
          />
        ))}
    </>
  );
}
