import { useEffect, useMemo, useState, useCallback } from "react";
import { listAssets, type Asset, assetFileUrl } from "../lib/assets";

/** We don't assume lib/assets provides dimensions; we enrich them client-side. */
export type EnrichedAsset = Asset & {
  width?: number;
  height?: number;
  aspect?: number; // width / height
};

type Options = {
  /** Try to load image naturalWidth/Height in the browser. Default: true */
  withMeta?: boolean;
};

export function useAssets(uploadId?: string | null, opts: Options = { withMeta: true }) {
  const [items, setItems] = useState<EnrichedAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build a file URL for an asset id
  const url = (id: string) => (uploadId ? assetFileUrl(uploadId, id) : "");

  // 1) Load the asset list
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
        if (!cancelled) setItems(assets as EnrichedAsset[]);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load assets");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uploadId]);

  // 2) Enrich with naturalWidth/Height if not present (safe, best-effort)
  useEffect(() => {
    if (!opts.withMeta) return;
    if (!uploadId || items.length === 0) return;

    let mounted = true;

    const toMeasure = items.filter((a) => a.width == null || a.height == null);
    if (toMeasure.length === 0) return;

    const measureOne = (id: string) =>
      new Promise<{ id: string; width?: number; height?: number }>((resolve) => {
        const img = new Image();
        // If your CDN requires it, uncomment:
        // img.crossOrigin = "anonymous";
        img.onload = () => resolve({ id, width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve({ id }); // ignore errors, keep original asset
        img.src = url(id);
      });

    (async () => {
      const results = await Promise.all(toMeasure.map((a) => measureOne(a.id)));
      if (!mounted) return;
      const dims = new Map(results.map((r) => [r.id, r]));
      setItems((prev) =>
        prev.map((a) => {
          const d = dims.get(a.id);
          if (!d || !d.width || !d.height) return a;
          const aspect = d.width && d.height ? d.width / d.height : undefined;
          return { ...a, width: d.width, height: d.height, aspect };
        })
      );
    })();

    return () => {
      mounted = false;
    };
  }, [uploadId, items, opts.withMeta]); // items is okay here; we only update those missing dims

  // 3) Helper: simple fit heuristic for a given frame
  const getFitForFrame = useCallback(
    (id: string, frameW: number, frameH: number): "cover" | "contain" => {
      const a = items.find((x) => x.id === id);
      if (!a?.width || !a?.height || !Number.isFinite(frameW) || !Number.isFinite(frameH)) {
        return "cover"; // default looks better most of the time
      }
      const imgR = a.width / a.height;
      const frameR = frameW / frameH;
      const mismatch = imgR > frameR ? imgR / frameR : frameR / imgR;

      // Heuristic:
      // - if aspect mismatch is large, prefer 'contain' to avoid aggressive cropping
      // - otherwise fill nicely with 'cover'
      return mismatch > 1.6 ? "contain" : "cover";
    },
    [items]
  );

  // Memoize a lightweight lookup by id (useful for drawers/inspectors)
  const byId = useMemo(() => new Map(items.map((a) => [a.id, a])), [items]);

  return { items, loading, error, url, byId, getFitForFrame };
}
