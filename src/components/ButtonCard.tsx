import { useState } from 'react';
import { confirm } from '@tauri-apps/plugin-dialog';
import { Pencil, Trash2 } from 'lucide-react';
import type { Button } from '../types';
import { useApp } from '../contexts/AppContext';
import { substituteVariables } from '../utils/variables';

interface ButtonCardProps {
    button: Button;
    onEdit: () => void;
}

export function ButtonCard({ button, onEdit }: ButtonCardProps) {
    const { activeConnection, publishButton, deleteButton, connectionStatus } = useApp();
    const [publishing, setPublishing] = useState(false);
    const [lastResult, setLastResult] = useState<'success' | 'error' | null>(null);

    const variables = activeConnection?.variables || {};
    const resolvedTopic = substituteVariables(button.topic, variables);
    const resolvedPayload = button.payload ? substituteVariables(button.payload, variables) : '';

    const handlePublish = async () => {
        if (connectionStatus !== 'connected') return;

        setPublishing(true);
        setLastResult(null);

        try {
            await publishButton(button);
            setLastResult('success');
            setTimeout(() => setLastResult(null), 2000);
        } catch {
            setLastResult('error');
        } finally {
            setPublishing(false);
        }
    };

    const handleDelete = async () => {
        const confirmed = await confirm(`Delete button "${button.name}"?`, {
            title: 'Delete Button',
            kind: 'warning',
        });
        if (confirmed) {
            await deleteButton(button.id);
        }
    };

    const qosLabels: Record<string, string> = {
        atmostonce: 'QoS 0',
        atleastonce: 'QoS 1',
        exactlyonce: 'QoS 2',
    };

    return (
        <div className={`button-card ${lastResult || ''}`}>
            <div className="button-card-header">
                <h3>{button.name}</h3>
                <div className="button-card-actions">
                    <button className="btn-icon" onClick={onEdit} title="Edit">
                        <Pencil size={16} />
                    </button>
                    <button className="btn-icon" onClick={handleDelete} title="Delete">
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>

            <div className="button-card-details">
                <div className="detail-row">
                    <span className="detail-label">Topic:</span>
                    <code className="detail-value">{resolvedTopic}</code>
                </div>
                {resolvedPayload && (
                    <div className="detail-row">
                        <span className="detail-label">Payload:</span>
                        <code className="detail-value">{resolvedPayload}</code>
                    </div>
                )}
                <div className="detail-row">
                    <span className="badge">{qosLabels[button.qos]}</span>
                    {button.retain && <span className="badge">Retain</span>}
                </div>
            </div>

            <button
                className={`btn btn-publish btn-color-${button.color || 'orange'}`}
                onClick={handlePublish}
                disabled={publishing || connectionStatus !== 'connected'}
            >
                {publishing ? 'Sending...' : 'Send'}
            </button>
        </div>
    );
}
