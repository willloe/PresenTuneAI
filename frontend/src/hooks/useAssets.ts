import { useEffect, useState } from "react";
import { listAssets, type Asset, assetFileUrl } from "../lib/assets";

export function useAssets(uploadId?: string | null) {
  const [items, setItems] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!uploadId) {
        setItems([]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const assets = await listAssets(uploadId);
        if (!cancelled) setItems(assets);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load assets");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [uploadId]);

  const url = (id: string) => (uploadId ? assetFileUrl(uploadId, id) : "");

  return { items, loading, error, url };
}
