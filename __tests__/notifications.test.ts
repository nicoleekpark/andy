jest.mock("../src/lib/native", () => ({ hasNativeModule: jest.fn(() => true) }));

jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  scheduleNotificationAsync: jest.fn(async () => "id"),
  SchedulableTriggerInputTypes: { DATE: "date" },
}));

import * as Notifications from "expo-notifications";
import { hasNativeModule } from "../src/lib/native";
import {
  briefable,
  briefingText,
  cancelBriefings,
  notificationAccess,
  nudgeText,
  scheduleBriefings,
  type BriefingSubject,
} from "../src/lib/notifications";

const NOW = new Date("2026-09-22T09:00:00Z").getTime();
const HOUR = 3600_000;

function meeting(over: Partial<BriefingSubject> = {}): BriefingSubject {
  return {
    eventId: "e1",
    title: "Coffee with Marcus",
    startsAt: NOW + 2 * HOUR,
    endsAt: NOW + 3 * HOUR,
    people: [{ profileId: "p1", name: "Marcus" }],
    ...over,
  };
}

/** Every `scheduleNotificationAsync` call, as the shape the code passes. */
function scheduled() {
  return (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.map(
    ([request]) =>
      request as {
        content: { title: string; body: string; data: Record<string, unknown> };
        trigger: { date: Date };
      },
  );
}

beforeEach(() => {
  (hasNativeModule as jest.Mock).mockReturnValue(true);
  // Re-set every one: `clearAllMocks` empties the implementations a
  // `jest.mock` factory gave them, not just their call records. Day 7 lost
  // three tests to that in the calendar suite before it was found.
  (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);
  (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockResolvedValue(undefined);
  (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue("id");
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
    granted: true,
    canAskAgain: false,
  });
});

afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// The 64-pending ceiling
// ---------------------------------------------------------------------------

test("should stop at twenty meetings, because iOS keeps only sixty-four", async () => {
  const many = Array.from({ length: 40 }, (_, i) =>
    meeting({
      eventId: `e${i}`,
      startsAt: NOW + (i + 2) * HOUR,
      endsAt: NOW + (i + 3) * HOUR,
    }),
  );

  const count = await scheduleBriefings(many, NOW);

  // `CLAUDE.md` is explicit about the ceiling, and past it iOS drops the
  // oldest silently — a briefing that simply never arrives, with nothing
  // anywhere saying why. Two per meeting, so twenty is forty pending.
  expect(count).toBe(20);
  expect(scheduled()).toHaveLength(40);
});

test("should take the soonest meetings when it has to choose", async () => {
  const many = Array.from({ length: 25 }, (_, i) =>
    meeting({
      eventId: `e${i}`,
      startsAt: NOW + (i + 2) * HOUR,
      endsAt: NOW + (i + 3) * HOUR,
    }),
  );

  await scheduleBriefings(many, NOW);

  // The caller hands them over in time order, and the cap cuts from the end.
  // Cutting from the front would drop the meeting happening next.
  const ids = scheduled().map((r) => r.content.data.eventId);
  expect(ids).toContain("e0");
  expect(ids).not.toContain("e24");
});

// ---------------------------------------------------------------------------
// Not buzzing about the past
// ---------------------------------------------------------------------------

test("should not schedule a briefing for a meeting that already started", async () => {
  const started = meeting({ startsAt: NOW - HOUR, endsAt: NOW + HOUR });

  await scheduleBriefings([started], NOW);

  // iOS fires a date trigger in the past immediately. Without this the app
  // buzzes on launch about a meeting that began an hour ago.
  const kinds = scheduled().map((r) => r.content.data.capture === true);
  expect(kinds).toEqual([true]); // the nudge only — its time is still ahead
});

test("should schedule nothing at all for a meeting that is over", async () => {
  const done = meeting({ startsAt: NOW - 3 * HOUR, endsAt: NOW - 2 * HOUR });

  const count = await scheduleBriefings([done], NOW);

  expect(count).toBe(0);
  expect(scheduled()).toEqual([]);
});

// ---------------------------------------------------------------------------
// What a lock screen is allowed to say
// ---------------------------------------------------------------------------

test("should put the person on the lock screen and the notes nowhere near it", () => {
  const text = briefingText(
    meeting({ people: [{ profileId: "p1", name: "Judy" }] }),
  );

  // A lock screen is read by whoever is holding the phone, and that is not
  // always its owner. "Judy's mother is in hospital" on a lock screen is this
  // app leaking somebody's private business to a room, so the digest stays
  // behind the tap.
  expect(text.title).toBe("Judy");
  // The meeting, and only the meeting. It said "Coffee with Marcus — open
  // Andy" until `code-reviewer` called the tail filler: tapping a notification
  // already opens the app, so the words add nothing and `STYLE.md` says not to
  // write them.
  expect(text.body).toBe("Coffee with Marcus");
  expect(`${text.title} ${text.body}`).not.toMatch(/note|fact|remember/i);
});

test("should ask about the person by name after the meeting", () => {
  const text = nudgeText(
    meeting({ people: [{ profileId: "p1", name: "Marcus" }] }),
  );

  expect(text.title).toBe("How was Marcus?");
});

test("should carry who it is about, so the nudge can open their capture screen", async () => {
  await scheduleBriefings([meeting()], NOW);

  for (const request of scheduled()) {
    expect(request.content.data.profileId).toBe("p1");
  }
  expect(scheduled().some((r) => r.content.data.capture === true)).toBe(true);
});

// ---------------------------------------------------------------------------
// Clearing only ours
// ---------------------------------------------------------------------------

test("should cancel its own pending briefings and leave everything else alone", async () => {
  (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
    { identifier: "ours-1", content: { data: { kind: "andy.briefing" } } },
    { identifier: "somebody-elses", content: { data: { kind: "other" } } },
    { identifier: "no-data", content: {} },
  ]);

  await cancelBriefings();

  // `cancelAllScheduledNotificationsAsync` is one call and would also throw
  // away whatever a later feature scheduled. Ours are marked for this reason.
  const cancelled = (
    Notifications.cancelScheduledNotificationAsync as jest.Mock
  ).mock.calls.map(([id]) => id);
  expect(cancelled).toEqual(["ours-1"]);
});

test("should clear the old set before scheduling the new one", async () => {
  (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
    { identifier: "stale", content: { data: { kind: "andy.briefing" } } },
  ]);

  await scheduleBriefings([meeting()], NOW);

  // The whole set is rebuilt from the calendar every time. Reconciling which
  // ones moved is more state than forty items is worth, and every branch of
  // it is a way for a briefing to be silently missing.
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
    "stale",
  );
});

// ---------------------------------------------------------------------------
// Who gets one
// ---------------------------------------------------------------------------

test("should ignore a meeting that is about nobody", () => {
  const subjects = briefable([
    {
      eventId: "a",
      title: "Standup",
      startsAt: NOW,
      endsAt: NOW,
      attendeeNames: [],
      people: [],
    },
    {
      eventId: "b",
      title: "Coffee with Marcus",
      startsAt: NOW,
      endsAt: NOW,
      attendeeNames: [],
      people: [{ profileId: "p1", name: "Marcus" }],
    },
  ]);

  // "You have a meeting" is what the calendar app already does. This one is
  // supposed to be about a person.
  expect(subjects.map((s) => s.eventId)).toEqual(["b"]);
});

// ---------------------------------------------------------------------------
// A build without the module
// ---------------------------------------------------------------------------

test("should say nothing is available rather than throw on a build without notifications", async () => {
  (hasNativeModule as jest.Mock).mockReturnValue(false);

  await expect(notificationAccess()).resolves.toEqual({ state: "unavailable" });
  expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
});

test("should tell a blocked permission apart from one never asked", async () => {
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
    granted: false,
    canAskAgain: true,
  });
  await expect(notificationAccess()).resolves.toEqual({
    state: "undetermined",
  });

  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
    granted: false,
    canAskAgain: false,
  });
  // The difference between a button that will work and a button iOS will
  // never honour — the card says different things for each.
  await expect(notificationAccess()).resolves.toEqual({ state: "denied" });
});
