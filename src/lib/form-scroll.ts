import type { ScrollViewProps } from "react-native";

/**
 * How every full-screen form scrolls: the note editor, Check this over, a
 * note's edit screen, a person's edit screen.
 *
 * `automaticallyAdjustKeyboardInsets` is the part that matters. Without it the
 * keyboard covers the bottom of the form and the scroll view does not know,
 * so the last fields cannot be scrolled into view at all (device QA build 4
 * #28: What you said on Check this over). iOS measures the keyboard itself;
 * see the note editor in `capture-screen.tsx` for why not a
 * `KeyboardAvoidingView`.
 *
 * One definition, because the screens that lacked it were the ones that had
 * copied the other two props and not this one.
 */
export const FORM_SCROLL = {
  keyboardShouldPersistTaps: "handled",
  keyboardDismissMode: "interactive",
  automaticallyAdjustKeyboardInsets: true,
} as const satisfies ScrollViewProps;
