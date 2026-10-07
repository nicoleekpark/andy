import { ConvexReactClient } from "convex/react";
import { nudgeReconnect } from "../src/lib/convex-reconnect";

/**
 * `nudgeReconnect` reaches into Convex's own socket manager, because the
 * installed version has no public reconnect. These tests build a *real*
 * ConvexReactClient from the installed package — only the WebSocket is fake —
 * so the day an upgrade renames or moves what this relies on, the first test
 * goes red instead of the nudge quietly turning into a no-op.
 */

class FakeWebSocket {
  static OPEN = 1;
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: ((event: never) => void) | null = null;
  onmessage: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {}
  send() {}
  close() {
    this.onclose?.({ code: 1000, reason: "" } as never);
  }
}

function realClient() {
  return new ConvexReactClient("https://example.convex.cloud", {
    webSocketConstructor: FakeWebSocket as unknown as typeof WebSocket,
  });
}

type Manager = {
  socket: { state: string };
  tryReconnectImmediately: () => void;
  closeAndReconnect: (reason: string) => void;
};

function managerOf(client: ConvexReactClient): Manager {
  return (client as unknown as { sync: { webSocketManager: Manager } }).sync.webSocketManager;
}

let client: ConvexReactClient;

// Fake timers so the client's own reconnect and inactivity timers never fire
// between tests; the fake socket never opens, so nothing else is scheduled.
// Not closed afterwards: `close()` waits on a socket that never opened.
beforeEach(() => {
  jest.useFakeTimers();
  client = realClient();
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllTimers();
  jest.useRealTimers();
});

test("should find the socket manager's reconnect methods on the installed Convex client", () => {
  const manager = managerOf(client);

  expect(typeof manager.tryReconnectImmediately).toBe("function");
  expect(typeof manager.closeAndReconnect).toBe("function");
  expect(typeof manager.socket.state).toBe("string");
});

test("should reconnect straight away when the socket is down", () => {
  const manager = managerOf(client);
  manager.socket.state = "disconnected";
  const now = jest.spyOn(manager, "tryReconnectImmediately").mockImplementation(() => {});

  expect(nudgeReconnect(client, { suspect: false })).toBe("reconnecting");
  expect(now).toHaveBeenCalledTimes(1);
});

test("should restart a 'connected' socket after a long time away — iOS may have frozen it", () => {
  const manager = managerOf(client);
  manager.socket.state = "ready";
  const restart = jest.spyOn(manager, "closeAndReconnect").mockImplementation(() => {});

  expect(nudgeReconnect(client, { suspect: true })).toBe("restarting");
  expect(restart).toHaveBeenCalledTimes(1);
});

test("should leave a healthy socket alone after a short trip away, so an Ask in flight is not dropped", () => {
  const manager = managerOf(client);
  manager.socket.state = "ready";
  const restart = jest.spyOn(manager, "closeAndReconnect").mockImplementation(() => {});
  const now = jest.spyOn(manager, "tryReconnectImmediately").mockImplementation(() => {});

  expect(nudgeReconnect(client, { suspect: false })).toBe("nothing-to-do");
  expect(restart).not.toHaveBeenCalled();
  expect(now).not.toHaveBeenCalled();
});

test("should not restart a suspect socket while an answer is still on its way", () => {
  const manager = managerOf(client);
  manager.socket.state = "ready";
  jest
    .spyOn(client, "connectionState")
    .mockReturnValue({ ...client.connectionState(), inflightActions: 1 });
  const restart = jest.spyOn(manager, "closeAndReconnect").mockImplementation(() => {});

  expect(nudgeReconnect(client, { suspect: true })).toBe("nothing-to-do");
  expect(restart).not.toHaveBeenCalled();
});

test("should do nothing, not throw, when the client no longer has that shape — and say so in development", () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const changed = { sync: {} } as unknown as ConvexReactClient;

  expect(nudgeReconnect(changed, { suspect: true })).toBe("unsupported");
  expect(warn).toHaveBeenCalledTimes(1);
});

test("should do nothing, not throw, for a client that has already been closed", () => {
  const closed = {
    get sync(): never {
      throw new Error("ConvexReactClient has already been closed.");
    },
  } as unknown as ConvexReactClient;

  expect(nudgeReconnect(closed, { suspect: true })).toBe("nothing-to-do");
});

test("should not throw out of the foreground listener when Convex's own method throws", () => {
  const manager = managerOf(client);
  manager.socket.state = "disconnected";
  jest.spyOn(manager, "tryReconnectImmediately").mockImplementation(() => {
    throw new Error("unexpected internal state");
  });

  expect(nudgeReconnect(client, { suspect: false })).toBe("unsupported");
});
