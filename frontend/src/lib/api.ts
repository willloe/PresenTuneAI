// frontend/src/lib/api.ts
import type { Deck } from "../types/deck";
import { request, requestWithMeta } from "./http";
export type { HttpMeta as ApiMeta } from "./http";
export { ApiError } from "./errors";

/** Narrow Slide type from Deck for convenience */
export type Slide = Deck["slides"][number];

/** Keep a single source for the base (matches http.ts) */
export const API_BASE: string =
  (import.meta as any).env?.VITE_API_BASE ??
  ((import.meta as any).env?.DEV ? "http://localhost:8000/v1" : "/v1");

/** Build a download URL from a server path or filename */
export function exportDownloadUrl(serverPath: string) {
  // Tolerate absolute URLs
  if (/^https?:\/\//i.test(serverPath)) return serverPath;

  // Works for Unix/Windows paths: take final segment as the filename
  const name = serverPath.split(/[\\/]/).pop()!;
  const base = String(API_BASE).replace(/\/$/, "");
  return `${base}/export/${encodeURIComponent(name)}`;
}

/* -------------------- Health -------------------- */

export type HealthResp = {
  status: string;
  schema_version?: string;
  time?: string;
};

/* -------------------- Export (new schema) -------------------- */

export type ExportResp = {
  path: string;
  format: "pptx" | "txt";
  theme?: string | null;
  bytes: number;
};

/* -------------------- Layout / Editor types -------------------- */

export type Frame = { x: number; y: number; w: number; h: number };

export type LayoutItem = {
  id: string;
  name: string;
  supports: Record<string, number>;
  weight: number;
  preview_url?: string;
  frames: Record<string, any>;
  style?: Record<string, any>;
};

export type LayoutLibrary = {
  items: LayoutItem[];
  page: number;
  page_size: number;
  total: number;
};

export type LayoutFilterRequest = {
  components: { text_count: number; image_count: number };
  top_k?: number;
};

export type EditorLayer = {
  id: string;
  kind: "textbox" | "image" | "shape";
  frame: Record<string, any>;
  text?: string;
  style?: Record<string, any>;
  source?: Record<string, any>;
  fit?: "cover" | "contain" | "fill";
  z: number;
};

export type EditorSlideOut = {
  id: string;
  name: string;
  background?: Record<string, any>;
  layers: EditorLayer[];
  meta?: Record<string, any>;
};

export type EditorDocOut = {
  editor_id: string;
  deck_id: string;
  version: string;
  page: Record<string, any>;
  theme: string;
  slides: EditorSlideOut[];
  meta?: Record<string, any>;
};

export type EditorBuildResponse = {
  editor: EditorDocOut;
  warnings: Array<Record<string, any>>;
  meta?: Record<string, any>;
};

/* -------------------- API client -------------------- */

export const api = {
  // Health
  health: () => request<HealthResp>("/health"),
  healthWithMeta: () => requestWithMeta<HealthResp>("/health"),

  // Outline
  outline: (body: { topic?: string; text?: string; slide_count?: number }) =>
    request<Deck>("/outline", { method: "POST", body: JSON.stringify(body) }),
  outlineWithMeta: (body: { topic?: string; text?: string; slide_count?: number }) =>
    requestWithMeta<Deck>("/outline", { method: "POST", body: JSON.stringify(body) }),

  // Regenerate a specific slide
  regenerateSlide: (
    index: number,
    body: { topic?: string; text?: string; slide_count?: number }
  ) =>
    request<Slide>(`/outline/${index}/regenerate`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  regenerateSlideWithMeta: (
    index: number,
    body: { topic?: string; text?: string; slide_count?: number }
  ) =>
    requestWithMeta<Slide>(`/outline/${index}/regenerate`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  /* -------------------- Export (new schema) -------------------- */
  // Enforce "either slides or editor" at the type level for callers
  exportDeck: (payload: { slides?: Deck["slides"]; editor?: EditorDocOut; theme?: string | null }) =>
    requestWithMeta<ExportResp>("/export", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Alternate export for explicit editor payload (kept for convenience)
  exportEditor: (payload: { editor: EditorDocOut; theme?: string | null }) =>
    requestWithMeta<ExportResp>("/export", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Schemas (optional)
  schema: {
    deck: () => request<Record<string, unknown>>("/schema/deck"),
    slide: () => request<Record<string, unknown>>("/schema/slide"),
  },

  // Layouts + editor build
  layouts: () => requestWithMeta<LayoutLibrary>("/layouts", { method: "GET" }),
  filterLayouts: (body: LayoutFilterRequest) =>
    requestWithMeta<{ candidates: string[] }>("/layouts/filter", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  buildEditor: (
    payload: {
      deck: Deck;
      selections: Array<{ slide_id: string; layout_id?: string }>;
      theme?: string;
      policy?: "best_fit" | "strict";
    },
    opts?: { idempotencyKey?: string }
  ) => {
    const headers: HeadersInit = {};
    if (opts?.idempotencyKey) (headers as any)["Idempotency-Key"] = opts.idempotencyKey;
    return requestWithMeta<EditorBuildResponse>("/editor/build", {
      method: "POST",
      headers,
      body: JSON.stringify({ theme: "default", policy: "best_fit", ...payload }),
    });
  },
};
