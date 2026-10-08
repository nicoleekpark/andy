import { fireEvent, screen, within } from "@testing-library/react-native";

/**
 * Answer Andy's own confirmation dialog (`confirm-dialog.tsx`). It is drawn in
 * the tree rather than by `Alert.alert`, so it is pressed after it opens, not
 * armed before. Fails if no dialog is open, or it has no such button.
 */
export async function answerDialog(text: string) {
  await fireEvent.press(within(screen.getByTestId("confirm-dialog")).getByRole("button", { name: text }));
}
