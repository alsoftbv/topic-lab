import { useState, useRef, useEffect } from "react";
import type { Button, Connection } from "../types";

interface UseButtonDragOptions {
  activeConnection: Connection | null;
  reorderButtons: (buttons: Button[]) => void;
  visibleButtons: Button[];
}

export function useButtonDrag({
  activeConnection,
  reorderButtons,
  visibleButtons,
}: UseButtonDragOptions) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragTargetGroupId, setDragTargetGroupId] = useState<string | null>(null);

  const dragIndexRef = useRef<number | null>(null);
  const dragOverIndexRef = useRef<number | null>(null);
  const dragTargetGroupIdRef = useRef<string | null>(null);
  const dragOverSideRef = useRef<"left" | "right">("left");
  const ghostRef = useRef<HTMLElement | null>(null);
  const visibleButtonsRef = useRef<Button[]>([]);

  visibleButtonsRef.current = visibleButtons;

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
      const targetGroupId = dragTargetGroupIdRef.current;

      if (fromIndex !== null && activeConnection) {
        const visible = visibleButtonsRef.current;
        const fromButton = visible[fromIndex];

        if (fromButton) {
          const buttons = [...activeConnection.buttons];
          const fromGlobalIdx = buttons.findIndex((b) => b.id === fromButton.id);

          if (targetGroupId != null && fromGlobalIdx !== -1) {
            const resolvedGroupId = targetGroupId === "__ungrouped__" ? undefined : targetGroupId;
            const [dragged] = buttons.splice(fromGlobalIdx, 1);
            dragged.groupId = resolvedGroupId;
            let insertIdx = -1;
            for (let i = buttons.length - 1; i >= 0; i--) {
              if (buttons[i].groupId === resolvedGroupId) {
                insertIdx = i + 1;
                break;
              }
            }
            buttons.splice(insertIdx === -1 ? buttons.length : insertIdx, 0, dragged);
            reorderButtons(buttons);
          } else if (toIndex !== null && toIndex !== fromIndex) {
            const toButton = visible[toIndex];
            const side = dragOverSideRef.current;
            if (toButton && fromGlobalIdx !== -1) {
              const [dragged] = buttons.splice(fromGlobalIdx, 1);
              dragged.groupId = toButton.groupId;
              const newToIdx = buttons.findIndex((b) => b.id === toButton.id);
              buttons.splice(side === "right" ? newToIdx + 1 : newToIdx, 0, dragged);
              reorderButtons(buttons);
            }
          }
        }
      }

      if (ghostRef.current) {
        ghostRef.current.remove();
        ghostRef.current = null;
      }

      setDragIndex(null);
      setDragOverIndex(null);
      setDragTargetGroupId(null);
      dragOverIndexRef.current = null;
      dragIndexRef.current = null;
      dragTargetGroupIdRef.current = null;
    };

    window.addEventListener("mousemove", handleGlobalMouseMove);
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [dragIndex, activeConnection, reorderButtons]);

  const handleDragStart = (index: number, x: number, y: number, element: HTMLElement) => {
    setDragIndex(index);
    setDragOverIndex(index);
    dragIndexRef.current = index;
    dragOverIndexRef.current = index;

    const clone = element.cloneNode(true) as HTMLElement;
    clone.classList.add("drag-ghost");
    clone.classList.remove("dragging");
    clone.style.position = "fixed";
    clone.style.left = `${x + 5}px`;
    clone.style.top = `${y + 5}px`;
    clone.style.width = `${element.offsetWidth}px`;
    clone.style.pointerEvents = "none";
    clone.style.zIndex = "1000";
    clone.style.opacity = "0.85";
    clone.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.3)";
    document.body.appendChild(clone);
    ghostRef.current = clone;
  };

  const handleDragEnter = (index: number) => {
    if (dragIndexRef.current === null) return;
    setDragOverIndex(index);
    dragOverIndexRef.current = index;
    dragTargetGroupIdRef.current = null;
    setDragTargetGroupId(null);
    dragOverSideRef.current = "left";
  };

  const handleDragSide = (side: "left" | "right") => {
    dragOverSideRef.current = side;
  };

  const handleDragEnterGroupZone = (groupId: string | null) => {
    if (dragIndexRef.current === null) return;
    dragTargetGroupIdRef.current = groupId ?? "__ungrouped__";
    setDragTargetGroupId(groupId ?? "__ungrouped__");
    setDragOverIndex(null);
    dragOverIndexRef.current = null;
  };

  return {
    dragIndex,
    dragOverIndex,
    dragTargetGroupId,
    visibleButtonsRef,
    handleDragStart,
    handleDragEnter,
    handleDragSide,
    handleDragEnterGroupZone,
  };
}
