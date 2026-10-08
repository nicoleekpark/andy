import { screen } from "@testing-library/react-native";

type Instance = ReturnType<typeof screen.getByLabelText>;

/**
 * The scroll view the field with this label sits in. Walks up from the field
 * itself rather than finding "the" scroll view: a stack keeps the screen
 * underneath mounted, so there can be several, and the one that matters is the
 * one the field is in.
 */
export function scrollViewAround(label: string): Instance | null {
  let node = screen.getByLabelText(label).parent;
  while (node !== null) {
    if (node.type === "RCTScrollView") return node;
    node = node.parent;
  }
  return null;
}

/**
 * What a form's scroll view must say, written out here rather than imported
 * from `FORM_SCROLL`: a check that read its expectation from the code under
 * test would agree with that code however it was broken.
 */
const EXPECTED = {
  automaticallyAdjustKeyboardInsets: true,
  keyboardDismissMode: "interactive",
  keyboardShouldPersistTaps: "handled",
};

/**
 * Whether that scroll view scrolls like a form: makes room for the keyboard,
 * lets it be dragged away, and keeps taps on buttons (device QA build 4 #28).
 */
export function scrollsAboveKeyboard(label: string): boolean {
  const scroll = scrollViewAround(label);
  return (
    scroll !== null &&
    Object.entries(EXPECTED).every(
      ([prop, value]) => (scroll.props as Record<string, unknown>)[prop] === value,
    )
  );
}
