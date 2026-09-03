import { useState, useEffect, useRef } from "react";
import { Plus, X, Trash2, Check, GripVertical } from "lucide-react";
import type { Message } from "@/types";
import { useApp } from "@/contexts/AppContext";
import { Editable } from "./Editable";

const EMPTY_SUBSCRIPTIONS: string[] = [];

interface MessagesPaneProps {
  messages: Message[];
  onClearMessages: () => void;
  showRawTemplates?: boolean;
  isDropTarget: boolean;
  onDragStart: (x: number, y: number, pane: "messages") => void;
}

export function MessagesPane({
  messages,
  onClearMessages,
  showRawTemplates,
  isDropTarget,
  onDragStart,
}: MessagesPaneProps) {
  const { connectionStatus, activeConnection, updateSubscriptions, resolvedSubscriptions } =
    useApp();
  const [topic, setTopic] = useState("");
  const [editingSub, setEditingSub] = useState<string | null>(null);
  const editSubRef = useRef<HTMLElement>(null);
  const messagesListRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  const subscriptions = activeConnection?.subscriptions ?? EMPTY_SUBSCRIPTIONS;
  const isConnected = connectionStatus === "connected";

  useEffect(() => {
    const list = messagesListRef.current;
    if (list && stickToBottomRef.current) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages]);

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

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = topic.trim();
    if (!t || !isConnected) return;
    if (!subscriptions.includes(t)) {
      await updateSubscriptions([...subscriptions, t]);
    }
    setTopic("");
  };

  const handleUnsubscribe = async (t: string) => {
    await updateSubscriptions(subscriptions.filter((s) => s !== t));
  };

  const saveSubEdit = async (oldTopic: string) => {
    if (!editSubRef.current) return;
    const newTopic = (editSubRef.current.textContent || "").trim();
    setEditingSub(null);
    if (!newTopic || newTopic === oldTopic) return;
    await updateSubscriptions(subscriptions.map((s) => (s === oldTopic ? newTopic : s)));
  };

  const handleListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 10;
  };

  const formatTime = (timestamp: number) => new Date(timestamp).toLocaleTimeString();

  return (
    <section
      className={`pane messages-pane${isDropTarget ? " pane-drop-target" : ""}`}
      data-pane="messages"
    >
      <div className="pane-header">
        <span className="pane-title">Messages</span>
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
        <span
          className="pane-drag-handle"
          title="Drag to reposition"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDragStart(e.clientX, e.clientY, "messages");
          }}
        >
          <GripVertical size={14} />
        </span>
      </div>

      <div className="pane-body">
        <div className="messages-toolbar">
          <form className="subscribe-form" onSubmit={handleSubscribe}>
            <input
              type="text"
              placeholder="Topic to subscribe to"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={!isConnected}
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            <button
              type="submit"
              className="btn btn-small btn-icon-only"
              disabled={!isConnected || !topic.trim()}
              title="Subscribe"
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
                        : (resolvedSubscriptions[sub] ?? sub)
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
                <button className="btn-icon" onClick={onClearMessages} title="Clear messages">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="messages-list" ref={messagesListRef} onScroll={handleListScroll}>
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
    </section>
  );
}
