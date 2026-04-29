import { useState, useRef, useEffect } from "react";
import { message } from "../utils/dialog";
import { Trash2, Check, X } from "lucide-react";
import { useApp } from "../contexts/AppContext";
import { isBuiltinVariable } from "../utils/builtins";
import { Editable } from "./Editable";

export function VariablesPanel() {
  const { activeConnection, updateConnection, updateVariables } = useApp();
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [editing, setEditing] = useState<{
    originalKey: string;
    field: "key" | "value";
  } | null>(null);
  const [historyOpen, setHistoryOpen] = useState<string | null>(null);
  const editRef = useRef<HTMLElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);

  const variables = activeConnection?.variables || {};
  const variableHistory = activeConnection?.variable_history || {};

  useEffect(() => {
    if (!historyOpen) return;
    function handleClick(e: MouseEvent) {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setHistoryOpen(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [historyOpen]);

  const handleHistorySelect = async (key: string, value: string) => {
    setHistoryOpen(null);
    setEditing(null);
    await updateVariables({ ...variables, [key]: value });
  };

  const handleHistoryDelete = async (key: string, value: string) => {
    if (!activeConnection) return;
    const history = { ...variableHistory };
    history[key] = (history[key] || []).filter((v) => v !== value);
    if (history[key].length === 0) delete history[key];
    await updateConnection({ ...activeConnection, variable_history: history });
  };

  useEffect(() => {
    const el = editRef.current;
    if (!editing || !el) return;
    el.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [editing]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = newKey.trim();
    if (!key) return;

    if (isBuiltinVariable(key)) {
      message(`"${key}" is a reserved built-in variable name`, {
        title: "Reserved Name",
        kind: "error",
      });
      return;
    }

    await updateVariables({
      ...variables,
      [key]: newValue,
    });

    setNewKey("");
    setNewValue("");
  };

  const handleSave = async (originalKey: string, field: "key" | "value") => {
    const el = editRef.current;
    if (!el) return;
    savingRef.current = true;
    const trimmed = (el.textContent || "").trim();

    if (field === "key") {
      if (!trimmed || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
        el.textContent = originalKey;
        savingRef.current = false;
        setEditing(null);
        return;
      }
      if (isBuiltinVariable(trimmed)) {
        el.textContent = originalKey;
        savingRef.current = false;
        setEditing(null);
        message(`"${trimmed}" is a reserved built-in variable name`, {
          title: "Reserved Name",
          kind: "error",
        });
        return;
      }
      if (trimmed !== originalKey) {
        const updated: Record<string, string> = {};
        for (const [k, v] of Object.entries(variables)) {
          updated[k === originalKey ? trimmed : k] = v;
        }

        const pattern = `{${originalKey}}`;
        const buttons = activeConnection?.buttons || [];
        const subscriptions = activeConnection?.subscriptions || [];
        const affectedButtons = buttons.filter(
          (b) => b.topic.includes(pattern) || (b.payload || "").includes(pattern)
        );
        const affectedSubs = subscriptions.filter((s) => s.includes(pattern));
        const totalAffected = affectedButtons.length + affectedSubs.length;

        if (totalAffected > 0 && activeConnection) {
          const parts: string[] = [];
          if (affectedButtons.length > 0) {
            parts.push(`${affectedButtons.length} ${affectedButtons.length === 1 ? "button" : "buttons"}`);
          }
          if (affectedSubs.length > 0) {
            parts.push(`${affectedSubs.length} ${affectedSubs.length === 1 ? "subscription" : "subscriptions"}`);
          }
          const renameLabel = "Rename References";
          const result = await message(
            `${parts.join(" and ")} use {${originalKey}}. Rename references to {${trimmed}}?`,
            {
              title: "Update References",
              kind: "warning",
              buttons: { yes: renameLabel, no: "Don't Rename", cancel: "Cancel" },
            }
          );
          if (result === "Cancel") {
            el.textContent = originalKey;
            savingRef.current = false;
            setEditing(null);
            return;
          }
          if (result === renameLabel) {
            const replacement = `{${trimmed}}`;
            const updatedButtons = buttons.map((b) => ({
              ...b,
              topic: b.topic.split(pattern).join(replacement),
              payload: b.payload ? b.payload.split(pattern).join(replacement) : b.payload,
            }));
            const updatedSubs = subscriptions.map((s) => s.split(pattern).join(replacement));
            await updateConnection({
              ...activeConnection,
              variables: updated,
              buttons: updatedButtons,
              subscriptions: updatedSubs,
            });
            savingRef.current = false;
            setEditing(null);
            return;
          }
        }

        await updateVariables(updated);
      }
    } else {
      await updateVariables({
        ...variables,
        [originalKey]: el.textContent || "",
      });
    }
    savingRef.current = false;
    setEditing(null);
  };

  const handleCancel = (originalKey: string, field: "key" | "value") => {
    if (savingRef.current) return;
    const el = editRef.current;
    if (el) {
      el.textContent = field === "key" ? originalKey : variables[originalKey] || "";
    }
    setEditing(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, originalKey: string, field: "key" | "value") => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave(originalKey, field);
    }
    if (e.key === "Escape") handleCancel(originalKey, field);
  };

  const handleDelete = async (key: string) => {
    const updated = { ...variables };
    delete updated[key];
    await updateVariables(updated);
  };

  const isEditing = (key: string, field: "key" | "value") =>
    editing?.originalKey === key && editing.field === field;

  return (
    <div className="variables-panel">
      <h3>Variables</h3>
      <p className="hint">
        Define variables to use in topics and payloads with {"{variable_name}"}
      </p>

      <div className="variables-list">
        {Object.entries(variables).map(([key, value]) => (
          <div key={key} className="variable-row">
            <Editable
              as="code"
              ref={isEditing(key, "key") ? editRef : undefined}
              className={`variable-key variable-key-editable`}
              contentEditable={isEditing(key, "key")}
              onClick={(e) => {
                if (!isEditing(key, "key")) {
                  e.stopPropagation();
                  setEditing({ originalKey: key, field: "key" });
                }
              }}
              onKeyDown={isEditing(key, "key") ? (e) => handleKeyDown(e, key, "key") : undefined}
              onBlur={isEditing(key, "key") ? () => handleCancel(key, "key") : undefined}
            >
              {key}
            </Editable>
            {isEditing(key, "key") && (
              <button
                className="inline-edit-save"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSave(key, "key");
                }}
                title="Save"
              >
                <Check size={16} />
              </button>
            )}
            <div className="variable-value-wrapper">
              <Editable
                ref={isEditing(key, "value") ? editRef : undefined}
                className={`variable-value variable-value-editable`}
                contentEditable={isEditing(key, "value")}
                onClick={(e) => {
                  if (!isEditing(key, "value")) {
                    e.stopPropagation();
                    setEditing({ originalKey: key, field: "value" });
                    if ((variableHistory[key] || []).length > 0) {
                      setHistoryOpen(key);
                    }
                  }
                }}
                onKeyDown={
                  isEditing(key, "value") ? (e) => handleKeyDown(e, key, "value") : undefined
                }
                onBlur={isEditing(key, "value") ? () => handleCancel(key, "value") : undefined}
              >
                {value}
              </Editable>
              {historyOpen === key && (variableHistory[key] || []).length > 0 && (
                <div className="variable-history-dropdown" ref={historyRef}>
                  {variableHistory[key].map((histValue) => (
                    <div key={histValue} className="variable-history-item">
                      <span
                        className="variable-history-value"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleHistorySelect(key, histValue);
                        }}
                      >
                        {histValue}
                      </span>
                      <button
                        className="variable-history-delete"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleHistoryDelete(key, histValue);
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {isEditing(key, "value") ? (
              <button
                className="inline-edit-save"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSave(key, "value");
                }}
                title="Save"
              >
                <Check size={16} />
              </button>
            ) : !isEditing(key, "key") ? (
              <button className="btn-icon" onClick={() => handleDelete(key)} title="Delete">
                <Trash2 size={16} />
              </button>
            ) : null}
          </div>
        ))}

        {Object.keys(variables).length === 0 && (
          <p className="empty-state">No variables defined yet</p>
        )}
      </div>

      <form className="add-variable-form" onSubmit={handleAdd}>
        <input
          type="text"
          placeholder="Name"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          pattern="[a-zA-Z_][a-zA-Z0-9_]*"
          title="Start with letter or underscore, followed by letters, numbers, or underscores"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <input
          type="text"
          placeholder="Value"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <button type="submit" className="btn btn-small">
          Add
        </button>
      </form>

      <div className="builtins-list">
        <h4>Built-in Variables</h4>
        <div className="builtin-row">
          <code>{"{now}"}</code> <span>ISO timestamp</span>
        </div>
        <div className="builtin-row">
          <code>{"{now:unix}"}</code> <span>Unix seconds</span>
        </div>
        <div className="builtin-row">
          <code>{"{now:unixms}"}</code> <span>Unix milliseconds</span>
        </div>
        <div className="builtin-row">
          <code>{"{now:date}"}</code> <span>Date only</span>
        </div>
        <div className="builtin-row">
          <code>{"{now:time}"}</code> <span>Time only</span>
        </div>
        <div className="builtin-row">
          <code>{"{now:utc}"}</code> <span>UTC timezone</span>
        </div>
        <div className="builtin-row">
          <code>{"{now:+5m}"}</code> <span>Offset (s/m/h/d/w/M/y)</span>
        </div>
        <div className="builtin-row">
          <code>{"{now:fmt:YYYY-MM-DD}"}</code> <span>Custom format</span>
        </div>
        <div className="builtin-row">
          <code>{"{uuid}"}</code> <span>Random UUID v4</span>
        </div>
        <div className="builtin-row">
          <code>{"{random}"}</code> <span>Random 0-100</span>
        </div>
        <div className="builtin-row">
          <code>{"{random:1-1000}"}</code> <span>Custom range</span>
        </div>
      </div>
    </div>
  );
}
