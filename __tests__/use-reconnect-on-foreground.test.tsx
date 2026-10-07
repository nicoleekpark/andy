import { act, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";
import type { ConvexReactClient } from "convex/react";
import { nudgeReconnect } from "../src/lib/convex-reconnect";
import { SUSPECT_AFTER_MS, useReconnectOnForeground } from "../src/lib/use-reconnect-on-foreground";

jest.mock("../src/lib/convex-reconnect", () => ({ nudgeReconnect: jest.fn() }));

/**
 * Coming back to Andy is when the socket gets nudged: React Native gives Convex
 * no network-came-back event of its own. `AppState.addEventListener` is a
 * jest.fn() under this preset, so the listener it was given is called directly.
 */

const client = {} as ConvexReactClient;

async function phase(next: string) {
  const calls = (AppState.addEventListener as jest.Mock).mock.calls;
  const [, listener] = calls[calls.length - 1] as [string, (p: string) => void];
  await act(async () => listener(next));
}

let now = 0;

beforeEach(() => {
  now = 1_000_000;
  jest.spyOn(Date, "now").mockImplementation(() => now);
});

afterEach(() => {
  jest.restoreAllMocks();
  (nudgeReconnect as jest.Mock).mockClear();
});

test("should nudge the socket on coming back from the background", async () => {
  await renderHook(() => useReconnectOnForeground(client));

  await phase("background");
  now += 2_000;
  await phase("active");

  expect(nudgeReconnect).toHaveBeenCalledTimes(1);
  expect(nudgeReconnect).toHaveBeenCalledWith(client, { suspect: false });
});

test("should treat a connected socket as suspect after a long time away", async () => {
  await renderHook(() => useReconnectOnForeground(client));

  await phase("background");
  now += SUSPECT_AFTER_MS;
  await phase("active");

  expect(nudgeReconnect).toHaveBeenCalledWith(client, { suspect: true });
});

test("should not nudge for an inactive blip that never left the app (Face ID, Control Center)", async () => {
  await renderHook(() => useReconnectOnForeground(client));

  await phase("inactive");
  await phase("active");

  expect(nudgeReconnect).not.toHaveBeenCalled();
});
