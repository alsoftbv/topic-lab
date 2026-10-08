import { useState, useEffect, useRef } from "react";
import { useApp } from "@/contexts/AppContext";
import * as api from "@/utils/api";
import type { AppSettings, ReleaseNotes } from "@/types";

export type ReleaseNotesSource = "update" | "manual";

export interface ReleaseNotesState {
  notes: ReleaseNotes | null;
  openedFrom: ReleaseNotesSource | null;
  enabled: boolean;
  show: () => void;
  dismiss: (dontShowAgain: boolean) => void;
  setEnabled: (enabled: boolean) => void;
}

export function useReleaseNotes(): ReleaseNotesState {
  const { data, loading, error, updateSettings, runsStartupTasks } = useApp();
  const [notes, setNotes] = useState<ReleaseNotes | null>(null);
  const [openedFrom, setOpenedFrom] = useState<ReleaseNotesSource | null>(null);
  const didInit = useRef(false);

  useEffect(() => {
    if (loading || didInit.current) return;
    didInit.current = true;
    if (error) return;

    const lastSeen = data.settings?.lastSeenVersion;
    const showAfterUpdate = data.settings?.showReleaseNotes !== false;
    const isUpgrade = lastSeen != null || data.connections.length > 0;

    api
      .getReleaseNotes()
      .then((loaded) => {
        if (!loaded) return;
        setNotes(loaded);
        if (!runsStartupTasks || lastSeen === loaded.version) return;
        if (isUpgrade && showAfterUpdate) {
          setOpenedFrom("update");
        } else {
          updateSettings({ lastSeenVersion: loaded.version });
        }
      })
      .catch((e) => console.error("Fetching release notes failed:", e));
  }, [loading]);

  function show() {
    if (notes) setOpenedFrom("manual");
  }

  function dismiss(dontShowAgain: boolean) {
    const wasUpdate = openedFrom === "update";
    setOpenedFrom(null);
    if (!notes || !wasUpdate) return;
    const settings: Partial<AppSettings> = { lastSeenVersion: notes.version };
    if (dontShowAgain) settings.showReleaseNotes = false;
    updateSettings(settings);
  }

  function setEnabled(enabled: boolean) {
    updateSettings({ showReleaseNotes: enabled });
  }

  return {
    notes,
    openedFrom,
    enabled: data.settings?.showReleaseNotes !== false,
    show,
    dismiss,
    setEnabled,
  };
}
