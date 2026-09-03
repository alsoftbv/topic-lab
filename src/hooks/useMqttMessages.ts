import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import type { Message } from "@/types";
import * as api from "@/utils/api";
import { useApp } from "@/contexts/AppContext";

const MAX_MESSAGES = 100;

function messageKey(m: Message): string {
  return `${m.timestamp}|${m.topic}|${m.payload}`;
}

export function useMqttMessages() {
  const { connectionStatus } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    if (connectionStatus !== "connected") {
      setMessages([]);
      return;
    }

    let cancelled = false;
    const unlisten = listen<Message>("mqtt-message", (event) => {
      setMessages((prev) => [...prev, event.payload].slice(-MAX_MESSAGES));
    });

    api
      .getMessages()
      .then((history) => {
        if (cancelled) return;
        setMessages((prev) => {
          const seen = new Set(prev.map(messageKey));
          const fresh = history.filter((m) => !seen.has(messageKey(m)));
          return [...fresh, ...prev].slice(-MAX_MESSAGES);
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unlisten.then((fn) => fn());
    };
  }, [connectionStatus]);

  const clearMessages = async () => {
    try {
      await api.clearMessages();
      setMessages([]);
    } catch (e) {
      console.error("Clear messages failed:", e);
    }
  };

  return { messages, clearMessages };
}
