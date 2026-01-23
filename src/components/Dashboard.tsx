import { useState } from 'react';
import { confirm } from '@tauri-apps/plugin-dialog';
import { Settings, Plus, X } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { ConnectionSwitcher } from './ConnectionSwitcher';
import { ConnectionStatus } from './ConnectionStatus';
import { MessageViewer } from './MessageViewer';
import { ButtonCard } from './ButtonCard';
import { ButtonEditor } from './ButtonEditor';
import { VariablesPanel } from './VariablesPanel';
import { ConnectionEditor } from './ConnectionEditor';
import type { Button } from '../types';

export function Dashboard() {
    const { activeConnection, error, deleteConnection, resetAll } = useApp();
    const [showEditor, setShowEditor] = useState(false);
    const [editingButton, setEditingButton] = useState<Button | undefined>();
    const [showVariables, setShowVariables] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showConnectionEditor, setShowConnectionEditor] = useState(false);
    const [isAddingConnection, setIsAddingConnection] = useState(false);

    if (!activeConnection) return null;

    const handleNewButton = () => {
        setEditingButton(undefined);
        setShowEditor(true);
    };

    const handleEditButton = (button: Button) => {
        setEditingButton(button);
        setShowEditor(true);
    };

    const handleCloseEditor = () => {
        setShowEditor(false);
        setEditingButton(undefined);
    };

    const handleEditConnection = () => {
        setShowSettings(false);
        setIsAddingConnection(false);
        setShowConnectionEditor(true);
    };

    const handleAddConnection = () => {
        setIsAddingConnection(true);
        setShowConnectionEditor(true);
    };

    const handleDeleteConnection = async () => {
        const confirmed = await confirm(
            `Delete connection "${activeConnection.name}"? This will also delete all buttons and variables for this connection.`,
            { title: 'Delete Connection', kind: 'warning' }
        );
        if (confirmed) {
            setShowSettings(false);
            await deleteConnection(activeConnection.id);
        }
    };

    const handleResetAll = async () => {
        const confirmed = await confirm(
            'This will delete ALL connections, buttons, and settings. This action cannot be undone.',
            { title: 'Reset Everything', kind: 'warning' }
        );
        if (confirmed) {
            setShowSettings(false);
            resetAll();
        }
    };

    return (
        <div className="dashboard">
            <header className="dashboard-header">
                <div className="header-left">
                    <ConnectionSwitcher onAddNew={handleAddConnection} />
                    <ConnectionStatus />
                </div>
                <div className="header-right">
                    <button
                        className={`btn btn-small ${showVariables ? 'btn-active' : 'btn-secondary'}`}
                        onClick={() => setShowVariables(!showVariables)}
                    >
                        Variables ({Object.keys(activeConnection.variables).length})
                    </button>
                    <button
                        className="btn btn-small btn-secondary btn-icon-only"
                        onClick={() => setShowSettings(!showSettings)}
                        title="Settings"
                    >
                        <Settings size={16} />
                    </button>
                </div>
            </header>

            {error && <div className="error-banner">{error}</div>}

            <div className="dashboard-content">
                <main className="buttons-area">
                    <MessageViewer />
                    <div className="buttons-header">
                        <h2>Commands</h2>
                        <button className="btn" onClick={handleNewButton}>
                            <Plus size={16} />
                            New Button
                        </button>
                    </div>

                    {activeConnection.buttons.length === 0 ? (
                        <div className="empty-state">
                            <p>No buttons yet</p>
                            <p className="hint">Create a button to send MQTT commands</p>
                        </div>
                    ) : (
                        <div className="buttons-grid">
                            {activeConnection.buttons.map((button) => (
                                <ButtonCard
                                    key={button.id}
                                    button={button}
                                    onEdit={() => handleEditButton(button)}
                                />
                            ))}
                        </div>
                    )}
                </main>

                {showVariables && (
                    <aside className="sidebar">
                        <VariablesPanel />
                    </aside>
                )}
            </div>

            {showEditor && <ButtonEditor button={editingButton} onClose={handleCloseEditor} />}

            {showSettings && (
                <div className="modal-overlay" onMouseDown={() => setShowSettings(false)}>
                    <div className="modal modal-small" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Connection Settings</h2>
                            <button className="btn-icon" onClick={() => setShowSettings(false)}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="settings-content">
                            <div className="setting-item">
                                <div>
                                    <strong>Broker</strong>
                                    <p>
                                        {activeConnection.broker_url}:{activeConnection.port}
                                    </p>
                                </div>
                            </div>
                            <div className="setting-item">
                                <div>
                                    <strong>Client ID</strong>
                                    <p>{activeConnection.client_id}</p>
                                </div>
                            </div>
                            <div className="setting-item">
                                <div>
                                    <strong>TLS</strong>
                                    <p>{activeConnection.use_tls ? 'Enabled' : 'Disabled'}</p>
                                </div>
                            </div>
                            <div
                                className="button-row"
                                style={{ marginTop: '1rem', justifyContent: 'flex-start' }}
                            >
                                <button type="button" className="btn" onClick={handleEditConnection}>
                                    Edit Connection
                                </button>
                            </div>
                            <hr />
                            <button type="button" className="btn btn-secondary" onClick={handleDeleteConnection}>
                                Delete Connection
                            </button>
                            <p className="hint">This will delete this connection and its buttons</p>
                            <hr />
                            <button type="button" className="btn btn-danger" onClick={handleResetAll}>
                                Reset Everything
                            </button>
                            <p className="hint">Delete all connections and start fresh</p>
                        </div>
                    </div>
                </div>
            )}

            {showConnectionEditor && (
                <ConnectionEditor
                    isNew={isAddingConnection}
                    onClose={() => {
                        setShowConnectionEditor(false);
                        setIsAddingConnection(false);
                    }}
                />
            )}
        </div>
    );
}
