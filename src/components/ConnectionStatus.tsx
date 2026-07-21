import { useApp } from "@/contexts/AppContext";

export function ConnectionStatus() {
  const { connectionStatus, connect, disconnect } = useApp();

  const statusLabels: Record<string, string> = {
    disconnected: "Disconnected",
    connecting: "Connecting...",
    connected: "Connected",
    error: "Connection Error",
  };

  return (
    <div className="connection-status">
      <span className={`status-indicator ${connectionStatus}`} />
      <span className="status-label">{statusLabels[connectionStatus]}</span>
      {connectionStatus === "disconnected" || connectionStatus === "error" ? (
        <button className="btn btn-small" onClick={connect}>
          Connect
        </button>
      ) : connectionStatus === "connected" ? (
        <button className="btn btn-small btn-secondary" onClick={disconnect}>
          Disconnect
        </button>
      ) : null}
    </div>
  );
}
