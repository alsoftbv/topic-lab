import {
  confirm as nativeConfirm,
  message as nativeMessage,
  type ConfirmDialogOptions,
  type MessageDialogOptions,
} from "@tauri-apps/plugin-dialog";

declare global {
  interface Window {
    __TAURI_E2E__?: boolean;
  }
}

export async function confirm(message: string, options?: ConfirmDialogOptions): Promise<boolean> {
  if (window.__TAURI_E2E__) return true;
  return nativeConfirm(message, options);
}

export async function message(msg: string, options?: string | MessageDialogOptions) {
  if (window.__TAURI_E2E__) return;
  return nativeMessage(msg, options);
}
