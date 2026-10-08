import { Sparkles } from "lucide-react";
import { useEscapeClose } from "@/hooks/useEscapeClose";
import type { ReleaseNotesState } from "@/hooks/useReleaseNotes";

function ReleaseNotesDialog({ releaseNotes }: { releaseNotes: ReleaseNotesState }) {
  const { notes, openedFrom } = releaseNotes;
  useEscapeClose(() => releaseNotes.dismiss(false));
  if (!notes) return null;

  return (
    <div className="modal-overlay">
      <div className="modal modal-small release-notes-modal">
        <div className="modal-header">
          <h2>What's new in v{notes.version}</h2>
        </div>
        <div className="settings-content">
          <ul className="release-notes-list">
            {notes.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
          <div className="button-row">
            {openedFrom === "update" && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => releaseNotes.dismiss(true)}
              >
                Don't show again
              </button>
            )}
            <button type="button" className="btn" onClick={() => releaseNotes.dismiss(false)}>
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReleaseNotesModal({
  releaseNotes,
  suppressed,
}: {
  releaseNotes: ReleaseNotesState;
  suppressed: boolean;
}) {
  if (!releaseNotes.notes || !releaseNotes.openedFrom || suppressed) return null;
  return <ReleaseNotesDialog releaseNotes={releaseNotes} />;
}

export function ReleaseNotesSettings({ releaseNotes }: { releaseNotes: ReleaseNotesState }) {
  return (
    <div className="update-settings">
      <div className="setting-item">
        <label className="update-autocheck checkbox-group">
          <input
            type="checkbox"
            checked={releaseNotes.enabled}
            onChange={(e) => releaseNotes.setEnabled(e.target.checked)}
          />
          <span>Show what's new after updating</span>
        </label>
      </div>
      {releaseNotes.notes && (
        <button type="button" className="btn btn-secondary" onClick={() => releaseNotes.show()}>
          <Sparkles size={15} /> What's new in v{releaseNotes.notes.version}
        </button>
      )}
    </div>
  );
}
