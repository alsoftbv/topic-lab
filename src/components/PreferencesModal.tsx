import { useEffect } from "react";
import { X } from "lucide-react";
import { UpdateSettingsSection } from "./UpdateNotice";
import type { Updater } from "../hooks/useUpdater";

interface PreferencesModalProps {
  updater: Updater;
  onClose: () => void;
}

export function PreferencesModal({ updater, onClose }: PreferencesModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-overlay">
      <div className="modal modal-small">
        <div className="modal-header">
          <h2>Preferences</h2>
          <button className="btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="settings-content">
          <h3 className="settings-section-title">Updates</h3>
          <UpdateSettingsSection updater={updater} />
        </div>
      </div>
    </div>
  );
}
