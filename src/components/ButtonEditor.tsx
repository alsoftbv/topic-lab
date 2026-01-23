import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { Button, QoS, ButtonColor } from '../types';
import { useApp } from '../contexts/AppContext';
import { substituteVariables, extractVariableNames } from '../utils/variables';

const COLOR_OPTIONS: { value: ButtonColor; label: string }[] = [
    { value: 'orange', label: 'Orange' },
    { value: 'green', label: 'Green' },
    { value: 'blue', label: 'Blue' },
    { value: 'purple', label: 'Purple' },
    { value: 'red', label: 'Red' },
    { value: 'teal', label: 'Teal' },
];

interface ButtonEditorProps {
    button?: Button;
    onClose: () => void;
}

export function ButtonEditor({ button, onClose }: ButtonEditorProps) {
    const { activeConnection, addButton, updateButton } = useApp();
    const isEditing = !!button;

    const [name, setName] = useState(button?.name || '');
    const [topic, setTopic] = useState(button?.topic || '');
    const [payload, setPayload] = useState(button?.payload || '');
    const [qos, setQos] = useState<QoS>(button?.qos || 'atmostonce');
    const [retain, setRetain] = useState(button?.retain || false);
    const [color, setColor] = useState<ButtonColor>(button?.color || 'orange');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const variables = activeConnection?.variables || {};
    const usedVariables = [
        ...new Set([...extractVariableNames(topic), ...extractVariableNames(payload)]),
    ];
    const missingVariables = usedVariables.filter((v) => !(v in variables));

    const previewTopic = substituteVariables(topic, variables);
    const previewPayload = substituteVariables(payload, variables);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSaving(true);

        try {
            const buttonData: Button = {
                id: button?.id || crypto.randomUUID(),
                name,
                topic,
                payload: payload || undefined,
                qos,
                retain,
                color,
            };

            if (isEditing) {
                await updateButton(buttonData);
            } else {
                await addButton(buttonData);
            }

            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to save button');
        } finally {
            setSaving(false);
        }
    };

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    return (
        <div className="modal-overlay" onMouseDown={onClose}>
            <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>{isEditing ? 'Edit Button' : 'New Button'}</h2>
                    <button className="btn-icon" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                {error && <div className="error-message">{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="buttonName">Button Name</label>
                        <input
                            id="buttonName"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Turn On Light"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="topic">
                            Topic
                            <span className="hint">Use {'{variable}'} for dynamic values</span>
                        </label>
                        <input
                            id="topic"
                            type="text"
                            value={topic}
                            onChange={(e) => setTopic(e.target.value)}
                            placeholder="devices/{device_id}/TOL"
                            required
                        />
                        {topic && (
                            <div className="preview">
                                Preview: <code>{previewTopic}</code>
                            </div>
                        )}
                    </div>

                    <div className="form-group">
                        <label htmlFor="payload">Payload (Optional)</label>
                        <textarea
                            id="payload"
                            value={payload}
                            onChange={(e) => setPayload(e.target.value)}
                            placeholder='{"action": "ON"}'
                            rows={3}
                        />
                        {payload && (
                            <div className="preview">
                                Preview: <code>{previewPayload}</code>
                            </div>
                        )}
                    </div>

                    {missingVariables.length > 0 && (
                        <div className="warning-message">
                            Missing variables: {missingVariables.join(', ')}
                            <br />
                            <small>Add them in the Variables panel</small>
                        </div>
                    )}

                    <div className="form-row">
                        <div className="form-group">
                            <label htmlFor="qos">QoS Level</label>
                            <select id="qos" value={qos} onChange={(e) => setQos(e.target.value as QoS)}>
                                <option value="atmostonce">0 - At Most Once</option>
                                <option value="atleastonce">1 - At Least Once</option>
                                <option value="exactlyonce">2 - Exactly Once</option>
                            </select>
                        </div>

                        <div className="form-group checkbox-group">
                            <label>
                                <input
                                    type="checkbox"
                                    checked={retain}
                                    onChange={(e) => setRetain(e.target.checked)}
                                />
                                Retain Message
                            </label>
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Button Color</label>
                        <div className="color-picker">
                            {COLOR_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    className={`color-swatch color-${opt.value} ${color === opt.value ? 'selected' : ''}`}
                                    onClick={() => setColor(opt.value)}
                                    title={opt.label}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="button-row">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn" disabled={saving}>
                            {saving ? 'Saving...' : isEditing ? 'Update' : 'Create'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
