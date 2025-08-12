import { useState } from "react";
import { api, type ApiMeta, ApiError, type Slide } from "../lib/api";
import type { Deck } from "@/types/deck";

export type OutlineRequest = {
  topic?: string | null;
  text?: string | null;
  slide_count?: number; // 1..15 (backend clamps)
};

export function useOutline() {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<ApiMeta | null>(null);

  function clearError() {
    setError(null);
  }

  async function generate(req: OutlineRequest) {
    setLoading(true);
    setError(null);
    setMeta(null);
    try {
      const { data, meta } = await api.outlineWithMeta({
        topic: req.topic ?? undefined,
        text: req.text ?? undefined,
        slide_count: req.slide_count,
      });
      setDeck(data);
      setMeta(meta);
      return { deck: data, meta };
    } catch (e: any) {
      const msg = e instanceof ApiError ? e.message : "Failed to generate outline";
      setError(msg);
      if (e instanceof ApiError) setMeta(e.meta);
      throw e;
    } finally {
      setLoading(false);
    }
  }

  async function regenerate(index: number, req: OutlineRequest) {
    try {
      const { data: slide, meta } = await api.regenerateSlideWithMeta(index, {
        topic: req.topic ?? undefined,
        text: req.text ?? undefined,
        slide_count: req.slide_count,
      });

      setDeck((prev: Deck | null) => {
        if (!prev) return prev;
        if (index < 0 || index >= prev.slides.length) return prev;
        const slides = [...prev.slides];
        slides[index] = slide as Slide;
        return { ...prev, slides };
      });

      setMeta(meta);
      return { slide, meta };
    } catch (e: any) {
      const msg = e instanceof ApiError ? e.message : "Failed to regenerate slide";
      setError(msg);
      if (e instanceof ApiError) setMeta(e.meta);
      throw e;
    }
  }

  return { deck, loading, error, meta, generate, regenerate, setDeck, clearError };
}
