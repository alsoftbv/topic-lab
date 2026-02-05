import { useState, useEffect, useRef, useCallback } from 'react';
import { confirm } from '@tauri-apps/plugin-dialog';
import { Settings, Plus, X } from 'lucide-react';
import * as api from '../utils/api';
import { useApp } from '../contexts/AppContext';
import { useDashboardKeyboard } from '../hooks/useDashboardKeyboard';
import { ConnectionSwitcher } from './ConnectionSwitcher';
import { ConnectionStatus } from './ConnectionStatus';
import { MessageViewer } from './MessageViewer';
import { ButtonCard } from './ButtonCard';
import { ButtonEditor } from './ButtonEditor';
import { VariablesPanel } from './VariablesPanel';
import { ConnectionEditor } from './ConnectionEditor';
import type { Button } from '../types';

export function Dashboard() {
    const { activeConnection, error, deleteConnection, deleteButton, reorderButtons, importConnection } = useApp();
    const [showEditor, setShowEditor] = useState(false);
    const [editingButton, setEditingButton] = useState<Button | undefined>();
    const [showVariables, setShowVariables] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showConnectionEditor, setShowConnectionEditor] = useState(false);
    const [isAddingConnection, setIsAddingConnection] = useState(false);
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const [messageViewerExpanded, setMessageViewerExpanded] = useState(false);
    const dragOverIndexRef = useRef<number | null>(null);
    const dragIndexRef = useRef<number | null>(null);
    const ghostRef = useRef<HTMLElement | null>(null);
    const gridRef = useRef<HTMLDivElement | null>(null);

    const { selectedIndex, setSelectedIndex, keyboardSentId, animatingId, setAnimatingId } = useDashboardKeyboard({
        activeConnection,
        modalsOpen: showEditor || showSettings || showConnectionEditor,
        gridRef,
        reorderButtons,
        onEdit: (button) => {
            setEditingButton(button);
            setShowEditor(true);
        },
        onDelete: async (button) => {
            const confirmed = await confirm('This action cannot be undone.', {
                title: `Delete "${button.name}"?`,
                kind: 'warning',
            });
            if (confirmed) {
                await deleteButton(button.id);
            }
        },
        onNewButton: () => {
            setEditingButton(undefined);
            setShowEditor(true);
        },
        onToggleMessageViewer: () => setMessageViewerExpanded(prev => !prev),
    });

    useEffect(() => {
        if (dragIndex === null) return;

        const handleGlobalMouseMove = (e: MouseEvent) => {
            if (ghostRef.current) {
                ghostRef.current.style.left = `${e.clientX + 5}px`;
                ghostRef.current.style.top = `${e.clientY + 5}px`;
            }
        };

        const handleGlobalMouseUp = () => {
            const fromIndex = dragIndexRef.current;
            const toIndex = dragOverIndexRef.current;

            if (fromIndex !== null && toIndex !== null && fromIndex !== toIndex && activeConnection) {
                const buttons = [...activeConnection.buttons];
                const [dragged] = buttons.splice(fromIndex, 1);
                buttons.splice(toIndex, 0, dragged);
                reorderButtons(buttons);
            }

            if (ghostRef.current) {
                ghostRef.current.remove();
                ghostRef.current = null;
            }

            setDragIndex(null);
            setDragOverIndex(null);
            dragOverIndexRef.current = null;
            dragIndexRef.current = null;
        };

        window.addEventListener('mousemove', handleGlobalMouseMove);
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [dragIndex, activeConnection, reorderButtons]);

    if (!activeConnection) return null;

    const handleDragStart = useCallback((index: number, x: number, y: number, element: HTMLElement) => {
        setDragIndex(index);
        setDragOverIndex(index);
        dragIndexRef.current = index;
        dragOverIndexRef.current = index;

        const clone = element.cloneNode(true) as HTMLElement;
        clone.classList.add('drag-ghost');
        clone.classList.remove('dragging');
        clone.style.position = 'fixed';
        clone.style.left = `${x + 5}px`;
        clone.style.top = `${y + 5}px`;
        clone.style.width = `${element.offsetWidth}px`;
        clone.style.pointerEvents = 'none';
        clone.style.zIndex = '1000';
        clone.style.opacity = '0.85';
        clone.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.3)';
        document.body.appendChild(clone);
        ghostRef.current = clone;
    }, []);

    const handleDragEnter = useCallback((index: number) => {
        if (dragIndexRef.current === null) return;
        setDragOverIndex(index);
        dragOverIndexRef.current = index;
    }, []);

    const handleNewButton = () => {
        setEditingButton(undefined);
        setShowEditor(true);
    };

    const handleEditButton = useCallback((buttonId: string) => {
        const button = activeConnection?.buttons.find(b => b.id === buttonId);
        if (button) {
            setEditingButton(button);
            setShowEditor(true);
        }
    }, [activeConnection?.buttons]);

    const handleDuplicateButton = useCallback((buttonId: string, index: number) => {
        const button = activeConnection?.buttons.find(b => b.id === buttonId);
        if (!button || !activeConnection) return;
        const newId = crypto.randomUUID();
        const duplicate: Button = {
            ...button,
            id: newId,
        };
        const buttons = [...activeConnection.buttons];
        buttons.splice(index + 1, 0, duplicate);
        reorderButtons(buttons);
        setAnimatingId(newId);
        setTimeout(() => setAnimatingId(null), 300);
    }, [activeConnection, reorderButtons]);

    const handleSelectButton = useCallback((index: number) => {
        setSelectedIndex(prev => prev === index ? null : index);
    }, []);

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

    const handleExport = async () => {
        await api.exportConnection(activeConnection);
    };

    const handleImport = async () => {
        const connectionData = await api.importConnection();
        if (connectionData) {
            await importConnection(connectionData);
        }
    };

    return (
        <div className="dashboard">
            <header className="dashboard-header">
                <div className="header-left">
                    <ConnectionSwitcher onAddNew={handleAddConnection} onImport={handleImport} />
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

            <div className="dashboard-content" onClick={() => setSelectedIndex(null)}>
                <main className="buttons-area">
                    <MessageViewer expanded={messageViewerExpanded} onToggle={setMessageViewerExpanded} />
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
                        <div className="buttons-grid" ref={gridRef}>
                            {activeConnection.buttons.map((button, index) => (
                                <ButtonCard
                                    key={button.id}
                                    button={button}
                                    index={index}
                                    onEdit={handleEditButton}
                                    onDuplicate={handleDuplicateButton}
                                    onSelect={handleSelectButton}
                                    onDragStart={handleDragStart}
                                    onDragEnter={handleDragEnter}
                                    isDragging={dragIndex === index}
                                    isDragOver={dragOverIndex === index}
                                    isSelected={selectedIndex === index}
                                    isAnimating={animatingId === button.id}
                                    keyboardSent={keyboardSentId === button.id}
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
                                <button type="button" className="btn btn-secondary" onClick={handleExport}>
                                    Export Connection
                                </button>
                            </div>
                            <hr />
                            <button type="button" className="btn btn-danger" onClick={handleDeleteConnection}>
                                Delete Connection
                            </button>
                            <p className="hint">This will delete this connection, including its variables and its buttons</p>
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
