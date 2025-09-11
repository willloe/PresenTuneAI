import { useEffect, useState } from "react";
import { api, type LayoutItem, type LayoutRecommendBatchResponse, type LayoutRecommendSlideSummary } from "../lib/api";

export function useLayouts() {
  const [items, setItems] = useState<LayoutItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const pageSize = 50; // fetch lots per page; tune if needed
      // first page
      const first = await api.layouts({ page: 1, page_size: pageSize });
      let all: LayoutItem[] = first.data.items || [];
      const total = first.data.total ?? all.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));

      if (totalPages > 1) {
        const promises: Promise<any>[] = [];
        for (let p = 2; p <= totalPages; p++) {
          promises.push(api.layouts({ page: p, page_size: pageSize }));
        }
        const rest = await Promise.all(promises);
        for (const r of rest) all = all.concat(r.data.items || []);
      }

      // de-dupe by id
      const seen = new Set<string>();
      const uniq = all.filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true)));

      setItems(uniq);
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

/** OPTIONAL helper: batch recommendation wrapper (Top-K + slots + reasons) */
export async function recommendLayoutsBatch(
  slides: LayoutRecommendSlideSummary[],
  top_k = 5
): Promise<LayoutRecommendBatchResponse> {
  const { data } = await api.recommendLayoutsBatch({ slides, top_k });
  return data;
}
