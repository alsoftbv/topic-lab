import { useEffect, useState } from "react";
import { X, CheckCircle2 } from "lucide-react";
import { UpdateSettingsSection } from "./UpdateNotice";
import * as api from "../utils/api";
import type { Updater } from "../hooks/useUpdater";

interface PreferencesModalProps {
  updater: Updater;
  onClose: () => void;
}

function CliToolSection() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const isWindows = typeof navigator !== "undefined" && /Windows/.test(navigator.userAgent);

  const handleInstall = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await api.installCli();
      const dir = r.path.replace(/\/[^/]+$/, "");
      const note = r.onPath ? "" : ` (add ${dir} to your PATH)`;
      setResult({
        ok: true,
        text: `${r.already ? "Already installed" : "Installed"}: ${r.path}${note}`,
      });
    } catch (e) {
      setResult({ ok: false, text: typeof e === "string" ? e : "Install failed" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="update-settings">
      <div className="setting-item">
        <div>
          <strong>Command-line tool</strong>
          <p>
            Install the <code>topic-lab</code> command so agents and terminals can drive this app.
          </p>
        </div>
        <button className="btn btn-small" onClick={handleInstall} disabled={busy}>
          {busy
            ? isWindows
              ? "Adding…"
              : "Installing…"
            : isWindows
              ? "Add to PATH"
              : "Install"}
        </button>
      </div>
      {result &&
        (result.ok ? (
          <div className="update-status-line update-status-ok">
            <CheckCircle2 size={15} />
            <span>{result.text}</span>
          </div>
        ) : (
          <pre className="error-message" style={{ whiteSpace: "pre-wrap" }}>
            {result.text}
          </pre>
        ))}
    </div>
  );
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
          <h3 className="settings-section-title">Command Line</h3>
          <CliToolSection />
        </div>
      </div>
    </div>
  );
}
