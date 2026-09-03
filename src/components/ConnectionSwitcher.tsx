import { useState, useRef, useEffect } from "react";
import {
  ChevronDown,
  Plus,
  Upload,
  Download,
  Copy,
  Wifi,
  WifiOff,
  Loader,
  GripVertical,
} from "lucide-react";
import type { Connection } from "@/types";
import { useApp } from "@/contexts/AppContext";
import { useConnectionDrag } from "@/hooks/useConnectionDrag";
import * as api from "@/utils/api";

interface ConnectionSwitcherProps {
  onAddNew: () => void;
  onImport: () => void;
}

export function ConnectionSwitcher({ onAddNew, onImport }: ConnectionSwitcherProps) {
  const {
    data,
    activeConnection,
    connectionStatus,
    switchConnection,
    duplicateConnection,
    reorderConnections,
  } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { dragId, dragOverId, dragOverSide, recentDragRef, handleDragStart, handleDragOver } =
    useConnectionDrag({ connections: data.connections, reorderConnections });
  const canReorder = data.connections.length > 1;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getStatusIcon = () => {
    switch (connectionStatus) {
      case "connected":
        return <Wifi size={14} className="status-icon connected" />;
      case "connecting":
        return <Loader size={14} className="status-icon connecting" />;
      case "error":
        return <WifiOff size={14} className="status-icon error" />;
      default:
        return <WifiOff size={14} className="status-icon disconnected" />;
    }
  };

  const handleSelect = async (id: string) => {
    if (recentDragRef.current) return;
    setIsOpen(false);
    if (id !== activeConnection?.id) {
      await switchConnection(id);
    }
  };

  const handleAddNew = () => {
    setIsOpen(false);
    onAddNew();
  };

  const handleImport = () => {
    setIsOpen(false);
    onImport();
  };

  const handleExport = async (e: React.MouseEvent, conn: Connection) => {
    e.stopPropagation();
    setIsOpen(false);
    await api.exportConnection(conn);
  };

  const handleDuplicate = async (e: React.MouseEvent, conn: Connection) => {
    e.stopPropagation();
    setIsOpen(false);
    await duplicateConnection(conn.id);
  };

  const handleDragHandleMouseDown = (e: React.MouseEvent, conn: Connection) => {
    e.preventDefault();
    e.stopPropagation();
    handleDragStart(conn.id);
  };

  const handleRowMouseOver = (e: React.MouseEvent<HTMLDivElement>, conn: Connection) => {
    if (dragId === null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    handleDragOver(conn.id, e.clientY < rect.top + rect.height / 2 ? "top" : "bottom");
  };

  const rowClassName = (conn: Connection) => {
    const classes = ["connection-option"];
    if (conn.id === activeConnection?.id) classes.push("active");
    if (conn.id === dragId) {
      classes.push("dragging");
    } else if (dragId !== null && conn.id === dragOverId) {
      classes.push("drag-over", `drag-${dragOverSide}`);
    }
    return classes.join(" ");
  };

  if (!activeConnection) return null;

  return (
    <div className="connection-switcher" ref={dropdownRef}>
      <button className="connection-switcher-button" onClick={() => setIsOpen(!isOpen)}>
        {getStatusIcon()}
        <span className="connection-name">{activeConnection.name}</span>
        <ChevronDown size={16} className={`chevron ${isOpen ? "open" : ""}`} />
      </button>

      {isOpen && (
        <div className={`connection-dropdown ${dragId !== null ? "reordering" : ""}`}>
          {data.connections.map((conn) => (
            <div
              key={conn.id}
              className={rowClassName(conn)}
              onClick={() => handleSelect(conn.id)}
              onMouseEnter={(e) => handleRowMouseOver(e, conn)}
              onMouseMove={dragId !== null ? (e) => handleRowMouseOver(e, conn) : undefined}
            >
              <div className="connection-option-info">
                <span className="connection-option-name">{conn.name}</span>
                <span className="connection-option-broker">{conn.broker_url}</span>
              </div>
              <div className="connection-option-actions">
                <button
                  className="connection-action-btn"
                  onClick={(e) => handleDuplicate(e, conn)}
                  title="Duplicate connection"
                >
                  <Copy size={14} />
                </button>
                <button
                  className="connection-action-btn"
                  onClick={(e) => handleExport(e, conn)}
                  title="Export connection"
                >
                  <Upload size={14} />
                </button>
                {canReorder && (
                  <span
                    className="connection-drag-handle"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => handleDragHandleMouseDown(e, conn)}
                    title="Drag to reorder"
                  >
                    <GripVertical size={14} />
                  </span>
                )}
              </div>
            </div>
          ))}
          <div className="connection-dropdown-divider" />
          <button className="connection-option add-new" onClick={handleAddNew}>
            <Plus size={16} />
            <span>Add Connection</span>
          </button>
          <button className="connection-option add-new" onClick={handleImport}>
            <Download size={16} />
            <span>Import Connection</span>
          </button>
        </div>
      )}
    </div>
  );
}
