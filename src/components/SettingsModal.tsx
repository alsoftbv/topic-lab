import { X } from 'lucide-react';
import { confirm } from '@tauri-apps/plugin-dialog';
import * as api from '../utils/api';
import type { Connection } from '../types';

interface SettingsModalProps {
    connection: Connection;
    onClose: () => void;
    onEditConnection: () => void;
    onDeleteConnection: () => Promise<void>;
}

export function SettingsModal({ connection, onClose, onEditConnection, onDeleteConnection }: SettingsModalProps) {
    const handleDelete = async () => {
        const confirmed = await confirm(
            `Delete connection "${connection.name}"? This will also delete all buttons and variables for this connection.`,
            { title: 'Delete Connection', kind: 'warning' }
        );
        if (confirmed) {
            onClose();
            await onDeleteConnection();
        }
    };

    const handleExport = async () => {
        await api.exportConnection(connection);
    };

    return (
        <div className="modal-overlay" onMouseDown={onClose}>
            <div className="modal modal-small" onMouseDown={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Connection Settings</h2>
                    <button className="btn-icon" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>
                <div className="settings-content">
                    <div className="setting-item">
                        <div>
                            <strong>Broker</strong>
                            <p>{connection.broker_url}:{connection.port}</p>
                        </div>
                    </div>
                    <div className="setting-item">
                        <div>
                            <strong>Client ID</strong>
                            <p>{connection.client_id}</p>
                        </div>
                    </div>
                    <div className="setting-item">
                        <div>
                            <strong>TLS</strong>
                            <p>{connection.use_tls ? 'Enabled' : 'Disabled'}</p>
                        </div>
                    </div>
                    <div
                        className="button-row"
                        style={{ marginTop: '1rem', justifyContent: 'flex-start' }}
                    >
                        <button type="button" className="btn" onClick={onEditConnection}>
                            Edit Connection
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={handleExport}>
                            Export Connection
                        </button>
                    </div>
                    <hr />
                    <button type="button" className="btn btn-danger" onClick={handleDelete}>
                        Delete Connection
                    </button>
                    <p className="hint">This will delete this connection, including its variables and its buttons</p>
                </div>
            </div>
        </div>
    );
}
