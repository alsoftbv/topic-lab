import { AppProvider, useApp } from './contexts/AppContext';
import { SetupWizard } from './components/SetupWizard';
import { Dashboard } from './components/Dashboard';
import './styles/main.css';

function AppContent() {
    const { data, loading, error, resetAll } = useApp();

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

    return <Dashboard />;
}

function App() {
    return (
        <AppProvider>
            <AppContent />
        </AppProvider>
    );
}

export default App;
