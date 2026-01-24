import { useState, useRef } from 'react';
import { confirm } from '@tauri-apps/plugin-dialog';
import { GripVertical, Pencil, Trash2 } from 'lucide-react';
import type { Button } from '../types';
import { useApp } from '../contexts/AppContext';
import { substituteVariables } from '../utils/variables';

interface ButtonCardProps {
    button: Button;
    index: number;
    onEdit: () => void;
    onDragStart: (index: number, x: number, y: number, element: HTMLElement) => void;
    onDragEnter: (index: number) => void;
    isDragging: boolean;
    isDragOver: boolean;
}

export function ButtonCard({ button, index, onEdit, onDragStart, onDragEnter, isDragging, isDragOver }: ButtonCardProps) {
    const { activeConnection, publishButton, deleteButton, connectionStatus } = useApp();
    const [publishing, setPublishing] = useState(false);
    const [lastResult, setLastResult] = useState<'success' | 'error' | null>(null);
    const cardRef = useRef<HTMLDivElement>(null);

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

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        if (cardRef.current) {
            onDragStart(index, e.clientX, e.clientY, cardRef.current);
        }
    };

    const handleMouseEnter = () => {
        onDragEnter(index);
    };

    return (
        <div
            ref={cardRef}
            className={`button-card ${lastResult || ''} ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
            onMouseEnter={handleMouseEnter}
        >
            <div className="button-card-header">
                <div
                    className="drag-handle"
                    title="Drag to reorder"
                    onMouseDown={handleMouseDown}
                >
                    <GripVertical size={16} />
                </div>
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
