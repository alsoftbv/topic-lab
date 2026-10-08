import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { AppData, Connection, DataSnapshot, OpenConnection } from "@/types";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({ label: "main", listen: vi.fn(async () => () => {}) }),
}));

vi.mock("@/utils/dialog", () => ({
  confirm: vi.fn(),
}));

vi.mock("@/utils/api", () => ({
  getBuiltinNames: vi.fn(async () => []),
  getData: vi.fn(),
  getWindowConnection: vi.fn(),
  getOpenConnections: vi.fn(),
  claimConnection: vi.fn(),
  focusWindow: vi.fn(async () => {}),
  openWindow: vi.fn(async () => {}),
  connect: vi.fn(async () => {}),
  disconnect: vi.fn(async () => {}),
  saveConnection: vi.fn(),
  deleteConnection: vi.fn(),
  setLastConnection: vi.fn(),
  resolveTemplates: vi.fn(async (templates: string[]) => templates),
}));

import * as api from "@/utils/api";
import { confirm } from "@/utils/dialog";
import { AppProvider, useApp } from "./AppContext";

function conn(id: string, clientId: string, autoConnect = true): Connection {
  return {
    id,
    name: id.toUpperCase(),
    broker_url: "broker.local",
    port: 1883,
    client_id: clientId,
    use_tls: false,
    auto_connect: autoConnect,
    variables: {},
    variable_history: {},
    buttons: [],
    groups: [],
    subscriptions: [],
  } as Connection;
}

let server: DataSnapshot;
let open: OpenConnection[];
const calls: string[] = [];

function commit(data: AppData): DataSnapshot {
  server = { revision: server.revision + 1, data };
  return server;
}

function setupBackend(connections: Connection[], windowConnection: string | null) {
  server = {
    revision: 0,
    data: { connections, last_connection_id: windowConnection ?? undefined },
  };
  open = windowConnection ? [{ label: "main", connectionId: windowConnection }] : [];
  calls.length = 0;

  vi.mocked(api.getData).mockImplementation(async () => server);
  vi.mocked(api.getWindowConnection).mockImplementation(async () => windowConnection);
  vi.mocked(api.getOpenConnections).mockImplementation(async () => open);
  vi.mocked(api.claimConnection).mockImplementation(async (id) => {
    calls.push(`claim:${id}`);
    const owner = open.find((o) => o.connectionId === id && o.label !== "main");
    if (owner) return { status: "openElsewhere", label: owner.label };
    open = [...open.filter((o) => o.label !== "main"), { label: "main", connectionId: id }];
    return { status: "claimed" };
  });
  vi.mocked(api.saveConnection).mockImplementation(async (c) => {
    calls.push(`save:${c.id}`);
    const exists = server.data.connections.some((x) => x.id === c.id);
    return commit({
      ...server.data,
      connections: exists
        ? server.data.connections.map((x) => (x.id === c.id ? c : x))
        : [...server.data.connections, c],
    });
  });
  vi.mocked(api.deleteConnection).mockImplementation(async (id) => {
    calls.push(`delete:${id}`);
    open = open.filter((o) => o.connectionId !== id);
    return commit({
      ...server.data,
      connections: server.data.connections.filter((x) => x.id !== id),
    });
  });
  vi.mocked(api.setLastConnection).mockImplementation(async (id) => {
    calls.push(`last:${id}`);
    return commit({ ...server.data, last_connection_id: id });
  });
  vi.mocked(api.disconnect).mockImplementation(async () => {
    calls.push("disconnect");
  });
  vi.mocked(api.connect).mockImplementation(async (c) => {
    calls.push(`connect:${c.id}`);
  });
}

function openElsewhere(label: string, connectionId: string) {
  open = [...open, { label, connectionId }];
}

async function renderApp() {
  const seen: (string | null)[] = [];
  const hook = renderHook(
    () => {
      const app = useApp();
      if (!app.loading) seen.push(app.activeConnection?.id ?? null);
      return app;
    },
    { wrapper: AppProvider }
  );
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  calls.length = 0;
  return { ...hook, seen };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AppContext windows and connections", () => {
  it("opens the connection the backend assigned to this window and auto-connects it", async () => {
    setupBackend([conn("a", "c-a"), conn("b", "c-b")], "b");
    const { result } = await renderApp();

    expect(result.current.activeConnection?.id).toBe("b");
    expect(api.connect).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }));
  });

  it("shows no connection when the window has none", async () => {
    setupBackend([conn("a", "c-a")], null);
    const { result } = await renderApp();

    expect(result.current.activeConnection).toBeNull();
    expect(api.connect).not.toHaveBeenCalled();
  });

  it("focuses the other window instead of switching to a connection open there", async () => {
    setupBackend([conn("a", "c-a"), conn("b", "c-b")], "a");
    openElsewhere("window-1", "b");
    const { result } = await renderApp();

    await act(() => result.current.switchConnection("b"));

    expect(api.focusWindow).toHaveBeenCalledWith("window-1");
    expect(api.claimConnection).not.toHaveBeenCalled();
    expect(result.current.activeConnection?.id).toBe("a");
  });

  it("claims, disconnects, records and connects in order when switching", async () => {
    setupBackend([conn("a", "c-a"), conn("b", "c-b")], "a");
    const { result } = await renderApp();

    await act(() => result.current.switchConnection("b"));

    expect(calls).toEqual(["claim:b", "disconnect", "last:b", "connect:b"]);
    expect(result.current.activeConnection?.id).toBe("b");
    expect(server.data.last_connection_id).toBe("b");
  });

  it("keeps the current connection when the claim loses a race", async () => {
    setupBackend([conn("a", "c-a"), conn("b", "c-b")], "a");
    const { result } = await renderApp();
    vi.mocked(api.claimConnection).mockResolvedValueOnce({
      status: "openElsewhere",
      label: "window-2",
    });

    await act(() => result.current.switchConnection("b"));

    expect(api.focusWindow).toHaveBeenCalledWith("window-2");
    expect(api.disconnect).not.toHaveBeenCalled();
    expect(result.current.activeConnection?.id).toBe("a");
  });

  it("gives a clashing connection a new client id when the user agrees", async () => {
    setupBackend([conn("a", "c-a"), conn("b", "c-b"), conn("c", "c-a")], "b");
    openElsewhere("window-1", "a");
    vi.mocked(confirm).mockResolvedValue(true);
    const { result } = await renderApp();

    await act(() => result.current.switchConnection("c"));

    const saved = server.data.connections.find((x) => x.id === "c");
    expect(saved?.client_id).toMatch(/^mqtt-topic-lab-[a-z0-9]{6}$/);
    expect(calls.slice(0, 2)).toEqual(["save:c", "claim:c"]);
    expect(result.current.activeConnection?.id).toBe("c");
    expect(api.connect).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "c", client_id: saved?.client_id })
    );
  });

  it("does nothing when the user cancels the client id prompt", async () => {
    setupBackend([conn("a", "c-a"), conn("b", "c-b"), conn("c", "c-a")], "b");
    openElsewhere("window-1", "a");
    vi.mocked(confirm).mockResolvedValue(false);
    const { result } = await renderApp();

    await act(() => result.current.switchConnection("c"));

    expect(calls).toEqual([]);
    expect(result.current.activeConnection?.id).toBe("b");
  });

  it("switches to the first free connection before deleting the active one", async () => {
    setupBackend([conn("a", "c-a"), conn("b", "c-b"), conn("c", "c-c")], "a");
    openElsewhere("window-1", "b");
    const { result, seen } = await renderApp();
    seen.length = 0;

    await act(() => result.current.deleteConnection("a"));

    expect(calls).toEqual(["claim:c", "disconnect", "last:c", "connect:c", "delete:a"]);
    expect(result.current.activeConnection?.id).toBe("c");
    expect(seen).not.toContain(null);
    expect(server.data.connections.map((x) => x.id)).toEqual(["b", "c"]);
  });

  it("shows the picker when the deleted connection leaves nothing free", async () => {
    setupBackend([conn("a", "c-a"), conn("b", "c-b")], "a");
    openElsewhere("window-1", "b");
    const { result } = await renderApp();

    await act(() => result.current.deleteConnection("a"));

    expect(calls).toEqual(["disconnect", "delete:a"]);
    expect(result.current.activeConnection).toBeNull();
  });

  it("deletes an inactive connection without touching the active one", async () => {
    setupBackend([conn("a", "c-a"), conn("b", "c-b")], "a");
    const { result } = await renderApp();

    await act(() => result.current.deleteConnection("b"));

    expect(calls).toEqual(["delete:b"]);
    expect(result.current.activeConnection?.id).toBe("a");
  });

  it("checks clashes against the own window before opening a new one", async () => {
    setupBackend([conn("a", "c-a"), conn("c", "c-a")], "a");
    vi.mocked(confirm).mockResolvedValue(true);
    const { result } = await renderApp();

    await act(() => result.current.openInNewWindow("c"));

    expect(confirm).toHaveBeenCalled();
    expect(server.data.connections.find((x) => x.id === "c")?.client_id).not.toBe("c-a");
    expect(api.openWindow).toHaveBeenCalledWith("c");
  });

  it("generates a new client id for duplicated connections", async () => {
    setupBackend([conn("a", "c-a")], "a");
    const { result } = await renderApp();

    await act(() => result.current.duplicateConnection("a"));

    const copy = server.data.connections.find((x) => x.id !== "a");
    expect(copy?.name).toBe("A Copy");
    expect(copy?.client_id).not.toBe("c-a");
    expect(result.current.activeConnection?.id).toBe(copy?.id);
  });
});
