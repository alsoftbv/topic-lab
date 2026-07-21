import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn(),
}));

import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { checkForUpdate, downloadAndInstall, getCurrentVersion } from "./updater";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  delete window.__TAURI_E2E__;
});

describe("getCurrentVersion", () => {
  it("delegates to the app API", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.2.3");
    await expect(getCurrentVersion()).resolves.toBe("1.2.3");
  });
});

describe("checkForUpdate", () => {
  it("returns null without calling the plugin under E2E", async () => {
    window.__TAURI_E2E__ = true;
    await expect(checkForUpdate()).resolves.toBeNull();
    expect(check).not.toHaveBeenCalled();
  });

  it("delegates to the plugin otherwise", async () => {
    const update = { version: "9.9.9" } as Update;
    vi.mocked(check).mockResolvedValue(update);
    await expect(checkForUpdate()).resolves.toBe(update);
    expect(check).toHaveBeenCalledTimes(1);
  });
});

describe("downloadAndInstall", () => {
  function makeUpdate(events: object[]) {
    return {
      downloadAndInstall: vi.fn(async (onEvent?: (event: object) => void) => {
        for (const event of events) onEvent?.(event);
      }),
    } as unknown as Update;
  }

  it("reports download progress fractions and relaunches", async () => {
    const update = makeUpdate([
      { event: "Started", data: { contentLength: 100 } },
      { event: "Progress", data: { chunkLength: 50 } },
      { event: "Progress", data: { chunkLength: 50 } },
      { event: "Finished" },
    ]);
    const onProgress = vi.fn();

    await downloadAndInstall(update, onProgress);

    expect(onProgress.mock.calls.map(([f]) => f)).toEqual([0.5, 1, 1]);
    expect(relaunch).toHaveBeenCalledTimes(1);
  });

  it("skips progress fractions when the total size is unknown", async () => {
    const update = makeUpdate([
      { event: "Started", data: {} },
      { event: "Progress", data: { chunkLength: 50 } },
      { event: "Finished" },
    ]);
    const onProgress = vi.fn();

    await downloadAndInstall(update, onProgress);

    expect(onProgress.mock.calls.map(([f]) => f)).toEqual([1]);
    expect(relaunch).toHaveBeenCalledTimes(1);
  });

  it("propagates install errors without relaunching", async () => {
    const update = {
      downloadAndInstall: vi.fn(async () => {
        throw new Error("download failed");
      }),
    } as unknown as Update;

    await expect(downloadAndInstall(update)).rejects.toThrow("download failed");
    expect(relaunch).not.toHaveBeenCalled();
  });
});
