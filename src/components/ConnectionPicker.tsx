import { useState } from "react";
import { Plus, Download, AppWindow } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { useConnectionImport } from "@/hooks/useConnectionImport";
import { ConnectionEditor } from "./ConnectionEditor";

export function ConnectionPicker() {
  const { data, error, switchConnection, isOpenElsewhere } = useApp();
  const { importError, handleImport } = useConnectionImport();
  const [showEditor, setShowEditor] = useState(false);

  return (
    <div className="setup-wizard">
      <div className="setup-card connection-picker">
        <h1>MQTT Topic Lab</h1>
        <p className="subtitle">Choose a connection for this window</p>

        {(error || importError) && <div className="error-message">{error ?? importError}</div>}

        <div className="connection-picker-list">
          {data.connections.map((conn) => {
            const openElsewhere = isOpenElsewhere(conn.id);
            return (
              <button
                key={conn.id}
                type="button"
                className="connection-picker-option"
                onClick={() => switchConnection(conn.id)}
              >
                <span className="connection-option-info">
                  <span className="connection-option-name">{conn.name}</span>
                  <span className="connection-option-broker">{conn.broker_url}</span>
                </span>
                {openElsewhere && (
                  <span className="connection-picker-open">
                    <AppWindow size={14} />
                    Already open
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="button-row">
          <button type="button" className="btn btn-secondary" onClick={handleImport}>
            <Download size={15} /> Import
          </button>
          <button type="button" className="btn" onClick={() => setShowEditor(true)}>
            <Plus size={15} /> New Connection
          </button>
        </div>
      </div>

      {showEditor && <ConnectionEditor isNew onClose={() => setShowEditor(false)} />}
    </div>
  );
}
