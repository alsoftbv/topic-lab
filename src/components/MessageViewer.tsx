import { useState, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { ChevronDown, ChevronRight, Plus, X, Trash2, Check } from "lucide-react";
import type { Message, QoS } from "../types";
import * as api from "../utils/api";
import { useApp } from "../contexts/AppContext";
import { substituteVariables } from "../utils/variables";
import { preferences } from "../utils/preferences";
import { Editable } from "./Editable";

const mod = /Mac|iPhone|iPad/.test(navigator.userAgent) ? "\u2318\u2009" : "Ctrl+";

interface MessageViewerProps {
  expanded: boolean;
  onToggle: (expanded: boolean) => void;
  showRawTemplates?: boolean;
}

export function MessageViewer({ expanded, onToggle, showRawTemplates }: MessageViewerProps) {
  const { connectionStatus, activeConnection, updateSubscriptions } = useApp();
  const [topic, setTopic] = useState("");
  const [subscriptions, setSubscriptions] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [height, setHeight] = useState(() => preferences.messageViewerHeight);
  const messagesListRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);

  const savedSubscriptions = activeConnection?.subscriptions ?? [];
  const variables = activeConnection?.variables ?? {};

  async function resubscribeToSaved(topics: string[]) {
    const activeSubs: string[] = [];
    for (const t of topics) {
      const resolved = substituteVariables(t, variables);
      try {
        await api.subscribe(resolved, "atmostonce" as QoS);
        activeSubs.push(t);
      } catch (err) {
        console.error("Resubscribe failed for", t, err);
      }
    }
    setSubscriptions(activeSubs);
  }

  const prevVariablesRef = useRef(variables);

  useEffect(() => {
    if (connectionStatus !== "connected") {
      setSubscriptions([]);
      setMessages([]);
      return;
    }

    api
      .getMessages()
      .then(setMessages)
      .catch(() => {});
    resubscribeToSaved(savedSubscriptions);

    const unlisten = listen<Message>("mqtt-message", (event) => {
      const list = messagesListRef.current;
      if (list) {
        const threshold = 10;
        wasAtBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < threshold;
      }
      setMessages((prev) => {
        const updated = [...prev, event.payload];
        if (updated.length > 100) updated.shift();
        return updated;
      });
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [connectionStatus, savedSubscriptions]);

  useEffect(() => {
    if (connectionStatus !== "connected" || subscriptions.length === 0) return;
    const prev = prevVariablesRef.current;
    prevVariablesRef.current = variables;

    (async () => {
      for (const t of subscriptions) {
        const oldResolved = substituteVariables(t, prev);
        const newResolved = substituteVariables(t, variables);
        if (oldResolved === newResolved) continue;
        try {
          await api.unsubscribe(oldResolved);
        } catch {}
        try {
          await api.subscribe(newResolved, "atmostonce" as QoS);
        } catch {}
      }
    })();
  }, [JSON.stringify(variables)]);

  useEffect(() => {
    const list = messagesListRef.current;
    if (list && wasAtBottomRef.current) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages]);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || connectionStatus !== "connected") return;
    const t = topic.trim();
    if (subscriptions.includes(t)) {
      setTopic("");
      return;
    }
    const resolved = substituteVariables(t, variables);
    try {
      await api.subscribe(resolved, "atmostonce" as QoS);
      const newSubs = [...subscriptions, t];
      setSubscriptions(newSubs);
      await updateSubscriptions(newSubs);
      setTopic("");
    } catch (err) {
      console.error("Subscribe failed:", err);
    }
  };

  const handleUnsubscribe = async (t: string) => {
    const resolved = substituteVariables(t, variables);
    try {
      await api.unsubscribe(resolved);
      const newSubs = subscriptions.filter((s) => s !== t);
      setSubscriptions(newSubs);
      await updateSubscriptions(newSubs);
    } catch (err) {
      console.error("Unsubscribe failed:", err);
    }
  };

  const [editingSub, setEditingSub] = useState<string | null>(null);
  const editSubRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = editSubRef.current;
    if (!editingSub || !el) return;
    el.textContent = editingSub;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [editingSub]);

  const saveSubEdit = async (oldTopic: string) => {
    if (!editSubRef.current) return;
    const newTopic = (editSubRef.current.textContent || "").trim();
    setEditingSub(null);
    if (!newTopic || newTopic === oldTopic) return;

    const oldResolved = substituteVariables(oldTopic, variables);
    const newResolved = substituteVariables(newTopic, variables);
    try {
      await api.unsubscribe(oldResolved);
      await api.subscribe(newResolved, "atmostonce" as QoS);
      const newSubs = subscriptions.map((s) => (s === oldTopic ? newTopic : s));
      setSubscriptions(newSubs);
      await updateSubscriptions(newSubs);
    } catch (err) {
      console.error("Edit subscription failed:", err);
    }
  };

  const handleClear = async () => {
    try {
      await api.clearMessages();
      setMessages([]);
    } catch (e) {
      console.error("Clear messages failed:", e);
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  const handleResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = height;
    let newHeight = height;

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (e: MouseEvent) => {
      newHeight = Math.max(100, Math.min(600, startHeight + e.clientY - startY));
      setHeight(newHeight);
    };

    const onMouseUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      preferences.messageViewerHeight = newHeight;
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const isConnected = connectionStatus === "connected";

  return (
    <div className="message-viewer">
      <button
        className="message-viewer-header"
        onClick={() => onToggle(!expanded)}
        title={`Toggle (${mod}I)`}
      >
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span>Message Viewer</span>
        {subscriptions.length > 0 && (
          <span className="badge">
            {subscriptions.length} sub{subscriptions.length !== 1 && "s"}
          </span>
        )}
        {messages.length > 0 && (
          <span className="badge">
            {messages.length} msg{messages.length !== 1 && "s"}
          </span>
        )}
      </button>

      {expanded && (
        <div className="message-viewer-content" style={{ height }}>
          <div className="message-viewer-left">
            <form className="subscribe-form" onSubmit={handleSubscribe}>
              <input
                type="text"
                placeholder="Topic to subscribe..."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={!isConnected}
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              <button
                type="submit"
                className="btn btn-small"
                disabled={!isConnected || !topic.trim()}
              >
                <Plus size={14} />
              </button>
            </form>

            {subscriptions.length > 0 && (
              <div className="subscriptions-list">
                {subscriptions.map((sub) => (
                  <div key={sub} className="subscription-item">
                    <Editable
                      as="code"
                      ref={editingSub === sub ? editSubRef : undefined}
                      className={editingSub !== sub ? "sub-editable" : undefined}
                      contentEditable={editingSub === sub}
                      onClick={() => {
                        if (editingSub !== sub) setEditingSub(sub);
                      }}
                      onKeyDown={(e) => {
                        if (editingSub !== sub) return;
                        if (e.key === "Enter") {
                          e.preventDefault();
                          saveSubEdit(sub);
                        }
                        if (e.key === "Escape") setEditingSub(null);
                      }}
                      onBlur={() => {
                        if (editingSub === sub) setEditingSub(null);
                      }}
                    >
                      {editingSub !== sub
                        ? showRawTemplates
                          ? sub
                          : substituteVariables(sub, variables)
                        : null}
                    </Editable>
                    {editingSub === sub ? (
                      <button
                        className="btn-icon"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          saveSubEdit(sub);
                        }}
                        title="Save"
                      >
                        <Check size={14} />
                      </button>
                    ) : (
                      <button
                        className="btn-icon"
                        onClick={() => handleUnsubscribe(sub)}
                        title="Unsubscribe"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="messages-area">
            {messages.length === 0 ? (
              <div className="empty-messages">
                {subscriptions.length === 0 ? "Subscribe to topics" : "Waiting..."}
              </div>
            ) : (
              <>
                <div className="messages-header">
                  <span>
                    {messages.length} msg{messages.length !== 1 && "s"}
                  </span>
                  <button className="btn-icon" onClick={handleClear} title="Clear messages">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="messages-list" ref={messagesListRef}>
                  {messages.map((msg, i) => (
                    <div key={`${msg.timestamp}-${i}`} className="message-item">
                      <div className="message-meta">
                        <code className="message-topic">{msg.topic}</code>
                        <span className="message-time">{formatTime(msg.timestamp)}</span>
                      </div>
                      <pre className="message-payload">{msg.payload || "(empty)"}</pre>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {expanded && <div className="resize-handle" onMouseDown={handleResize} />}
    </div>
  );
}
