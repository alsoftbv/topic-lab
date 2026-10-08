import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import * as api from "@/utils/api";

export function useConnectionImport() {
  const { importConnection } = useApp();
  const [importError, setImportError] = useState<string | null>(null);

  async function handleImport() {
    setImportError(null);
    try {
      const connectionData = await api.importConnection();
      if (connectionData) {
        await importConnection(connectionData);
      }
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Failed to import connection");
    }
  }

  return { importError, handleImport };
}
