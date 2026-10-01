import { screen } from "@testing-library/react-native";

/**
 * How much of a thread is drawn: the paths under the element with this testID
 * (the thread itself plus each twist dash currently covered), read off the
 * rendered tree. Counting what is drawn — not whether an animation was asked
 * for — is the point: an Animated value that only committed its last frame
 * passed a "was the loop started" test while the screen sat blank (2026-10-01).
 */
type Node = { type?: string; props?: { testID?: string }; children?: unknown[] | null };
export function drawn(testID: string): number {
  const find = (node: Node | null): Node | null => {
    if (!node || typeof node !== "object") return null;
    if (node.props?.testID === testID) return node;
    for (const child of node.children ?? []) {
      const hit = find(child as Node);
      if (hit) return hit;
    }
    return null;
  };
  const count = (node: Node): number =>
    (node.type === "RNSVGPath" ? 1 : 0) +
    (node.children ?? []).reduce<number>(
      (sum, child) => sum + (child && typeof child === "object" ? count(child as Node) : 0),
      0,
    );
  const root = find(screen.toJSON() as Node);
  return root ? count(root) : 0;
}
