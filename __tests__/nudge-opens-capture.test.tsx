jest.mock("../src/lib/native", () => ({ hasNativeModule: jest.fn(() => true) }));

jest.mock("expo-notifications", () => ({
  DEFAULT_ACTION_IDENTIFIER: "expo.modules.notifications.actions.DEFAULT",
  getLastNotificationResponse: jest.fn(() => null),
  clearLastNotificationResponse: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getPermissionsAsync: jest.fn(async () => ({ status: "undetermined", canAskAgain: true })),
  requestPermissionsAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  scheduleNotificationAsync: jest.fn(async () => "id"),
  SchedulableTriggerInputTypes: { DATE: "date" },
}));

import { act, screen, waitFor } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import { renderRouter } from "expo-router/testing-library";
import { captureTargetOf } from "../src/lib/notifications";
import { hasNativeModule } from "../src/lib/native";

/**
 * The briefing flow's last step (PROJECT_SCOPE.md): tapping the nudge after a
 * meeting ("How was Marcus?") opens that person's capture screen. Until this,
 * the nudge carried who it was about and nothing read it (QA 19.5).
 */

const PLAIN_TAP = "expo.modules.notifications.actions.DEFAULT";

function response(data: Record<string, unknown>, actionIdentifier = PLAIN_TAP) {
  return { actionIdentifier, notification: { request: { content: { data } } } };
}

const NUDGE = { kind: "andy.briefing", eventId: "e1", profileId: "p1", capture: true };
const BRIEFING = { kind: "andy.briefing", eventId: "e1", profileId: "p1" };

describe("which tapped notification opens capture", () => {
  test("should read the person off our nudge", () => {
    expect(captureTargetOf(response(NUDGE))).toBe("p1");
  });

  test("should leave the briefing before a meeting alone — it only opens the app", () => {
    expect(captureTargetOf(response(BRIEFING))).toBeNull();
  });

  test("should ignore anything that is not ours, a button other than the tap, or a bad id", () => {
    expect(captureTargetOf(response({ ...NUDGE, kind: "someone.else" }))).toBeNull();
    expect(captureTargetOf(response(NUDGE, "snooze"))).toBeNull();
    expect(captureTargetOf(response({ ...NUDGE, profileId: 42 }))).toBeNull();
    expect(captureTargetOf(response({ ...NUDGE, profileId: "" }))).toBeNull();
  });
});

describe("tapping the nudge", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should open that person's capture screen when the tap launched the app", async () => {
    (Notifications.getLastNotificationResponse as jest.Mock).mockReturnValueOnce(response(NUDGE));

    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;

    await waitFor(() => expect(result.getPathname()).toBe("/profile/p1/capture"));
    // Handled once: cleared, so the next unlock does not replay it.
    expect(Notifications.clearLastNotificationResponse).toHaveBeenCalledTimes(1);
  });

  test("should open it when the nudge is tapped while the app is open", async () => {
    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;
    expect(result.getPathname()).toBe("/");

    const listener = (Notifications.addNotificationResponseReceivedListener as jest.Mock).mock
      .calls[0]?.[0] as (r: ReturnType<typeof response>) => void;
    await act(async () => {
      listener(response(NUDGE));
    });

    await waitFor(() => expect(result.getPathname()).toBe("/profile/p1/capture"));
  });

  test("should stay where it is for the briefing before a meeting", async () => {
    (Notifications.getLastNotificationResponse as jest.Mock).mockReturnValueOnce(response(BRIEFING));

    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;
    await act(async () => {});

    expect(result.getPathname()).toBe("/");
    expect(Notifications.clearLastNotificationResponse).not.toHaveBeenCalled();
  });

  // This runs in the signed-in layout, so a binary without the emitter, or one
  // that throws, must cost only the shortcut — never the app (day 6 lost the
  // whole profile screen to a missing native module).
  test("should leave the app working when the notification side is missing or throws", async () => {
    (hasNativeModule as jest.Mock).mockReturnValueOnce(false);
    const missing = renderRouter("src/app", { initialUrl: "/" });
    await missing;
    expect(screen.getByText("Record")).toBeTruthy();

    (Notifications.getLastNotificationResponse as jest.Mock).mockImplementationOnce(() => {
      throw new Error("no emitter in this binary");
    });
    const throwing = renderRouter("src/app", { initialUrl: "/" });
    await throwing;
    expect(screen.getByText("Record")).toBeTruthy();
    expect(throwing.getPathname()).toBe("/");
  });
});
