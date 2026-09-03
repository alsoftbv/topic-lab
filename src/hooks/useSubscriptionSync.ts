import { useEffect, useRef } from "react";
import type { QoS } from "@/types";
import * as api from "@/utils/api";
import { useApp } from "@/contexts/AppContext";

const EMPTY_SUBSCRIPTIONS: string[] = [];
const EMPTY_VARIABLES: Record<string, string> = {};

export function useSubscriptionSync() {
  const { connectionStatus, activeConnection } = useApp();
  const activeResolvedRef = useRef(new Map<string, string>());
  const reconcileGenRef = useRef(0);

  const subscriptions = activeConnection?.subscriptions ?? EMPTY_SUBSCRIPTIONS;
  const variables = activeConnection?.variables ?? EMPTY_VARIABLES;

  useEffect(() => {
    const current = activeResolvedRef.current;
    if (connectionStatus !== "connected") {
      current.clear();
      return;
    }

    const gen = ++reconcileGenRef.current;
    const isStale = () => gen !== reconcileGenRef.current;

    (async () => {
      const desired = new Map<string, string>();
      for (const t of subscriptions) {
        const resolved = await api.resolveTemplate(t, variables).catch(() => t);
        if (isStale()) return;
        desired.set(t, resolved);
      }

      for (const [t, resolved] of Array.from(current)) {
        if (desired.get(t) === resolved) continue;
        current.delete(t);
        try {
          await api.unsubscribe(resolved);
        } catch (err) {
          console.error("Unsubscribe failed for", t, err);
        }
        if (isStale()) return;
      }

      for (const [t, resolved] of desired) {
        if (current.get(t) === resolved) continue;
        try {
          await api.subscribe(resolved, "atmostonce" as QoS);
          current.set(t, resolved);
        } catch (err) {
          console.error("Subscribe failed for", t, err);
        }
        if (isStale()) return;
      }
    })();
  }, [connectionStatus, subscriptions, variables]);
}
