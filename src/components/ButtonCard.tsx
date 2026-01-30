import { useState, useRef, useEffect, useCallback } from 'react';
import { confirm } from '@tauri-apps/plugin-dialog';
import { GripVertical, Pencil, Trash2, Repeat } from 'lucide-react';
import type { Button } from '../types';
import { useApp } from '../contexts/AppContext';
import { substituteVariables } from '../utils/variables';

function formatInterval(ms: number): string {
    const parts: string[] = [];
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const millis = ms % 1000;

    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}min`);
    if (seconds) parts.push(`${seconds}s`);
    if (millis) parts.push(`${millis}ms`);

    return parts.join(' ') || '0ms';
}

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
    const [isMultiSending, setIsMultiSending] = useState(false);
    const [sendCount, setSendCount] = useState(0);
    const cardRef = useRef<HTMLDivElement>(null);
    const intervalRef = useRef<number | null>(null);
    const timeoutRef = useRef<number | null>(null);

    const variables = activeConnection?.variables || {};
    const resolvedTopic = substituteVariables(button.topic, variables);
    const resolvedPayload = button.payload ? substituteVariables(button.payload, variables) : '';

    const stopMultiSend = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        setIsMultiSending(false);
        setSendCount(0);
    }, []);

    useEffect(() => {
        if (connectionStatus !== 'connected' && isMultiSending) {
            stopMultiSend();
        }
    }, [connectionStatus, isMultiSending, stopMultiSend]);

    useEffect(() => {
        if (!button.multiSendEnabled && isMultiSending) {
            stopMultiSend();
        }
    }, [button.multiSendEnabled, isMultiSending, stopMultiSend]);

    useEffect(() => {
        if (!isMultiSending || !intervalRef.current) return;

        clearInterval(intervalRef.current);
        const newInterval = Math.max(100, button.multiSendInterval || 1000);
        const publishOnce = async () => {
            try {
                await publishButton(button);
                setSendCount((c) => c + 1);
            } catch {
                stopMultiSend();
                setLastResult('error');
            }
        };
        intervalRef.current = window.setInterval(publishOnce, newInterval);
    }, [isMultiSending, button, publishButton, stopMultiSend]);

    useEffect(() => {
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    const singlePublish = async () => {
        setPublishing(true);
        setLastResult(null);
        try {
            await publishButton(button);
            setLastResult('success');
            timeoutRef.current = window.setTimeout(() => setLastResult(null), 2000);
        } catch {
            setLastResult('error');
        } finally {
            setPublishing(false);
        }
    };

    const startMultiSend = async () => {
        const publishOnce = async (): Promise<boolean> => {
            try {
                await publishButton(button);
                setSendCount((c) => c + 1);
                return true;
            } catch {
                stopMultiSend();
                setLastResult('error');
                return false;
            }
        };

        setIsMultiSending(true);
        setSendCount(0);

        if (!(await publishOnce())) return;

        const interval = Math.max(100, button.multiSendInterval || 1000);
        intervalRef.current = window.setInterval(publishOnce, interval);
    };

    const handlePublish = async () => {
        if (connectionStatus !== 'connected') return;

        if (button.multiSendEnabled) {
            isMultiSending ? stopMultiSend() : await startMultiSend();
        } else {
            await singlePublish();
        }
    };

    const handleDelete = async () => {
        const confirmed = await confirm('This action cannot be undone.', {
            title: `Delete "${button.name}"?`,
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
            className={`button-card ${lastResult || ''} ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''} ${isMultiSending ? 'multi-send-active' : ''}`}
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
                    {button.qos !== 'atmostonce' && <span className="badge">{qosLabels[button.qos]}</span>}
                    {button.retain && <span className="badge">Retain</span>}
                    {button.multiSendEnabled && <span className="badge"><Repeat size={12} /> {formatInterval(button.multiSendInterval || 1000)}</span>}
                </div>
            </div>

            <button
                className={`btn btn-publish btn-color-${button.color || 'orange'} ${isMultiSending ? 'multi-send-active' : ''}`}
                onClick={handlePublish}
                disabled={publishing || connectionStatus !== 'connected'}
            >
                {isMultiSending ? `Stop (${sendCount})` : publishing ? 'Sending...' : button.multiSendEnabled ? 'Start' : 'Send'}
            </button>
        </div>
    );
}
