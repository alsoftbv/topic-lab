import { useState, useRef, useEffect } from "react";
import type { Connection } from "@/types";

export type DropSide = "top" | "bottom";

interface UseConnectionDragOptions {
  connections: Connection[];
  reorderConnections: (connections: Connection[]) => void;
}

export function moveConnection(
  connections: Connection[],
  fromId: string,
  toId: string,
  side: DropSide
): Connection[] | null {
  const fromIdx = connections.findIndex((c) => c.id === fromId);
  const toIdx = connections.findIndex((c) => c.id === toId);
  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return null;

  const result = [...connections];
  const [moved] = result.splice(fromIdx, 1);
  const anchor = result.findIndex((c) => c.id === toId);
  result.splice(side === "bottom" ? anchor + 1 : anchor, 0, moved);

  const unchanged = result.every((c, i) => c.id === connections[i].id);
  return unchanged ? null : result;
}

export function useConnectionDrag({ connections, reorderConnections }: UseConnectionDragOptions) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverSide, setDragOverSide] = useState<DropSide>("top");

  const dragIdRef = useRef<string | null>(null);
  const dragOverIdRef = useRef<string | null>(null);
  const dragOverSideRef = useRef<DropSide>("top");
  const recentDragRef = useRef(false);

  useEffect(() => {
    if (dragId === null) return;

    const handleMouseUp = () => {
      const from = dragIdRef.current;
      const to = dragOverIdRef.current;
      if (from && to) {
        const reordered = moveConnection(connections, from, to, dragOverSideRef.current);
        if (reordered) reorderConnections(reordered);
      }

      setDragId(null);
      setDragOverId(null);
      dragIdRef.current = null;
      dragOverIdRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setTimeout(() => {
        recentDragRef.current = false;
      }, 0);
    };

    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [dragId, connections, reorderConnections]);

  const handleDragStart = (id: string) => {
    recentDragRef.current = true;
    setDragId(id);
    setDragOverId(id);
    setDragOverSide("top");
    dragIdRef.current = id;
    dragOverIdRef.current = id;
    dragOverSideRef.current = "top";
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
  };

  const handleDragOver = (id: string, side: DropSide) => {
    if (dragIdRef.current === null) return;
    setDragOverId(id);
    setDragOverSide(side);
    dragOverIdRef.current = id;
    dragOverSideRef.current = side;
  };

  return {
    dragId,
    dragOverId,
    dragOverSide,
    recentDragRef,
    handleDragStart,
    handleDragOver,
  };
}
