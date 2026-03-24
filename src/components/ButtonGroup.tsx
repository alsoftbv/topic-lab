import { useState, useRef, useEffect } from "react";
import { confirm } from "../utils/dialog";
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, GripVertical, Check } from "lucide-react";
import type { Button, ButtonGroup as ButtonGroupType } from "../types";
import { useApp } from "../contexts/AppContext";
import { ButtonCard } from "./ButtonCard";

const mod = /Mac|iPhone|iPad/.test(navigator.userAgent) ? "\u2318\u2009" : "Ctrl+";

interface ButtonGroupProps {
  group: ButtonGroupType | null;
  buttons: Button[];
  collapsed: boolean;
  onToggle: () => void;
  onAddButton: (groupId?: string) => void;
  onEditButton: (buttonId: string) => void;
  onDuplicateButton: (buttonId: string, globalIndex: number) => void;
  onSelectButton: (globalIndex: number) => void;
  onDragStartButton: (globalIndex: number, x: number, y: number, element: HTMLElement) => void;
  onDragEnterButton: (globalIndex: number) => void;
  onDragSideButton: (side: "left" | "right") => void;
  onDragEnterGroupZone: (groupId: string | null) => void;
  isDraggingButton: boolean;
  dragIndex: number | null;
  dragOverIndex: number | null;
  selectedIndex: number | null;
  animatingId: string | null;
  keyboardSentId: string | null;
  matchingButtonIds: Set<string>;
  globalIndexOffset: number;
  onGroupDragStart: (groupId: string) => void;
  onGroupDragEnter: (groupId: string) => void;
  onGroupDragSide: (side: "top" | "bottom") => void;
  isGroupDragging: boolean;
  isGroupDragOver: boolean;
  isDropTarget: boolean;
  isGroupSelected: boolean;
  showRawTemplates?: boolean;
  gridRef?: React.RefObject<HTMLDivElement | null>;
}

export function ButtonGroupSection({
  group,
  buttons,
  collapsed,
  onToggle,
  onAddButton,
  onEditButton,
  onDuplicateButton,
  onSelectButton,
  onDragStartButton,
  onDragEnterButton,
  onDragSideButton,
  onDragEnterGroupZone,
  isDraggingButton,
  dragIndex,
  dragOverIndex,
  selectedIndex,
  animatingId,
  keyboardSentId,
  matchingButtonIds,
  globalIndexOffset,
  onGroupDragStart,
  onGroupDragEnter,
  onGroupDragSide,
  isGroupDragging,
  isGroupDragOver,
  isDropTarget,
  isGroupSelected,
  showRawTemplates,
  gridRef,
}: ButtonGroupProps) {
  const { updateGroup, deleteGroup } = useApp();
  const [isRenaming, setIsRenaming] = useState(false);
  const [groupDragSide, setGroupDragSide] = useState<"top" | "bottom">("top");
  const nameRef = useRef<HTMLSpanElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);

  const isUngrouped = group === null;
  const groupName = group?.name ?? "Ungrouped";

  useEffect(() => {
    if (!isRenaming || !nameRef.current || !group) return;
    nameRef.current.textContent = group.name;
    nameRef.current.focus();
    const range = document.createRange();
    range.selectNodeContents(nameRef.current);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [isRenaming]);

  const stopRenaming = () => {
    setIsRenaming(false);
    window.getSelection()?.removeAllRanges();
  };

  const handleSaveRename = () => {
    if (!nameRef.current || !group) return;
    const newName = (nameRef.current.textContent || "").trim();
    if (newName && newName !== group.name) {
      updateGroup({ ...group, name: newName });
    }
    stopRenaming();
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveRename();
    }
    if (e.key === "Escape") stopRenaming();
  };

  const handleDelete = async () => {
    if (!group) return;
    const msg =
      buttons.length > 0
        ? `Delete group "${group.name}"? Its ${buttons.length} button${buttons.length !== 1 ? "s" : ""} will become ungrouped.`
        : `Delete group "${group.name}"?`;
    const confirmed = await confirm(msg, { title: "Delete Group", kind: "warning" });
    if (confirmed) await deleteGroup(group.id);
  };

  const handleHeaderClick = (e: React.MouseEvent) => {
    if (isRenaming) return;
    e.stopPropagation();
    onToggle();
  };

  const computeGroupSide = (clientY: number): "top" | "bottom" => {
    const rect = groupRef.current?.getBoundingClientRect();
    if (!rect) return "top";
    return clientY > rect.top + rect.height / 2 ? "bottom" : "top";
  };

  const handleGroupMouseEnter = (e: React.MouseEvent) => {
    if (!group) return;
    onGroupDragEnter(group.id);
    const side = computeGroupSide(e.clientY);
    setGroupDragSide(side);
    onGroupDragSide(side);
  };

  const handleGroupMouseMove = (e: React.MouseEvent) => {
    const side = computeGroupSide(e.clientY);
    setGroupDragSide(side);
    onGroupDragSide(side);
  };

  return (
    <div
      ref={groupRef}
      className={`button-group ${isGroupDragging ? "group-dragging" : ""} ${isGroupDragOver ? `group-drag-over group-drag-${groupDragSide}` : ""}`}
      onMouseEnter={handleGroupMouseEnter}
      onMouseMove={isGroupDragOver && !isGroupDragging ? handleGroupMouseMove : undefined}
    >
      <div
        className={`button-group-header ${isGroupSelected ? "group-selected" : ""}`}
        onClick={handleHeaderClick}
        title={`Toggle (${mod}T)`}
        role="button"
        tabIndex={0}
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        {isRenaming ? (
          <span
            ref={nameRef}
            className="button-group-name"
            contentEditable
            suppressContentEditableWarning
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleRenameKeyDown}
            onBlur={stopRenaming}
            spellCheck={false}
          />
        ) : (
          <span className="button-group-name">{groupName}</span>
        )}
        <span className="button-group-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="btn-icon"
            onClick={() => onAddButton(group?.id)}
            title={`Add button (${mod}N)`}
          >
            <Plus size={14} />
          </button>
          {!isUngrouped && (
            <>
              {isRenaming ? (
                <button
                  className="btn-icon"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSaveRename();
                  }}
                  title="Save"
                >
                  <Check size={14} />
                </button>
              ) : (
                <button className="btn-icon" onClick={() => setIsRenaming(true)} title="Rename">
                  <Pencil size={14} />
                </button>
              )}
              <button className="btn-icon" onClick={handleDelete} title="Delete group">
                <Trash2 size={14} />
              </button>
            </>
          )}
        </span>
        {!isUngrouped && (
          <span
            className="button-group-drag-handle"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              group && onGroupDragStart(group.id);
            }}
            title="Drag to reorder"
          >
            <GripVertical size={14} />
          </span>
        )}
      </div>

      {!collapsed && (
        <div className="button-group-content">
          {buttons.length === 0 ? (
            <div
              className={`button-group-empty ${isDropTarget ? "drop-target" : ""}`}
              onMouseEnter={() => isDraggingButton && onDragEnterGroupZone(group?.id ?? null)}
            >
              No buttons
            </div>
          ) : (
            <div className="buttons-grid" ref={gridRef}>
              {buttons.map((button, localIndex) => {
                const globalIndex = globalIndexOffset + localIndex;
                return (
                  <ButtonCard
                    key={button.id}
                    button={button}
                    index={globalIndex}
                    onEdit={onEditButton}
                    onDuplicate={onDuplicateButton}
                    onSelect={onSelectButton}
                    onDragStart={onDragStartButton}
                    onDragEnter={onDragEnterButton}
                    onDragSide={onDragSideButton}
                    isDragging={dragIndex === globalIndex}
                    isDragOver={dragOverIndex === globalIndex}
                    isSelected={selectedIndex === globalIndex}
                    isAnimating={animatingId === button.id}
                    keyboardSent={keyboardSentId === button.id}
                    isDimmed={!matchingButtonIds.has(button.id)}
                    showRawTemplates={showRawTemplates}
                  />
                );
              })}
              {isDraggingButton && (
                <div
                  className="button-group-drop-tail"
                  onMouseEnter={() => {
                    onDragEnterButton(globalIndexOffset + buttons.length - 1);
                    onDragSideButton("right");
                  }}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
