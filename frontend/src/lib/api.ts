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
    this.meta = meta;
  }
}

/** Safe join for base + path (protects against trailing/leading slashes) */
function join(base: string, path: string) {
  if (base.endsWith("/") && path.startsWith("/")) return base + path.slice(1);
  if (!base.endsWith("/") && !path.startsWith("/")) return base + "/" + path;
  return base + path;
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

  const data = (await res.json()) as T;
  return { data, meta };
}

async function request<T>(path: string, init: RequestInit = {}) {
  const { data } = await requestWithMeta<T>(path, init);
  return data;
}

/** Shared API response types you can import in App.tsx if desired */
export type HealthResp = { status: string; schema_version?: string; time?: string };
export type ExportResp = { path: string; format: string; theme?: string | null; bytes: number };

export const api = {
  // ─────────────────────────── Health ───────────────────────────
  health: () => request<HealthResp>("/health"),
  healthWithMeta: () => requestWithMeta<HealthResp>("/health"),

  // ─────────────────────────── Outline ──────────────────────────
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

  // ─────────────────────────── Export ───────────────────────────
  exportDeck: (payload: { slides: Deck["slides"]; theme?: string | null }) =>
    requestWithMeta<ExportResp>("/export", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // ─────────────────────────── Schemas ──────────────────────────
  schema: {
    deck: () => request<Record<string, unknown>>("/schema/deck"),
    slide: () => request<Record<string, unknown>>("/schema/slide"),
  },
};
