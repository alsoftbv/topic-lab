import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { AppData, Connection, DataSnapshot } from "@/types";

const listeners = vi.hoisted(() => new Map<string, (event: { payload: unknown }) => void>());

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (name: string, handler: (event: { payload: unknown }) => void) => {
    listeners.set(name, handler);
    return () => listeners.delete(name);
  }),
}));

vi.mock("@/utils/api", () => ({
  getData: vi.fn(),
}));

import * as api from "@/utils/api";
import { useSyncedData, keepUnchanged } from "./useSyncedData";

function conn(id: string, name = `Connection ${id}`): Connection {
  return { id, name } as Connection;
}

function snapshot(revision: number, connections: Connection[]): DataSnapshot {
  return { revision, data: { connections } };
}

function names(data: AppData): string[] {
  return data.connections.map((c) => c.name);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function emitDataChanged(payload: DataSnapshot) {
  const handler = listeners.get("data-changed");
  if (!handler) throw new Error("data-changed listener not registered");
  act(() => handler({ payload }));
}

async function setup(initial: DataSnapshot = snapshot(0, [conn("a")])) {
  vi.mocked(api.getData).mockResolvedValue(initial);
  const hook = renderHook(() => useSyncedData());
  await act(async () => {
    await hook.result.current.load();
  });
  await waitFor(() => expect(listeners.has("data-changed")).toBe(true));
  return hook;
}

beforeEach(() => {
  vi.clearAllMocks();
  listeners.clear();
});

describe("useSyncedData", () => {
  it("loads the backend snapshot", async () => {
    const { result } = await setup(snapshot(3, [conn("a"), conn("b")]));

    expect(result.current.data.connections.map((c) => c.id)).toEqual(["a", "b"]);
    expect(result.current.dataRef.current).toBe(result.current.data);
  });

  it("shows an optimistic change at once and the backend result afterwards", async () => {
    const { result } = await setup();
    const request = deferred<DataSnapshot>();

    let saved!: Promise<AppData>;
    act(() => {
      saved = result.current.mutate(
        (prev) => ({ ...prev, connections: [conn("a", "Optimistic")] }),
        () => request.promise
      );
    });
    expect(names(result.current.data)).toEqual(["Optimistic"]);

    await act(async () => {
      request.resolve(snapshot(1, [conn("a", "Saved")]));
      await saved;
    });
    expect(names(result.current.data)).toEqual(["Saved"]);
  });

  it("sends requests one at a time in call order", async () => {
    const { result } = await setup();
    const first = deferred<DataSnapshot>();
    const second = vi.fn(() => Promise.resolve(snapshot(2, [conn("a", "Second")])));

    let done!: Promise<unknown>;
    act(() => {
      const a = result.current.mutate(
        (prev) => prev,
        () => first.promise
      );
      const b = result.current.mutate((prev) => prev, second);
      done = Promise.all([a, b]);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(second).not.toHaveBeenCalled();

    await act(async () => {
      first.resolve(snapshot(1, [conn("a", "First")]));
      await done;
    });
    expect(second).toHaveBeenCalledTimes(1);
    expect(names(result.current.data)).toEqual(["Second"]);
  });

  it("keeps optimistic state until every pending request has finished", async () => {
    const { result } = await setup();
    const first = deferred<DataSnapshot>();
    const second = deferred<DataSnapshot>();

    let done!: Promise<unknown>;
    act(() => {
      const a = result.current.mutate(
        (prev) => ({ ...prev, connections: [conn("a", "One")] }),
        () => first.promise
      );
      const b = result.current.mutate(
        (prev) => ({ ...prev, connections: [conn("a", "Two")] }),
        () => second.promise
      );
      done = Promise.all([a, b]);
    });

    await act(async () => {
      first.resolve(snapshot(1, [conn("a", "One")]));
      await first.promise;
    });
    expect(names(result.current.data)).toEqual(["Two"]);

    await act(async () => {
      second.resolve(snapshot(2, [conn("a", "Two")]));
      await done;
    });
    expect(names(result.current.data)).toEqual(["Two"]);
  });

  it("rolls back to the backend state when a request fails", async () => {
    const { result } = await setup(snapshot(4, [conn("a", "Original")]));

    let outcome!: Promise<unknown>;
    act(() => {
      outcome = result.current
        .mutate(
          (prev) => ({ ...prev, connections: [conn("a", "Optimistic")] }),
          () => Promise.reject("disk full")
        )
        .catch((e) => e);
    });
    expect(names(result.current.data)).toEqual(["Optimistic"]);

    await act(async () => {
      expect(await outcome).toBe("disk full");
    });
    expect(names(result.current.data)).toEqual(["Original"]);
  });

  it("keeps sending queued requests after a failure", async () => {
    const { result } = await setup();

    await act(async () => {
      const failing = result.current
        .mutate(
          (prev) => prev,
          () => Promise.reject("nope")
        )
        .catch(() => undefined);
      const next = result.current.mutate(
        (prev) => prev,
        () => Promise.resolve(snapshot(1, [conn("a", "After failure")]))
      );
      await Promise.all([failing, next]);
    });

    expect(names(result.current.data)).toEqual(["After failure"]);
  });

  it("applies changes from other windows", async () => {
    const { result } = await setup();

    emitDataChanged(snapshot(1, [conn("a"), conn("b", "From another window")]));

    expect(names(result.current.data)).toEqual(["Connection a", "From another window"]);
  });

  it("ignores snapshots older than the newest one seen", async () => {
    const { result } = await setup();
    emitDataChanged(snapshot(5, [conn("a", "Newest")]));

    emitDataChanged(snapshot(4, [conn("a", "Stale")]));

    expect(names(result.current.data)).toEqual(["Newest"]);
  });

  it("holds other windows' changes until local requests finish, then shows the newest", async () => {
    const { result } = await setup();
    const request = deferred<DataSnapshot>();

    let saved!: Promise<AppData>;
    act(() => {
      saved = result.current.mutate(
        (prev) => ({ ...prev, connections: [conn("a", "Local")] }),
        () => request.promise
      );
    });

    emitDataChanged(snapshot(1, [conn("a"), conn("b", "Remote")]));
    expect(names(result.current.data)).toEqual(["Local"]);

    await act(async () => {
      request.resolve(snapshot(2, [conn("a", "Local"), conn("b", "Remote")]));
      await saved;
    });
    expect(names(result.current.data)).toEqual(["Local", "Remote"]);
  });

  it("does not let a late response undo a newer event", async () => {
    const { result } = await setup();
    const request = deferred<DataSnapshot>();

    let saved!: Promise<AppData>;
    act(() => {
      saved = result.current.mutate(
        (prev) => prev,
        () => request.promise
      );
    });
    emitDataChanged(snapshot(2, [conn("a", "Newer")]));

    await act(async () => {
      request.resolve(snapshot(1, [conn("a", "Older")]));
      await saved;
    });
    expect(names(result.current.data)).toEqual(["Newer"]);
  });

  it("hands each request the latest saved data", async () => {
    const { result } = await setup(snapshot(2, [conn("a", "Saved")]));
    const request = vi.fn(() => Promise.resolve(snapshot(3, [conn("a", "Next")])));

    await act(async () => {
      await result.current.mutate(
        (prev) => ({ ...prev, connections: [conn("a", "Optimistic")] }),
        request
      );
    });

    expect(request).toHaveBeenCalledWith({ connections: [conn("a", "Saved")] });
  });

  it("does not carry a failed change into the next queued request", async () => {
    const { result } = await setup(snapshot(1, [conn("a", "Saved")]));
    const second = vi.fn((saved: AppData) =>
      Promise.resolve(
        snapshot(2, [{ ...saved.connections[0], name: `${saved.connections[0].name}+B` }])
      )
    );

    await act(async () => {
      const failing = result.current
        .mutate(
          (prev) => ({ ...prev, connections: [conn("a", "A")] }),
          () => Promise.reject("disk full")
        )
        .catch(() => undefined);
      const next = result.current.mutate(
        (prev) => ({ ...prev, connections: [conn("a", `${prev.connections[0].name}+B`)] }),
        second
      );
      await Promise.all([failing, next]);
    });

    expect(second).toHaveBeenCalledWith({ connections: [conn("a", "Saved")] });
    expect(names(result.current.data)).toEqual(["Saved+B"]);
  });

  it("keeps unchanged connections as the same objects across snapshots", async () => {
    const { result } = await setup(snapshot(1, [conn("a"), conn("b")]));
    const [a, b] = result.current.data.connections;

    emitDataChanged(snapshot(2, [conn("a"), conn("b", "Renamed")]));

    expect(result.current.data.connections[0]).toBe(a);
    expect(result.current.data.connections[1]).not.toBe(b);
    expect(names(result.current.data)).toEqual(["Connection a", "Renamed"]);
  });

  it("keeps the whole data object when nothing changed", async () => {
    const { result } = await setup(snapshot(1, [conn("a")]));
    const before = result.current.data;

    emitDataChanged(snapshot(2, [conn("a")]));

    expect(result.current.data).toBe(before);
  });
});

describe("keepUnchanged", () => {
  it("returns the next data when the order or last connection changes", () => {
    const a = conn("a");
    const b = conn("b");
    const prev: AppData = { connections: [a, b], last_connection_id: "a" };

    const reordered = keepUnchanged(prev, {
      connections: [conn("b"), conn("a")],
      last_connection_id: "a",
    });
    expect(reordered.connections[0]).toBe(b);
    expect(reordered.connections[1]).toBe(a);
    expect(reordered).not.toBe(prev);

    const lastChanged = keepUnchanged(prev, {
      connections: [conn("a"), conn("b")],
      last_connection_id: "b",
    });
    expect(lastChanged.last_connection_id).toBe("b");
    expect(lastChanged.connections[0]).toBe(a);
  });

  it("keeps unchanged settings and replaces changed ones", () => {
    const prev: AppData = { connections: [], settings: { autoCheckUpdates: true } };

    expect(keepUnchanged(prev, { connections: [], settings: { autoCheckUpdates: true } })).toBe(
      prev
    );
    const changed = keepUnchanged(prev, { connections: [], settings: { autoCheckUpdates: false } });
    expect(changed.settings).toEqual({ autoCheckUpdates: false });
  });
});
