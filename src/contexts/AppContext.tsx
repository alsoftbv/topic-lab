import { createContext, useContext, useState, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type {
  AppData,
  AppSettings,
  Connection,
  Button,
  ButtonGroup,
  ConnectionStatus,
  DataSnapshot,
  OpenConnection,
} from "@/types";
import * as api from "@/utils/api";
import { setBuiltinNames, templateHasBuiltin } from "@/utils/builtins";
import { findClientIdClash, generateClientId } from "@/utils/clientId";
import { confirm } from "@/utils/dialog";
import { MAIN_WINDOW } from "@/utils/windows";
import { useSyncedData, EMPTY_DATA } from "@/hooks/useSyncedData";

interface AppContextType {
  data: AppData;
  activeConnection: Connection | null;
  connectionStatus: ConnectionStatus;
  loading: boolean;
  error: string | null;
  resolvedButtons: Record<string, { topic: string; payload: string }>;
  resolvedSubscriptions: Record<string, string>;
  openConnections: OpenConnection[];
  runsStartupTasks: boolean;
  isOpenElsewhere: (id: string) => boolean;
  openInNewWindow: (id: string) => Promise<void>;
  addConnection: (connection: Connection) => Promise<void>;
  importConnection: (connection: Omit<Connection, "id">) => Promise<void>;
  duplicateConnection: (id: string) => Promise<void>;
  updateConnection: (id: string, patch: Partial<Connection>) => Promise<void>;
  deleteConnection: (id: string) => Promise<void>;
  switchConnection: (id: string) => Promise<void>;
  reorderConnections: (connections: Connection[]) => Promise<void>;
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
  const { data, dataRef, load, mutate } = useSyncedData();
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvedButtons, setResolvedButtons] = useState<
    Record<string, { topic: string; payload: string }>
  >({});
  const [resolvedSubscriptions, setResolvedSubscriptions] = useState<Record<string, string>>({});
  const [openConnections, setOpenConnections] = useState<OpenConnection[]>([]);
  const windowLabel = getCurrentWebviewWindow().label;
  const runsStartupTasks = windowLabel === MAIN_WINDOW;

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
    const unlisten = getCurrentWebviewWindow().listen<string>("mqtt-status", (event) => {
      updateConnectionStatus(event.payload as ConnectionStatus);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const unlisten = listen<OpenConnection[]>("open-connections-changed", (event) => {
      setOpenConnections(event.payload);
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
      const loaded = await load();
      const [windowConnectionId, open] = await Promise.all([
        api.getWindowConnection(),
        api.getOpenConnections(),
      ]);
      setOpenConnections(open);

      const initialConnection = loaded.connections.find((c) => c.id === windowConnectionId);
      if (initialConnection) {
        setActiveConnectionId(initialConnection.id);
        if (initialConnection.auto_connect) {
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

  async function save(
    optimistic: (prev: AppData) => AppData,
    request: (saved: AppData) => Promise<DataSnapshot>
  ): Promise<AppData | null> {
    try {
      const saved = await mutate(optimistic, request);
      setError(null);
      return saved;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save data");
      return null;
    }
  }

  function withoutConnection(data: AppData, id: string): AppData {
    return { ...data, connections: data.connections.filter((c) => c.id !== id) };
  }

  async function editConnection(id: string, updater: (conn: Connection) => Connection) {
    await save(
      (prev) => ({
        ...prev,
        connections: prev.connections.map((c) => (c.id === id ? updater(c) : c)),
      }),
      (saved) => {
        const conn = saved.connections.find((c) => c.id === id);
        if (!conn) throw new Error("This connection no longer exists");
        return api.saveConnection(updater(conn));
      }
    );
  }

  async function updateActiveConnection(updater: (conn: Connection) => Connection) {
    if (activeConnectionId) await editConnection(activeConnectionId, updater);
  }

  async function updateConnection(id: string, patch: Partial<Connection>) {
    await editConnection(id, (conn) => ({ ...conn, ...patch }));
  }

  function ownerIn(open: OpenConnection[], id: string): OpenConnection | undefined {
    return open.find((o) => o.connectionId === id && o.label !== windowLabel);
  }

  function isOpenElsewhere(id: string): boolean {
    return ownerIn(openConnections, id) !== undefined;
  }

  async function freshOpenConnections(): Promise<OpenConnection[]> {
    const open = await api.getOpenConnections();
    setOpenConnections(open);
    return open;
  }

  async function resolveClientIdClash(
    connection: Connection,
    open: OpenConnection[],
    includeOwnWindow: boolean
  ): Promise<Connection | null> {
    const others = open
      .filter((o) => includeOwnWindow || o.label !== windowLabel)
      .map((o) => dataRef.current.connections.find((c) => c.id === o.connectionId))
      .filter((c): c is Connection => c !== undefined);
    const clash = findClientIdClash(connection, others);
    if (!clash) return connection;
    const regenerate = await confirm(
      `“${connection.name}” uses the same client ID as “${clash.name}”, which is already open. ` +
        `The broker would keep disconnecting one of them.\n\nGive “${connection.name}” a new client ID?`,
      {
        title: "Client ID already in use",
        kind: "warning",
        okLabel: "New Client ID",
        cancelLabel: "Cancel",
      }
    );
    if (!regenerate) return null;
    const clientId = generateClientId();
    await updateConnection(connection.id, { client_id: clientId });
    return { ...connection, client_id: clientId };
  }

  async function claim(id: string): Promise<boolean> {
    try {
      const result = await api.claimConnection(id);
      if (result.status === "claimed") return true;
      await api.focusWindow(result.label);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    return false;
  }

  async function activate(connection: Connection): Promise<boolean> {
    const open = await freshOpenConnections();
    const owner = ownerIn(open, connection.id);
    if (owner) {
      await api.focusWindow(owner.label);
      return false;
    }
    const ready = await resolveClientIdClash(connection, open, false);
    if (!ready || !(await claim(ready.id))) return false;
    await tryDisconnect();
    setActiveConnectionId(ready.id);
    await save(
      (prev) => ({ ...prev, last_connection_id: ready.id }),
      () => api.setLastConnection(ready.id)
    );
    await tryAutoConnect(ready);
    return true;
  }

  async function openInNewWindow(id: string) {
    const open = await freshOpenConnections();
    const owner = ownerIn(open, id);
    if (owner) {
      await api.focusWindow(owner.label);
      return;
    }
    const target = dataRef.current.connections.find((c) => c.id === id);
    if (!target) return;
    const ready = await resolveClientIdClash(target, open, true);
    if (!ready) return;
    await api.openWindow(ready.id);
  }

  async function addConnection(connection: Connection) {
    const saved = await save(
      (prev) => ({ ...prev, connections: [...prev.connections, connection] }),
      () => api.saveConnection(connection)
    );
    if (!saved) return;
    await activate(connection);
  }

  async function importConnection(connectionData: Omit<Connection, "id">) {
    await addConnection({
      ...connectionData,
      id: crypto.randomUUID(),
      client_id: generateClientId(),
    });
  }

  async function duplicateConnection(id: string) {
    const source = dataRef.current.connections.find((c) => c.id === id);
    if (!source) return;
    await addConnection({
      ...structuredClone(source),
      id: crypto.randomUUID(),
      name: `${source.name} Copy`,
      client_id: generateClientId(),
    });
  }

  async function deleteConnection(id: string) {
    const remove = () =>
      save(
        (prev) => withoutConnection(prev, id),
        () => api.deleteConnection(id)
      );

    if (activeConnectionId !== id) {
      await remove();
      return;
    }

    const open = await freshOpenConnections();
    const next = dataRef.current.connections.find(
      (c) => c.id !== id && !open.some((o) => o.connectionId === c.id)
    );
    if (next && (await activate(next))) {
      await remove();
      return;
    }

    await tryDisconnect();
    if (await remove()) setActiveConnectionId(null);
  }

  async function switchConnection(id: string) {
    if (id === activeConnectionId) return;
    const target = dataRef.current.connections.find((c) => c.id === id);
    if (target) await activate(target);
  }

  async function reorderConnections(connections: Connection[]) {
    await save(
      (prev) => ({ ...prev, connections }),
      () => api.reorderConnections(connections.map((c) => c.id))
    );
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
    await save(
      (prev) => ({ ...prev, settings: { ...prev.settings, ...settings } }),
      () => api.updateSettings(settings)
    );
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
    setActiveConnectionId(null);
    updateConnectionStatus("disconnected");
    setError(null);
    mutate(() => EMPTY_DATA, api.deleteData).catch((e) =>
      console.error("Delete data during reset failed:", e)
    );
    api.disconnect().catch((e) => console.error("Disconnect during reset failed:", e));
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
        openConnections,
        runsStartupTasks,
        isOpenElsewhere,
        openInNewWindow,
        addConnection,
        importConnection,
        duplicateConnection,
        updateConnection,
        deleteConnection,
        switchConnection,
        reorderConnections,
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
