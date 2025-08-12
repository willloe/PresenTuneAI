/**
 * PresenTuneAI — SDK (thin wrapper)
 * Normalizes nulls, re-exports errors/base, and returns typed results.
 */
import {
  api as rawApi,
  API_BASE,
  ApiError,
  type ApiMeta,
} from "../lib/api";
import type { Deck } from "../types/deck";
import type { OutlineRequest, ExportResp } from "./types";

export { API_BASE, ApiError };
export type { ApiMeta };

/** Convert nullable fields to the shape lib/api expects */
function normalize(req: OutlineRequest): {
  topic?: string;
  text?: string;
  slide_count?: number;
} {
  return {
    topic: req.topic ?? undefined,
    text: req.text ?? undefined,
    slide_count: req.slide_count,
  };
}

/** Health */
export async function health() {
  return rawApi.health();
}
export async function healthWithMeta() {
  return rawApi.healthWithMeta();
}

/** Outline */
export async function outline(body: OutlineRequest): Promise<Deck> {
  return rawApi.outline(normalize(body));
}
export async function outlineWithMeta(body: OutlineRequest) {
  return rawApi.outlineWithMeta(normalize(body));
}

/** Regenerate a single slide (0-based index) */
export async function regenerateSlide(index: number, body: OutlineRequest) {
  return rawApi.regenerateSlide(index, normalize(body));
}
export async function regenerateSlideWithMeta(index: number, body: OutlineRequest) {
  return rawApi.regenerateSlideWithMeta(index, normalize(body));
}

/** Export (.txt stub) */
export async function exportDeck(payload: {
  slides: Deck["slides"];
  theme?: string | null;
}): Promise<{ data: ExportResp; meta: ApiMeta }> {
  // rawApi.exportDeck already returns { data, meta }
  return rawApi.exportDeck(payload);
}

/** JSON Schemas */
export const schema = {
  deck: () => rawApi.schema.deck(),
  slide: () => rawApi.schema.slide(),
};
