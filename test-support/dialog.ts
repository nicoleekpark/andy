import { fireEvent, screen, within } from "@testing-library/react-native";
import * as dialogModule from "../src/components/confirm-dialog";
import type { ConfirmButton } from "../src/components/confirm-dialog";

/**
 * Taken before any test spies on it. The stand-in below still calls the real
 * hook — and so its hooks — because a test may swap it in after a screen has
 * rendered, and React refuses a component whose hooks change between renders.
 */
const realUseConfirm = dialogModule.useConfirm;

/**
 * Answer Andy's own confirmation dialog (`confirm-dialog.tsx`). It is drawn in
 * the tree rather than by `Alert.alert`, so it is pressed after it opens, not
 * armed before. Fails if no dialog is open, or it has no such button.
 */
export async function answerDialog(text: string) {
  await fireEvent.press(within(screen.getByTestId("confirm-dialog")).getByRole("button", { name: text }));
}

/**
 * Watch what a screen asks, the way a spy on `Alert.alert` used to: the
 * returned mock receives `(title, message, buttons)` for every `confirm(...)`
 * and draws nothing. For tests about the *asking* — which question, which
 * buttons, what each answer does. Tests about where the dialog is drawn (under
 * the lock, inside a sheet) use the real one and `answerDialog`.
 */
export function spyOnConfirm() {
  // One spy per test, however often this is called: a screen holds on to the
  // `confirm` it rendered with, so a second, fresh mock would never hear it.
  // A later call only changes how the same mock answers.
  if (current !== undefined && jest.isMockFunction(dialogModule.useConfirm)) {
    return current;
  }
  const confirm = jest.fn<void, [string, string?, ConfirmButton[]?]>();
  jest.spyOn(dialogModule, "useConfirm").mockImplementation(() => {
    realUseConfirm();
    return confirm;
  });
  current = confirm;
  return confirm;
}

let current: jest.Mock<void, [string, string?, ConfirmButton[]?]> | undefined;

/** `spyOnConfirm`, answering every question with the button called `text`. */
export function pressConfirmButton(text: string) {
  return spyOnConfirm().mockImplementation((_title, _message, buttons) => {
    buttons?.find((button) => button.text === text)?.onPress?.();
  });
}
