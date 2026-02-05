import { useState, useEffect, useRef, type RefObject } from 'react';
import type { Button, Connection } from '../types';

interface UseDashboardKeyboardOptions {
    activeConnection: Connection | null;
    modalsOpen: boolean;
    gridRef: RefObject<HTMLDivElement | null>;
    reorderButtons: (buttons: Button[]) => void;
    onEdit: (button: Button) => void;
    onDelete: (button: Button) => void;
    onNewButton: () => void;
    onToggleMessageViewer: () => void;
}

function getGridColumns(gridElement: HTMLDivElement | null): number {
    if (!gridElement) return 1;
    const style = getComputedStyle(gridElement);
    const columns = style.gridTemplateColumns.split(' ').filter(s => s.length > 0);
    return columns.length || 1;
}

export function useDashboardKeyboard({
    activeConnection,
    modalsOpen,
    gridRef,
    reorderButtons,
    onEdit,
    onDelete,
    onNewButton,
    onToggleMessageViewer,
}: UseDashboardKeyboardOptions) {
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [copiedButton, setCopiedButton] = useState<Button | null>(null);
    const [keyboardSentId, setKeyboardSentId] = useState<string | null>(null);
    const [animatingId, setAnimatingId] = useState<string | null>(null);

    const refs = useRef({ gridRef, activeConnection, reorderButtons, onEdit, onDelete, onNewButton, onToggleMessageViewer });
    refs.current = { gridRef, activeConnection, reorderButtons, onEdit, onDelete, onNewButton, onToggleMessageViewer };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (modalsOpen) return;
            const { activeConnection, reorderButtons, onEdit, onDelete, onNewButton, onToggleMessageViewer, gridRef } = refs.current;

            if (e.key === 'Escape') {
                setSelectedIndex(null);
                return;
            }

            if ((e.key === 'Enter' || e.key === ' ') && selectedIndex !== null && activeConnection) {
                e.preventDefault();
                const btn = activeConnection.buttons[selectedIndex];
                setKeyboardSentId(btn.id);
                setTimeout(() => setKeyboardSentId(null), 200);
                return;
            }

            if ((e.key === 'Backspace' || e.key === 'Delete') && selectedIndex !== null && activeConnection) {
                e.preventDefault();
                onDelete(activeConnection.buttons[selectedIndex]);
                return;
            }

            const total = activeConnection?.buttons.length ?? 0;
            if (total === 0) return;

            const columns = getGridColumns(gridRef.current);

            if (e.key === 'ArrowRight') {
                e.preventDefault();
                if (selectedIndex === null) {
                    setSelectedIndex(0);
                } else {
                    const col = selectedIndex % columns;
                    const rowStart = selectedIndex - col;
                    const rowEnd = Math.min(rowStart + columns - 1, total - 1);
                    const isLastInRow = selectedIndex === rowEnd;
                    setSelectedIndex(isLastInRow ? rowStart : selectedIndex + 1);
                }
                return;
            }

            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                if (selectedIndex === null) {
                    setSelectedIndex(0);
                } else {
                    const col = selectedIndex % columns;
                    const rowStart = selectedIndex - col;
                    const rowEnd = Math.min(rowStart + columns - 1, total - 1);
                    setSelectedIndex(col === 0 ? rowEnd : selectedIndex - 1);
                }
                return;
            }

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (selectedIndex === null) {
                    setSelectedIndex(0);
                } else {
                    const next = selectedIndex + columns;
                    setSelectedIndex(next >= total ? selectedIndex % columns : next);
                }
                return;
            }

            if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (selectedIndex === null) {
                    setSelectedIndex(0);
                } else {
                    const prev = selectedIndex - columns;
                    if (prev < 0) {
                        const col = selectedIndex % columns;
                        const lastRowStart = Math.floor((total - 1) / columns) * columns;
                        const target = lastRowStart + col;
                        setSelectedIndex(target >= total ? target - columns : target);
                    } else {
                        setSelectedIndex(prev);
                    }
                }
                return;
            }

            const isMod = e.metaKey || e.ctrlKey;
            if (!isMod) return;

            if (e.key === 't') {
                e.preventDefault();
                onToggleMessageViewer();
                return;
            }

            if (e.key === 'e' && selectedIndex !== null && activeConnection) {
                e.preventDefault();
                onEdit(activeConnection.buttons[selectedIndex]);
                return;
            }

            if (e.key === 'n') {
                e.preventDefault();
                onNewButton();
                return;
            }

            const numKey = parseInt(e.key);
            if (!isNaN(numKey) && activeConnection) {
                const buttonIndex = numKey === 0 ? 9 : numKey - 1;
                if (buttonIndex < activeConnection.buttons.length) {
                    e.preventDefault();
                    const btn = activeConnection.buttons[buttonIndex];
                    setKeyboardSentId(btn.id);
                    setTimeout(() => setKeyboardSentId(null), 200);
                }
                return;
            }

            if (e.key === 'c' && selectedIndex !== null) {
                e.preventDefault();
                setCopiedButton(activeConnection?.buttons[selectedIndex] || null);
            } else if (e.key === 'v' && copiedButton && activeConnection) {
                e.preventDefault();
                const insertIndex = selectedIndex !== null ? selectedIndex : activeConnection.buttons.length - 1;
                const newId = crypto.randomUUID();
                const duplicate: Button = {
                    ...copiedButton,
                    id: newId,
                };
                const buttons = [...activeConnection.buttons];
                buttons.splice(insertIndex + 1, 0, duplicate);
                reorderButtons(buttons);
                setSelectedIndex(insertIndex + 1);
                setAnimatingId(newId);
                setTimeout(() => setAnimatingId(null), 300);
            } else if (e.key === 'd' && selectedIndex !== null && activeConnection) {
                e.preventDefault();
                const button = activeConnection.buttons[selectedIndex];
                const newId = crypto.randomUUID();
                const duplicate: Button = {
                    ...button,
                    id: newId,
                };
                const buttons = [...activeConnection.buttons];
                buttons.splice(selectedIndex + 1, 0, duplicate);
                reorderButtons(buttons);
                setSelectedIndex(selectedIndex + 1);
                setAnimatingId(newId);
                setTimeout(() => setAnimatingId(null), 300);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedIndex, copiedButton, modalsOpen]);

    return {
        selectedIndex,
        setSelectedIndex,
        keyboardSentId,
        animatingId,
        setAnimatingId,
    };
}
