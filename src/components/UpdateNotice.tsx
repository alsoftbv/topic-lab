import { Download, X, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import type { Updater } from "@/hooks/useUpdater";

export function UpdateOptInModal({ updater }: { updater: Updater }) {
  if (!updater.showOptIn) return null;
  return (
    <div className="modal-overlay">
      <div className="modal modal-small">
        <div className="modal-header">
          <h2>Check for updates?</h2>
        </div>
        <div className="settings-content">
          <p className="hint" style={{ marginTop: 0 }}>
            MQTT Topic Lab can automatically check GitHub for new versions when it starts and let
            you install them with one click. You can change this later in Settings.
          </p>
          <div className="button-row" style={{ marginTop: "1.25rem", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => updater.resolveOptIn(false)}
            >
              Not now
            </button>
            <button type="button" className="btn" onClick={() => updater.resolveOptIn(true)}>
              Check automatically
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function UpdateBanner({ updater }: { updater: Updater }) {
  const { status, update, progress, error, errorSource } = updater;
  const installFailed = status === "error" && errorSource === "install";
  if (status !== "available" && status !== "downloading" && !installFailed) return null;

  if (installFailed) {
    return (
      <div className="update-banner update-banner-error">
        <AlertCircle size={16} />
        <span>Update failed: {error ?? "unknown error"}</span>
        <div className="update-banner-actions">
          <button className="btn btn-small" onClick={() => updater.install()}>
            Retry
          </button>
          <button className="btn-icon" title="Dismiss" onClick={() => updater.dismiss()}>
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  if (status === "downloading") {
    return (
      <div className="update-banner">
        <Download size={16} />
        <span>Downloading update… {Math.round(progress * 100)}%</span>
        <div className="update-banner-progress">
          <div className="update-banner-progress-fill" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="update-banner">
      <Download size={16} />
      <span>
        Version <strong>{update?.version}</strong> is available
      </span>
      <div className="update-banner-actions">
        <button className="btn btn-small" onClick={() => updater.install()}>
          Install &amp; Restart
        </button>
        <button className="btn-icon" title="Dismiss" onClick={() => updater.dismiss()}>
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

export function UpdateSettingsSection({ updater }: { updater: Updater }) {
  const { status, update, currentVersion, error, progress, autoCheck } = updater;

  return (
    <div className="update-settings">
      <div className="setting-item">
        <div>
          <strong>Version</strong>
          <p>{currentVersion ? `v${currentVersion}` : "—"}</p>
        </div>
      </div>

      <div className="setting-item">
        <label className="update-autocheck checkbox-group">
          <input
            type="checkbox"
            checked={autoCheck}
            onChange={(e) => updater.setAutoCheck(e.target.checked)}
          />
          <span>Check for updates automatically on startup</span>
        </label>
      </div>

      {status === "available" && update && (
        <div className="update-status-line update-status-available">
          <Download size={15} />
          <span>
            Version <strong>{update.version}</strong> is available
          </span>
        </div>
      )}
      {status === "downloading" && (
        <div className="update-status-line">
          <Download size={15} />
          <span>Downloading… {Math.round(progress * 100)}%</span>
        </div>
      )}
      {status === "uptodate" && (
        <div className="update-status-line update-status-ok">
          <CheckCircle2 size={15} />
          <span>You're on the latest version</span>
        </div>
      )}
      {status === "error" && (
        <div className="update-status-line update-status-error">
          <AlertCircle size={15} />
          <span>{error ?? "Update check failed"}</span>
        </div>
      )}

      <div className="button-row" style={{ justifyContent: "flex-start" }}>
        {status === "available" && update ? (
          <button type="button" className="btn" onClick={() => updater.install()}>
            <Download size={15} /> Install &amp; Restart
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => updater.check()}
            disabled={status === "checking" || status === "downloading"}
          >
            <RefreshCw size={15} className={status === "checking" ? "update-spin" : undefined} />
            {status === "checking" ? "Checking…" : "Check for updates"}
          </button>
        )}
      </div>
    </div>
  );
}
