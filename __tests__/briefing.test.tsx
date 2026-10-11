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
import { AppState } from "react-native";
import { useConvex } from "convex/react";
import { BriefingCard } from "../src/components/briefing-card";
import { hasNativeModule } from "../src/lib/native";
import { useBriefing } from "../src/lib/use-briefing";
import { BRIEFING_LEAD_MINUTES } from "../src/lib/notifications";
import { useReadingCopy } from "../src/lib/offline-copy";
import * as calendarMatch from "@convex/calendarMatch";

jest.mock("convex/react", () => ({ useConvex: jest.fn() }));
// The phone's copy, which matching reads. Mocked so these tests need no
// providers; `useReadingCopy` itself is the offline-copy suite's business.
jest.mock("../src/lib/offline-copy", () => ({ useReadingCopy: jest.fn() }));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

const AT = new Date("2026-09-22T09:30:00Z").getTime();

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

/** A copy with nobody in it — enough for the briefing to start matching. */
const EMPTY_COPY = { ownerId: "user_a", takenAt: 0, profiles: [], notes: [], links: [] };

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
  const { briefing, ask, alerts, askForAlerts } = useBriefing(enabled);
  if (briefing.state === "loading" || briefing.state === "off") return null;
  if (briefing.state === "ask") {
    return (
      <BriefingCard state="ask" onAsk={() => void ask()} asking={briefing.asking} />
    );
  }
  if (briefing.state === "ready") {
    return (
      <BriefingCard
        state="ready"
        briefing={briefing.briefing}
        alerts={alerts}
        onEnableAlerts={() => void askForAlerts()}
      />
    );
  }
  return <BriefingCard state={briefing.state} />;
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
// Asking, at the point of use
// ---------------------------------------------------------------------------

test("should invite rather than prompt when calendar access has never been asked for", async () => {
  grant(false, true);
  await render(<Harness />);

  await waitFor(() =>
    expect(screen.getByLabelText("Let Andy read my calendar")).toBeTruthy(),
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
    expect(screen.getByLabelText("Let Andy read my calendar")).toBeTruthy(),
  );

  await act(async () => {
    fireEvent.press(screen.getByLabelText("Let Andy read my calendar"));
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
    expect(screen.getByLabelText("Let Andy read my calendar")).toBeTruthy(),
  );

  await act(async () => {
    fireEvent.press(screen.getByLabelText("Let Andy read my calendar"));
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
    expect(screen.getByLabelText("Let Andy read my calendar")).toBeTruthy(),
  );

  // Two presses before the first resolves. Each one is a system permission
  // sheet; two of them stacked is the app asking twice for the same thing.
  await act(async () => {
    fireEvent.press(screen.getByLabelText("Let Andy read my calendar"));
    fireEvent.press(screen.getByLabelText("Let Andy read my calendar"));
  });
  expect(Calendar.requestCalendarPermissions).toHaveBeenCalledTimes(1);

  await act(async () => {
    settle({ granted: true, canAskAgain: false, status: "granted" });
  });
});

test("should offer no button once iOS will not ask again", async () => {
  grant(false, false);
  await render(<Harness />);

  // A button that cannot work is worse than no button: pressing it does
  // nothing at all, which reads as the app being broken rather than as a
  // choice that was already made.
  await waitFor(() => expect(screen.getByTestId("briefing-card")).toBeTruthy());
  expect(screen.queryByLabelText("Let Andy read my calendar")).toBeNull();
  expect(screen.getByText(/Settings/)).toBeTruthy();
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

test("should say it cannot tell which person rather than pick one", async () => {
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
      ambiguous: [{ name: "Judy", count: 2 }],
    },
  ]);
  await render(<Harness />);

  await waitFor(() =>
    expect(screen.getByText(/can.t tell which one/)).toBeTruthy(),
  );
  // Filed as "Judy", so the card says Judy — not the lowercase key the
  // matching compares by.
  expect(screen.getByText(/“Judy”/)).toBeTruthy();
  // People are written about, never "kept" (STYLE.md → Terminology).
  // The apostrophe is written &apos; in the JSX; on screen it is a plain '.
  expect(screen.getByText(/You've written about 2 people called “Judy”/)).toBeTruthy();
  expect(screen.queryByText(/You keep/)).toBeNull();
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
    expect(screen.getByLabelText("Let Andy read my calendar")).toBeTruthy(),
  );

  await act(async () => {
    fireEvent.press(screen.getByLabelText("Let Andy read my calendar"));
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
      briefing={{ title: "Coffee with Marcus", startsAt: AT, people: [], ambiguous: [] }}
      alerts="off"
      onEnableAlerts={jest.fn()}
    />,
  );
  expect(screen.getByText(`Remind me ${BRIEFING_LEAD_MINUTES} minutes before ›`)).toBeTruthy();
});

test("should draw no dashed border, which React Native cannot render on one side", async () => {
  // STYLE.md once asked for a dashed "torn edge" on top of this card. It never
  // appeared: React Native warns "Unsupported dashed / dotted border style"
  // and draws nothing (QA 18.3). It was dropped rather than hand-drawn, so a
  // dashed style here is a regression to something that silently does nothing.
  const view = await render(<BriefingCard state="empty" />);

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
