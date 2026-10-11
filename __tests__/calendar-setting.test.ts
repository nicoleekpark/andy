import {
  calendarSetting,
  muteForToday,
  nextLocalMidnight,
  setCalendarSetting,
  settingAt,
} from "../src/lib/calendar-setting";
import { forgetOnThisPhone } from "../src/lib/on-phone";

/**
 * The person's own calendar setting, kept on this phone
 * (docs/design/decisions/calendar-connection.md → Brief, R8 and R15).
 */
const files = () =>
  (jest.requireMock("expo-file-system") as { __files: Map<string, string> }).__files;
const SETTING = "file:///documents/calendar-setting/setting.json";

afterEach(() => {
  setCalendarSetting({ mode: "on" });
});

test("should be on when nothing has been chosen", () => {
  expect(calendarSetting()).toEqual({ mode: "on" });
});

test("should mute until the next local midnight, from the calendar date", () => {
  const lateEvening = new Date(2026, 9, 11, 23, 59).getTime();
  const until = nextLocalMidnight(lateEvening);
  const midnight = new Date(until);

  // Muting at 23:59 means one minute — kept literal (R12).
  expect([midnight.getDate(), midnight.getHours(), midnight.getMinutes()]).toEqual([12, 0, 0]);
  expect(until - lateEvening).toBe(60_000);
});

test("should keep the setting on this phone, so it survives a restart", () => {
  muteForToday(new Date(2026, 9, 11, 9, 0).getTime());

  expect(JSON.parse(files().get(SETTING)!)).toEqual({
    mode: "muted",
    until: new Date(2026, 9, 12).getTime(),
  });
});

test("should read a mute whose moment has passed as on", () => {
  const muted = { mode: "muted", until: 1_000 } as const;
  expect(settingAt(muted, 999)).toEqual(muted);
  expect(settingAt(muted, 1_000)).toEqual({ mode: "on" });
});

test("should go back to on after a sign-out, in memory and on disk", () => {
  setCalendarSetting({ mode: "off" });
  expect(files().has(SETTING)).toBe(true);

  forgetOnThisPhone();

  // The next account on this phone must not inherit "off" or "muted" (R15).
  expect(files().has(SETTING)).toBe(false);
  expect(calendarSetting()).toEqual({ mode: "on" });
});
