import { Linking } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { CalendarSection } from "../src/components/calendar-section";
import { calendarSetting, setCalendarSetting } from "../src/lib/calendar-setting";
import { askForCalendar, calendarAccess } from "../src/lib/calendar";
import { askForNotifications, notificationAccess } from "../src/lib/notifications";
import { useFeature } from "../src/lib/feature-flags";

/**
 * `settings` → Calendar (docs/design/decisions/calendar-connection.md, Option A,
 * R18–R22): every state's controls, and what each one does.
 */
jest.mock("../src/lib/calendar", () => ({ calendarAccess: jest.fn(), askForCalendar: jest.fn() }));
jest.mock("../src/lib/notifications", () => ({
  notificationAccess: jest.fn(),
  askForNotifications: jest.fn(),
}));
jest.mock("../src/lib/feature-flags", () => ({ useFeature: jest.fn() }));

function permissions(calendar: string, alerts = "granted") {
  (calendarAccess as jest.Mock).mockResolvedValue({ state: calendar });
  (notificationAccess as jest.Mock).mockResolvedValue({ state: alerts });
}

async function shown() {
  await render(<CalendarSection />);
  await waitFor(() => expect(screen.getByTestId("calendar-section")).toBeTruthy());
}

beforeEach(() => {
  (useFeature as jest.Mock).mockReturnValue(true);
  (askForCalendar as jest.Mock).mockResolvedValue({ state: "granted" });
  (askForNotifications as jest.Mock).mockResolvedValue({ state: "granted" });
  setCalendarSetting({ mode: "on" });
});

afterEach(() => {
  setCalendarSetting({ mode: "on" });
  // `restoreMocks` resets spies, not the jest.fn()s of a `jest.mock` factory:
  // without this, one test's asking iOS counts in the next.
  jest.clearAllMocks();
});

test("should explain and offer Connect calendar when never asked, and connect on it", async () => {
  permissions("undetermined");
  setCalendarSetting({ mode: "off" }); // e.g. Not now on the card
  await shown();

  expect(screen.getByText(/nothing leaves it, and nothing is added/)).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Connect calendar" }));

  await waitFor(() => expect(askForCalendar).toHaveBeenCalledTimes(1));
  expect(calendarSetting()).toEqual({ mode: "on" });
});

test("should send someone who refused to iPhone Settings", async () => {
  permissions("denied");
  const open = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
  await shown();

  expect(screen.queryByRole("button", { name: "Connect calendar" })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Open iPhone Settings" }));
  expect(open).toHaveBeenCalledTimes(1);
});

test("should turn off in Andy at once, and back on without asking iOS again", async () => {
  permissions("granted");
  await shown();

  expect(screen.getByText("On — Andy reads your calendar on this phone.")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Turn off in Andy" }));

  // No confirmation: one tap undoes it (R19).
  expect(calendarSetting()).toEqual({ mode: "off" });
  await waitFor(() => expect(screen.getByText(/^Off — Andy isn't reading your calendar/)).toBeTruthy());

  await fireEvent.press(screen.getByRole("button", { name: "Connect calendar" }));
  // Access is already allowed: straight back on, no iOS sheet (R20).
  expect(askForCalendar).not.toHaveBeenCalled();
  expect(calendarSetting()).toEqual({ mode: "on" });
});

test("should always offer removing access completely, since an app cannot give it back", async () => {
  permissions("granted");
  await shown();

  expect(screen.getByText(/To take away access completely/)).toBeTruthy();
  expect(screen.getAllByRole("button", { name: "Open iPhone Settings" }).length).toBeGreaterThan(0);
});

test("should say muted until tomorrow, and turn back on from there", async () => {
  permissions("granted");
  setCalendarSetting({ mode: "muted", until: Date.now() + 3600_000 });
  await shown();

  await waitFor(() => expect(screen.getByText(/Muted until tomorrow/)).toBeTruthy());
  await fireEvent.press(screen.getByRole("button", { name: "Turn back on" }));
  expect(calendarSetting()).toEqual({ mode: "on" });
});

test("should read a mute that has run out as on", async () => {
  permissions("granted");
  setCalendarSetting({ mode: "muted", until: Date.now() - 1000 });
  await shown();

  expect(screen.queryByText(/Muted until tomorrow/)).toBeNull();
  expect(screen.getByText("On — Andy reads your calendar on this phone.")).toBeTruthy();
});

test("should show nothing when switched off remotely or missing from the build", async () => {
  permissions("granted");
  (useFeature as jest.Mock).mockReturnValue(false);
  const first = await render(<CalendarSection />);
  await act(async () => {});
  expect(screen.queryByTestId("calendar-section")).toBeNull();
  await first.unmount();

  (useFeature as jest.Mock).mockReturnValue(true);
  permissions("unavailable");
  await render(<CalendarSection />);
  await act(async () => {});
  expect(screen.queryByTestId("calendar-section")).toBeNull();
});

test("should ask for reminders at this point of use, not as a side effect of connecting", async () => {
  permissions("granted", "undetermined");
  await shown();

  expect(askForNotifications).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("button", { name: "Remind me 10 minutes before" }));
  expect(askForNotifications).toHaveBeenCalledTimes(1);
});

test("should state the reminder promise once allowed, and point to iPhone Settings once refused", async () => {
  permissions("granted", "granted");
  const first = await render(<CalendarSection />);
  await waitFor(() => expect(screen.getByText(/They show a name, never what you wrote/)).toBeTruthy());
  await first.unmount();

  permissions("granted", "denied");
  await render(<CalendarSection />);
  await waitFor(() => expect(screen.getByText("Notifications are off for Andy.")).toBeTruthy());
});

test("should not show the reminder row while the calendar is off", async () => {
  permissions("granted", "undetermined");
  setCalendarSetting({ mode: "off" });
  await shown();

  expect(screen.queryByTestId("reminders-row")).toBeNull();
});
