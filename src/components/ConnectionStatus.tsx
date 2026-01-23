import { useApp } from '../contexts/AppContext';

export function ConnectionStatus() {
    const { connectionStatus, connect, disconnect } = useApp();

    const statusColors: Record<string, string> = {
        disconnected: '#888',
        connecting: '#f0ad4e',
        connected: '#5cb85c',
        error: '#d9534f',
    };

    const statusLabels: Record<string, string> = {
        disconnected: 'Disconnected',
        connecting: 'Connecting...',
        connected: 'Connected',
        error: 'Connection Error',
    };

    return (
        <div className="connection-status">
            <span
                className="status-indicator"
                style={{ backgroundColor: statusColors[connectionStatus] }}
            />
            <span className="status-label">{statusLabels[connectionStatus]}</span>
            {connectionStatus === 'disconnected' || connectionStatus === 'error' ? (
                <button className="btn btn-small" onClick={connect}>
                    Connect
                </button>
            ) : connectionStatus === 'connected' ? (
                <button className="btn btn-small btn-secondary" onClick={disconnect}>
                    Disconnect
                </button>
            ) : null}
        </div>
    );
}
