import { fireEvent, render, screen } from "@testing-library/react-native";
import { View } from "react-native";
import { ConfirmHost, ConfirmProvider } from "../src/components/confirm-dialog";
import { DraftSheet } from "../src/components/draft-sheet";
import { LockedContext } from "../src/lib/lock-context";

/**
 * The follow-up draft is a native `<Modal>`, which iOS presents above the
 * whole React tree — above the app lock's cover too. So the sheet hides itself
 * while the lock is up, and comes back, edits intact, on unlock.
 */

const draft = { personName: "Rowan", subject: "Checking in", body: "Hi Rowan" };

function sheet(locked: boolean) {
  return (
    <LockedContext.Provider value={locked}>
      <ConfirmProvider>
      <DraftSheet
        draft={draft}
        onClose={jest.fn()}
        onRewrite={jest.fn()}
        rewriting={false}
        error={null}
      />
      {/* The app's own host, as in (app)/_layout.tsx, outside the sheet. */}
      <View testID="app-host">
        <ConfirmHost />
      </View>
      </ConfirmProvider>
    </LockedContext.Provider>
  );
}

test("should hide the draft while the app is locked and bring it back, edits intact, on unlock", async () => {
  const { rerender } = await render(sheet(false));
  await fireEvent.changeText(screen.getByLabelText("Subject"), "Coffee next week?");

  await rerender(sheet(true));
  expect(screen.queryByText("Follow-up to Rowan")).toBeNull();

  await rerender(sheet(false));
  expect(screen.getByText("Follow-up to Rowan")).toBeTruthy();
  expect(screen.getByLabelText("Subject").props.value).toBe("Coffee next week?");
});

/** Whether this element sits inside the native sheet rather than the app. */
function insideSheet(element: ReturnType<typeof screen.getByTestId>): boolean {
  let node = element.parent;
  while (node !== null) {
    if (node.props.testID === "app-host") return false;
    if (node.props.presentationStyle === "pageSheet") return true;
    node = node.parent;
  }
  return false;
}

test("should ask about replacing an edited draft inside the sheet, where it can be seen — once", async () => {
  const onRewrite = jest.fn();
  await render(
    <LockedContext.Provider value={false}>
      <ConfirmProvider>
        <DraftSheet draft={draft} onClose={jest.fn()} onRewrite={onRewrite} rewriting={false} error={null} />
        <View testID="app-host">
          <ConfirmHost />
        </View>
      </ConfirmProvider>
    </LockedContext.Provider>,
  );
  await fireEvent.changeText(screen.getByLabelText("Subject"), "Coffee next week?");
  await fireEvent.press(screen.getByLabelText("Write another draft"));

  // iOS draws the sheet above the app: a dialog drawn by the app's host would
  // open behind it. One dialog, in the sheet.
  const dialogs = screen.getAllByTestId("confirm-dialog");
  expect(dialogs).toHaveLength(1);
  expect(insideSheet(dialogs[0]!)).toBe(true);
  expect(screen.getByText("Replace what you wrote?")).toBeTruthy();
});

test("should hand an open question back to the app while the sheet hides under the lock", async () => {
  await render(sheet(false));
  await fireEvent.changeText(screen.getByLabelText("Subject"), "Coffee next week?");
  await fireEvent.press(screen.getByLabelText("Write another draft"));
  expect(insideSheet(screen.getByTestId("confirm-dialog"))).toBe(true);

  // The sheet hides itself when locked; the question is then the app's, where
  // the lock covers it — and the sheet's again on unlock.
  await screen.rerender(sheet(true));
  expect(screen.getAllByTestId("confirm-dialog")).toHaveLength(1);
  expect(insideSheet(screen.getByTestId("confirm-dialog"))).toBe(false);

  await screen.rerender(sheet(false));
  expect(screen.getAllByTestId("confirm-dialog")).toHaveLength(1);
  expect(insideSheet(screen.getByTestId("confirm-dialog"))).toBe(true);
});
