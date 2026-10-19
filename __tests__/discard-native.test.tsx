import { act, fireEvent, screen } from "@testing-library/react-native";
import { useQuery } from "convex/react";
import { renderRouter } from "expo-router/testing-library";
import { answerByName } from "../test-support/convex-mocks";

/**
 * Device QA B5-7 (`docs/qa/findings.md`): on a phone, back left Write first
 * and asked "Discard this note?" over home, so Cancel had nothing to cancel.
 * jest's stack is JavaScript and always waited for the answer — the suite was
 * green over the bug (`write-screen.test.tsx`, "stay on Cancel"). What makes a
 * device wait is the native stack being told, which only `usePreventRemove`
 * does (`preventNativeDismiss`). So this checks that it is told, and when.
 */

const mockPrevented: boolean[] = [];
jest.mock("expo-router/react-navigation", () => {
  const actual = jest.requireActual<typeof import("expo-router/react-navigation")>(
    "expo-router/react-navigation",
  );
  return {
    ...actual,
    usePreventRemove: (prevent: boolean, callback: Parameters<typeof actual.usePreventRemove>[1]) => {
      mockPrevented.push(prevent);
      actual.usePreventRemove(prevent, callback);
    },
  };
});

const WRITE_BODY = /^Write (or paste )?what you want to remember/;

beforeEach(() => {
  mockPrevented.length = 0;
  answerByName(useQuery, { "profiles:resolveNames": [], "profiles:people": [] }, () => undefined);
});

test("should tell the native stack to wait once there are words to lose, and not before", async () => {
  await renderRouter("src/app", { initialUrl: "/capture?door=write" });
  expect(mockPrevented.at(-1)).toBe(false);

  await act(async () => {
    fireEvent.changeText(screen.getByLabelText(WRITE_BODY), "Nina moved to Lisbon");
  });
  expect(mockPrevented.at(-1)).toBe(true);

  await act(async () => {
    fireEvent.changeText(screen.getByLabelText(WRITE_BODY), "   ");
  });
  expect(mockPrevented.at(-1)).toBe(false);
});
