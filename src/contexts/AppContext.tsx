import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { AppData, Connection, Button, ConnectionStatus } from '../types';
import * as api from '../utils/api';

interface AppContextType {
    data: AppData;
    activeConnection: Connection | null;
    connectionStatus: ConnectionStatus;
    loading: boolean;
    error: string | null;
    addConnection: (connection: Connection) => Promise<void>;
    updateConnection: (connection: Connection) => Promise<void>;
    deleteConnection: (id: string) => Promise<void>;
    switchConnection: (id: string) => Promise<void>;
    addButton: (button: Button) => Promise<void>;
    updateButton: (button: Button) => Promise<void>;
    deleteButton: (id: string) => Promise<void>;
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
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const activeConnection = data.connections.find((c) => c.id === activeConnectionId) ?? null;

    const tryAutoConnect = useCallback(async (connection: Connection | undefined) => {
        if (!connection?.auto_connect) return;
        try {
            setConnectionStatus('connecting');
            await api.connect(connection);
        } catch (e) {
            console.error('Auto-connect failed:', e);
        }
    }, []);

    const tryDisconnect = useCallback(async () => {
        try {
            await api.disconnect();
        } catch { }
        setConnectionStatus('disconnected');
    }, []);

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        const unlisten = listen<string>('mqtt-status', (event) => {
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
                        setConnectionStatus('connecting');
                        await api.connect(initialConnection);
                    } catch (e) {
                        console.error('Auto-connect failed:', e);
                    }
                }
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load data');
        } finally {
            setLoading(false);
        }
    }

    const saveData = useCallback(async (newData: AppData) => {
        try {
            await api.saveData(newData);
            setData(newData);
            setError(null);
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Failed to save data';
            setError(msg);
            throw new Error(msg);
        }
    }, []);

    const addConnection = useCallback(
        async (connection: Connection) => {
            await saveData({
                ...data,
                connections: [...data.connections, connection],
                last_connection_id: connection.id,
            });
            setActiveConnectionId(connection.id);
            await tryAutoConnect(connection);
        },
        [data, saveData, tryAutoConnect]
    );

    const updateConnection = useCallback(
        async (connection: Connection) => {
            await saveData({
                ...data,
                connections: data.connections.map((c) => (c.id === connection.id ? connection : c)),
            });
        },
        [data, saveData]
    );

    const deleteConnection = useCallback(
        async (id: string) => {
            const newConnections = data.connections.filter((c) => c.id !== id);
            const newLastConnectionId =
                data.last_connection_id === id ? newConnections[0]?.id : data.last_connection_id;

            await saveData({ connections: newConnections, last_connection_id: newLastConnectionId });

            if (activeConnectionId === id) {
                await tryDisconnect();
                const nextConnection = newConnections[0];
                setActiveConnectionId(nextConnection?.id ?? null);
                await tryAutoConnect(nextConnection);
            }
        },
        [data, saveData, activeConnectionId, tryDisconnect, tryAutoConnect]
    );

    const switchConnection = useCallback(
        async (id: string) => {
            if (id === activeConnectionId) return;

            await tryDisconnect();
            await saveData({ ...data, last_connection_id: id });
            setActiveConnectionId(id);
            await tryAutoConnect(data.connections.find((c) => c.id === id));
        },
        [data, saveData, activeConnectionId, tryDisconnect, tryAutoConnect]
    );

    const addButton = useCallback(
        async (button: Button) => {
            if (!activeConnection) return;
            await updateConnection({
                ...activeConnection,
                buttons: [...activeConnection.buttons, button],
            });
        },
        [activeConnection, updateConnection]
    );

    const updateButton = useCallback(
        async (button: Button) => {
            if (!activeConnection) return;
            await updateConnection({
                ...activeConnection,
                buttons: activeConnection.buttons.map((b) => (b.id === button.id ? button : b)),
            });
        },
        [activeConnection, updateConnection]
    );

    const deleteButton = useCallback(
        async (id: string) => {
            if (!activeConnection) return;
            await updateConnection({
                ...activeConnection,
                buttons: activeConnection.buttons.filter((b) => b.id !== id),
            });
        },
        [activeConnection, updateConnection]
    );

    const updateVariables = useCallback(
        async (variables: Record<string, string>) => {
            if (!activeConnection) return;
            await updateConnection({ ...activeConnection, variables });
        },
        [activeConnection, updateConnection]
    );

    const updateSubscriptions = useCallback(
        async (subscriptions: string[]) => {
            if (!activeConnection) return;
            await updateConnection({ ...activeConnection, subscriptions });
        },
        [activeConnection, updateConnection]
    );

    const connect = useCallback(async () => {
        if (!activeConnection) return;
        if (connectionStatus === 'connecting' || connectionStatus === 'connected') return;
        try {
            setConnectionStatus('connecting');
            await api.connect(activeConnection);
        } catch (e) {
            setConnectionStatus('error');
            console.error('Connection failed:', e);
        }
    }, [activeConnection, connectionStatus]);

    const disconnect = useCallback(async () => {
        try {
            await api.disconnect();
            setConnectionStatus('disconnected');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to disconnect');
        }
    }, []);

    const publishButton = useCallback(
        async (button: Button) => {
            if (!activeConnection) return;
            try {
                await api.publishButton(button, activeConnection.variables);
            } catch (e) {
                const msg = e instanceof Error ? e.message : 'Failed to publish';
                setError(msg);
                throw new Error(msg);
            }
        },
        [activeConnection]
    );

    const resetAll = useCallback(() => {
        setData({ connections: [] });
        setActiveConnectionId(null);
        setConnectionStatus('disconnected');
        setError(null);
        (async () => {
            try {
                await api.disconnect();
            } catch { }
            try {
                await api.deleteData();
            } catch { }
        })();
    }, []);

    return (
        <AppContext.Provider
            value={{
                data,
                activeConnection,
                connectionStatus,
                loading,
                error,
                addConnection,
                updateConnection,
                deleteConnection,
                switchConnection,
                addButton,
                updateButton,
                deleteButton,
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
        throw new Error('useApp must be used within an AppProvider');
    }
    return context;
}
