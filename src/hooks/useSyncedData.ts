import { useState, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import type { AppData, DataSnapshot } from "@/types";
import * as api from "@/utils/api";

export const EMPTY_DATA: AppData = { connections: [] };

function sameValue<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function keepUnchanged(prev: AppData, next: AppData): AppData {
  const connections = next.connections.map((connection) => {
    const previous = prev.connections.find((c) => c.id === connection.id);
    return previous && sameValue(previous, connection) ? previous : connection;
  });
  const settings = sameValue(prev.settings, next.settings) ? prev.settings : next.settings;
  const unchanged =
    connections.length === prev.connections.length &&
    connections.every((c, i) => c === prev.connections[i]) &&
    settings === prev.settings &&
    next.last_connection_id === prev.last_connection_id;
  return unchanged ? prev : { ...next, connections, settings };
}

export function useSyncedData() {
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const dataRef = useRef<AppData>(EMPTY_DATA);
  const latestRef = useRef<DataSnapshot>({ revision: -1, data: EMPTY_DATA });
  const pendingRef = useRef(0);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  function show(next: AppData) {
    const shown = keepUnchanged(dataRef.current, next);
    dataRef.current = shown;
    setData(shown);
  }

  function receive(snapshot: DataSnapshot) {
    if (snapshot.revision > latestRef.current.revision) {
      latestRef.current = snapshot;
    }
    if (pendingRef.current === 0) {
      show(latestRef.current.data);
    }
  }

  useEffect(() => {
    const unlisten = listen<DataSnapshot>("data-changed", (event) => receive(event.payload));
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  async function load(): Promise<AppData> {
    receive(await api.getData());
    return latestRef.current.data;
  }

  function mutate(
    optimistic: (prev: AppData) => AppData,
    request: (saved: AppData) => Promise<DataSnapshot>
  ): Promise<AppData> {
    pendingRef.current += 1;
    show(optimistic(dataRef.current));
    const result = queueRef.current.then(async () => {
      try {
        receive(await request(latestRef.current.data));
      } finally {
        pendingRef.current -= 1;
        if (pendingRef.current === 0) {
          show(latestRef.current.data);
        }
      }
      return latestRef.current.data;
    });
    queueRef.current = result.catch(() => undefined);
    return result;
  }

  return { data, dataRef, load, mutate };
}
