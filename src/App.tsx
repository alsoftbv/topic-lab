import { useEffect, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { AppProvider, useApp } from "@/contexts/AppContext";
import { SetupWizard } from "@/components/SetupWizard";
import { Dashboard } from "@/components/Dashboard";
import { ConnectionPicker } from "@/components/ConnectionPicker";
import { PreferencesModal } from "@/components/PreferencesModal";
import { ReleaseNotesModal } from "@/components/ReleaseNotes";
import { useReleaseNotes } from "@/hooks/useReleaseNotes";
import { useUpdater, type Updater } from "@/hooks/useUpdater";
import "@/styles/main.css";

function MainView({ updater, preferencesOpen }: { updater: Updater; preferencesOpen: boolean }) {
  const { data, loading, error, resetAll, activeConnection } = useApp();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  if (error && data.connections.length === 0) {
    return (
      <div className="loading-screen">
        <h2>Something went wrong</h2>
        <p className="hint">{error}</p>
        <button className="btn" onClick={resetAll}>
          Reset and Start Fresh
        </button>
      </div>
    );
  }

  if (data.connections.length === 0) {
    return <SetupWizard />;
  }

  if (!activeConnection) {
    return <ConnectionPicker />;
  }

  return <Dashboard updater={updater} preferencesOpen={preferencesOpen} />;
}

function AppContent() {
  const updater = useUpdater();
  const releaseNotes = useReleaseNotes();
  const [showPreferences, setShowPreferences] = useState(false);

  useEffect(() => {
    const unlisten = getCurrentWebviewWindow().listen("open-preferences", () =>
      setShowPreferences(true)
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <>
      <MainView updater={updater} preferencesOpen={showPreferences} />

      {showPreferences && (
        <PreferencesModal
          updater={updater}
          releaseNotes={releaseNotes}
          onClose={() => setShowPreferences(false)}
        />
      )}

      <ReleaseNotesModal releaseNotes={releaseNotes} suppressed={updater.showOptIn} />
    </>
  );
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
