import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function useHealth() {
  const [health, setHealth] = useState<"checking" | "ok" | "error">("checking");
  const [schemaVersion, setSchemaVersion] = useState<string | null>(null);

  async function refresh() {
    try {
      const { data } = await api.healthWithMeta();
      setHealth("ok");
      setSchemaVersion((data as any)?.schema_version ?? null);
    } catch {
      setHealth("error");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return { health, schemaVersion, refresh };
}
