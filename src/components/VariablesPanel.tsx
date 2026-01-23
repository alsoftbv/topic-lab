import { useState } from 'react';
import { Pencil, Trash2, Check, X } from 'lucide-react';
import { useApp } from '../contexts/AppContext';

export function VariablesPanel() {
    const { activeConnection, updateVariables } = useApp();
    const [newKey, setNewKey] = useState('');
    const [newValue, setNewValue] = useState('');
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');

    const variables = activeConnection?.variables || {};

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newKey.trim()) return;

        await updateVariables({
            ...variables,
            [newKey.trim()]: newValue,
        });

        setNewKey('');
        setNewValue('');
    };

    const handleUpdate = async (key: string) => {
        await updateVariables({
            ...variables,
            [key]: editValue,
        });
        setEditingKey(null);
    };

    const handleDelete = async (key: string) => {
        const updated = { ...variables };
        delete updated[key];
        await updateVariables(updated);
    };

    const startEditing = (key: string) => {
        setEditingKey(key);
        setEditValue(variables[key]);
    };

    return (
        <div className="variables-panel">
            <h3>Variables</h3>
            <p className="hint">
                Define variables to use in topics and payloads with {'{variable_name}'}
            </p>

            <div className="variables-list">
                {Object.entries(variables).map(([key, value]) => (
                    <div key={key} className="variable-row">
                        <code className="variable-key">{key}</code>
                        {editingKey === key ? (
                            <>
                                <input
                                    type="text"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleUpdate(key);
                                        if (e.key === 'Escape') setEditingKey(null);
                                    }}
                                    autoFocus
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                />
                                <button className="btn-icon" onClick={() => handleUpdate(key)} title="Save">
                                    <Check size={16} />
                                </button>
                                <button className="btn-icon" onClick={() => setEditingKey(null)} title="Cancel">
                                    <X size={16} />
                                </button>
                            </>
                        ) : (
                            <>
                                <span className="variable-value">{value}</span>
                                <button className="btn-icon" onClick={() => startEditing(key)} title="Edit">
                                    <Pencil size={16} />
                                </button>
                                <button className="btn-icon" onClick={() => handleDelete(key)} title="Delete">
                                    <Trash2 size={16} />
                                </button>
                            </>
                        )}
                    </div>
                ))}

                {Object.keys(variables).length === 0 && (
                    <p className="empty-state">No variables defined yet</p>
                )}
            </div>

            <form className="add-variable-form" onSubmit={handleAdd}>
                <input
                    type="text"
                    placeholder="name"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    pattern="[a-zA-Z_][a-zA-Z0-9_]*"
                    title="Start with letter or underscore, followed by letters, numbers, or underscores"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                />
                <input
                    type="text"
                    placeholder="Value"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                />
                <button type="submit" className="btn btn-small">
                    Add
                </button>
            </form>
        </div>
    );
}
