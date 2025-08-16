// frontend/src/lib/api.ts
import type { Deck } from "../types/deck";

/** Narrow Slide type from Deck for convenience */
export type Slide = Deck["slides"][number];

export const API_BASE =
  (import.meta.env.VITE_API_BASE as string) ??
  (import.meta.env.DEV ? "http://localhost:8000/v1" : "/v1");

export type ApiMeta = {
  requestId?: string;
  status: number;
  url: string;
  serverTiming?: string | null;
};

export class ApiError extends Error {
  meta: ApiMeta;
  constructor(message: string, meta: ApiMeta) {
    super(message);
    this.name = "ApiError";
    this.meta = meta;
  }
}

/** Safe join for base + path (protects against trailing/leading slashes) */
function join(base: string, path: string) {
  if (base.endsWith("/") && path.startsWith("/")) return base + path.slice(1);
  if (!base.endsWith("/") && !path.startsWith("/")) return base + "/" + path;
  return base + path;
}

/** Turn the server's absolute file path into a GET /export/{filename} URL */
export function exportDownloadUrl(serverPath: string) {
  // Works for Unix/Windows paths
  const name = serverPath.split(/[\\/]/).pop()!;
  return join(API_BASE, `/export/${encodeURIComponent(name)}`);
}

async function requestWithMeta<T>(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.method && init.method !== "GET") {
    headers.set("Content-Type", "application/json");
  }

  const url = join(API_BASE, path);
  const res = await fetch(url, { ...init, headers });

  const meta: ApiMeta = {
    requestId: res.headers.get("x-request-id") ?? undefined,
    status: res.status,
    url,
    serverTiming: res.headers.get("server-timing"),
  };

  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.clone().json();
      detail = (j?.detail as string) ?? JSON.stringify(j);
    } catch {
      try {
        detail = await res.text();
      } catch {
        detail = "";
      }
    }
    throw new ApiError(
      `${res.status} ${res.statusText}${detail ? ` — ${detail}` : ""}`,
      meta
    );
  }

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const data = (await res.json()) as T;
    return { data, meta };
  } else {
    const text = (await res.text()) as unknown as T;
    return { data: text, meta };
  }
}

async function request<T>(path: string, init: RequestInit = {}) {
  const { data } = await requestWithMeta<T>(path, init);
  return data;
}

export type HealthResp = {
  status: string;
  schema_version?: string;
  time?: string;
};

export type ExportResp = {
  path: string;
  format: "pptx" | "txt";
  theme?: string | null;
  bytes: number;
};

/* -------------------- Layout / Editor types -------------------- */

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

export const exportEditor = (payload: { editor: EditorDocOut; theme?: string | null }) =>
  requestWithMeta<ExportResp>("/export", {
    method: "POST",
    body: JSON.stringify(payload),
  });

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
  // Enforce "either slides or editor" at the type level
  exportDeck: (payload: { slides?: Deck["slides"]; editor?: EditorDocOut; theme?: string | null }) =>
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
