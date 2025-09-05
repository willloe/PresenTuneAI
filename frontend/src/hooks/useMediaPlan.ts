import { useCallback, useState } from "react";

export type MediaSlotPlan = {
  /** where did this come from? */
  source?: "library" | "generated" | "external" | "empty";
  url?: string;
  alt?: string;
  fit?: "cover" | "contain" | "fill";
  asset_id?: string | null;
};

export type MediaPlan = Record<string, MediaSlotPlan[]>; // slide_id -> slots

/**
 * Minimal slot-aware media plan.
 * - You can "ensure" a number of slots per slide (we'll pad with {source:'empty'})
 * - You can set or clear individual slots without touching your Deck state yet.
 * - Optional: keep this plan in sync with your Deck when you wire Workbench.
 */
export function useMediaPlan() {
  const [plan, setPlan] = useState<MediaPlan>({});

  const ensureSlots = useCallback((slideId: string, count: number) => {
    if (!Number.isFinite(count) || count < 0) return;
    setPlan((prev) => {
      const arr = prev[slideId]?.slice() ?? [];
      // pad with empties
      while (arr.length < count) arr.push({ source: "empty" });
      // trim extras
      if (arr.length > count) arr.length = count;
      return { ...prev, [slideId]: arr };
    });
  }, []);

  const setSlot = useCallback((slideId: string, slotIndex: number, patch: MediaSlotPlan) => {
    if (!Number.isFinite(slotIndex) || slotIndex < 0) return;
    setPlan((prev) => {
      const arr = prev[slideId]?.slice() ?? [];
      while (arr.length <= slotIndex) arr.push({ source: "empty" });
      arr[slotIndex] = { ...arr[slotIndex], ...patch };
      return { ...prev, [slideId]: arr };
    });
  }, []);

  const removeSlot = useCallback((slideId: string, slotIndex: number) => {
    if (!Number.isFinite(slotIndex) || slotIndex < 0) return;
    setPlan((prev) => {
      const arr = prev[slideId]?.slice() ?? [];
      if (!arr.length) return prev;
      // mark as empty rather than reindexing
      if (slotIndex < arr.length) arr[slotIndex] = { source: "empty" };
      return { ...prev, [slideId]: arr };
    });
  }, []);

  const clearSlide = useCallback((slideId: string) => {
    setPlan((prev) => {
      if (!(slideId in prev)) return prev;
      const next = { ...prev };
      delete next[slideId];
      return next;
    });
  }, []);

  return { plan, ensureSlots, setSlot, removeSlot, clearSlide };
}
