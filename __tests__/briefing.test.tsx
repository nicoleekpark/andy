jest.mock("../src/lib/native", () => ({ hasNativeModule: jest.fn(() => true) }));

// Neither of these is stubbed by jest-expo, and both must never reach a real
// device API from a test. Mocked here rather than at the call site, because
// reading somebody's calendar is the one thing in this file that must not
// happen for real.
jest.mock("expo-calendar", () => ({
  getCalendarPermissions: jest.fn(),
  requestCalendarPermissions: jest.fn(),
  getCalendars: jest.fn(async () => [{ id: "cal-1" }]),
  listEvents: jest.fn(async () => []),
  EntityTypes: { EVENT: "event", REMINDER: "reminder" },
}));

/**
 * `getCalendars` as SDK 57's native module actually behaves: called without
 * `EntityTypes.EVENT` it lists reminder lists as well and throws unless the
 * REMINDERS permission is held, which this app never asks for. The stub used
 * to answer any call, so the suite stayed green while every real read failed.
 */
function calendarsNeedAnEntityType() {
  (Calendar.getCalendars as jest.Mock).mockImplementation(async (type?: string) => {
    if (type !== "event") {
      throw new Error("MissionPermissionsException: REMINDERS permission is required");
    }
    return [{ id: "cal-1" }];
  });
}

jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  scheduleNotificationAsync: jest.fn(async () => "id"),
  SchedulableTriggerInputTypes: { DATE: "date" },
}));

import * as Calendar from "expo-calendar";
import * as Notifications from "expo-notifications";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo, AppState } from "react-native";
import { useConvex } from "convex/react";
import { BriefingCard } from "../src/components/briefing-card";
import { hasNativeModule } from "../src/lib/native";
import { useBriefing } from "../src/lib/use-briefing";
import { BRIEFING_LEAD_MINUTES } from "../src/lib/notifications";
import { useReadingCopy } from "../src/lib/offline-copy";
import { muteForToday, nextLocalMidnight, setCalendarSetting } from "../src/lib/calendar-setting";
import * as calendarMatch from "@convex/calendarMatch";
import { NONE, pick, picksOf } from "../src/lib/briefing-picks";
import { forgetOnThisPhone } from "../src/lib/on-phone";
import { formatDate } from "../src/lib/dates";

jest.mock("convex/react", () => ({ useConvex: jest.fn() }));
// The phone's copy, which matching reads. Mocked so these tests need no
// providers; `useReadingCopy` itself is the offline-copy suite's business.
jest.mock("../src/lib/offline-copy", () => ({ useReadingCopy: jest.fn() }));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

/**
 * A meeting two hours from now, on the minute. It used to be a fixed date in
 * the past, which the card now drops: a meeting leaves it when it starts.
 */
const AT = Math.ceil((Date.now() + 2 * 3600_000) / 60_000) * 60_000;

function grant(granted: boolean, canAskAgain = true) {
  (Calendar.getCalendarPermissions as jest.Mock).mockResolvedValue({
    granted,
    canAskAgain,
    status: granted ? "granted" : "denied",
  });
}

function calendarSays(events: Record<string, unknown>[]) {
  (Calendar.listEvents as jest.Mock).mockResolvedValue(events);
}

/**
 * What matching the events against the person's people comes out with.
 *
 * Matching runs on the phone (`matchEventsIn`, against the phone's copy), so
 * this spies on that function rather than a server: tests about what the
 * *card* does with an answer set the answer here; `calendarMatch` has its own
 * tests for how names are found. Returns the spy, so a test can read back
 * which events were matched — `mock.calls[n][2]`.
 */
function backendSays(matched: Record<string, unknown>[]) {
  return jest
    .spyOn(calendarMatch, "matchEventsIn")
    .mockImplementation(() => matched as ReturnType<typeof calendarMatch.matchEventsIn>);
}

/**
 * The phone's copy with one person in it — enough for the briefing to start.
 * With nobody in Andy there is no card at all (R2), which has its own test.
 */
const EMPTY_COPY = {
  ownerId: "user_a",
  takenAt: 0,
  profiles: [
    { _id: "p-nina", _creationTime: 0, userId: "u", name: "Nina", entityType: "person", tags: [], autoCreated: false },
  ],
  notes: [],
  links: [],
};

/**
 * `render` is awaited everywhere below, and that is not a style choice.
 * `@testing-library/react-native` v14 returns a promise from it, so an
 * un-awaited render leaves `screen` unbound and every query throws
 * "`render` function has not been called" — which reads exactly like a
 * component that rendered nothing. Day 1 logged the same trap for
 * `renderRouter`; this is the same shape, one version later.
 */

/** A harness that renders whatever the hook currently says. */
function Harness({ enabled = true }: { enabled?: boolean }) {
  const { briefing, ask, alerts, askForAlerts, answer, unanswer } = useBriefing(enabled);
  const onMute = jest.fn();
  if (
    briefing.state === "loading" ||
    briefing.state === "off" ||
    briefing.state === "muted" ||
    briefing.state === "nobody"
  ) {
    return null;
  }
  if (briefing.state === "ask") {
    return (
      <BriefingCard
        state="ask"
        onAsk={() => void ask()}
        asking={briefing.asking}
        onNotNow={jest.fn()}
        onMute={onMute}
      />
    );
  }
  if (briefing.state === "ready") {
    return (
      <BriefingCard
        state="ready"
        briefings={briefing.briefings}
        now={briefing.now}
        alerts={alerts}
        onEnableAlerts={() => void askForAlerts()}
        onAnswer={answer}
        onUnanswer={unanswer}
        onMute={onMute}
      />
    );
  }
  if (briefing.state === "denied") {
    return <BriefingCard state="denied" onOpenSettings={jest.fn()} onMute={onMute} />;
  }
  if (briefing.state === "empty") return <BriefingCard state="empty" onMute={onMute} />;
  return <BriefingCard state="unavailable" />;
}

beforeEach(() => {
  // Every one of these, every test. `clearAllMocks` in the shared `afterEach`
  // empties the implementations the `jest.mock` factory gave them along with
  // their call records — so a mock set up once at the top returns `undefined`
  // from the second test onward. That failure does not look like a missing
  // mock: `getCalendars()` returning `undefined` throws inside the reader,
  // the throw is caught, and the card silently renders as "unavailable" —
  // three tests passed for the wrong reason before this was found.
  (hasNativeModule as jest.Mock).mockReturnValue(true);
  calendarsNeedAnEntityType();
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
    granted: true,
    canAskAgain: false,
  });
  (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);
  (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockResolvedValue(undefined);
  (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue("id");
  (useReadingCopy as jest.Mock).mockReturnValue(EMPTY_COPY);
  setCalendarSetting({ mode: "on" });
  backendSays([]);
  calendarSays([]);
  grant(true);
});

afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// The remote switch (INFRA.md #6)
// ---------------------------------------------------------------------------

test("should read nothing and show nothing when switched off remotely", async () => {
  grant(true);
  await render(<Harness enabled={false} />);

  await waitFor(() => expect(Notifications.getAllScheduledNotificationsAsync).toHaveBeenCalled());
  expect(screen.queryByTestId("briefing-card")).toBeNull();
  // Not even the permission is checked: switched off means the calendar is
  // left alone entirely.
  expect(Calendar.getCalendarPermissions).not.toHaveBeenCalled();
  expect(Calendar.listEvents).not.toHaveBeenCalled();
});

test("should cancel the reminders already on the phone when switched off", async () => {
  (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
    { identifier: "ours", content: { data: { kind: "andy.briefing" } } },
    { identifier: "someone-else", content: { data: {} } },
  ]);
  await render(<Harness enabled={false} />);

  // A switch that left them would keep buzzing for days after it was flipped.
  await waitFor(() =>
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("ours"),
  );
  expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith("someone-else");
});

test("should leave no reminder behind when switched off while they are being written", async () => {
  // A phone's pending notifications, so cancelling and scheduling act on
  // the same list — the race is between the two.
  const pending: { identifier: string; content: { data: { kind?: string } } }[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockImplementation(async () => [...pending]);
  (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockImplementation(async (id: string) => {
    const at = pending.findIndex((request) => request.identifier === id);
    if (at >= 0) pending.splice(at, 1);
  });
  (Notifications.scheduleNotificationAsync as jest.Mock).mockImplementation(
    async (request: { content: { data: { kind?: string } } }) => {
      await gate;
      pending.push({ identifier: `n${pending.length}`, content: request.content });
      return "id";
    },
  );
  const soon = Date.now() + 2 * 3600_000;
  calendarSays([
    { id: "e1", title: "Coffee with Marcus", startDate: new Date(soon), endDate: new Date(soon + 3600_000), allDay: false },
  ]);
  backendSays([
    {
      eventId: "e1",
      title: "Coffee with Marcus",
      startsAt: soon,
      endsAt: soon + 3600_000,
      people: [{ profileId: "p1", name: "Marcus", noteCount: 1 }],
      ambiguous: [],
    },
  ]);

  const { rerender } = await render(<Harness />);
  await waitFor(() => expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled());

  // Switched off while the reminder is still being written, then it lands.
  await rerender(<Harness enabled={false} />);
  await act(async () => {
    release();
  });

  await waitFor(() =>
    expect(pending.filter((request) => request.content.data.kind === "andy.briefing")).toEqual([]),
  );
});

test("should come back when switched on again, live", async () => {
  grant(true);
  const { rerender } = await render(<Harness enabled={false} />);
  expect(screen.queryByTestId("briefing-card")).toBeNull();

  await rerender(<Harness enabled />);
  await waitFor(() => expect(screen.getByTestId("briefing-card")).toBeTruthy());
});

// ---------------------------------------------------------------------------
// The person's own setting (docs/design/decisions/calendar-connection.md)
// ---------------------------------------------------------------------------

/** Two meetings with Nina: one later today, one at 08:00 tomorrow. */
function todayAndTomorrow() {
  (calendarMatch.matchEventsIn as jest.Mock).mockRestore();
  const now = Date.now();
  const midnight = nextLocalMidnight(now);
  // Halfway to midnight, so its reminder is still ahead of now.
  // Whole milliseconds: a Date drops the fraction, and a fractional time would
  // make "this reminder was not scheduled" pass whatever was scheduled.
  const today = Math.round(now + Math.max((midnight - now) / 2, 20 * 60_000));
  const tomorrow = midnight + 8 * 3600_000;
  calendarSays([
    { id: "today", title: "Coffee with Nina", startDate: new Date(today), endDate: new Date(today + 1800_000), allDay: false },
    { id: "tomorrow", title: "Breakfast with Nina", startDate: new Date(tomorrow), endDate: new Date(tomorrow + 3600_000), allDay: false },
  ]);
  return { today, tomorrow, midnight };
}

/** When each scheduled briefing (not nudge) will fire. */
function briefingTimes(): number[] {
  return (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls
    .map(([request]) => request as { content: { data: { capture?: boolean } }; trigger: { date: Date } })
    .filter((request) => request.content.data.capture !== true)
    .map((request) => request.trigger.date.getTime());
}

test("should show no card while nobody is in Andy yet", async () => {
  (useReadingCopy as jest.Mock).mockReturnValue({ ...EMPTY_COPY, profiles: [] });
  grant(false, true);
  await render(<Harness />);
  await act(async () => {});

  // Not even the invitation: with nobody to match against, it could only ask
  // for access it cannot use yet (R2).
  expect(screen.queryByTestId("briefing-card")).toBeNull();
  expect(Calendar.listEvents).not.toHaveBeenCalled();
});

test("should read nothing and cancel reminders when the person turned it off", async () => {
  setCalendarSetting({ mode: "off" });
  await render(<Harness />);

  await waitFor(() => expect(Notifications.getAllScheduledNotificationsAsync).toHaveBeenCalled());
  expect(screen.queryByTestId("briefing-card")).toBeNull();
  expect(Calendar.listEvents).not.toHaveBeenCalled();
});

test("should schedule tomorrow's early reminder, beyond the card's twelve hours", async () => {
  const { tomorrow, midnight } = todayAndTomorrow();
  await render(<Harness />);

  await waitFor(() => expect(briefingTimes()).toContain(tomorrow - BRIEFING_LEAD_MINUTES * 60_000));
  // The read reaches the end of the next local day (R13).
  const [, , until] = (Calendar.listEvents as jest.Mock).mock.calls[0] as [unknown, Date, Date];
  expect(until.getTime()).toBe(nextLocalMidnight(midnight));
});

test("should hide the card and silence only today's meetings while muted for today", async () => {
  const { today, tomorrow } = todayAndTomorrow();
  muteForToday();
  await render(<Harness />);

  await waitFor(() => expect(briefingTimes()).toContain(tomorrow - BRIEFING_LEAD_MINUTES * 60_000));
  // Decided by when the meeting starts (R9): nothing for today's, tomorrow's
  // still comes.
  expect(briefingTimes()).not.toContain(today - BRIEFING_LEAD_MINUTES * 60_000);
  expect(briefingTimes()).toHaveLength(1);
  expect(screen.queryByTestId("briefing-card")).toBeNull();
});

test("should be on again once the muted-until moment has passed", async () => {
  todayAndTomorrow();
  setCalendarSetting({ mode: "muted", until: Date.now() - 1000 });
  await render(<Harness />);

  await waitFor(() => expect(screen.getByText("Coffee with Nina")).toBeTruthy());
});

/** A reminder of this app's, already pending with iOS. */
function reminderPending() {
  (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
    { identifier: "ours", content: { data: { kind: "andy.briefing" } } },
  ]);
}

test("should cancel reminders once the last person has been deleted", async () => {
  reminderPending();
  (useReadingCopy as jest.Mock).mockReturnValue({ ...EMPTY_COPY, profiles: [] });
  await render(<Harness />);

  // Nobody left to be reminded about.
  await waitFor(() =>
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("ours"),
  );
});

test("should cancel the reminder of a meeting deleted from the calendar", async () => {
  reminderPending();
  calendarSays([]);
  await render(<Harness />);

  await waitFor(() =>
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("ours"),
  );
});

test("should cancel reminders when calendar access has been taken away", async () => {
  grant(false, false);
  (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
    { identifier: "ours", content: { data: { kind: "andy.briefing" } } },
  ]);
  await render(<Harness />);

  // Taken away in iPhone Settings: nothing may keep buzzing about meetings
  // Andy can no longer see (R14).
  await waitFor(() =>
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("ours"),
  );
});

// ---------------------------------------------------------------------------
// Asking, at the point of use
// ---------------------------------------------------------------------------

test("should invite rather than prompt when calendar access has never been asked for", async () => {
  grant(false, true);
  await render(<Harness />);

  await waitFor(() =>
    expect(screen.getByLabelText("Connect calendar")).toBeTruthy(),
  );
  // `CLAUDE.md`: permissions are opt-in per feature, requested at the point of
  // use. A card that asked iOS on render would be the app-wide prompt that
  // rule exists to forbid.
  expect(Calendar.requestCalendarPermissions).not.toHaveBeenCalled();
});

test("should ask iOS only when the invitation is taken", async () => {
  grant(false, true);
  (Calendar.requestCalendarPermissions as jest.Mock).mockResolvedValue({
    granted: true,
    canAskAgain: false,
    status: "granted",
  });
  await render(<Harness />);
  await waitFor(() =>
    expect(screen.getByLabelText("Connect calendar")).toBeTruthy(),
  );

  await act(async () => {
    fireEvent.press(screen.getByLabelText("Connect calendar"));
  });

  await waitFor(() =>
    expect(Calendar.requestCalendarPermissions).toHaveBeenCalledTimes(1),
  );
});

test("should show the meeting straight after access is allowed, asking for nothing else", async () => {
  grant(false, true);
  (Calendar.requestCalendarPermissions as jest.Mock).mockResolvedValue({
    granted: true,
    canAskAgain: false,
    status: "granted",
  });
  calendarSays([
    {
      id: "e1",
      title: "Coffee with Marcus",
      startDate: new Date(AT),
      endDate: new Date(AT + 3600_000),
      allDay: false,
    },
  ]);
  backendSays([
    {
      eventId: "e1",
      title: "Coffee with Marcus",
      startsAt: AT,
      endsAt: AT + 3600_000,
      people: [{ profileId: "p1", name: "Marcus", noteCount: 1 }],
      ambiguous: [],
    },
  ]);
  await render(<Harness />);
  await waitFor(() =>
    expect(screen.getByLabelText("Connect calendar")).toBeTruthy(),
  );

  await act(async () => {
    fireEvent.press(screen.getByLabelText("Connect calendar"));
  });

  // Found live: Allow was tapped and the card disappeared, because the read
  // behind it needed a reminders permission nobody had been asked for.
  await waitFor(() => expect(screen.getByText("Coffee with Marcus")).toBeTruthy());
  expect(Calendar.getCalendars).toHaveBeenCalledWith("event");
});

test("should ask once however fast the invitation is tapped twice", async () => {
  grant(false, true);
  let settle: (value: unknown) => void = () => {};
  (Calendar.requestCalendarPermissions as jest.Mock).mockReturnValue(
    new Promise((resolve) => {
      settle = resolve;
    }),
  );
  await render(<Harness />);
  await waitFor(() =>
    expect(screen.getByLabelText("Connect calendar")).toBeTruthy(),
  );

  // Two presses before the first resolves. Each one is a system permission
  // sheet; two of them stacked is the app asking twice for the same thing.
  await act(async () => {
    fireEvent.press(screen.getByLabelText("Connect calendar"));
    fireEvent.press(screen.getByLabelText("Connect calendar"));
  });
  expect(Calendar.requestCalendarPermissions).toHaveBeenCalledTimes(1);

  await act(async () => {
    settle({ granted: true, canAskAgain: false, status: "granted" });
  });
});

test("should offer iPhone Settings, not Connect, once iOS will not ask again", async () => {
  grant(false, false);
  await render(<Harness />);

  // Connect would do nothing at all — iOS will not show its sheet twice — so
  // the way forward is Andy's own page in iPhone Settings (R5).
  await waitFor(() => expect(screen.getByTestId("briefing-card")).toBeTruthy());
  expect(screen.queryByRole("button", { name: "Connect calendar" })).toBeNull();
  expect(screen.getByRole("button", { name: "Open iPhone Settings" })).toBeTruthy();
});

test("should show nothing at all when the calendar module is not in this build", async () => {
  (hasNativeModule as jest.Mock).mockReturnValue(false);
  const view = await render(<Harness />);

  // Day 6's lesson applied before it could cost anything: a build one module
  // behind loses the card, not the home screen. Asserted on the render result
  // rather than on `screen`, which has nothing to talk about when a component
  // renders nothing at all.
  await waitFor(() =>
    expect(Calendar.getCalendarPermissions).not.toHaveBeenCalled(),
  );
  expect(view.toJSON()).toBeNull();
});

// ---------------------------------------------------------------------------
// What it says
// ---------------------------------------------------------------------------

test("should show the meeting and what is already written about who is in it", async () => {
  calendarSays([
    {
      id: "e1",
      title: "Coffee with Marcus",
      startDate: new Date(AT),
      endDate: new Date(AT + 3600_000),
      allDay: false,
    },
  ]);
  backendSays([
    {
      eventId: "e1",
      title: "Coffee with Marcus",
      startsAt: AT,
      endsAt: AT + 3600_000,
      people: [{ profileId: "p1", name: "Marcus", noteCount: 3 }],
      ambiguous: [],
    },
  ]);
  await render(<Harness />);

  await waitFor(() => expect(screen.getByText("Coffee with Marcus")).toBeTruthy());
  expect(screen.getByText("Marcus")).toBeTruthy();
  expect(screen.getByText("3 notes")).toBeTruthy();
});

test("should say plainly when there is nothing written about the person yet", async () => {
  calendarSays([
    { id: "e1", title: "Lunch with Tom", startDate: new Date(AT), endDate: new Date(AT), allDay: false },
  ]);
  backendSays([
    {
      eventId: "e1",
      title: "Lunch with Tom",
      startsAt: AT,
      endsAt: AT,
      people: [{ profileId: "p9", name: "Tom", noteCount: 0 }],
      ambiguous: [],
    },
  ]);
  await render(<Harness />);

  // The briefing is still worth showing — knowing you have nothing on somebody
  // you are about to meet is the reminder this app exists to give.
  await waitFor(() =>
    expect(screen.getByText("nothing remembered yet")).toBeTruthy(),
  );
});

test("should ask which person rather than pick one", async () => {
  (useReadingCopy as jest.Mock).mockReturnValue({
    ...EMPTY_COPY,
    profiles: [
      { _id: "j-gym", _creationTime: 0, userId: "u", name: "Judy", relationshipContext: "from the gym", entityType: "person", tags: [], autoCreated: false },
      { _id: "j-work", _creationTime: 0, userId: "u", name: "Judy", relationshipContext: "from work", entityType: "person", tags: [], autoCreated: false },
    ],
    notes: [{ profileId: "j-work", createdAt: Date.UTC(2026, 8, 2, 12) }],
  });
  calendarSays([
    { id: "e1", title: "Lunch with Judy", startDate: new Date(AT), endDate: new Date(AT), allDay: false },
  ]);
  backendSays([
    {
      eventId: "e1",
      title: "Lunch with Judy",
      startsAt: AT,
      endsAt: AT,
      people: [],
      ambiguous: [{ name: "Judy", key: "judy", count: 2, profileIds: ["j-gym", "j-work"] }],
    },
  ]);
  await render(<Harness />);

  // Filed as "Judy", so the card asks about Judy — not the lowercase key the
  // matching compares by. People are written about, never "kept" (STYLE.md).
  await waitFor(() => expect(screen.getByText("Which Judy is this?")).toBeTruthy());
  expect(screen.getByText(/You've written about 2 people called Judy/)).toBeTruthy();
  // Both offered, each with how you know them, in the order `review` lists
  // them — and neither chosen for you, though one has more notes (R-P10).
  const choices = screen.getAllByTestId("briefing-card-pick-choice");
  expect(choices.map((c) => c.props.accessibilityLabel)).toEqual([
    "Judy, from the gym · 0 notes · never written about",
    `Judy, from work · 1 note · last ${formatDate(Date.UTC(2026, 8, 2, 12))}`,
  ]);
  expect(screen.queryByTestId("briefing-card-person-link")).toBeNull();
  expect(screen.getByText("Neither of them")).toBeTruthy();
});

// ---------------------------------------------------------------------------
// Which Priya — answered on the card, kept on this phone
// (docs/design/decisions/briefing-card-people.md, R-P1–R-P8)
// ---------------------------------------------------------------------------

describe("an answered shared name", () => {
  const twoPriyas = {
    ...EMPTY_COPY,
    profiles: [
      { _id: "p-kumar", _creationTime: 0, userId: "u", name: "Priya", entityType: "person", tags: [], autoCreated: false },
      { _id: "p-shah", _creationTime: 0, userId: "u", name: "Priya", entityType: "person", tags: [], autoCreated: false },
    ],
    notes: [{ profileId: "p-shah", createdAt: 0 }],
  };
  const coffee = {
    eventId: "e1",
    title: "Coffee with Priya",
    startsAt: AT,
    endsAt: AT + 3600_000,
    people: [],
    ambiguous: [{ name: "Priya", key: "priya", count: 2, profileIds: ["p-kumar", "p-shah"] }],
  };

  beforeEach(() => {
    (useReadingCopy as jest.Mock).mockReturnValue(twoPriyas);
    calendarSays([
      { id: "e1", title: "Coffee with Priya", startDate: new Date(AT), endDate: new Date(AT + 3600_000), allDay: false },
    ]);
    backendSays([coffee]);
  });

  afterEach(async () => {
    await act(async () => {
      forgetOnThisPhone();
    });
  });

  test("should brief the Priya picked, and remind you about her, from the moment she is picked", async () => {
    await render(<Harness />);
    await waitFor(() => expect(screen.getByText("Which Priya is this?")).toBeTruthy());
    // Unanswered: no reminder that cannot name who it is about (R-P5).
    expect(briefingTimes()).toEqual([]);

    await act(async () => {
      pick("user_a", "e1", "priya", "p-shah");
    });

    // No foreground needed: a Priya picked at 10:45 still gets her 10:50
    // reminder (R-P5).
    await waitFor(() => expect(screen.getByLabelText("Open Priya")).toBeTruthy());
    expect(screen.getByText("1 note")).toBeTruthy();
    expect(screen.queryByText("Which Priya is this?")).toBeNull();
    await waitFor(() =>
      expect(briefingTimes()).toContain(AT - BRIEFING_LEAD_MINUTES * 60_000),
    );
  });

  test("should answer with one tap on the card, and take it back with one more", async () => {
    await render(<Harness />);
    await waitFor(() => expect(screen.getByText("Which Priya is this?")).toBeTruthy());

    const [, shah] = screen.getAllByTestId("briefing-card-pick-choice");
    await act(async () => {
      fireEvent.press(shah!);
    });

    // Saved at once, no dialog (R-P4), against this event and this name.
    expect(picksOf("user_a")).toEqual([
      expect.objectContaining({ eventId: "e1", nameKey: "priya", profileId: "p-shah" }),
    ]);
    await waitFor(() => expect(screen.getByLabelText("Open Priya")).toBeTruthy());
    expect(screen.queryByText("Which Priya is this?")).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByText("Not this Priya?"));
    });

    // Back to the question with nothing chosen — not the previous answer as
    // a default (R-P10).
    expect(picksOf("user_a")).toEqual([]);
    await waitFor(() => expect(screen.getByText("Which Priya is this?")).toBeTruthy());
  });

  test("should say Neither on the card and offer Change there", async () => {
    await render(<Harness />);
    await waitFor(() => expect(screen.getByText("Which Priya is this?")).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByText("Neither of them"));
    });

    await waitFor(() =>
      expect(screen.getByText("Not a Priya you've written about.")).toBeTruthy(),
    );
    expect(picksOf("user_a")).toEqual([expect.objectContaining({ profileId: NONE })]);

    await act(async () => {
      fireEvent.press(screen.getByText("Change"));
    });
    await waitFor(() => expect(screen.getByText("Which Priya is this?")).toBeTruthy());
  });

  test("should not lose an answer given while the calendar is still being read", async () => {
    let release: (events: unknown[]) => void = () => {};
    (Calendar.listEvents as jest.Mock).mockReturnValueOnce(
      new Promise((resolve) => (release = resolve)),
    );
    await render(<Harness />);
    await waitFor(() => expect(Calendar.listEvents).toHaveBeenCalledTimes(1));

    // Picked while the first read is still under way. That read started
    // before the answer, so its result is thrown away — and the refresh the
    // answer asked for used to be dropped with it, leaving no card at all.
    await act(async () => {
      pick("user_a", "e1", "priya", "p-shah");
    });
    await act(async () => {
      release([
        { id: "e1", title: "Coffee with Priya", startDate: new Date(AT), endDate: new Date(AT + 3600_000), allDay: false },
      ]);
    });

    await waitFor(() => expect(screen.getByLabelText("Open Priya")).toBeTruthy());
  });

  test("should keep a meeting answered Neither on the card, so the answer can be undone there", async () => {
    pick("user_a", "e1", "priya", NONE);
    await render(<Harness />);

    // R-P6: the meeting stays until it starts; nobody is on it to remind about.
    await waitFor(() => expect(screen.getByText("Coffee with Priya")).toBeTruthy());
    expect(screen.queryByText("Which Priya is this?")).toBeNull();
    expect(briefingTimes()).toEqual([]);
  });

  test("should ask again, and forget the answer, once the picked Priya has been deleted", async () => {
    pick("user_a", "e1", "priya", "p-shah");
    (useReadingCopy as jest.Mock).mockReturnValue({
      ...twoPriyas,
      profiles: [...twoPriyas.profiles.slice(0, 1), { ...twoPriyas.profiles[0], _id: "p-third" }],
    });
    backendSays([
      { ...coffee, ambiguous: [{ ...coffee.ambiguous[0], profileIds: ["p-kumar", "p-third"] }] },
    ]);
    await render(<Harness />);

    await waitFor(() => expect(screen.getByText("Which Priya is this?")).toBeTruthy());
    // R-P7: pruned on the read, since a deletion elsewhere never reaches it.
    expect(picksOf("user_a")).toEqual([]);
    // Tidying is part of that read, not a reason for another: one calendar
    // read, one round of reminders.
    await act(async () => {});
    expect(Calendar.listEvents).toHaveBeenCalledTimes(1);
  });

  test("should not use another account's answer on this phone", async () => {
    pick("user_b", "e1", "priya", "p-shah");
    await render(<Harness />);

    await waitFor(() => expect(screen.getByText("Which Priya is this?")).toBeTruthy());
    expect(briefingTimes()).toEqual([]);
  });
});

test("should skip the meetings that are about nobody and show the one that is not", async () => {
  calendarSays([
    { id: "a", title: "Standup", startDate: new Date(AT), endDate: new Date(AT), allDay: false },
    { id: "b", title: "Coffee with Marcus", startDate: new Date(AT + 3600_000), endDate: new Date(AT + 7200_000), allDay: false },
  ]);
  backendSays([
    { eventId: "a", title: "Standup", startsAt: AT, endsAt: AT, people: [], ambiguous: [] },
    {
      eventId: "b",
      title: "Coffee with Marcus",
      startsAt: AT + 3600_000,
      endsAt: AT + 7200_000,
      people: [{ profileId: "p1", name: "Marcus", noteCount: 1 }],
      ambiguous: [],
    },
  ]);
  await render(<Harness />);

  // A standup is not a briefing, and showing it would push the meeting this
  // feature exists for off the top of the screen.
  await waitFor(() => expect(screen.getByText("Coffee with Marcus")).toBeTruthy());
  expect(screen.queryByText("Standup")).toBeNull();
});

// ---------------------------------------------------------------------------
// A meeting leaves the card when it starts (device QA #12)
// ---------------------------------------------------------------------------

/** Two meetings with Nina, starting at these times. */
function meetingsAt(first: number, second: number) {
  (calendarMatch.matchEventsIn as jest.Mock).mockRestore();
  calendarSays([
    { id: "a", title: "Coffee with Nina", startDate: new Date(first), endDate: new Date(first + 3600_000), allDay: false },
    { id: "b", title: "Lunch with Nina", startDate: new Date(second), endDate: new Date(second + 3600_000), allDay: false },
  ]);
}

test("should not show a meeting that has already started", async () => {
  const now = Date.now();
  meetingsAt(now - 10 * 60_000, now + 2 * 3600_000);
  await render(<Harness />);

  await waitFor(() => expect(screen.getByText("Lunch with Nina")).toBeTruthy());
  expect(screen.queryByText("Coffee with Nina")).toBeNull();
});

test("should move on to the next meeting the moment one starts, with the app open", async () => {
  jest.useFakeTimers();
  try {
    const now = Date.now();
    meetingsAt(now + 5 * 60_000, now + 2 * 3600_000);
    await render(<Harness />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("Coffee with Nina")).toBeTruthy();

    // No foreground, no tap: the clock passes the start.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5 * 60_000 + 2_000);
    });
    expect(screen.queryByText("Coffee with Nina")).toBeNull();
    expect(screen.getByText("Lunch with Nina")).toBeTruthy();
  } finally {
    jest.useRealTimers();
  }
});

// ---------------------------------------------------------------------------
// More than one meeting (docs/design/decisions/briefing-card-people.md, R-C1–R-C8)
// ---------------------------------------------------------------------------

describe("the carousel", () => {
  const position = () => screen.queryByTestId("briefing-card-page-position");

  test("should show the next meeting first, with the later one a tap away", async () => {
    const now = Date.now();
    meetingsAt(now + 3600_000, now + 2 * 3600_000);
    await render(<Harness />);

    await waitFor(() => expect(screen.getByText("Coffee with Nina")).toBeTruthy());
    // Position as words, not dots (R-C8).
    expect(position()?.props.children).toEqual([1, " of ", 2]);
    expect(screen.getByLabelText("Previous meeting").props.accessibilityState).toEqual({ disabled: true });

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Next meeting"));
    });

    // #14: the 11:05 Emily can be read before 11:00.
    expect(screen.getByText("Lunch with Nina")).toBeTruthy();
    expect(screen.queryByText("Coffee with Nina")).toBeNull();
    expect(position()?.props.children).toEqual([2, " of ", 2]);
    expect(screen.getByLabelText("Next meeting").props.accessibilityState).toEqual({ disabled: true });
  });

  test("should have no pager for a single meeting", async () => {
    const now = Date.now();
    meetingsAt(now - 60_000, now + 2 * 3600_000);
    await render(<Harness />);

    await waitFor(() => expect(screen.getByText("Lunch with Nina")).toBeTruthy());
    expect(screen.queryByTestId("briefing-card-pager")).toBeNull();
  });

  test("should say each page's place, time and title to VoiceOver at once", async () => {
    const now = Date.now();
    meetingsAt(now + 3600_000, now + 2 * 3600_000);
    await render(<Harness />);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: /^Meeting 1 of 2, .+, Coffee with Nina$/ })).toBeTruthy(),
    );
  });

  test("should stay on the page being read when the app comes back", async () => {
    const now = Date.now();
    meetingsAt(now + 3600_000, now + 2 * 3600_000);
    await render(<Harness />);
    await waitFor(() => expect(screen.getByText("Coffee with Nina")).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Next meeting"));
    });

    const listener = (AppState.addEventListener as jest.Mock).mock.calls.at(-1);
    await act(async () => {
      (listener?.[1] as (phase: string) => void)("active");
    });

    // R-C6: still that meeting, not back to the first page.
    await waitFor(() => expect(Calendar.listEvents).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Lunch with Nina")).toBeTruthy();
  });

  test("should move on at a start without reading the calendar again", async () => {
    jest.useFakeTimers();
    try {
      const now = Date.now();
      meetingsAt(now + 5 * 60_000, now + 2 * 3600_000);
      await render(<Harness />);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(position()).toBeTruthy();

      await act(async () => {
        await jest.advanceTimersByTimeAsync(5 * 60_000 + 2_000);
      });

      // R-C5: only the clock moved — no read, no rescheduling.
      expect(Calendar.listEvents).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Lunch with Nina")).toBeTruthy();
      // One meeting left: no pager (§3).
      expect(position()).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  test("should take VoiceOver to what replaced a page that left, never into nothing", async () => {
    const focus = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent").mockImplementation(() => {});
    jest.useFakeTimers();
    try {
      const now = Date.now();
      // Two meetings, then one, then none: both handovers move focus (R-C8).
      meetingsAt(now + 5 * 60_000, now + 10 * 60_000);
      await render(<Harness />);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(focus).not.toHaveBeenCalled();

      await act(async () => {
        await jest.advanceTimersByTimeAsync(5 * 60_000 + 2_000);
      });
      expect(screen.getByText("Lunch with Nina")).toBeTruthy();
      expect(focus).toHaveBeenCalledTimes(1);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(5 * 60_000);
      });
      // The last one gone: "Nothing coming up" takes the focus.
      expect(screen.getByText("Nothing coming up")).toBeTruthy();
      expect(focus).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  test("should keep a page mid-question when its meeting starts, until it is answered", async () => {
    jest.useFakeTimers();
    try {
      const now = Date.now();
      (useReadingCopy as jest.Mock).mockReturnValue({
        ...EMPTY_COPY,
        profiles: [
          { _id: "p-kumar", _creationTime: 0, userId: "u", name: "Priya", entityType: "person", tags: [], autoCreated: false },
          { _id: "p-shah", _creationTime: 0, userId: "u", name: "Priya", entityType: "person", tags: [], autoCreated: false },
        ],
      });
      backendSays([
        {
          eventId: "e1",
          title: "Coffee with Priya",
          startsAt: now + 5 * 60_000,
          endsAt: now + 3600_000,
          people: [],
          ambiguous: [{ name: "Priya", key: "priya", count: 2, profileIds: ["p-kumar", "p-shah"] }],
        },
        {
          eventId: "e2",
          title: "Lunch with Nina",
          startsAt: now + 2 * 3600_000,
          endsAt: now + 3 * 3600_000,
          people: [{ profileId: "p-nina", name: "Nina", noteCount: 0 }],
          ambiguous: [],
        },
      ]);
      calendarSays([{ id: "e1", title: "x", startDate: new Date(now + 5 * 60_000), endDate: new Date(now + 3600_000), allDay: false }]);
      await render(<Harness />);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByText("Which Priya is this?")).toBeTruthy();

      await act(async () => {
        await jest.advanceTimersByTimeAsync(5 * 60_000 + 2_000);
      });
      // Not pulled from under a finger mid-choice (R-C5).
      expect(screen.getByText("Which Priya is this?")).toBeTruthy();

      await act(async () => {
        fireEvent.press(screen.getByText("Neither of them"));
        await jest.advanceTimersByTimeAsync(0);
      });
      // Answered, and started: it goes, and the next one is there.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(screen.queryByText("Coffee with Priya")).toBeNull();
      expect(screen.getByText("Lunch with Nina")).toBeTruthy();
    } finally {
      await act(async () => {
        forgetOnThisPhone();
      });
      jest.useRealTimers();
    }
  });

  test("should show at most ten meetings, in time order", async () => {
    const now = Date.now();
    const many = Array.from({ length: 12 }, (_, i) => ({
      eventId: `e${i}`,
      // Titles in the opposite order to times, so only a sort by time passes.
      title: `Meeting ${String(i).padStart(2, "0")}`,
      // Given out of order, so the card has to sort them.
      startsAt: now + (12 - i) * 10 * 60_000,
      endsAt: now + (13 - i) * 10 * 60_000,
      people: [{ profileId: "p-nina", name: "Nina", noteCount: 0 }],
      ambiguous: [],
    }));
    backendSays(many);
    calendarSays([{ id: "x", title: "x", startDate: new Date(now + 60_000), endDate: new Date(now + 120_000), allDay: false }]);
    await render(<Harness />);

    await waitFor(() => expect(position()?.props.children).toEqual([1, " of ", 10]));
    // The earliest first: e11 starts soonest, though its title sorts last.
    expect(screen.getByText("Meeting 11")).toBeTruthy();
  });
});

test("should not keep refreshing after being switched off while a refresh was under way", async () => {
  jest.useFakeTimers();
  try {
    const now = Date.now();
    meetingsAt(now + 5 * 60_000, now + 2 * 3600_000);
    // The calendar read is slow: still in flight when the switch flips.
    let answer!: () => void;
    const slow = new Promise<void>((resolve) => (answer = resolve));
    const events = (Calendar.listEvents as jest.Mock).getMockImplementation();
    (Calendar.listEvents as jest.Mock).mockImplementation(async (...args: unknown[]) => {
      await slow;
      return events?.(...args);
    });

    const { rerender } = await render(<Harness />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    await rerender(<Harness enabled={false} />);
    await act(async () => {
      answer();
      await jest.advanceTimersByTimeAsync(0);
    });
    const reads = (Calendar.listEvents as jest.Mock).mock.calls.length;

    // Well past the first meeting's start: a timer left behind would read
    // the calendar again for a feature that is off.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10 * 60_000);
    });
    expect((Calendar.listEvents as jest.Mock).mock.calls.length).toBe(reads);
    expect(screen.queryByTestId("briefing-card")).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

test("should say the day is clear rather than show an empty card body", async () => {
  calendarSays([]);
  await render(<Harness />);

  await waitFor(() => expect(screen.getByText("Nothing coming up")).toBeTruthy());
  // Nothing to match for a day with no events.
  expect(calendarMatch.matchEventsIn).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------------------
// On the phone (docs/design/decisions/calendar-connection.md #5)
// ---------------------------------------------------------------------------

test("should find the person on the phone, and send the calendar nowhere", async () => {
  (calendarMatch.matchEventsIn as jest.Mock).mockRestore();
  const soon = Date.now() + 2 * 3600_000;
  (useReadingCopy as jest.Mock).mockReturnValue({
    ...EMPTY_COPY,
    profiles: [{ _id: "p-marcus", _creationTime: 0, userId: "u", name: "Marcus", entityType: "person", tags: [], autoCreated: false }],
    notes: [{ _id: "n1", _creationTime: 0, userId: "u", profileId: "p-marcus", text: "", source: "manual", createdAt: 1 }],
  });
  calendarSays([
    { id: "e1", title: "Coffee with Marcus", startDate: new Date(soon), endDate: new Date(soon + 3600_000), allDay: false },
  ]);

  await render(<Harness />);

  await waitFor(() => expect(screen.getByText("Coffee with Marcus")).toBeTruthy());
  // Found from the copy: the person, with their note count from it too.
  expect(screen.getByLabelText("Open Marcus")).toBeTruthy();
  expect(screen.getByText("1 note")).toBeTruthy();
  // The point of matching here: no title and no attendee name reaches a
  // server. Nothing in the briefing so much as opens the Convex client.
  expect(useConvex).not.toHaveBeenCalled();
});

test("should not re-read the calendar every time a note changes", async () => {
  const { rerender } = await render(<Harness />);
  await waitFor(() => expect(Calendar.listEvents).toHaveBeenCalledTimes(1));

  // The copy is a new object after any note is edited, anywhere in the app.
  // Each refresh re-reads the calendar and reschedules every reminder, so
  // that must not follow every edit — foreground is the cadence.
  (useReadingCopy as jest.Mock).mockReturnValue({ ...EMPTY_COPY, takenAt: 1 });
  await rerender(<Harness />);
  (useReadingCopy as jest.Mock).mockReturnValue({ ...EMPTY_COPY, takenAt: 2 });
  await rerender(<Harness />);
  await act(async () => {});

  expect(Calendar.listEvents).toHaveBeenCalledTimes(1);
});

test("should wait for the phone's copy, then match as soon as it arrives", async () => {
  (useReadingCopy as jest.Mock).mockReturnValue(null);
  const soon = Date.now() + 2 * 3600_000;
  calendarSays([
    { id: "e1", title: "Coffee with Marcus", startDate: new Date(soon), endDate: new Date(soon + 3600_000), allDay: false },
  ]);
  backendSays([
    {
      eventId: "e1",
      title: "Coffee with Marcus",
      startsAt: soon,
      endsAt: soon + 3600_000,
      people: [{ profileId: "p1", name: "Marcus", noteCount: 1 }],
      ambiguous: [],
    },
  ]);

  const { rerender } = await render(<Harness />);
  // A first session: nothing to match against yet, so no card rather than a
  // wrong "Nothing coming up".
  await act(async () => {});
  expect(screen.queryByTestId("briefing-card")).toBeNull();

  (useReadingCopy as jest.Mock).mockReturnValue(EMPTY_COPY);
  await rerender(<Harness />);
  await waitFor(() => expect(screen.getByText("Coffee with Marcus")).toBeTruthy());
});

// ---------------------------------------------------------------------------
// What is sent
// ---------------------------------------------------------------------------

test("should drop an all-day event rather than brief you for a birthday", async () => {
  calendarSays([
    { id: "b", title: "Marcus's birthday", startDate: new Date(AT), endDate: new Date(AT), allDay: true },
  ]);
  const query = backendSays([]);
  await render(<Harness />);

  // An all-day event would sit at the top of the screen all day about a
  // meeting that is not happening.
  await waitFor(() => expect(screen.getByText("Nothing coming up")).toBeTruthy());
  expect(query).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------------------
// Failing quietly, but not invisibly
// ---------------------------------------------------------------------------

/** Only this hook's own warnings, so an unrelated one cannot pass a test. */
function briefingWarnings(warn: jest.SpyInstance) {
  return warn.mock.calls.filter(
    ([first]) => typeof first === "string" && first.startsWith("Briefing:"),
  );
}

test("should say why the card is missing, in a development build", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const cause = new Error("REMINDERS permission is required");
  (Calendar.getCalendars as jest.Mock).mockRejectedValue(cause);
  const view = await render(<Harness />);

  // What the person sees is unchanged: no card, no banner. What changed is
  // that the person running the build is told why — PR #50's bug took a
  // pasted-in console.warn to find, because this said nothing at all.
  await waitFor(() => expect(briefingWarnings(warn)).toHaveLength(1));
  expect(briefingWarnings(warn)[0]?.[1]).toBe(cause);
  expect(view.toJSON()).toBeNull();
});

test("should say why when the card goes the moment access is allowed", async () => {
  // The exact path PR #50's bug took: invitation → Allow → the read throws.
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  grant(false, true);
  (Calendar.requestCalendarPermissions as jest.Mock).mockResolvedValue({
    granted: true,
    canAskAgain: false,
    status: "granted",
  });
  const cause = new Error("REMINDERS permission is required");
  (Calendar.getCalendars as jest.Mock).mockRejectedValue(cause);
  const view = await render(<Harness />);
  await waitFor(() =>
    expect(screen.getByLabelText("Connect calendar")).toBeTruthy(),
  );

  await act(async () => {
    fireEvent.press(screen.getByLabelText("Connect calendar"));
  });

  await waitFor(() => expect(briefingWarnings(warn)).toHaveLength(1));
  expect(briefingWarnings(warn)[0]?.[1]).toBe(cause);
  expect(view.toJSON()).toBeNull();
});

test("should stay silent about it in a release build", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const wasDev = (globalThis as { __DEV__?: boolean }).__DEV__;
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
  try {
    (Calendar.getCalendars as jest.Mock).mockRejectedValue(new Error("boom"));
    const view = await render(<Harness />);

    await waitFor(() => expect(Calendar.getCalendars).toHaveBeenCalled());
    expect(view.toJSON()).toBeNull();
    expect(briefingWarnings(warn)).toHaveLength(0);
  } finally {
    (globalThis as { __DEV__?: boolean }).__DEV__ = wasDev;
  }
});

test("should keep the card up and say so when the alerts cannot be scheduled", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const cause = new Error("scheduling refused");
  (Notifications.scheduleNotificationAsync as jest.Mock).mockRejectedValue(cause);
  calendarSays([
    {
      id: "e1",
      title: "Coffee with Irene",
      startDate: new Date(Date.now() + 3 * 3600_000),
      endDate: new Date(Date.now() + 4 * 3600_000),
      allDay: false,
    },
  ]);
  backendSays([
    {
      eventId: "e1",
      title: "Coffee with Irene",
      startsAt: Date.now() + 3 * 3600_000,
      endsAt: Date.now() + 4 * 3600_000,
      people: [{ profileId: "p1", name: "Irene", noteCount: 1 }],
      ambiguous: [],
    },
  ]);
  await render(<Harness />);

  await waitFor(() => expect(screen.getByText("Coffee with Irene")).toBeTruthy());
  await waitFor(() => expect(briefingWarnings(warn)).toHaveLength(1));
  expect(briefingWarnings(warn)[0]?.[0]).toMatch(/schedule/);
});

test("should drop an event whose dates cannot be read", async () => {
  calendarSays([
    { id: "x", title: "Coffee with Marcus", startDate: "not a date", endDate: "not a date", allDay: false },
  ]);
  const query = backendSays([]);
  await render(<Harness />);

  // `NaN` sorts into the middle of the list and renders as "Invalid Date".
  await waitFor(() => expect(screen.getByText("Nothing coming up")).toBeTruthy());
  expect(query).not.toHaveBeenCalled();
});

test("should refresh once when two foregrounds arrive together", async () => {
  calendarSays([
    {
      id: "e1",
      title: "Coffee with Marcus",
      startDate: new Date(AT),
      endDate: new Date(AT + 3600_000),
      allDay: false,
    },
  ]);
  const query = backendSays([]);
  await render(<Harness />);
  await waitFor(() => expect(query).toHaveBeenCalledTimes(1));

  // Two "active" transitions before the first refresh settles — a quick app
  // switch, pulling notification centre down, dismissing a permission sheet.
  // Each refresh cancels this app's pending briefings and schedules the whole
  // set again, so two interleaved leave duplicate pairs for one meeting:
  // two buzzes ten minutes before one coffee.
  const listener = (AppState.addEventListener as jest.Mock).mock.calls.at(-1);
  await act(async () => {
    (listener?.[1] as (phase: string) => void)("active");
    (listener?.[1] as (phase: string) => void)("active");
  });

  expect(query).toHaveBeenCalledTimes(2);
});

test("should send the names on the invitation, dropping the blanks", async () => {
  calendarSays([
    {
      id: "e1",
      title: "Meeting",
      startDate: new Date(AT),
      endDate: new Date(AT + 3600_000),
      allDay: false,
      getAttendees: jest.fn(async () => [
        { name: "Marcus" },
        { name: "  " },
        { name: null },
      ]),
    },
  ]);
  const query = backendSays([]);
  await render(<Harness />);

  await waitFor(() => expect(query).toHaveBeenCalledTimes(1));
  // The stronger of the two signals the matcher distinguishes — an attendee
  // beats a title — and every fixture in this file omitted `getAttendees`, so
  // the whole path shipped with zero coverage until `code-reviewer` said so.
  expect(query.mock.calls[0]?.[2][0]?.attendeeNames).toEqual(["Marcus"]);
});

test("should still brief you when the guest list cannot be read", async () => {
  calendarSays([
    {
      id: "e1",
      title: "Coffee with Marcus",
      startDate: new Date(AT),
      endDate: new Date(AT + 3600_000),
      allDay: false,
      getAttendees: jest.fn(async () => {
        throw new Error("no access to attendees");
      }),
    },
  ]);
  const query = backendSays([]);
  await render(<Harness />);

  // Plenty of calendars carry no readable guest list — a personal one, a
  // subscribed one, an event typed straight into the phone. "Coffee with
  // Marcus" is still a briefing worth showing, so losing the event would throw
  // away the common case to be strict about the rare one.
  await waitFor(() => expect(query).toHaveBeenCalledTimes(1));
  expect(query.mock.calls[0]?.[2][0]?.attendeeNames).toEqual([]);
});

test("should send the events in time order, earliest first", async () => {
  calendarSays([
    { id: "late", title: "Later thing", startDate: new Date(AT + 7200_000), endDate: new Date(AT + 9000_000), allDay: false },
    { id: "soon", title: "Sooner thing", startDate: new Date(AT), endDate: new Date(AT + 3600_000), allDay: false },
  ]);
  const query = backendSays([]);
  await render(<Harness />);

  await waitFor(() => expect(query).toHaveBeenCalledTimes(1));
  // The backend answers in the order asked, and the card takes the first match
  // — so "next" is decided here, by sorting, not by whatever order EventKit
  // happened to return.
  const sent = query.mock.calls[0]?.[2] ?? [];
  expect(sent.map((e) => e.eventId)).toEqual(["soon", "late"]);
});

// ---------------------------------------------------------------------------
// The card's look
// ---------------------------------------------------------------------------

test("should offer the reminder at the time it is actually scheduled", async () => {
  // The card says the number in words; this keeps it honest when the lead
  // changes (it went from 20 to 10 on 2026-10-08).
  await render(
    <BriefingCard
      state="ready"
      briefings={[{ eventId: "e1", title: "Coffee with Marcus", startsAt: AT, people: [], ambiguous: [], declined: [] }]}
      now={AT - 1}
      alerts="off"
      onEnableAlerts={jest.fn()}
      onAnswer={jest.fn()}
      onUnanswer={jest.fn()}
      onMute={jest.fn()}
    />,
  );
  expect(screen.getByText(`Remind me ${BRIEFING_LEAD_MINUTES} minutes before ›`)).toBeTruthy();
});

test("should draw no dashed border, which React Native cannot render on one side", async () => {
  // STYLE.md once asked for a dashed "torn edge" on top of this card. It never
  // appeared: React Native warns "Unsupported dashed / dotted border style"
  // and draws nothing (QA 18.3). It was dropped rather than hand-drawn, so a
  // dashed style here is a regression to something that silently does nothing.
  const view = await render(<BriefingCard state="empty" onMute={jest.fn()} />);

  const dashed: unknown[] = [];
  const walk = (node: unknown) => {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    const { props, children } = node as { props?: { style?: unknown }; children?: unknown };
    const flat = [props?.style].flat(Infinity) as ({ borderStyle?: string } | undefined)[];
    if (flat.some((style) => style?.borderStyle === "dashed" || style?.borderStyle === "dotted")) {
      dashed.push(node);
    }
    walk(children);
  };
  walk(view.toJSON());

  expect(screen.getByText("Nothing coming up")).toBeTruthy();
  expect(dashed).toHaveLength(0);
});
