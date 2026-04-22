import { useState, useEffect, useRef } from "react";
import { confirm } from "../utils/dialog";
import { Settings, Plus, X, Search } from "lucide-react";
import * as api from "../utils/api";
import { useApp } from "../contexts/AppContext";
import { substituteVariables } from "../utils/variables";
import { preferences, type MessageViewerPosition } from "../utils/preferences";
import { useDashboardKeyboard } from "../hooks/useDashboardKeyboard";
import { useButtonDrag } from "../hooks/useButtonDrag";
import { useGroupDrag } from "../hooks/useGroupDrag";
import { ConnectionSwitcher } from "./ConnectionSwitcher";
import { ConnectionStatus } from "./ConnectionStatus";
import { MessageViewer } from "./MessageViewer";
import { ButtonEditor } from "./ButtonEditor";
import { ButtonGroupSection } from "./ButtonGroup";
import { VariablesPanel } from "./VariablesPanel";
import { ConnectionEditor } from "./ConnectionEditor";
import { SettingsModal } from "./SettingsModal";
import type { Button } from "../types";

export function Dashboard() {
  const {
    activeConnection,
    error,
    deleteConnection,
    deleteButton,
    reorderButtons,
    duplicateButton,
    importConnection,
    addGroup,
    reorderGroups,
  } = useApp();
  const [showEditor, setShowEditor] = useState(false);
  const [editingButton, setEditingButton] = useState<Button | undefined>();
  const [editorGroupId, setEditorGroupId] = useState<string | undefined>();
  const [showVariables, setShowVariables] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showConnectionEditor, setShowConnectionEditor] = useState(false);
  const [isAddingConnection, setIsAddingConnection] = useState(false);
  const [messageViewerExpanded, setMessageViewerExpanded] = useState(
    () => preferences.messageViewerExpanded
  );
  const [messageViewerPosition, setMessageViewerPosition] = useState<MessageViewerPosition>(
    () => preferences.messageViewerPosition
  );
  const [mvDragging, setMvDragging] = useState(false);
  const [mvDragTarget, setMvDragTarget] = useState<MessageViewerPosition | null>(null);
  const mvGhostRef = useRef<HTMLElement | null>(null);
  const mvDragTargetRef = useRef<MessageViewerPosition | null>(null);
  const buttonsAreaRef = useRef<HTMLElement | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(() => preferences.sidebarWidth);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(preferences.collapsedGroups)
  );
  const [newGroupName, setNewGroupName] = useState("");
  const [showNewGroupInput, setShowNewGroupInput] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const newGroupInputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  function getVisibleButtonOrder(): {
    buttons: Button[];
    groupNav: { id: string; start: number; count: number }[];
  } {
    if (!activeConnection) return { buttons: [], groupNav: [] };
    const result: Button[] = [];
    const nav: { id: string; start: number; count: number }[] = [];
    for (const group of activeConnection.groups) {
      const groupButtons = activeConnection.buttons.filter((b) => b.groupId === group.id);
      if (collapsedGroups.has(group.id)) {
        nav.push({ id: group.id, start: -1, count: 0 });
        continue;
      }
      nav.push({
        id: group.id,
        start: groupButtons.length > 0 ? result.length : -1,
        count: groupButtons.length,
      });
      result.push(...groupButtons);
    }
    const ungrouped = activeConnection.buttons.filter(
      (b) => !b.groupId || !activeConnection.groups.some((g) => g.id === b.groupId)
    );
    if (ungrouped.length > 0 || activeConnection.groups.length === 0) {
      if (collapsedGroups.has("__ungrouped__")) {
        nav.push({ id: "__ungrouped__", start: -1, count: 0 });
      } else {
        nav.push({
          id: "__ungrouped__",
          start: ungrouped.length > 0 ? result.length : -1,
          count: ungrouped.length,
        });
        result.push(...ungrouped);
      }
    }
    return { buttons: result, groupNav: nav };
  }

  const { buttons: visibleButtons, groupNav } = getVisibleButtonOrder();

  const {
    dragIndex,
    dragOverIndex,
    dragTargetGroupId,
    handleDragStart,
    handleDragEnter,
    handleDragSide,
    handleDragEnterGroupZone,
  } = useButtonDrag({
    activeConnection,
    reorderButtons,
    visibleButtons,
  });

  const {
    dragGroupId,
    dragOverGroupId,
    recentGroupDragRef,
    handleGroupDragStart,
    handleGroupDragEnter,
    handleGroupDragSide,
  } = useGroupDrag({
    activeConnection,
    reorderGroups,
  });

  const {
    selectedIndex,
    setSelectedIndex,
    selectedGroupId,
    setSelectedGroupId,
    keyboardSentId,
    animatingId,
    setAnimatingId,
  } = useDashboardKeyboard({
    activeConnection,
    visibleButtons,
    groupNav,
    modalsOpen: showEditor || showSettings || showConnectionEditor,
    duplicateButton,
    onEdit: (button) => {
      setEditingButton(button);
      setEditorGroupId(button.groupId);
      setShowEditor(true);
    },
    onDelete: async (button) => {
      const confirmed = await confirm("This action cannot be undone.", {
        title: `Delete "${button.name}"?`,
        kind: "warning",
      });
      if (confirmed) {
        await deleteButton(button.id);
      }
    },
    onNewButton: () => {
      setEditingButton(undefined);
      setEditorGroupId(undefined);
      setShowEditor(true);
    },
    onToggleMessageViewer: () =>
      setMessageViewerExpanded((prev) => {
        const next = !prev;
        preferences.messageViewerExpanded = next;
        return next;
      }),
    onToggleGroup: (groupId: string) => {
      setCollapsedGroups((prev) => {
        const next = new Set(prev);
        if (next.has(groupId)) next.delete(groupId);
        else next.add(groupId);
        preferences.collapsedGroups = [...next];
        return next;
      });
    },
  });

  const toggleGroupCollapse = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      preferences.collapsedGroups = [...next];
      return next;
    });
  };

  useEffect(() => {
    if (!mvDragging) return;

    const setTarget = (pos: MessageViewerPosition | null) => {
      if (mvDragTargetRef.current !== pos) {
        mvDragTargetRef.current = pos;
        setMvDragTarget(pos);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (mvGhostRef.current) {
        mvGhostRef.current.style.left = `${e.clientX + 8}px`;
        mvGhostRef.current.style.top = `${e.clientY + 8}px`;
      }
      const area = buttonsAreaRef.current;
      if (!area) return;
      const rect = area.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x < 0 || x > rect.width || y < 0 || y > rect.height) {
        setTarget(null);
        return;
      }
      const dTop = y / rect.height;
      const dLeft = x / rect.width;
      const dRight = (rect.width - x) / rect.width;
      const candidates: { pos: MessageViewerPosition; d: number }[] = [];
      if (dTop < 0.3) candidates.push({ pos: "top", d: dTop });
      if (dLeft < 0.3) candidates.push({ pos: "left", d: dLeft });
      if (dRight < 0.3) candidates.push({ pos: "right", d: dRight });
      if (candidates.length === 0) {
        setTarget(null);
        return;
      }
      candidates.sort((a, b) => a.d - b.d);
      setTarget(candidates[0].pos);
    };

    const handleMouseUp = () => {
      const target = mvDragTargetRef.current;
      if (target && target !== messageViewerPosition) {
        setMessageViewerPosition(target);
        preferences.messageViewerPosition = target;
      }
      if (mvGhostRef.current) {
        mvGhostRef.current.remove();
        mvGhostRef.current = null;
      }
      mvDragTargetRef.current = null;
      setMvDragTarget(null);
      setMvDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [mvDragging, messageViewerPosition]);

  const handleMvDragStart = (x: number, y: number) => {
    setMvDragging(true);
    const ghost = document.createElement("div");
    ghost.className = "mv-drag-ghost";
    ghost.textContent = "Message Viewer";
    ghost.style.position = "fixed";
    ghost.style.left = `${x + 8}px`;
    ghost.style.top = `${y + 8}px`;
    ghost.style.pointerEvents = "none";
    ghost.style.zIndex = "1000";
    document.body.appendChild(ghost);
    mvGhostRef.current = ghost;
  };

  useEffect(() => {
    if (showSearch) searchInputRef.current?.focus();
  }, [showSearch]);

  useEffect(() => {
    if (showNewGroupInput) newGroupInputRef.current?.focus();
  }, [showNewGroupInput]);

  useEffect(() => {
    const handleSearchKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        if (showEditor || showSettings || showConnectionEditor) return;
        e.preventDefault();
        if (showSearch) {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        } else {
          setShowSearch(true);
        }
      }
      if (e.key === "Escape" && showSearch) {
        e.stopPropagation();
        setShowSearch(false);
        setSearchQuery("");
      }
    };
    window.addEventListener("keydown", handleSearchKey, true);
    return () => window.removeEventListener("keydown", handleSearchKey, true);
  }, [showSearch, showEditor, showSettings, showConnectionEditor]);

  if (!activeConnection) return null;

  const groups = activeConnection.groups;
  const buttonsByGroup = new Map<string | undefined, Button[]>();
  for (const button of activeConnection.buttons) {
    const key = button.groupId;
    if (!buttonsByGroup.has(key)) buttonsByGroup.set(key, []);
    buttonsByGroup.get(key)!.push(button);
  }

  const handleNewButton = (groupId?: string) => {
    setEditingButton(undefined);
    setEditorGroupId(groupId);
    setShowEditor(true);
  };

  const handleEditButton = (buttonId: string) => {
    const button = activeConnection?.buttons.find((b) => b.id === buttonId);
    if (button) {
      setEditingButton(button);
      setEditorGroupId(button.groupId);
      setShowEditor(true);
    }
  };

  const handleDuplicateButton = async (_buttonId: string, index: number) => {
    const button = visibleButtons[index];
    if (!button || !activeConnection) return;
    const newId = await duplicateButton(button, button.id);
    setAnimatingId(newId);
    setTimeout(() => setAnimatingId(null), 300);
  };

  const handleSelectButton = (index: number) => {
    setSelectedIndex((prev) => (prev === index ? null : index));
  };

  const handleCloseEditor = () => {
    setShowEditor(false);
    setEditingButton(undefined);
    setEditorGroupId(undefined);
  };

  const handleAddConnection = () => {
    setIsAddingConnection(true);
    setShowConnectionEditor(true);
  };

  const handleImport = async () => {
    const connectionData = await api.importConnection();
    if (connectionData) {
      await importConnection(connectionData);
    }
  };

  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    await addGroup({ id: crypto.randomUUID(), name });
    setNewGroupName("");
    setShowNewGroupInput(false);
  };

  const variables = activeConnection.variables;
  const query = searchQuery.toLowerCase();
  const matchingButtonIds = new Set(
    query
      ? activeConnection.buttons
          .filter((b) => {
            const name = b.name.toLowerCase();
            const topic = substituteVariables(b.topic, variables).toLowerCase();
            const payload = b.payload
              ? substituteVariables(b.payload, variables).toLowerCase()
              : "";
            return name.includes(query) || topic.includes(query) || payload.includes(query);
          })
          .map((b) => b.id)
      : activeConnection.buttons.map((b) => b.id)
  );

  const ungroupedButtons = activeConnection.buttons.filter(
    (b) => !b.groupId || !groups.some((g) => g.id === b.groupId)
  );

  let globalIndexCounter = 0;

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <ConnectionSwitcher onAddNew={handleAddConnection} onImport={handleImport} />
          <ConnectionStatus />
        </div>
        <div className="header-right">
          <button
            className={`btn btn-small ${showVariables ? "btn-active" : "btn-secondary"}`}
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

      <div
        className="dashboard-content"
        onClick={() => {
          setSelectedIndex(null);
          setSelectedGroupId(null);
        }}
      >
        {showSearch && (
          <div className="search-bar">
            <Search size={16} className="search-bar-icon" />
            <input
              ref={searchInputRef}
              type="text"
              className="search-bar-input"
              placeholder="Search buttons..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setShowSearch(false);
                  setSearchQuery("");
                }
              }}
            />
            <button
              className="btn-icon"
              onClick={() => {
                setShowSearch(false);
                setSearchQuery("");
              }}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <main
          ref={buttonsAreaRef}
          className={`buttons-area mv-pos-${messageViewerPosition}`}
        >
          {messageViewerPosition !== "right" && (
            <MessageViewer
              expanded={messageViewerExpanded}
              onToggle={(v) => {
                setMessageViewerExpanded(v);
                preferences.messageViewerExpanded = v;
              }}
              showRawTemplates={showVariables}
              position={messageViewerPosition}
              onDragStart={handleMvDragStart}
            />
          )}

          <div className="button-groups">
            {groups.map((group) => {
              const groupButtons = buttonsByGroup.get(group.id) || [];
              const offset = globalIndexCounter;
              if (!collapsedGroups.has(group.id)) {
                globalIndexCounter += groupButtons.length;
              }
              return (
                <ButtonGroupSection
                  key={group.id}
                  group={group}
                  buttons={groupButtons}
                  collapsed={collapsedGroups.has(group.id)}
                  onToggle={() => {
                    if (!recentGroupDragRef.current) toggleGroupCollapse(group.id);
                  }}
                  onAddButton={handleNewButton}
                  onEditButton={handleEditButton}
                  onDuplicateButton={handleDuplicateButton}
                  onSelectButton={handleSelectButton}
                  onDragStartButton={handleDragStart}
                  onDragEnterButton={handleDragEnter}
                  onDragSideButton={handleDragSide}
                  onDragEnterGroupZone={handleDragEnterGroupZone}
                  isDraggingButton={dragIndex !== null}
                  dragIndex={dragIndex}
                  dragOverIndex={dragOverIndex}
                  selectedIndex={selectedIndex}
                  animatingId={animatingId}
                  keyboardSentId={keyboardSentId}
                  matchingButtonIds={matchingButtonIds}
                  globalIndexOffset={offset}
                  onGroupDragStart={handleGroupDragStart}
                  onGroupDragEnter={handleGroupDragEnter}
                  onGroupDragSide={handleGroupDragSide}
                  isGroupDragging={dragGroupId === group.id}
                  isGroupDragOver={dragOverGroupId === group.id}
                  isDropTarget={dragTargetGroupId === group.id}
                  isGroupSelected={selectedGroupId === group.id}
                  showRawTemplates={showVariables}
                />
              );
            })}

            {(ungroupedButtons.length > 0 || groups.length === 0) && (
              <ButtonGroupSection
                group={null}
                buttons={ungroupedButtons}
                collapsed={collapsedGroups.has("__ungrouped__")}
                onToggle={() => toggleGroupCollapse("__ungrouped__")}
                onAddButton={handleNewButton}
                onEditButton={handleEditButton}
                onDuplicateButton={handleDuplicateButton}
                onSelectButton={handleSelectButton}
                onDragStartButton={handleDragStart}
                onDragEnterButton={handleDragEnter}
                onDragSideButton={handleDragSide}
                onDragEnterGroupZone={handleDragEnterGroupZone}
                isDraggingButton={dragIndex !== null}
                dragIndex={dragIndex}
                dragOverIndex={dragOverIndex}
                selectedIndex={selectedIndex}
                animatingId={animatingId}
                keyboardSentId={keyboardSentId}
                matchingButtonIds={matchingButtonIds}
                globalIndexOffset={globalIndexCounter}
                onGroupDragStart={() => {}}
                onGroupDragEnter={() => {}}
                onGroupDragSide={() => {}}
                isGroupDragging={false}
                isGroupDragOver={false}
                isDropTarget={dragTargetGroupId === "__ungrouped__"}
                isGroupSelected={selectedGroupId === "__ungrouped__"}
                showRawTemplates={showVariables}
                gridRef={gridRef}
              />
            )}

            {showNewGroupInput ? (
              <div className="new-group-input">
                <input
                  ref={newGroupInputRef}
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Group name..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCreateGroup();
                    }
                    if (e.key === "Escape") {
                      setShowNewGroupInput(false);
                      setNewGroupName("");
                    }
                  }}
                  onBlur={() => {
                    if (!newGroupName.trim()) {
                      setShowNewGroupInput(false);
                      setNewGroupName("");
                    }
                  }}
                />
                <button
                  className="btn btn-small"
                  onClick={handleCreateGroup}
                  disabled={!newGroupName.trim()}
                >
                  Create
                </button>
              </div>
            ) : (
              <button className="new-group-area" onClick={() => setShowNewGroupInput(true)}>
                <Plus size={14} />
                New Group
              </button>
            )}
          </div>

          {messageViewerPosition === "right" && (
            <MessageViewer
              expanded={messageViewerExpanded}
              onToggle={(v) => {
                setMessageViewerExpanded(v);
                preferences.messageViewerExpanded = v;
              }}
              showRawTemplates={showVariables}
              position={messageViewerPosition}
              onDragStart={handleMvDragStart}
            />
          )}

          {mvDragging && (
            <div className="mv-drop-zones">
              {mvDragTarget && (
                <div className={`mv-drop-indicator mv-drop-indicator-${mvDragTarget}`} />
              )}
            </div>
          )}
        </main>

        {showVariables && (
          <aside className="sidebar" style={{ width: sidebarWidth }}>
            <div
              className="sidebar-resize-handle"
              onMouseDown={(e) => {
                e.preventDefault();
                const startX = e.clientX;
                const startWidth = sidebarWidth;
                let newWidth = startWidth;
                document.body.style.cursor = "col-resize";
                document.body.style.userSelect = "none";
                const onMouseMove = (e: MouseEvent) => {
                  newWidth = Math.max(280, Math.min(500, startWidth - (e.clientX - startX)));
                  setSidebarWidth(newWidth);
                };
                const onMouseUp = () => {
                  document.body.style.cursor = "";
                  document.body.style.userSelect = "";
                  document.removeEventListener("mousemove", onMouseMove);
                  document.removeEventListener("mouseup", onMouseUp);
                  preferences.sidebarWidth = newWidth;
                };
                document.addEventListener("mousemove", onMouseMove);
                document.addEventListener("mouseup", onMouseUp);
              }}
            />
            <VariablesPanel />
          </aside>
        )}
      </div>

      {showEditor && (
        <ButtonEditor
          button={editingButton}
          defaultGroupId={editorGroupId}
          onClose={handleCloseEditor}
        />
      )}

      {showSettings && (
        <SettingsModal
          connection={activeConnection}
          onClose={() => setShowSettings(false)}
          onEditConnection={() => {
            setShowSettings(false);
            setIsAddingConnection(false);
            setShowConnectionEditor(true);
          }}
          onDeleteConnection={() => deleteConnection(activeConnection.id)}
        />
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
