import { useState, useEffect, useRef } from "react";
import { confirm } from "@/utils/dialog";
import { Settings, Plus, X, Search, LayoutGrid, MessageSquare, Send } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import * as api from "@/utils/api";
import { useApp } from "@/contexts/AppContext";
import { preferences, type DockPaneId, type DockPosition, type PaneId } from "@/utils/preferences";
import { useDashboardKeyboard } from "@/hooks/useDashboardKeyboard";
import { useButtonDrag } from "@/hooks/useButtonDrag";
import { useGroupDrag } from "@/hooks/useGroupDrag";
import { ConnectionSwitcher } from "./ConnectionSwitcher";
import { ConnectionStatus } from "./ConnectionStatus";
import { Dock } from "./Dock";
import { MessagesPane } from "./MessagesPane";
import { PublishPane, type PublishDraft } from "./PublishPane";
import { useMqttMessages } from "@/hooks/useMqttMessages";
import { useSubscriptionSync } from "@/hooks/useSubscriptionSync";
import { ButtonEditor } from "./ButtonEditor";
import { ButtonGroupSection } from "./ButtonGroup";
import { VariablesPanel } from "./VariablesPanel";
import { ConnectionEditor } from "./ConnectionEditor";
import { SettingsModal } from "./SettingsModal";
import { PreferencesModal } from "./PreferencesModal";
import { useUpdater } from "@/hooks/useUpdater";
import { UpdateBanner, UpdateOptInModal } from "./UpdateNotice";
import { modKey } from "@/utils/platform";
import type { Button } from "@/types";

type DockDropTarget = DockPosition | "bottom" | "swap";

const PANE_TOGGLES: { pane: PaneId; label: string; Icon: typeof LayoutGrid; shortcut?: string }[] =
  [
    { pane: "commands", label: "Commands", Icon: LayoutGrid },
    { pane: "messages", label: "Messages", Icon: MessageSquare, shortcut: "I" },
    { pane: "publish", label: "Publish", Icon: Send, shortcut: "P" },
  ];

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
    resolvedButtons,
  } = useApp();
  const [showEditor, setShowEditor] = useState(false);
  const [editingButton, setEditingButton] = useState<Button | undefined>();
  const [editorGroupId, setEditorGroupId] = useState<string | undefined>();
  const [showVariables, setShowVariables] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const updater = useUpdater();
  const [showConnectionEditor, setShowConnectionEditor] = useState(false);
  const [isAddingConnection, setIsAddingConnection] = useState(false);
  const [visiblePanes, setVisiblePanes] = useState<PaneId[]>(() => preferences.visiblePanes);
  const [dockPosition, setDockPosition] = useState<DockPosition>(() => preferences.dockPosition);
  const [dockOrder, setDockOrder] = useState<DockPaneId[]>(() => preferences.dockOrder);
  const [dockDragging, setDockDragging] = useState(false);
  const [draggedPane, setDraggedPane] = useState<DockPaneId | null>(null);
  const [dockDragTarget, setDockDragTarget] = useState<DockDropTarget | null>(null);
  const dockGhostRef = useRef<HTMLElement | null>(null);
  const dockDragTargetRef = useRef<DockDropTarget | null>(null);
  const draggedPaneRef = useRef<DockPaneId | null>(null);
  const [publishDraft, setPublishDraft] = useState<PublishDraft>({ topic: "", payload: "" });
  const [editorPrefill, setEditorPrefill] = useState<PublishDraft | undefined>();
  const { messages, clearMessages } = useMqttMessages();
  useSubscriptionSync();
  const buttonsAreaRef = useRef<HTMLElement | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
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

  const isPaneVisible = (pane: PaneId) => visiblePanes.includes(pane);
  const dockFills = !isPaneVisible("commands");

  const togglePane = (pane: PaneId) => {
    setVisiblePanes((prev) => {
      const next = prev.includes(pane) ? prev.filter((p) => p !== pane) : [...prev, pane];
      if (next.length === 0) return prev;
      preferences.visiblePanes = next;
      return next;
    });
  };

  const toggleGroupCollapse = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      preferences.collapsedGroups = [...next];
      return next;
    });
  };

  const {
    selectedIndex,
    setSelectedIndex,
    selectedGroupId,
    setSelectedGroupId,
    keyboardSend,
    animatingId,
    setAnimatingId,
  } = useDashboardKeyboard({
    activeConnection,
    visibleButtons,
    groupNav,
    modalsOpen: showEditor || showSettings || showConnectionEditor || showPreferences,
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
    onTogglePane: togglePane,
    onToggleGroup: toggleGroupCollapse,
  });

  useEffect(() => {
    if (!dockDragging) return;

    const setTarget = (pos: DockDropTarget | null) => {
      if (dockDragTargetRef.current !== pos) {
        dockDragTargetRef.current = pos;
        setDockDragTarget(pos);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (dockGhostRef.current) {
        dockGhostRef.current.style.left = `${e.clientX + 8}px`;
        dockGhostRef.current.style.top = `${e.clientY + 8}px`;
      }
      const dragged = draggedPaneRef.current;
      const other = dragged
        ? document.querySelector<HTMLElement>(
            `.dock .pane[data-pane]:not([data-pane="${dragged}"])`
          )
        : null;
      if (!dockFills && other) {
        const r = other.getBoundingClientRect();
        if (
          e.clientX >= r.left &&
          e.clientX <= r.right &&
          e.clientY >= r.top &&
          e.clientY <= r.bottom
        ) {
          setTarget("swap");
          return;
        }
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
      const dBottom = (rect.height - y) / rect.height;
      const dLeft = x / rect.width;
      const dRight = (rect.width - x) / rect.width;
      const candidates: { pos: DockDropTarget; d: number }[] = [];
      if (dTop < 0.3) candidates.push({ pos: "top", d: dTop });
      if (dLeft < 0.3) candidates.push({ pos: "left", d: dLeft });
      if (dRight < 0.3) candidates.push({ pos: "right", d: dRight });
      if (dockFills && dBottom < 0.3) candidates.push({ pos: "bottom", d: dBottom });
      if (candidates.length === 0) {
        setTarget(null);
        return;
      }
      candidates.sort((a, b) => a.d - b.d);
      setTarget(candidates[0].pos);
    };

    const handleMouseUp = () => {
      const target = dockDragTargetRef.current;
      const dragged = draggedPaneRef.current;
      if (target === "swap") {
        setDockOrder((prev) => {
          const next = [...prev].reverse();
          preferences.dockOrder = next;
          return next;
        });
      } else if (target && dockFills && dragged) {
        const other = dockOrder.find((p) => p !== dragged);
        if (other) {
          const draggedFirst = target === "left" || target === "top";
          const nextOrder: DockPaneId[] = draggedFirst ? [dragged, other] : [other, dragged];
          setDockOrder(nextOrder);
          preferences.dockOrder = nextOrder;
        }
        const sideBySide = target === "left" || target === "right";
        const nextPosition: DockPosition = sideBySide
          ? "top"
          : dockPosition === "top"
            ? "right"
            : dockPosition;
        setDockPosition(nextPosition);
        preferences.dockPosition = nextPosition;
      } else if (target && target !== "bottom" && target !== dockPosition) {
        setDockPosition(target);
        preferences.dockPosition = target;
      }
      if (dockGhostRef.current) {
        dockGhostRef.current.remove();
        dockGhostRef.current = null;
      }
      dockDragTargetRef.current = null;
      draggedPaneRef.current = null;
      setDraggedPane(null);
      setDockDragTarget(null);
      setDockDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dockDragging, dockPosition, dockOrder, dockFills]);

  const handleDockDragStart = (x: number, y: number, pane: DockPaneId) => {
    setDockDragging(true);
    setDraggedPane(pane);
    draggedPaneRef.current = pane;
    const ghost = document.createElement("div");
    ghost.className = "dock-drag-ghost";
    ghost.textContent = PANE_TOGGLES.find((t) => t.pane === pane)?.label ?? pane;
    ghost.style.position = "fixed";
    ghost.style.left = `${x + 8}px`;
    ghost.style.top = `${y + 8}px`;
    ghost.style.pointerEvents = "none";
    ghost.style.zIndex = "1000";
    document.body.appendChild(ghost);
    dockGhostRef.current = ghost;
  };

  useEffect(() => {
    if (showSearch) searchInputRef.current?.focus();
  }, [showSearch]);

  useEffect(() => {
    if (showNewGroupInput) newGroupInputRef.current?.focus();
  }, [showNewGroupInput]);

  useEffect(() => {
    const unlisten = listen("open-preferences", () => setShowPreferences(true));
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const handleSettingsKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ".") {
        if (showEditor || showConnectionEditor || showPreferences) return;
        e.preventDefault();
        setShowSettings((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleSettingsKey);
    return () => window.removeEventListener("keydown", handleSettingsKey);
  }, [showEditor, showConnectionEditor, showPreferences]);

  useEffect(() => {
    const handleSearchKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        if (showEditor || showSettings || showConnectionEditor || showPreferences) return;
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
  }, [showSearch, showEditor, showSettings, showConnectionEditor, showPreferences]);

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

  const handleOpenInPublish = (buttonId: string) => {
    const button = activeConnection?.buttons.find((b) => b.id === buttonId);
    if (!button) return;
    setPublishDraft({ topic: button.topic, payload: button.payload ?? "" });
    if (!isPaneVisible("publish")) togglePane("publish");
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
    setEditorPrefill(undefined);
  };

  const handleMakeButton = (draft: PublishDraft) => {
    setEditingButton(undefined);
    setEditorGroupId(undefined);
    setEditorPrefill(draft);
    setShowEditor(true);
  };

  const handleAddConnection = () => {
    setIsAddingConnection(true);
    setShowConnectionEditor(true);
  };

  const handleImport = async () => {
    setImportError(null);
    try {
      const connectionData = await api.importConnection();
      if (connectionData) {
        await importConnection(connectionData);
      }
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Failed to import connection");
    }
  };

  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    await addGroup({ id: crypto.randomUUID(), name });
    setNewGroupName("");
    setShowNewGroupInput(false);
  };

  const query = searchQuery.toLowerCase();
  const matchingButtonIds = new Set(
    query
      ? activeConnection.buttons
          .filter((b) => {
            const name = b.name.toLowerCase();
            const resolved = resolvedButtons[b.id];
            const topic = (resolved?.topic ?? b.topic).toLowerCase();
            const payload = (resolved?.payload ?? b.payload ?? "").toLowerCase();
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
          <div className="pane-toggles" role="group" aria-label="Panes">
            {PANE_TOGGLES.map(({ pane, label, Icon, shortcut }) => {
              const on = isPaneVisible(pane);
              return (
                <button
                  key={pane}
                  data-pane={pane}
                  className={`btn btn-small btn-icon-only ${on ? "btn-active" : "btn-secondary"}`}
                  onClick={() => togglePane(pane)}
                  disabled={on && visiblePanes.length === 1}
                  aria-pressed={on}
                  title={shortcut ? `${label} (${modKey}${shortcut})` : label}
                >
                  <Icon size={16} />
                </button>
              );
            })}
          </div>
          <button
            className="btn btn-small btn-secondary btn-icon-only"
            onClick={() => setShowSettings(!showSettings)}
            title={`Connection Settings (${modKey}.)`}
          >
            <Settings size={16} />
          </button>
          <button
            className={`btn btn-small ${showVariables ? "btn-active" : "btn-secondary"}`}
            onClick={() => setShowVariables(!showVariables)}
          >
            Variables ({Object.keys(activeConnection.variables).length})
          </button>
        </div>
      </header>

      <UpdateBanner updater={updater} />

      {error && <div className="error-banner">{error}</div>}

      {importError && <div className="error-banner">{importError}</div>}

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
        <main ref={buttonsAreaRef} className="buttons-area">
          <div className={`workspace dock-pos-${dockPosition}`}>
            {(isPaneVisible("messages") || isPaneVisible("publish")) && (
              <Dock position={dockPosition} fill={dockFills}>
                {dockOrder
                  .filter(isPaneVisible)
                  .map((pane) =>
                    pane === "messages" ? (
                      <MessagesPane
                        key="messages"
                        messages={messages}
                        onClearMessages={clearMessages}
                        showRawTemplates={showVariables}
                        isDropTarget={dockDragTarget === "swap" && draggedPane === "publish"}
                        onDragStart={handleDockDragStart}
                      />
                    ) : (
                      <PublishPane
                        key="publish"
                        draft={publishDraft}
                        onDraftChange={setPublishDraft}
                        showRawTemplates={showVariables}
                        isDropTarget={dockDragTarget === "swap" && draggedPane === "messages"}
                        onDragStart={handleDockDragStart}
                        onMakeButton={handleMakeButton}
                      />
                    )
                  )}
              </Dock>
            )}

            {isPaneVisible("commands") && (
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
                      onOpenInPublishButton={handleOpenInPublish}
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
                      keyboardSend={keyboardSend}
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
                    onOpenInPublishButton={handleOpenInPublish}
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
                    keyboardSend={keyboardSend}
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
            )}
          </div>

          {dockDragging && (
            <div className="dock-drop-zones">
              {dockDragTarget && dockDragTarget !== "swap" && (
                <div className={`dock-drop-indicator dock-drop-indicator-${dockDragTarget}`} />
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
          prefill={editorPrefill}
          onClose={handleCloseEditor}
        />
      )}

      <UpdateOptInModal updater={updater} />

      {showPreferences && (
        <PreferencesModal updater={updater} onClose={() => setShowPreferences(false)} />
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
