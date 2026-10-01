/**
 * The thread's shape as numbers: how long it is and where each dash of its
 * twist sits along it. react-native-svg has no `pathLength`, so drawing a
 * thread on with a dash needs the real length, and the twist (a dash pattern
 * of its own) has to be split into dashes that can appear as the thread
 * reaches them. Shared by every thread Andy draws: the launch loop, the empty
 * home's loop and the name mark.
 *
 * Only the path shape Andy uses is understood: one `M` then cubic `C`
 * segments, every number a coordinate.
 */
export type ThreadGeometry = {
  length: number;
  dashes: { d: string; at: number }[];
};

function points(path: string): number[][] {
  const numbers = (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const pairs: number[][] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) pairs.push([numbers[i], numbers[i + 1]]);
  return pairs;
}

function walk(pts: number[][], samples: number): { x: number; y: number; at: number }[] {
  const out = [{ x: pts[0][0], y: pts[0][1], at: 0 }];
  for (let s = 0; s + 3 < pts.length; s += 3) {
    const [p0, p1, p2, p3] = pts.slice(s, s + 4);
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

export function threadGeometry(
  path: string,
  twist: { on: number; off: number },
  samples = 120,
): ThreadGeometry {
  const along = walk(points(path), samples);
  const length = along[along.length - 1].at;
  const dashes: ThreadGeometry["dashes"] = [];
  for (let start = 0; start < length; start += twist.on + twist.off) {
    const end = Math.min(start + twist.on, length);
    const at = (start + end) / 2;
    const pts = along.filter((p) => p.at >= start && p.at <= end);
    // Away from the very ends, where the thread is faded or off the page
    // anyway and a dash's visibility window would run off the motion's range.
    if (pts.length > 1 && at > 1 && at < length - 1) {
      dashes.push({
        d: pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" "),
        at,
      });
    }
  }
  return { length, dashes };
}
