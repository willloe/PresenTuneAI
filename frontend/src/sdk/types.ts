// Central SDK types (frontend-facing)
// Re-export core models and API metadata in one place.

export type { Deck, Slide } from "../types/deck";
export type { ApiMeta, ExportResp } from "../lib/api";

// Canonical request payload for outline endpoints (matches backend OutlineRequest)
export type OutlineRequest = {
  topic?: string | null;
  text?: string | null;
  slide_count?: number; // 1..15 (backend clamps)
};
