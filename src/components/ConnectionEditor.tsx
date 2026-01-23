import { useState } from 'react';
import { X } from 'lucide-react';
import type { Connection } from '../types';
import { useApp } from '../contexts/AppContext';

interface ConnectionEditorProps {
    isNew?: boolean;
    onClose: () => void;
}

export function ConnectionEditor({ isNew = false, onClose }: ConnectionEditorProps) {
    const { activeConnection, addConnection, updateConnection, disconnect, connect } = useApp();

    const [name, setName] = useState(isNew ? '' : activeConnection?.name || '');
    const [brokerUrl, setBrokerUrl] = useState(isNew ? '' : activeConnection?.broker_url || '');
    const [port, setPort] = useState(isNew ? 1883 : activeConnection?.port || 1883);
    const [clientId, setClientId] = useState(
        isNew
            ? `mqtt-topic-lab-${Math.random().toString(36).slice(2, 8)}`
            : activeConnection?.client_id || ''
    );
    const [username, setUsername] = useState(isNew ? '' : activeConnection?.username || '');
    const [password, setPassword] = useState(isNew ? '' : activeConnection?.password || '');
    const [useTls, setUseTls] = useState(isNew ? false : activeConnection?.use_tls || false);
    const [autoConnect, setAutoConnect] = useState(
        isNew ? true : (activeConnection?.auto_connect ?? true)
    );

    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!name.trim()) {
            setError('Connection name is required');
            return;
        }
        if (!brokerUrl.trim()) {
            setError('Broker URL is required');
            return;
        }
        if (!clientId.trim()) {
            setError('Client ID is required');
            return;
        }

        setError(null);
        setSaving(true);

        try {
            if (isNew) {
                const newConnection: Connection = {
                    id: crypto.randomUUID(),
                    name: name.trim(),
                    broker_url: brokerUrl.trim(),
                    port,
                    client_id: clientId.trim(),
                    username: username || undefined,
                    password: password || undefined,
                    use_tls: useTls,
                    auto_connect: autoConnect,
                    variables: {},
                    buttons: [],
                    subscriptions: [],
                };
                await addConnection(newConnection);
            } else if (activeConnection) {
                await disconnect();

                const updated: Connection = {
                    ...activeConnection,
                    name: name.trim(),
                    broker_url: brokerUrl.trim(),
                    port,
                    client_id: clientId.trim(),
                    username: username || undefined,
                    password: password || undefined,
                    use_tls: useTls,
                    auto_connect: autoConnect,
                };

                await updateConnection(updated);

                if (autoConnect) {
                    await connect();
                }
            }

            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to save connection');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="modal-overlay" onMouseDown={onClose}>
            <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>{isNew ? 'New Connection' : 'Edit Connection'}</h2>
                    <button className="btn-icon" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>
                <form onSubmit={handleSubmit}>
                    {error && <div className="error-message">{error}</div>}

                    <div className="form-group">
                        <label>Connection Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Production Server"
                        />
                    </div>

                    <div className="form-group">
                        <label>Broker URL</label>
                        <input
                            type="text"
                            value={brokerUrl}
                            onChange={(e) => setBrokerUrl(e.target.value)}
                            placeholder="mqtt.example.com"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                        />
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>Port</label>
                            <input
                                type="number"
                                value={port}
                                onChange={(e) => setPort(parseInt(e.target.value) || 1883)}
                            />
                        </div>
                        <div className="form-group">
                            <label>Client ID</label>
                            <input
                                type="text"
                                value={clientId}
                                onChange={(e) => setClientId(e.target.value)}
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck={false}
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Username (Optional)</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                        />
                    </div>

                    <div className="form-group">
                        <label>Password (Optional)</label>
                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                    </div>

                    <div className="form-row">
                        <div className="form-group checkbox-group">
                            <label>
                                <input
                                    type="checkbox"
                                    checked={useTls}
                                    onChange={(e) => setUseTls(e.target.checked)}
                                />
                                Use TLS/SSL
                            </label>
                        </div>
                        <div className="form-group checkbox-group">
                            <label>
                                <input
                                    type="checkbox"
                                    checked={autoConnect}
                                    onChange={(e) => setAutoConnect(e.target.checked)}
                                />
                                Auto-connect when selected
                            </label>
                        </div>
                    </div>

                    <div className="button-row">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn" disabled={saving}>
                            {saving ? 'Saving...' : isNew ? 'Create Connection' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
