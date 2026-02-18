import { useState, useRef, useEffect } from 'react';
import type { ButtonGroup, Connection } from '../types';

interface UseGroupDragOptions {
    activeConnection: Connection | null;
    reorderGroups: (groups: ButtonGroup[]) => void;
}

export function useGroupDrag({ activeConnection, reorderGroups }: UseGroupDragOptions) {
    const [dragGroupId, setDragGroupId] = useState<string | null>(null);
    const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);

    const dragGroupIdRef = useRef<string | null>(null);
    const dragOverGroupIdRef = useRef<string | null>(null);
    const dragOverGroupSideRef = useRef<'top' | 'bottom'>('top');
    const recentGroupDragRef = useRef(false);

    useEffect(() => {
        if (dragGroupId === null) return;

        const handleMouseUp = () => {
            const from = dragGroupIdRef.current;
            const to = dragOverGroupIdRef.current;

            if (from && to && from !== to && activeConnection) {
                const side = dragOverGroupSideRef.current;
                const groups = [...activeConnection.groups];
                const fromIdx = groups.findIndex(g => g.id === from);
                const toIdx = groups.findIndex(g => g.id === to);
                if (fromIdx !== -1 && toIdx !== -1) {
                    const [dragged] = groups.splice(fromIdx, 1);
                    const newToIdx = groups.findIndex(g => g.id === to);
                    groups.splice(side === 'bottom' ? newToIdx + 1 : newToIdx, 0, dragged);
                    reorderGroups(groups);
                }
            }

            setDragGroupId(null);
            setDragOverGroupId(null);
            dragGroupIdRef.current = null;
            dragOverGroupIdRef.current = null;
            setTimeout(() => { recentGroupDragRef.current = false; }, 0);
        };

        window.addEventListener('mouseup', handleMouseUp);
        return () => window.removeEventListener('mouseup', handleMouseUp);
    }, [dragGroupId, activeConnection, reorderGroups]);

    const handleGroupDragStart = (groupId: string) => {
        recentGroupDragRef.current = true;
        setDragGroupId(groupId);
        setDragOverGroupId(groupId);
        dragGroupIdRef.current = groupId;
        dragOverGroupIdRef.current = groupId;
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';

        const handleUp = () => {
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mouseup', handleUp);
        };
        document.addEventListener('mouseup', handleUp);
    };

    const handleGroupDragEnter = (groupId: string) => {
        if (dragGroupIdRef.current === null) return;
        setDragOverGroupId(groupId);
        dragOverGroupIdRef.current = groupId;
        dragOverGroupSideRef.current = 'top';
    };

    const handleGroupDragSide = (side: 'top' | 'bottom') => {
        dragOverGroupSideRef.current = side;
    };

    return {
        dragGroupId,
        dragOverGroupId,
        recentGroupDragRef,
        handleGroupDragStart,
        handleGroupDragEnter,
        handleGroupDragSide,
    };
}
