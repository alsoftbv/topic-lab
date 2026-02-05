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

type IntervalUnit = 'ms' | 's' | 'min' | 'hour';

const UNIT_TO_MS: Record<IntervalUnit, number> = {
    ms: 1,
    s: 1000,
    min: 60000,
    hour: 3600000,
};

function msToUnit(ms: number): { value: number; unit: IntervalUnit } {
    if (ms >= 3600000 && ms % 3600000 === 0) return { value: ms / 3600000, unit: 'hour' };
    if (ms >= 60000 && ms % 60000 === 0) return { value: ms / 60000, unit: 'min' };
    if (ms >= 1000 && ms % 1000 === 0) return { value: ms / 1000, unit: 's' };
    return { value: ms, unit: 'ms' };
}

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
    const [multiSendEnabled, setMultiSendEnabled] = useState(button?.multiSendEnabled || false);
    const initialInterval = msToUnit(button?.multiSendInterval || 1000);
    const [intervalValue, setIntervalValue] = useState(initialInterval.value);
    const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>(initialInterval.unit);
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
                multiSendEnabled: multiSendEnabled || undefined,
                multiSendInterval: multiSendEnabled ? intervalValue * UNIT_TO_MS[intervalUnit] : undefined,
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
                            autoFocus
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
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                        />
                        {topic && (
                            <div className="preview">
                                Preview: <code>{previewTopic}</code>
                            </div>
                        )}
                    </div>

                    <div className="form-group">
                        <label htmlFor="payload">Payload</label>
                        <textarea
                            id="payload"
                            value={payload}
                            onChange={(e) => setPayload(e.target.value)}
                            placeholder='{"action": "ON"}'
                            rows={5}
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
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

                    <div className="form-group-inline">
                        <label>QoS Level</label>
                        <select
                            value={qos}
                            onChange={(e) => setQos(e.target.value as QoS)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') e.preventDefault();
                            }}
                        >
                            <option value="atmostonce">0 - At Most Once</option>
                            <option value="atleastonce">1 - At Least Once</option>
                            <option value="exactlyonce">2 - Exactly Once</option>
                        </select>
                    </div>

                    <div className="form-group-inline">
                        <div className="label-with-checkbox">
                            <input
                                type="checkbox"
                                checked={retain}
                                onChange={(e) => setRetain(e.target.checked)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        setRetain(!retain);
                                    }
                                }}
                            />
                            <label>Retain Message</label>
                        </div>
                    </div>

                    <div className="form-group-inline">
                        <div className="label-with-checkbox">
                            <input
                                type="checkbox"
                                checked={multiSendEnabled}
                                onChange={(e) => setMultiSendEnabled(e.target.checked)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        setMultiSendEnabled(!multiSendEnabled);
                                    }
                                }}
                            />
                            <label>Multi-send</label>
                        </div>
                        <div className="input-with-suffix">
                            <input
                                type="number"
                                value={intervalValue}
                                onChange={(e) => setIntervalValue(Math.max(1, parseInt(e.target.value) || 1))}
                                min={1}
                                disabled={!multiSendEnabled}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') e.preventDefault();
                                }}
                            />
                            <select
                                value={intervalUnit}
                                onChange={(e) => setIntervalUnit(e.target.value as IntervalUnit)}
                                disabled={!multiSendEnabled}
                                className="unit-select"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') e.preventDefault();
                                }}
                            >
                                <option value="ms">ms</option>
                                <option value="s">s</option>
                                <option value="min">min</option>
                                <option value="hour">hour</option>
                            </select>
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
