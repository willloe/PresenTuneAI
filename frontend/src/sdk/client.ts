/**
 * PresenTuneAI — SDK (thin wrapper)
 * Normalizes nulls, re-exports errors/base, and returns typed results.
 */
import {
  api as rawApi,
  API_BASE,
  ApiError,
  type ApiMeta,
  exportDownloadUrl as coreExportDownloadUrl,
} from "../lib/api";
import type { Deck } from "../types/deck";
import type { OutlineRequest, ExportResp } from "./types";

// Re-exports for convenience
export { API_BASE, ApiError };
export type { ApiMeta };

// Handy consumer types
export type Slide = Deck["slides"][number];

// Normalize nullable fields to the shape lib/api expects
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
export async function healthWithMeta(): Promise<{
  data: { status: string; schema_version?: string; time?: string };
  meta: ApiMeta;
}> {
  return rawApi.healthWithMeta();
}

/** Outline */
export async function outline(body: OutlineRequest): Promise<Deck> {
  return rawApi.outline(normalize(body));
}
export async function outlineWithMeta(
  body: OutlineRequest
): Promise<{ data: Deck; meta: ApiMeta }> {
  return rawApi.outlineWithMeta(normalize(body));
}

/** Regenerate a single slide (0-based index) */
export async function regenerateSlide(
  index: number,
  body: OutlineRequest
): Promise<Slide> {
  return rawApi.regenerateSlide(index, normalize(body));
}
export async function regenerateSlideWithMeta(
  index: number,
  body: OutlineRequest
): Promise<{ data: Slide; meta: ApiMeta }> {
  return rawApi.regenerateSlideWithMeta(index, normalize(body));
}

/** Export (.txt/.pptx, etc.) */
export async function exportDeck(payload: {
  slides?: Deck["slides"];
  // if you’ve built an editor doc already, you can also pass:
  // editor?: import("../lib/api").EditorDocOut;
  theme?: string | null;
}): Promise<{ data: ExportResp; meta: ApiMeta }> {
  return rawApi.exportDeck(payload);
}

/** Build a download URL for /export/{filename} from a server path or name */
export function exportDownloadUrl(pathOrName: string): string {
  return coreExportDownloadUrl(pathOrName);
}
