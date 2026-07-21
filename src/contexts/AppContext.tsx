import { createContext, useContext, useState, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import type {
  AppData,
  AppSettings,
  Connection,
  Button,
  ButtonGroup,
  ConnectionStatus,
} from "@/types";
import * as api from "@/utils/api";
import { setBuiltinNames, templateHasBuiltin } from "@/utils/builtins";

interface AppContextType {
  data: AppData;
  activeConnection: Connection | null;
  connectionStatus: ConnectionStatus;
  loading: boolean;
  error: string | null;
  resolvedButtons: Record<string, { topic: string; payload: string }>;
  resolvedSubscriptions: Record<string, string>;
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
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  publishButton: (button: Button) => Promise<void>;
  resetAll: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>({ connections: [] });
  const dataRef = useRef(data);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvedButtons, setResolvedButtons] = useState<
    Record<string, { topic: string; payload: string }>
  >({});
  const [resolvedSubscriptions, setResolvedSubscriptions] = useState<Record<string, string>>({});

  const connectionStatusRef = useRef<ConnectionStatus>("disconnected");

  const activeConnection = data.connections.find((c) => c.id === activeConnectionId) ?? null;

  function updateConnectionStatus(status: ConnectionStatus) {
    connectionStatusRef.current = status;
    setConnectionStatus(status);
  }

  async function tryAutoConnect(connection: Connection | undefined) {
    if (!connection?.auto_connect) return;
    try {
      updateConnectionStatus("connecting");
      await api.connect(connection);
    } catch (e) {
      updateConnectionStatus("error");
      console.error("Auto-connect failed:", e);
    }
  }

  async function tryDisconnect() {
    try {
      await api.disconnect();
    } catch (e) {
      console.error("Disconnect failed:", e);
    }
    updateConnectionStatus("disconnected");
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    const unlisten = listen<string>("mqtt-status", (event) => {
      updateConnectionStatus(event.payload as ConnectionStatus);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const lastResolvedRef = useRef<string>("");

  useEffect(() => {
    if (!activeConnection) {
      setResolvedButtons({});
      setResolvedSubscriptions({});
      lastResolvedRef.current = "";
      return;
    }
    const { buttons, variables, subscriptions } = activeConnection;
    const templates: string[] = [];
    for (const b of buttons) {
      templates.push(b.topic, b.payload ?? "");
    }
    const subStart = templates.length;
    for (const s of subscriptions) {
      templates.push(s);
    }

    let cancelled = false;
    lastResolvedRef.current = "";
    const hasBuiltins = templates.some(templateHasBuiltin);
    const compute = () => {
      api
        .resolveTemplates(templates, variables)
        .then((resolved) => {
          if (cancelled) return;
          const key = JSON.stringify(resolved);
          if (key === lastResolvedRef.current) return;
          lastResolvedRef.current = key;
          const btnMap: Record<string, { topic: string; payload: string }> = {};
          buttons.forEach((b, i) => {
            btnMap[b.id] = { topic: resolved[i * 2], payload: resolved[i * 2 + 1] };
          });
          const subMap: Record<string, string> = {};
          subscriptions.forEach((s, i) => {
            subMap[s] = resolved[subStart + i];
          });
          setResolvedButtons(btnMap);
          setResolvedSubscriptions(subMap);
        })
        .catch(() => {});
    };
    compute();
    const interval = hasBuiltins ? window.setInterval(compute, 1000) : undefined;
    return () => {
      cancelled = true;
      if (interval !== undefined) clearInterval(interval);
    };
  }, [activeConnection?.buttons, activeConnection?.variables, activeConnection?.subscriptions]);

  async function loadData() {
    try {
      setLoading(true);
      try {
        setBuiltinNames(await api.getBuiltinNames());
      } catch (e) {
        console.error("Fetching builtin names failed:", e);
      }
      const loaded = await api.getData();
      setData(loaded);

      const initialConnectionId = loaded.last_connection_id ?? loaded.connections[0]?.id;
      if (initialConnectionId) {
        setActiveConnectionId(initialConnectionId);
        const initialConnection = loaded.connections.find((c) => c.id === initialConnectionId);
        if (initialConnection?.auto_connect) {
          try {
            updateConnectionStatus("connecting");
            await api.connect(initialConnection);
          } catch (e) {
            updateConnectionStatus("error");
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
    const prevData = dataRef.current;
    const newData = updater(prevData);
    dataRef.current = newData;
    setData(newData);
    try {
      await api.saveData(newData);
      setError(null);
    } catch (e) {
      dataRef.current = prevData;
      setData(prevData);
      setError(e instanceof Error ? e.message : "Failed to save data");
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
      return { ...prev, connections: deletedConnections, last_connection_id: deletedLastId };
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

  async function updateSettings(settings: Partial<AppSettings>) {
    await saveData((prev) => ({
      ...prev,
      settings: { ...prev.settings, ...settings },
    }));
  }

  async function connect() {
    const conn = dataRef.current.connections.find((c) => c.id === activeConnectionId);
    if (!conn) return;
    if (connectionStatusRef.current === "connecting" || connectionStatusRef.current === "connected")
      return;
    try {
      updateConnectionStatus("connecting");
      await api.connect(conn);
    } catch (e) {
      updateConnectionStatus("error");
      console.error("Connection failed:", e);
    }
  }

  async function disconnect() {
    try {
      await api.disconnect();
      updateConnectionStatus("disconnected");
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
    updateConnectionStatus("disconnected");
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
        resolvedButtons,
        resolvedSubscriptions,
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
        updateSettings,
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
