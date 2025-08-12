import type { Deck } from "../types/deck";

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

async function requestWithMeta<T>(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.method && init.method !== "GET") {
    headers.set("Content-Type", "application/json");
  }

  const url = `${API_BASE}${path}`;
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
      detail = await res.text();
    }
    throw new ApiError(`${res.status} ${res.statusText}${detail ? ` — ${detail}` : ""}`, meta);
  }

  const data = (await res.json()) as T;
  return { data, meta };
}

async function request<T>(path: string, init: RequestInit = {}) {
  const { data } = await requestWithMeta<T>(path, init);
  return data;
}

type ExportResp = { path: string; format: string; theme?: string | null; bytes: number };

export const api = {
  // Health
  health: () => request<{ status: string; schema_version?: string; time?: string }>("/health"),
  healthWithMeta: () => requestWithMeta<{ status: string; schema_version?: string; time?: string }>("/health"),

  // Outline
  outline: (body: { topic?: string; text?: string; slide_count?: number }) =>
    request<Deck>("/outline", { method: "POST", body: JSON.stringify(body) }),
  outlineWithMeta: (body: { topic?: string; text?: string; slide_count?: number }) =>
    requestWithMeta<Deck>("/outline", { method: "POST", body: JSON.stringify(body) }),

  // Export
  exportDeck: (payload: { slides: Deck["slides"]; theme?: string | null }) =>
    requestWithMeta<ExportResp>("/export", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Schemas
  schema: {
    deck: () => request<Record<string, unknown>>("/schema/deck"),
    slide: () => request<Record<string, unknown>>("/schema/slide"),
  },
};
