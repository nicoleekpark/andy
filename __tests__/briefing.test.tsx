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
}));

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

jest.mock("convex/react", () => ({ useConvex: jest.fn() }));
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

function backendSays(matched: Record<string, unknown>[]) {
  // Typed arguments, so a test can read back what was sent. `jest.fn()` with
  // no parameters infers an empty tuple and indexing it is a type error.
  const query = jest.fn(
    async (
      _reference: unknown,
      _args: { events: { eventId: string; attendeeNames: string[] }[] },
    ) => matched,
  );
  (useConvex as jest.Mock).mockReturnValue({ query });
  return query;
}

/**
 * `render` is awaited everywhere below, and that is not a style choice.
 * `@testing-library/react-native` v14 returns a promise from it, so an
 * un-awaited render leaves `screen` unbound and every query throws
 * "`render` function has not been called" — which reads exactly like a
 * component that rendered nothing. Day 1 logged the same trap for
 * `renderRouter`; this is the same shape, one version later.
 */

/** A harness that renders whatever the hook currently says. */
function Harness() {
  const { briefing, ask, alerts, askForAlerts } = useBriefing();
  if (briefing.state === "loading") return null;
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
  (Calendar.getCalendars as jest.Mock).mockResolvedValue([{ id: "cal-1" }]);
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
    granted: true,
    canAskAgain: false,
  });
  (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);
  (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockResolvedValue(undefined);
  (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue("id");
  backendSays([]);
  calendarSays([]);
  grant(true);
});

afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
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
    expect(screen.getByText("nothing written down yet")).toBeTruthy(),
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
  // No backend round trip for a day with no events — the query costs a request
  // per foreground, and there is nothing to ask about.
  expect((useConvex as jest.Mock).mock.results[0]?.value.query).not.toHaveBeenCalled();
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
  // two buzzes twenty minutes before one coffee.
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
  expect(query.mock.calls[0]?.[1].events[0]?.attendeeNames).toEqual(["Marcus"]);
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
  expect(query.mock.calls[0]?.[1].events[0]?.attendeeNames).toEqual([]);
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
  const sent = query.mock.calls[0]?.[1] as { events: { eventId: string }[] };
  expect(sent.events.map((e) => e.eventId)).toEqual(["soon", "late"]);
});
