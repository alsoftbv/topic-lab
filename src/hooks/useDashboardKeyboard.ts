import { useState, useEffect, useRef } from "react";
import type { Button, Connection } from "@/types";

interface GroupNavItem {
  id: string;
  start: number;
  count: number;
}

interface UseDashboardKeyboardOptions {
  activeConnection: Connection | null;
  visibleButtons: Button[];
  groupNav: GroupNavItem[];
  modalsOpen: boolean;
  duplicateButton: (sourceButton: Button, afterButtonId?: string) => Promise<string>;
  onEdit: (button: Button) => void;
  onDelete: (button: Button) => void;
  onNewButton: () => void;
  onToggleMessageViewer: () => void;
  onToggleGroup: (groupId: string) => void;
}

function findGroupForButton(
  index: number,
  nav: GroupNavItem[]
): { navIdx: number; start: number; end: number } | null {
  for (let i = 0; i < nav.length; i++) {
    if (nav[i].start === -1) continue;
    const end = nav[i].start + nav[i].count;
    if (index >= nav[i].start && index < end) {
      return { navIdx: i, start: nav[i].start, end };
    }
  }
  return null;
}

function getGridColumns(): number {
  const selected = document.querySelector(".button-card.selected");
  if (!selected) return 1;
  const grid = selected.closest(".buttons-grid");
  if (!grid) return 1;
  const style = getComputedStyle(grid);
  const columns = style.gridTemplateColumns.split(" ").filter((s) => s.length > 0);
  return columns.length || 1;
}

export function useDashboardKeyboard({
  activeConnection,
  visibleButtons,
  groupNav,
  modalsOpen,
  duplicateButton,
  onEdit,
  onDelete,
  onNewButton,
  onToggleMessageViewer,
  onToggleGroup,
}: UseDashboardKeyboardOptions) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [copiedButton, setCopiedButton] = useState<Button | null>(null);
  const [keyboardSend, setKeyboardSend] = useState<{ id: string; nonce: number } | null>(null);
  const [animatingId, setAnimatingId] = useState<string | null>(null);

  const lastColumnRef = useRef(0);
  const sendNonceRef = useRef(0);

  const triggerSend = (id: string) => {
    sendNonceRef.current += 1;
    const nonce = sendNonceRef.current;
    setKeyboardSend({ id, nonce });
    window.setTimeout(() => {
      setKeyboardSend((current) => (current?.nonce === nonce ? null : current));
    }, 200);
  };

  const refs = useRef({
    activeConnection,
    visibleButtons,
    groupNav,
    duplicateButton,
    onEdit,
    onDelete,
    onNewButton,
    onToggleMessageViewer,
    onToggleGroup,
  });
  refs.current = {
    activeConnection,
    visibleButtons,
    groupNav,
    duplicateButton,
    onEdit,
    onDelete,
    onNewButton,
    onToggleMessageViewer,
    onToggleGroup,
  };

  useEffect(() => {
    if (selectedIndex !== null && selectedIndex >= visibleButtons.length) {
      setSelectedIndex(null);
    }
  }, [visibleButtons.length]);

  useEffect(() => {
    const el =
      selectedGroupId !== null
        ? document.querySelector(".button-group-header.group-selected")
        : selectedIndex !== null
          ? document.querySelector(".button-card.selected")
          : null;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const container = el.closest(".button-groups");
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const margin = 40;
    if (rect.bottom + margin > containerRect.bottom) {
      container.scrollBy({ top: rect.bottom + margin - containerRect.bottom, behavior: "smooth" });
    } else if (rect.top - margin < containerRect.top) {
      container.scrollBy({ top: rect.top - margin - containerRect.top, behavior: "smooth" });
    }
  }, [selectedIndex, selectedGroupId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (modalsOpen) return;

      const target = e.target as HTMLElement;
      const isEditing =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      if (isEditing) return;

      const {
        activeConnection,
        visibleButtons,
        groupNav,
        duplicateButton,
        onEdit,
        onDelete,
        onNewButton,
        onToggleMessageViewer,
        onToggleGroup,
      } = refs.current;

      if (e.key === "Escape") {
        setSelectedIndex(null);
        setSelectedGroupId(null);
        return;
      }

      if ((e.key === "Enter" || e.key === " ") && selectedGroupId !== null) {
        e.preventDefault();
        onToggleGroup(selectedGroupId);
        return;
      }

      if (
        (e.key === "Enter" || e.key === " ") &&
        selectedIndex !== null &&
        visibleButtons[selectedIndex]
      ) {
        e.preventDefault();
        triggerSend(visibleButtons[selectedIndex].id);
        return;
      }

      if (
        (e.key === "Backspace" || e.key === "Delete") &&
        selectedIndex !== null &&
        visibleButtons[selectedIndex]
      ) {
        e.preventDefault();
        onDelete(visibleButtons[selectedIndex]);
        return;
      }

      if (
        e.key === "ArrowDown" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight"
      ) {
        e.preventDefault();

        const selectNextDown = (fromNavIdx: number, col: number) => {
          for (let i = fromNavIdx + 1; i < groupNav.length; i++) {
            if (groupNav[i].count > 0) {
              setSelectedIndex(
                Math.min(groupNav[i].start + col, groupNav[i].start + groupNav[i].count - 1)
              );
              setSelectedGroupId(null);
              lastColumnRef.current = col;
              return;
            }
            setSelectedGroupId(groupNav[i].id);
            setSelectedIndex(null);
            lastColumnRef.current = col;
            return;
          }
        };

        const selectNextUp = (fromNavIdx: number, col: number, columns: number) => {
          for (let i = fromNavIdx - 1; i >= 0; i--) {
            if (groupNav[i].count > 0) {
              const lastRowStart =
                groupNav[i].start + Math.floor((groupNav[i].count - 1) / columns) * columns;
              setSelectedIndex(
                Math.min(lastRowStart + col, groupNav[i].start + groupNav[i].count - 1)
              );
              setSelectedGroupId(null);
              lastColumnRef.current = col;
              return;
            }
            setSelectedGroupId(groupNav[i].id);
            setSelectedIndex(null);
            lastColumnRef.current = col;
            return;
          }
        };

        if (selectedIndex === null && selectedGroupId === null) {
          for (const g of groupNav) {
            if (g.count > 0) {
              setSelectedIndex(g.start);
              lastColumnRef.current = 0;
              return;
            }
            setSelectedGroupId(g.id);
            return;
          }
          return;
        }

        if (selectedGroupId !== null) {
          const gIdx = groupNav.findIndex((g) => g.id === selectedGroupId);
          const col = lastColumnRef.current;
          if (e.key === "ArrowDown") selectNextDown(gIdx, col);
          else if (e.key === "ArrowUp") selectNextUp(gIdx, col, 1);
          return;
        }

        const columns = getGridColumns();

        if (e.key === "ArrowRight") {
          const gInfo = findGroupForButton(selectedIndex!, groupNav);
          if (!gInfo) return;
          const col = (selectedIndex! - gInfo.start) % columns;
          if (col + 1 < columns && selectedIndex! + 1 < gInfo.end) {
            setSelectedIndex(selectedIndex! + 1);
            lastColumnRef.current = col + 1;
          }
          return;
        }

        if (e.key === "ArrowLeft") {
          const gInfo = findGroupForButton(selectedIndex!, groupNav);
          if (!gInfo) return;
          const col = (selectedIndex! - gInfo.start) % columns;
          if (col > 0) {
            setSelectedIndex(selectedIndex! - 1);
            lastColumnRef.current = col - 1;
          }
          return;
        }

        if (e.key === "ArrowDown") {
          const gInfo = findGroupForButton(selectedIndex!, groupNav);
          if (!gInfo) return;
          const localIdx = selectedIndex! - gInfo.start;
          const desiredCol = lastColumnRef.current;
          const groupSize = gInfo.end - gInfo.start;
          const currentRow = Math.floor(localIdx / columns);
          const totalRows = Math.ceil(groupSize / columns);
          if (currentRow + 1 < totalRows) {
            const target = gInfo.start + (currentRow + 1) * columns + desiredCol;
            setSelectedIndex(Math.min(target, gInfo.end - 1));
          } else {
            selectNextDown(gInfo.navIdx, desiredCol);
          }
          return;
        }

        if (e.key === "ArrowUp") {
          const gInfo = findGroupForButton(selectedIndex!, groupNav);
          if (!gInfo) return;
          const localIdx = selectedIndex! - gInfo.start;
          const desiredCol = lastColumnRef.current;
          const currentRow = Math.floor(localIdx / columns);
          if (currentRow > 0) {
            setSelectedIndex(gInfo.start + (currentRow - 1) * columns + desiredCol);
          } else {
            selectNextUp(gInfo.navIdx, desiredCol, columns);
          }
          return;
        }

        return;
      }

      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;

      if (e.key === "i") {
        e.preventDefault();
        onToggleMessageViewer();
        return;
      }

      if (e.key === "t") {
        e.preventDefault();
        if (selectedGroupId) {
          onToggleGroup(selectedGroupId);
        } else if (selectedIndex !== null && visibleButtons[selectedIndex]) {
          const btn = visibleButtons[selectedIndex];
          const groupId = btn.groupId || "__ungrouped__";
          onToggleGroup(groupId);
          setSelectedGroupId(groupId);
          setSelectedIndex(null);
        } else if (groupNav.length > 0) {
          onToggleGroup(groupNav[0].id);
        }
        return;
      }

      if (e.key === "e" && selectedIndex !== null && visibleButtons[selectedIndex]) {
        e.preventDefault();
        onEdit(visibleButtons[selectedIndex]);
        return;
      }

      if (e.key === "n") {
        e.preventDefault();
        onNewButton();
        return;
      }

      const numKey = parseInt(e.key);
      if (!isNaN(numKey) && activeConnection) {
        const buttonIndex = numKey === 0 ? 9 : numKey - 1;
        const btn = visibleButtons[buttonIndex];
        if (btn) {
          e.preventDefault();
          triggerSend(btn.id);
        }
        return;
      }

      if (e.key === "c" && selectedIndex !== null && visibleButtons[selectedIndex]) {
        if (!window.getSelection()?.toString()) {
          e.preventDefault();
          setCopiedButton(visibleButtons[selectedIndex]);
        }
      } else if (e.key === "v" && copiedButton && activeConnection) {
        e.preventDefault();
        const targetButton = selectedIndex !== null ? visibleButtons[selectedIndex] : null;
        duplicateButton(copiedButton, targetButton?.id)
          .then((newId) => {
            if (selectedIndex !== null) setSelectedIndex(selectedIndex + 1);
            setAnimatingId(newId);
            setTimeout(() => setAnimatingId(null), 300);
          })
          .catch((err) => console.error("Duplicate failed:", err));
      } else if (
        e.key === "d" &&
        selectedIndex !== null &&
        visibleButtons[selectedIndex] &&
        activeConnection
      ) {
        e.preventDefault();
        const button = visibleButtons[selectedIndex];
        duplicateButton(button, button.id)
          .then((newId) => {
            setSelectedIndex(selectedIndex + 1);
            setAnimatingId(newId);
            setTimeout(() => setAnimatingId(null), 300);
          })
          .catch((err) => console.error("Duplicate failed:", err));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIndex, selectedGroupId, copiedButton, modalsOpen]);

  return {
    selectedIndex,
    setSelectedIndex,
    selectedGroupId,
    setSelectedGroupId,
    keyboardSend,
    animatingId,
    setAnimatingId,
  };
}
