import type { Deck } from "../types/deck";
import { request, requestWithMeta } from "./http";
export type { HttpMeta as ApiMeta } from "./http";
export { ApiError } from "./errors";

import type { ThemeMeta } from "../theme/meta";

/** Narrow Slide type from Deck for convenience */
export type Slide = Deck["slides"][number];

/** Keep a single source for the base (matches http.ts) */
const ENV = import.meta.env as { VITE_API_BASE?: string; DEV?: boolean };
export const API_BASE: string = ENV.VITE_API_BASE ?? (ENV.DEV ? "http://localhost:8000/v1" : "/v1");

/** Build a download URL from a server path or filename */
export function exportDownloadUrl(serverPath: string) {
  if (/^https?:\/\//i.test(serverPath)) return serverPath;
  const name = serverPath.split(/[\\/]/).pop()!;
  const base = String(API_BASE).replace(/\/$/, "");
  return `${base}/export/${encodeURIComponent(name)}`;
}

/* -------------------- small util -------------------- */
const qs = (params?: Record<string, any>) => {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.append(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
};

/** Pass-through options (kept optional everywhere) */
export type ApiRequestOpts = {
  signal?: AbortSignal;
  timeoutMs?: number;
  retries?: number;
  idempotencyKey?: string;
};

/* -------------------- Health -------------------- */
export type HealthResp = { status: string; schema_version?: string; time?: string };

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
  top_k?: number; // callers should pass >=1; server clamps
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
  /** serialized theme settings for the exporter (optional) */
  theme_meta?: ThemeMeta;
};

export type EditorBuildResponse = {
  editor: EditorDocOut;
  warnings: Array<Record<string, any>>;
  meta?: Record<string, any>;
};

/* -------------------- NEW: Batch layout recommendations -------------------- */
export type LayoutRecommendSlideSummary = {
  slide_id: string;
  title?: string;
  bullet_count: number;
  text_char_count: number;
  image_count: number;
};

export type LayoutRecommendation = {
  slide_id: string;
  selected_layout?: string | null;
  top_k?: string[];            // layout IDs, highest score first
  image_slots_needed?: number; // slots required by selected layout
  reasons?: string[];          // optional explainers
};

export type LayoutRecommendBatchResponse = {
  recommendations: LayoutRecommendation[];
};

/* -------------------- NEW: Images -------------------- */
export type ImageAsset = { url: string };

export type ImageGenRequest = {
  prompt: string;
  n?: number;
  size?: "1024x1024" | "1024x768" | "768x1024" | "512x512";
  style?: string;
  reference_image?: string | null;
  mask?: string | null;
};

export type ImageGenResponse = {
  assets: ImageAsset[];
  provider?: string | null;  // "pexels" | "openai" | "stub"
  model?: string | null;     // e.g. "gpt-image-1"
  used_query?: string | null;
};

/* -------------------- API client -------------------- */

export type LayoutsQuery = { page?: number; page_size?: number };

export const api = {
  // Health
  health: (opts?: ApiRequestOpts) =>
    request<HealthResp>("/health", { signal: opts?.signal, timeoutMs: opts?.timeoutMs, retries: opts?.retries }),
  healthWithMeta: (opts?: ApiRequestOpts) =>
    requestWithMeta<HealthResp>("/health", { signal: opts?.signal, timeoutMs: opts?.timeoutMs, retries: opts?.retries }),

  // Outline
  outline: (body: { topic?: string; text?: string; slide_count?: number }, opts?: ApiRequestOpts) =>
    request<Deck>("/outline", {
      method: "POST",
      body: JSON.stringify(body),
      signal: opts?.signal,
      timeoutMs: opts?.timeoutMs,
      retries: opts?.retries,
    }),
  outlineWithMeta: (body: { topic?: string; text?: string; slide_count?: number }, opts?: ApiRequestOpts) =>
    requestWithMeta<Deck>("/outline", {
      method: "POST",
      body: JSON.stringify(body),
      signal: opts?.signal,
      timeoutMs: opts?.timeoutMs,
      retries: opts?.retries,
    }),

  // Regenerate a specific slide
  regenerateSlide: (index: number, body: { topic?: string; text?: string; slide_count?: number }, opts?: ApiRequestOpts) =>
    request<Slide>(`/outline/${index}/regenerate`, {
      method: "POST",
      body: JSON.stringify(body),
      signal: opts?.signal,
      timeoutMs: opts?.timeoutMs,
      retries: opts?.retries,
    }),
  regenerateSlideWithMeta: (index: number, body: { topic?: string; text?: string; slide_count?: number }, opts?: ApiRequestOpts) =>
    requestWithMeta<Slide>(`/outline/${index}/regenerate`, {
      method: "POST",
      body: JSON.stringify(body),
      signal: opts?.signal,
      timeoutMs: opts?.timeoutMs,
      retries: opts?.retries,
    }),

  /* -------------------- Export (new schema) -------------------- */
  exportDeck: (
    payload: {
      slides?: Deck["slides"];
      editor?: EditorDocOut;
      theme?: string | null;
      theme_meta?: ThemeMeta; // allow tokens even for slides-only export
    },
    opts?: ApiRequestOpts
  ) =>
    requestWithMeta<ExportResp>("/export", {
      method: "POST",
      body: JSON.stringify(payload),
      signal: opts?.signal,
      timeoutMs: opts?.timeoutMs,
      retries: opts?.retries,
    }),

  // Allow theme_meta
  exportEditor: (
    payload: {
      editor: EditorDocOut;
      theme?: string | null;
      theme_meta?: ThemeMeta;
    },
    opts?: ApiRequestOpts
  ) =>
    requestWithMeta<ExportResp>("/export", {
      method: "POST",
      body: JSON.stringify(payload),
      signal: opts?.signal,
      timeoutMs: opts?.timeoutMs,
      retries: opts?.retries,
    }),

  // Schemas (optional)
  schema: {
    deck: (opts?: ApiRequestOpts) =>
      request<Record<string, unknown>>("/schema/deck", {
        method: "GET",
        signal: opts?.signal,
        timeoutMs: opts?.timeoutMs,
        retries: opts?.retries,
      }),
    slide: (opts?: ApiRequestOpts) =>
      request<Record<string, unknown>>("/schema/slide", {
        method: "GET",
        signal: opts?.signal,
        timeoutMs: opts?.timeoutMs,
        retries: opts?.retries,
      }),
  },

  // Layouts + editor build
  layouts: (params?: LayoutsQuery, opts?: ApiRequestOpts) =>
    requestWithMeta<LayoutLibrary>(`/layouts${qs(params)}`, {
      method: "GET",
      signal: opts?.signal,
      timeoutMs: opts?.timeoutMs,
      retries: opts?.retries,
    }),

  filterLayouts: (body: LayoutFilterRequest, opts?: ApiRequestOpts) =>
    requestWithMeta<{ candidates: string[] }>("/layouts/filter", {
      method: "POST",
      body: JSON.stringify(body),
      signal: opts?.signal,
      timeoutMs: opts?.timeoutMs,
      retries: opts?.retries,
    }),

  // NEW: batch recommend (Top-K + image slot needs)
  recommendLayoutsBatch: (payload: { slides: LayoutRecommendSlideSummary[]; top_k?: number }, opts?: ApiRequestOpts) =>
    requestWithMeta<LayoutRecommendBatchResponse>("/layouts/recommend", {
      method: "POST",
      body: JSON.stringify(payload),
      signal: opts?.signal,
      timeoutMs: opts?.timeoutMs,
      retries: opts?.retries,
    }),

  // Allow theme_meta in builder so doc carries tokens
  buildEditor: (
    payload: {
      deck: Deck;
      selections: Array<{ slide_id: string; layout_id?: string }>;
      theme?: string;
      policy?: "best_fit" | "strict";
      theme_meta?: ThemeMeta;
    },
    opts?: ApiRequestOpts
  ) => {
    const headers: HeadersInit = {};
    if (opts?.idempotencyKey) (headers as any)["Idempotency-Key"] = opts.idempotencyKey;
    return requestWithMeta<EditorBuildResponse>("/editor/build", {
      method: "POST",
      headers,
      body: JSON.stringify({
        theme: payload.theme ? payload.theme : "default",
        policy: payload.policy ? payload.policy : "best_fit",
        ...payload,
      }),
      signal: opts?.signal,
      timeoutMs: opts?.timeoutMs,
      retries: opts?.retries,
    });
  },

  // Images
  generateImages: (payload: ImageGenRequest, opts?: ApiRequestOpts) => {
    const headers: HeadersInit = {};
    if (opts?.idempotencyKey) (headers as any)["Idempotency-Key"] = opts.idempotencyKey;
    return requestWithMeta<ImageGenResponse>("/images/generate", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: opts?.signal,
      timeoutMs: opts?.timeoutMs,
      retries: opts?.retries,
    });
  },

  imageProvider: (opts?: ApiRequestOpts) =>
    requestWithMeta<{ provider: string; model?: string }>("/images/provider", {
      method: "GET",
      signal: opts?.signal,
      timeoutMs: opts?.timeoutMs,
      retries: opts?.retries,
    }),
};
