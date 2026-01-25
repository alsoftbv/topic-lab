import { useState } from 'react';
import type { Connection } from '../types';
import { useApp } from '../contexts/AppContext';
import { importConnection } from '../utils/api';

export function SetupWizard() {
    const { addConnection } = useApp();
    const [step, setStep] = useState(1);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const [name, setName] = useState('My Connection');
    const [brokerUrl, setBrokerUrl] = useState('');
    const [port, setPort] = useState(1883);
    const [clientId, setClientId] = useState(
        `mqtt-topic-lab-${Math.random().toString(36).slice(2, 8)}`
    );
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [useTls, setUseTls] = useState(false);
    const [autoConnect, setAutoConnect] = useState(true);

    const handleImport = async () => {
        setError(null);
        setSaving(true);
        try {
            const imported = await importConnection();
            if (!imported) {
                setSaving(false);
                return;
            }

            const connection: Connection = {
                ...imported,
                id: crypto.randomUUID(),
            };

            await addConnection(connection);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to import connection');
            setSaving(false);
        }
    };

    const handleNextStep = () => {
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
        setStep(2);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSaving(true);

        try {
            const connection: Connection = {
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

            await addConnection(connection);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to save connection');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="setup-wizard">
            <div className="setup-card">
                <h1>MQTT Topic Lab</h1>
                <p className="subtitle">Set up your first MQTT connection to get started</p>

                {error && <div className="error-message">{error}</div>}

                <form onSubmit={handleSubmit}>
                    {step === 1 && (
                        <div className="form-step">
                            <h2>Connection Details</h2>

                            <div className="form-group">
                                <label htmlFor="name">Connection Name</label>
                                <input
                                    id="name"
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Production Server"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="brokerUrl">Broker URL</label>
                                <input
                                    id="brokerUrl"
                                    type="text"
                                    placeholder="mqtt.example.com"
                                    value={brokerUrl}
                                    onChange={(e) => setBrokerUrl(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label htmlFor="port">Port</label>
                                    <input
                                        id="port"
                                        type="number"
                                        value={port}
                                        onChange={(e) => setPort(parseInt(e.target.value) || 1883)}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="clientId">Client ID</label>
                                    <input
                                        id="clientId"
                                        type="text"
                                        value={clientId}
                                        onChange={(e) => setClientId(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>

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

                            <button type="button" className="btn" onClick={handleNextStep}>
                                Next: Authentication
                            </button>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="form-step">
                            <h2>Authentication (Optional)</h2>

                            <div className="form-group">
                                <label htmlFor="username">Username</label>
                                <input
                                    id="username"
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="password">Password</label>
                                <input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
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

                            <div className="button-row">
                                <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>
                                    Back
                                </button>
                                <button type="submit" className="btn" disabled={saving}>
                                    {saving ? 'Saving...' : 'Create Connection'}
                                </button>
                            </div>
                        </div>
                    )}
                </form>

                <div className="divider">
                    <span>or import existing</span>
                </div>

                <button
                    type="button"
                    className="btn btn-secondary import-btn"
                    onClick={handleImport}
                    disabled={saving}
                >
                    Import Connection
                </button>
            </div>
        </div>
    );
}
