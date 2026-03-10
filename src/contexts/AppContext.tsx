import { createContext, useContext, useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import type { AppData, Connection, Button, ButtonGroup, ConnectionStatus } from "../types";
import * as api from "../utils/api";

interface AppContextType {
  data: AppData;
  activeConnection: Connection | null;
  connectionStatus: ConnectionStatus;
  loading: boolean;
  error: string | null;
  addConnection: (connection: Connection) => Promise<void>;
  importConnection: (connection: Omit<Connection, "id">) => Promise<void>;
  updateConnection: (connection: Connection) => Promise<void>;
  deleteConnection: (id: string) => Promise<void>;
  switchConnection: (id: string) => Promise<void>;
  addButton: (button: Button) => Promise<void>;
  updateButton: (button: Button) => Promise<void>;
  deleteButton: (id: string) => Promise<void>;
  reorderButtons: (buttons: Button[]) => Promise<void>;
  duplicateButton: (sourceButton: Button, afterButtonId?: string) => Promise<string>;
  addGroup: (group: ButtonGroup) => Promise<void>;
  updateGroup: (group: ButtonGroup) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
  reorderGroups: (groups: ButtonGroup[]) => Promise<void>;
  updateVariables: (variables: Record<string, string>) => Promise<void>;
  updateSubscriptions: (subscriptions: string[]) => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  publishButton: (button: Button) => Promise<void>;
  resetAll: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>({ connections: [] });
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeConnection = data.connections.find((c) => c.id === activeConnectionId) ?? null;

  async function tryAutoConnect(connection: Connection | undefined) {
    if (!connection?.auto_connect) return;
    try {
      setConnectionStatus("connecting");
      await api.connect(connection);
    } catch (e) {
      setConnectionStatus("error");
      console.error("Auto-connect failed:", e);
    }
  }

  async function tryDisconnect() {
    try {
      await api.disconnect();
    } catch (e) {
      console.error("Disconnect failed:", e);
    }
    setConnectionStatus("disconnected");
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const unlisten = listen<string>("mqtt-status", (event) => {
      setConnectionStatus(event.payload as ConnectionStatus);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const loaded = await api.getData();
      setData(loaded);

      const initialConnectionId = loaded.last_connection_id ?? loaded.connections[0]?.id;
      if (initialConnectionId) {
        setActiveConnectionId(initialConnectionId);
        const initialConnection = loaded.connections.find((c) => c.id === initialConnectionId);
        if (initialConnection?.auto_connect) {
          try {
            setConnectionStatus("connecting");
            await api.connect(initialConnection);
          } catch (e) {
            setConnectionStatus("error");
            console.error("Auto-connect failed:", e);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  async function saveData(updater: (prev: AppData) => AppData) {
    let newData: AppData | null = null;
    setData((prev) => {
      newData = updater(prev);
      return newData;
    });
    if (newData) {
      try {
        await api.saveData(newData);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save data");
      }
    }
  }

  async function updateActiveConnection(updater: (conn: Connection) => Connection) {
    await saveData((prev) => {
      const conn = prev.connections.find((c) => c.id === activeConnectionId);
      if (!conn) return prev;
      return {
        ...prev,
        connections: prev.connections.map((c) => (c.id === conn.id ? updater(c) : c)),
      };
    });
  }

  async function addConnection(connection: Connection) {
    await tryDisconnect();
    await saveData((prev) => ({
      ...prev,
      connections: [...prev.connections, connection],
      last_connection_id: connection.id,
    }));
    setActiveConnectionId(connection.id);
    await tryAutoConnect(connection);
  }

  async function importConnection(connectionData: Omit<Connection, "id">) {
    const connection: Connection = {
      ...connectionData,
      id: crypto.randomUUID(),
    };
    await addConnection(connection);
  }

  async function updateConnection(connection: Connection) {
    await saveData((prev) => ({
      ...prev,
      connections: prev.connections.map((c) => (c.id === connection.id ? connection : c)),
    }));
  }

  async function deleteConnection(id: string) {
    let deletedConnections: Connection[] = [];
    let deletedLastId: string | undefined;
    await saveData((prev) => {
      deletedConnections = prev.connections.filter((c) => c.id !== id);
      deletedLastId =
        prev.last_connection_id === id ? deletedConnections[0]?.id : prev.last_connection_id;
      return { connections: deletedConnections, last_connection_id: deletedLastId };
    });

    if (activeConnectionId === id) {
      await tryDisconnect();
      const nextConnection = deletedConnections[0];
      setActiveConnectionId(nextConnection?.id ?? null);
      await tryAutoConnect(nextConnection);
    }
  }

  async function switchConnection(id: string) {
    if (id === activeConnectionId) return;

    await tryDisconnect();
    let conn: Connection | undefined;
    await saveData((prev) => {
      conn = prev.connections.find((c) => c.id === id);
      return { ...prev, last_connection_id: id };
    });
    setActiveConnectionId(id);
    await tryAutoConnect(conn);
  }

  async function addButton(button: Button) {
    await updateActiveConnection((conn) => ({
      ...conn,
      buttons: [...conn.buttons, button],
    }));
  }

  async function updateButton(button: Button) {
    await updateActiveConnection((conn) => ({
      ...conn,
      buttons: conn.buttons.map((b) => (b.id === button.id ? button : b)),
    }));
  }

  async function deleteButton(id: string) {
    await updateActiveConnection((conn) => ({
      ...conn,
      buttons: conn.buttons.filter((b) => b.id !== id),
    }));
  }

  async function reorderButtons(buttons: Button[]) {
    await updateActiveConnection((conn) => ({ ...conn, buttons }));
  }

  async function duplicateButton(sourceButton: Button, afterButtonId?: string): Promise<string> {
    const newId = crypto.randomUUID();
    await updateActiveConnection((conn) => {
      const buttons = [...conn.buttons];
      if (afterButtonId) {
        const idx = buttons.findIndex((b) => b.id === afterButtonId);
        buttons.splice(idx + 1, 0, { ...sourceButton, id: newId });
      } else {
        buttons.push({ ...sourceButton, id: newId });
      }
      return { ...conn, buttons };
    });
    return newId;
  }

  async function addGroup(group: ButtonGroup) {
    await updateActiveConnection((conn) => ({
      ...conn,
      groups: [...conn.groups, group],
    }));
  }

  async function updateGroup(group: ButtonGroup) {
    await updateActiveConnection((conn) => ({
      ...conn,
      groups: conn.groups.map((g) => (g.id === group.id ? group : g)),
    }));
  }

  async function deleteGroup(id: string) {
    await updateActiveConnection((conn) => ({
      ...conn,
      groups: conn.groups.filter((g) => g.id !== id),
      buttons: conn.buttons.map((b) => (b.groupId === id ? { ...b, groupId: undefined } : b)),
    }));
  }

  async function reorderGroups(groups: ButtonGroup[]) {
    await updateActiveConnection((conn) => ({ ...conn, groups }));
  }

  const MAX_VARIABLE_HISTORY = 5;

  async function updateVariables(variables: Record<string, string>) {
    await updateActiveConnection((conn) => {
      const history = { ...conn.variable_history };
      for (const [key, newValue] of Object.entries(variables)) {
        const oldValue = conn.variables[key];
        if (oldValue !== undefined && oldValue !== newValue) {
          const existing = history[key] || [];
          history[key] = [oldValue, ...existing.filter((v) => v !== oldValue)].slice(
            0,
            MAX_VARIABLE_HISTORY
          );
        }
      }
      for (const key of Object.keys(history)) {
        if (!(key in variables)) delete history[key];
      }
      return { ...conn, variables, variable_history: history };
    });
  }

  async function updateSubscriptions(subscriptions: string[]) {
    await updateActiveConnection((conn) => ({ ...conn, subscriptions }));
  }

  async function connect() {
    if (!activeConnection) return;
    if (connectionStatus === "connecting" || connectionStatus === "connected") return;
    try {
      setConnectionStatus("connecting");
      await api.connect(activeConnection);
    } catch (e) {
      setConnectionStatus("error");
      console.error("Connection failed:", e);
    }
  }

  async function disconnect() {
    try {
      await api.disconnect();
      setConnectionStatus("disconnected");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to disconnect");
    }
  }

  async function publishButton(button: Button) {
    if (!activeConnection) return;
    try {
      await api.publishButton(button, activeConnection.variables);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to publish";
      setError(msg);
      throw new Error(msg);
    }
  }

  function resetAll() {
    setData({ connections: [] });
    setActiveConnectionId(null);
    setConnectionStatus("disconnected");
    setError(null);
    (async () => {
      try {
        await api.disconnect();
      } catch (e) {
        console.error("Disconnect during reset failed:", e);
      }
      try {
        await api.deleteData();
      } catch (e) {
        console.error("Delete data during reset failed:", e);
      }
    })();
  }

  return (
    <AppContext.Provider
      value={{
        data,
        activeConnection,
        connectionStatus,
        loading,
        error,
        addConnection,
        importConnection,
        updateConnection,
        deleteConnection,
        switchConnection,
        addButton,
        updateButton,
        deleteButton,
        reorderButtons,
        duplicateButton,
        addGroup,
        updateGroup,
        deleteGroup,
        reorderGroups,
        updateVariables,
        updateSubscriptions,
        connect,
        disconnect,
        publishButton,
        resetAll,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}
