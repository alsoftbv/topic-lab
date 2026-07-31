import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@/contexts/AppContext", () => ({
  useApp: vi.fn(),
}));

vi.mock("@/utils/updater", () => ({
  checkForUpdate: vi.fn(),
  downloadAndInstall: vi.fn(),
  getCurrentVersion: vi.fn(),
}));

import { useApp } from "@/contexts/AppContext";
import { checkForUpdate, downloadAndInstall, getCurrentVersion } from "@/utils/updater";
import type { Update } from "@/utils/updater";
import type { AppSettings } from "@/types";
import { useUpdater } from "./useUpdater";

function mockApp(settings?: AppSettings) {
  const updateSettings = vi.fn();
  vi.mocked(useApp).mockReturnValue({
    data: { connections: [], settings },
    updateSettings,
  } as unknown as ReturnType<typeof useApp>);
  return { updateSettings };
}

const fakeUpdate = { version: "9.9.9" } as Update;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentVersion).mockResolvedValue("1.2.3");
  vi.mocked(checkForUpdate).mockResolvedValue(null);
  vi.mocked(downloadAndInstall).mockResolvedValue(undefined);
});

afterEach(() => {
  delete window.__TAURI_E2E__;
});

describe("useUpdater init", () => {
  it("shows the opt-in prompt when no preference is stored", async () => {
    mockApp(undefined);
    const { result, unmount } = renderHook(() => useUpdater());

    await waitFor(() => expect(result.current.showOptIn).toBe(true));
    expect(result.current.status).toBe("idle");
    expect(result.current.autoCheck).toBe(false);
    expect(checkForUpdate).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.currentVersion).toBe("1.2.3"));

    unmount();
  });

  it("auto-checks when opted in and reports an available update", async () => {
    mockApp({ autoCheckUpdates: true });
    vi.mocked(checkForUpdate).mockResolvedValue(fakeUpdate);
    const { result, unmount } = renderHook(() => useUpdater());

    await waitFor(() => expect(result.current.status).toBe("available"));
    expect(result.current.update).toBe(fakeUpdate);
    expect(result.current.showOptIn).toBe(false);
    expect(result.current.autoCheck).toBe(true);

    unmount();
  });

  it("does not check or prompt when opted out", async () => {
    mockApp({ autoCheckUpdates: false });
    const { result, unmount } = renderHook(() => useUpdater());

    await waitFor(() => expect(result.current.currentVersion).toBe("1.2.3"));
    expect(result.current.showOptIn).toBe(false);
    expect(result.current.status).toBe("idle");
    expect(checkForUpdate).not.toHaveBeenCalled();

    unmount();
  });

  it("skips initialization entirely under E2E", async () => {
    window.__TAURI_E2E__ = true;
    mockApp(undefined);
    const { result, unmount } = renderHook(() => useUpdater());

    await act(async () => {});
    expect(result.current.showOptIn).toBe(false);
    expect(getCurrentVersion).not.toHaveBeenCalled();
    expect(checkForUpdate).not.toHaveBeenCalled();

    unmount();
  });
});

describe("useUpdater check", () => {
  it("reports up to date when no update exists", async () => {
    mockApp({ autoCheckUpdates: false });
    const { result, unmount } = renderHook(() => useUpdater());

    await act(async () => {
      await result.current.check();
    });
    expect(result.current.status).toBe("uptodate");
    expect(result.current.update).toBeNull();

    unmount();
  });

  it("surfaces check errors", async () => {
    mockApp({ autoCheckUpdates: false });
    vi.mocked(checkForUpdate).mockRejectedValue(new Error("network down"));
    const { result, unmount } = renderHook(() => useUpdater());

    await act(async () => {
      await result.current.check();
    });
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("network down");
    expect(result.current.errorSource).toBe("check");

    unmount();
  });
});

describe("useUpdater install", () => {
  it("does nothing without an available update", async () => {
    mockApp({ autoCheckUpdates: false });
    const { result, unmount } = renderHook(() => useUpdater());

    await act(async () => {
      await result.current.install();
    });
    expect(downloadAndInstall).not.toHaveBeenCalled();

    unmount();
  });

  it("downloads the available update", async () => {
    mockApp({ autoCheckUpdates: false });
    vi.mocked(checkForUpdate).mockResolvedValue(fakeUpdate);
    const { result, unmount } = renderHook(() => useUpdater());

    await act(async () => {
      await result.current.check();
    });
    await act(async () => {
      await result.current.install();
    });
    expect(downloadAndInstall).toHaveBeenCalledWith(fakeUpdate, expect.any(Function));
    expect(result.current.status).toBe("downloading");

    unmount();
  });

  it("surfaces install errors", async () => {
    mockApp({ autoCheckUpdates: false });
    vi.mocked(checkForUpdate).mockResolvedValue(fakeUpdate);
    vi.mocked(downloadAndInstall).mockRejectedValue(new Error("disk full"));
    const { result, unmount } = renderHook(() => useUpdater());

    await act(async () => {
      await result.current.check();
    });
    await act(async () => {
      await result.current.install();
    });
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("disk full");
    expect(result.current.errorSource).toBe("install");

    unmount();
  });

  it("keeps the update so a failed install can be retried", async () => {
    mockApp({ autoCheckUpdates: false });
    vi.mocked(checkForUpdate).mockResolvedValue(fakeUpdate);
    vi.mocked(downloadAndInstall).mockRejectedValueOnce(new Error("disk full"));
    const { result, unmount } = renderHook(() => useUpdater());

    await act(async () => {
      await result.current.check();
    });
    await act(async () => {
      await result.current.install();
    });
    expect(result.current.update).toBe(fakeUpdate);
    await act(async () => {
      await result.current.install();
    });
    expect(result.current.status).toBe("downloading");
    expect(result.current.error).toBeNull();
    expect(result.current.errorSource).toBeNull();

    unmount();
  });
});

describe("useUpdater opt-in and dismissal", () => {
  it("persists opt-in and starts a check", async () => {
    const { updateSettings } = mockApp(undefined);
    const { result, unmount } = renderHook(() => useUpdater());

    await waitFor(() => expect(result.current.showOptIn).toBe(true));
    await act(async () => {
      result.current.resolveOptIn(true);
    });
    expect(updateSettings).toHaveBeenCalledWith({ autoCheckUpdates: true });
    expect(result.current.showOptIn).toBe(false);
    expect(checkForUpdate).toHaveBeenCalledTimes(1);

    unmount();
  });

  it("persists opt-out without checking", async () => {
    const { updateSettings } = mockApp(undefined);
    const { result, unmount } = renderHook(() => useUpdater());

    await waitFor(() => expect(result.current.showOptIn).toBe(true));
    await act(async () => {
      result.current.resolveOptIn(false);
    });
    expect(updateSettings).toHaveBeenCalledWith({ autoCheckUpdates: false });
    expect(result.current.showOptIn).toBe(false);
    expect(checkForUpdate).not.toHaveBeenCalled();

    unmount();
  });

  it("dismiss resets status to idle", async () => {
    mockApp({ autoCheckUpdates: false });
    vi.mocked(checkForUpdate).mockResolvedValue(fakeUpdate);
    const { result, unmount } = renderHook(() => useUpdater());

    await act(async () => {
      await result.current.check();
    });
    expect(result.current.status).toBe("available");
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.status).toBe("idle");

    unmount();
  });

  it("dismiss clears a pending error", async () => {
    mockApp({ autoCheckUpdates: false });
    vi.mocked(checkForUpdate).mockResolvedValue(fakeUpdate);
    vi.mocked(downloadAndInstall).mockRejectedValue(new Error("disk full"));
    const { result, unmount } = renderHook(() => useUpdater());

    await act(async () => {
      await result.current.check();
    });
    await act(async () => {
      await result.current.install();
    });
    expect(result.current.errorSource).toBe("install");
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBeNull();
    expect(result.current.errorSource).toBeNull();

    unmount();
  });
});
