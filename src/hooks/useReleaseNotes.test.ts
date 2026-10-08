import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@/contexts/AppContext", () => ({
  useApp: vi.fn(),
}));

vi.mock("@/utils/api", () => ({
  getReleaseNotes: vi.fn(),
}));

import { useApp } from "@/contexts/AppContext";
import { getReleaseNotes } from "@/utils/api";
import type { AppSettings, Connection, ReleaseNotes } from "@/types";
import { useReleaseNotes } from "./useReleaseNotes";

const notes: ReleaseNotes = { version: "0.5.0", items: ["Multiple windows", "Release notes"] };
const someConnection = { id: "c1" } as Connection;

function mockApp({
  settings,
  connections = [],
  loading = false,
  error = null,
  runsStartupTasks = true,
}: {
  settings?: AppSettings;
  connections?: Connection[];
  loading?: boolean;
  error?: string | null;
  runsStartupTasks?: boolean;
}) {
  const updateSettings = vi.fn();
  vi.mocked(useApp).mockReturnValue({
    data: { connections, settings },
    loading,
    error,
    updateSettings,
    runsStartupTasks,
  } as unknown as ReturnType<typeof useApp>);
  return { updateSettings };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getReleaseNotes).mockResolvedValue(notes);
});

describe("useReleaseNotes init", () => {
  it("opens after an update from a previously seen version", async () => {
    const { updateSettings } = mockApp({
      settings: { lastSeenVersion: "0.4.1" },
      connections: [someConnection],
    });
    const { result } = renderHook(() => useReleaseNotes());

    await waitFor(() => expect(result.current.openedFrom).toBe("update"));
    expect(result.current.notes).toEqual(notes);
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("treats existing connections without a seen version as an upgrade", async () => {
    mockApp({ settings: {}, connections: [someConnection] });
    const { result } = renderHook(() => useReleaseNotes());

    await waitFor(() => expect(result.current.openedFrom).toBe("update"));
  });

  it("records the version silently on a fresh install", async () => {
    const { updateSettings } = mockApp({ settings: undefined, connections: [] });
    const { result } = renderHook(() => useReleaseNotes());

    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({ lastSeenVersion: "0.5.0" }));
    expect(result.current.openedFrom).toBeNull();
    expect(result.current.notes).toEqual(notes);
  });

  it("stays closed when the version was already seen", async () => {
    const { updateSettings } = mockApp({
      settings: { lastSeenVersion: "0.5.0" },
      connections: [someConnection],
    });
    const { result } = renderHook(() => useReleaseNotes());

    await waitFor(() => expect(result.current.notes).toEqual(notes));
    expect(result.current.openedFrom).toBeNull();
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("records the version without opening when turned off", async () => {
    const { updateSettings } = mockApp({
      settings: { lastSeenVersion: "0.4.1", showReleaseNotes: false },
      connections: [someConnection],
    });
    const { result } = renderHook(() => useReleaseNotes());

    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({ lastSeenVersion: "0.5.0" }));
    expect(result.current.openedFrom).toBeNull();
    expect(result.current.enabled).toBe(false);
  });

  it("does nothing when the build has no release notes", async () => {
    vi.mocked(getReleaseNotes).mockResolvedValue(null);
    const { updateSettings } = mockApp({ settings: {}, connections: [] });
    const { result } = renderHook(() => useReleaseNotes());

    await waitFor(() => expect(getReleaseNotes).toHaveBeenCalled());
    expect(result.current.notes).toBeNull();
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("does not touch settings when loading the data failed", async () => {
    const { updateSettings } = mockApp({ settings: undefined, error: "corrupt data.json" });
    renderHook(() => useReleaseNotes());

    await Promise.resolve();
    expect(getReleaseNotes).not.toHaveBeenCalled();
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("only loads the notes in windows that do not run the startup tasks", async () => {
    const { updateSettings } = mockApp({
      settings: { lastSeenVersion: "0.4.1" },
      connections: [someConnection],
      runsStartupTasks: false,
    });
    const { result } = renderHook(() => useReleaseNotes());

    await waitFor(() => expect(result.current.notes).toEqual(notes));
    expect(result.current.openedFrom).toBeNull();
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("waits until the data has loaded", async () => {
    mockApp({ settings: { lastSeenVersion: "0.4.1" }, loading: true });
    const { result, rerender } = renderHook(() => useReleaseNotes());
    expect(getReleaseNotes).not.toHaveBeenCalled();

    mockApp({ settings: { lastSeenVersion: "0.4.1" }, connections: [someConnection] });
    rerender();

    await waitFor(() => expect(result.current.openedFrom).toBe("update"));
    expect(getReleaseNotes).toHaveBeenCalledTimes(1);
  });
});

describe("useReleaseNotes actions", () => {
  async function openedAfterUpdate() {
    const app = mockApp({ settings: { lastSeenVersion: "0.4.1" }, connections: [someConnection] });
    const hook = renderHook(() => useReleaseNotes());
    await waitFor(() => expect(hook.result.current.openedFrom).toBe("update"));
    return { ...app, ...hook };
  }

  it("OK records the version as seen", async () => {
    const { result, updateSettings } = await openedAfterUpdate();

    act(() => result.current.dismiss(false));

    expect(result.current.openedFrom).toBeNull();
    expect(updateSettings).toHaveBeenCalledWith({ lastSeenVersion: "0.5.0" });
  });

  it("Don't show again also turns release notes off", async () => {
    const { result, updateSettings } = await openedAfterUpdate();

    act(() => result.current.dismiss(true));

    expect(result.current.openedFrom).toBeNull();
    expect(updateSettings).toHaveBeenCalledWith({
      lastSeenVersion: "0.5.0",
      showReleaseNotes: false,
    });
  });

  it("opens manually and closes without touching settings", async () => {
    const { updateSettings } = mockApp({
      settings: { lastSeenVersion: "0.5.0" },
      connections: [someConnection],
    });
    const { result } = renderHook(() => useReleaseNotes());
    await waitFor(() => expect(result.current.notes).toEqual(notes));

    act(() => result.current.show());
    expect(result.current.openedFrom).toBe("manual");

    act(() => result.current.dismiss(false));
    expect(result.current.openedFrom).toBeNull();
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("setEnabled writes the setting", async () => {
    const { updateSettings } = mockApp({ settings: { lastSeenVersion: "0.5.0" } });
    const { result } = renderHook(() => useReleaseNotes());
    await waitFor(() => expect(result.current.notes).toEqual(notes));

    act(() => result.current.setEnabled(true));

    expect(updateSettings).toHaveBeenCalledWith({ showReleaseNotes: true });
  });
});
