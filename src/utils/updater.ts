import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";

export type { Update };

export async function getCurrentVersion(): Promise<string> {
  return getVersion();
}

export async function checkForUpdate(): Promise<Update | null> {
  if (window.__TAURI_E2E__) return null;
  return check();
}

export async function downloadAndInstall(
  update: Update,
  onProgress?: (fraction: number) => void
): Promise<void> {
  let downloaded = 0;
  let total = 0;
  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        total = event.data.contentLength ?? 0;
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        if (total > 0) onProgress?.(downloaded / total);
        break;
      case "Finished":
        onProgress?.(1);
        break;
    }
  });
  await relaunch();
}
