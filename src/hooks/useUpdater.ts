import { useState, useEffect, useRef } from "react";
import { useApp } from "@/contexts/AppContext";
import {
  checkForUpdate,
  downloadAndInstall,
  getCurrentVersion,
  type Update,
} from "@/utils/updater";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "uptodate"
  | "downloading"
  | "error";

export interface Updater {
  status: UpdateStatus;
  update: Update | null;
  currentVersion: string;
  error: string | null;
  errorSource: "check" | "install" | null;
  progress: number;
  autoCheck: boolean;
  showOptIn: boolean;
  check: () => Promise<void>;
  install: () => Promise<void>;
  resolveOptIn: (enabled: boolean) => void;
  setAutoCheck: (enabled: boolean) => void;
  dismiss: () => void;
}

export function useUpdater(): Updater {
  const { data, updateSettings } = useApp();
  const autoCheckPref = data.settings?.autoCheckUpdates;

  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [update, setUpdate] = useState<Update | null>(null);
  const [currentVersion, setCurrentVersion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorSource, setErrorSource] = useState<"check" | "install" | null>(null);
  const [progress, setProgress] = useState(0);
  const [showOptIn, setShowOptIn] = useState(false);
  const didInit = useRef(false);

  async function check() {
    setStatus("checking");
    setError(null);
    setErrorSource(null);
    try {
      const result = await checkForUpdate();
      if (result) {
        setUpdate(result);
        setStatus("available");
      } else {
        setUpdate(null);
        setStatus("uptodate");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setErrorSource("check");
      setStatus("error");
    }
  }

  async function install() {
    if (!update) return;
    setStatus("downloading");
    setProgress(0);
    setError(null);
    setErrorSource(null);
    try {
      await downloadAndInstall(update, setProgress);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setErrorSource("install");
      setStatus("error");
    }
  }

  function resolveOptIn(enabled: boolean) {
    updateSettings({ autoCheckUpdates: enabled });
    setShowOptIn(false);
    if (enabled) check();
  }

  function setAutoCheck(enabled: boolean) {
    updateSettings({ autoCheckUpdates: enabled });
  }

  function dismiss() {
    setStatus("idle");
    setError(null);
    setErrorSource(null);
  }

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    if (window.__TAURI_E2E__) return;
    getCurrentVersion()
      .then(setCurrentVersion)
      .catch(() => {});
    if (autoCheckPref === undefined || autoCheckPref === null) {
      setShowOptIn(true);
    } else if (autoCheckPref === true) {
      check();
    }
  }, [autoCheckPref]);

  return {
    status,
    update,
    currentVersion,
    error,
    errorSource,
    progress,
    autoCheck: autoCheckPref === true,
    showOptIn,
    check,
    install,
    resolveOptIn,
    setAutoCheck,
    dismiss,
  };
}
