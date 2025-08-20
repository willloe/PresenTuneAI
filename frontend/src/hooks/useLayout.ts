import { useEffect, useState } from "react";
import { api, type LayoutItem } from "../lib/api";

export function useLayouts() {
  const [items, setItems] = useState<LayoutItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.layouts();
      setItems(data.items || []);
    } catch (e: any) {
      setError(e?.message || "failed to load layouts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return { items, loading, error, refresh };
}
