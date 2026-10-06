import { fireEvent, render, screen } from "@testing-library/react-native";
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
      <DraftSheet
        draft={draft}
        onClose={jest.fn()}
        onRewrite={jest.fn()}
        rewriting={false}
        error={null}
      />
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
