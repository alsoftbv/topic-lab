import { useState, useEffect } from "react";
import { Send, SquarePlus, GripVertical } from "lucide-react";
import type { QoS } from "@/types";
import * as api from "@/utils/api";
import { useApp } from "@/contexts/AppContext";
import { templateHasBuiltin } from "@/utils/builtins";
import { modKey } from "@/utils/platform";

const EMPTY_VARIABLES: Record<string, string> = {};

export interface PublishDraft {
  topic: string;
  payload: string;
}

interface PublishPaneProps {
  draft: PublishDraft;
  onDraftChange: (draft: PublishDraft) => void;
  showRawTemplates?: boolean;
  isDropTarget: boolean;
  onDragStart: (x: number, y: number, pane: "publish") => void;
  onMakeButton: (draft: PublishDraft) => void;
}

export function PublishPane({
  draft,
  onDraftChange,
  showRawTemplates,
  isDropTarget,
  onDragStart,
  onMakeButton,
}: PublishPaneProps) {
  const { connectionStatus, activeConnection } = useApp();
  const [focus, setFocus] = useState<"topic" | "payload" | null>(null);
  const [resolved, setResolved] = useState<PublishDraft>({ topic: "", payload: "" });
  const [sendError, setSendError] = useState<string | null>(null);

  const variables = activeConnection?.variables ?? EMPTY_VARIABLES;
  const isConnected = connectionStatus === "connected";
  const hasTopic = draft.topic.trim().length > 0;

  useEffect(() => {
    let cancelled = false;
    const compute = () => {
      api
        .resolveTemplates([draft.topic, draft.payload], variables)
        .then(([topic, payload]) => {
          if (cancelled) return;
          setResolved((prev) =>
            prev.topic === topic && prev.payload === payload ? prev : { topic, payload }
          );
        })
        .catch(() => {});
    };
    compute();
    const hasBuiltins = templateHasBuiltin(draft.topic) || templateHasBuiltin(draft.payload);
    const interval = hasBuiltins ? window.setInterval(compute, 1000) : undefined;
    return () => {
      cancelled = true;
      if (interval !== undefined) clearInterval(interval);
    };
  }, [draft.topic, draft.payload, variables]);

  const send = async () => {
    const topic = draft.topic.trim();
    if (!topic || !isConnected) return;
    setSendError(null);
    try {
      await api.publish(topic, draft.payload, "atmostonce" as QoS, false, variables);
    } catch (err) {
      setSendError(String(err));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send();
  };

  const handlePayloadKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      send();
    }
  };

  const shownTopic = showRawTemplates || focus === "topic" ? draft.topic : resolved.topic;
  const shownPayload = showRawTemplates || focus === "payload" ? draft.payload : resolved.payload;

  return (
    <section
      className={`pane publish-pane${isDropTarget ? " pane-drop-target" : ""}`}
      data-pane="publish"
    >
      <div className="pane-header">
        <span className="pane-title">Publish</span>
        <button
          type="button"
          className="btn-icon"
          onClick={() => onMakeButton(draft)}
          disabled={!hasTopic}
          title="Make button"
        >
          <SquarePlus size={14} />
        </button>
        <span
          className="pane-drag-handle"
          title="Drag to reposition"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDragStart(e.clientX, e.clientY, "publish");
          }}
        >
          <GripVertical size={14} />
        </span>
      </div>

      <form className="pane-body publish-form" onSubmit={handleSubmit}>
        <div className="publish-topic-row">
          <input
            type="text"
            name="topic"
            placeholder="Topic"
            value={shownTopic}
            onChange={(e) => onDraftChange({ ...draft, topic: e.target.value })}
            onFocus={() => setFocus("topic")}
            onBlur={() => setFocus(null)}
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <button
            type="submit"
            className="btn btn-small btn-icon-only"
            disabled={!isConnected || !hasTopic}
            title={`Send (${modKey}Enter in the payload)`}
          >
            <Send size={14} />
          </button>
        </div>
        <textarea
          name="payload"
          placeholder="Payload"
          value={shownPayload}
          onChange={(e) => onDraftChange({ ...draft, payload: e.target.value })}
          onFocus={() => setFocus("payload")}
          onBlur={() => setFocus(null)}
          onKeyDown={handlePayloadKeyDown}
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        {sendError && <div className="send-error">{sendError}</div>}
      </form>
    </section>
  );
}
