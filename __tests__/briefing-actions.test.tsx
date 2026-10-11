import { Linking, Pressable, Text } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ConfirmHost, ConfirmProvider } from "../src/components/confirm-dialog";
import { BriefingCard } from "../src/components/briefing-card";
import { calendarSetting, nextLocalMidnight, setCalendarSetting } from "../src/lib/calendar-setting";
import { useBriefingActions } from "../src/lib/use-briefing-actions";
import { answerDialog } from "../test-support/dialog";
import { colors } from "../src/constants/theme";

/**
 * The `briefing-card`'s own buttons (docs/design/decisions/calendar-connection.md,
 * Option A): the X and its `briefing-mute-alert`, Not now, and Open iPhone
 * Settings — with the real `confirm-dialog`, so what is asked is what shows.
 */
function Probe({ connected }: { connected: boolean }) {
  const { askToMute, notNow, openIphoneSettings } = useBriefingActions();
  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => askToMute(connected)}>
        <Text>mute</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={notNow}>
        <Text>not now</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={openIphoneSettings}>
        <Text>settings</Text>
      </Pressable>
    </>
  );
}

async function renderProbe(connected = true) {
  await render(
    <ConfirmProvider>
      <Probe connected={connected} />
      <ConfirmHost />
    </ConfirmProvider>,
  );
}

afterEach(() => {
  setCalendarSetting({ mode: "on" });
});

test("should mute until midnight from Mute for today", async () => {
  await renderProbe();
  await fireEvent.press(screen.getByText("mute"));

  expect(screen.getByText("Mute the briefing?")).toBeTruthy();
  await answerDialog("Mute for today");

  const setting = calendarSetting();
  expect(setting.mode).toBe("muted");
  // Until the next local midnight — from a moment this test cannot pin, so
  // checked against the two midnights it could be.
  expect(setting.mode === "muted" && setting.until).toBeGreaterThan(Date.now());
  expect(setting.mode === "muted" && setting.until).toBeLessThanOrEqual(nextLocalMidnight(Date.now()));
});

test("should turn it off from Mute until I turn it back on", async () => {
  await renderProbe();
  await fireEvent.press(screen.getByText("mute"));
  await answerDialog("Mute until I turn it back on");

  expect(calendarSetting()).toEqual({ mode: "off" });
});

test("should change nothing on Cancel", async () => {
  await renderProbe();
  await fireEvent.press(screen.getByText("mute"));
  await answerDialog("Cancel");

  expect(calendarSetting()).toEqual({ mode: "on" });
});

test("should not mention reminders before the calendar is connected", async () => {
  await renderProbe(false);
  await fireEvent.press(screen.getByText("mute"));

  expect(screen.getByText(/You can connect your calendar any time in Settings/)).toBeTruthy();
  expect(screen.queryByText(/reminders/)).toBeNull();
});

test("should paint neither mute choice in the deletion red", async () => {
  await renderProbe();
  await fireEvent.press(screen.getByText("mute"));

  // STYLE.md: `alert` is for deleting a note, a person or the account only.
  for (const label of ["Mute for today", "Mute until I turn it back on"]) {
    const style = [screen.getByRole("button", { name: label }).props.style].flat(Infinity);
    expect(style).not.toContainEqual(expect.objectContaining({ backgroundColor: colors.alert }));
  }
});

test("should turn it off at once, with no dialog, on Not now", async () => {
  await renderProbe();
  await fireEvent.press(screen.getByText("not now"));

  expect(screen.queryByTestId("confirm-dialog")).toBeNull();
  expect(calendarSetting()).toEqual({ mode: "off" });
});

test("should open Andy's own page in iPhone Settings", async () => {
  const open = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
  await renderProbe();
  await fireEvent.press(screen.getByText("settings"));

  expect(open).toHaveBeenCalledTimes(1);
});

test("should put the X on every visible card state, at a 44pt target", async () => {
  const onMute = jest.fn();
  const states = [
    <BriefingCard key="a" state="ask" onAsk={jest.fn()} asking={false} onNotNow={jest.fn()} onMute={onMute} />,
    <BriefingCard key="d" state="denied" onOpenSettings={jest.fn()} onMute={onMute} />,
    <BriefingCard key="e" state="empty" onMute={onMute} />,
    <BriefingCard
      key="r"
      state="ready"
      briefing={{ title: "Coffee with Nina", startsAt: 0, people: [], ambiguous: [] }}
      alerts="on"
      onEnableAlerts={jest.fn()}
      onMute={onMute}
    />,
  ];
  for (const card of states) {
    const { unmount } = await render(card);
    const x = screen.getByRole("button", { name: "Mute the briefing" });
    const style = Object.assign({}, ...[x.props.style].flat(Infinity));
    expect(style.width).toBeGreaterThanOrEqual(44);
    expect(style.height).toBeGreaterThanOrEqual(44);
    await fireEvent.press(x);
    await unmount();
  }
  expect(onMute).toHaveBeenCalledTimes(4);
});

test("should offer Connect calendar and Not now on the invitation, and Open iPhone Settings when refused", async () => {
  const onNotNow = jest.fn();
  const onOpenSettings = jest.fn();
  const first = await render(
    <BriefingCard state="ask" onAsk={jest.fn()} asking={false} onNotNow={onNotNow} onMute={jest.fn()} />,
  );
  expect(screen.getByRole("button", { name: "Connect calendar" })).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Not now" }));
  expect(onNotNow).toHaveBeenCalledTimes(1);
  await first.unmount();

  await render(<BriefingCard state="denied" onOpenSettings={onOpenSettings} onMute={jest.fn()} />);
  await fireEvent.press(screen.getByRole("button", { name: "Open iPhone Settings" }));
  expect(onOpenSettings).toHaveBeenCalledTimes(1);
});

test("should draw the meeting time in ink, not brass, so it can be read", async () => {
  await render(
    <BriefingCard
      state="ready"
      briefing={{ title: "Coffee with Nina", startsAt: 0, people: [], ambiguous: [] }}
      alerts="on"
      onEnableAlerts={jest.fn()}
      onMute={jest.fn()}
    />,
  );
  // Brass text on paper is 2.28:1 (STYLE.md → Accessibility); the stripe keeps it.
  const time = new Date(0).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const style = Object.assign({}, ...[screen.getByText(time).props.style].flat(Infinity));
  expect(style.color).toBe(colors.ink);
});
