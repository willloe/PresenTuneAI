import type { Deck } from "../types/deck";

export const API_BASE =
  (import.meta.env.VITE_API_BASE as string) ?? "http://localhost:8000/v1";

export type ApiMeta = {
  requestId?: string;
  status: number;
  url: string;
};

export class ApiError extends Error {
  meta: ApiMeta;
  constructor(message: string, meta: ApiMeta) {
    super(message);
    this.meta = meta;
  }
}

async function requestWithMeta<T>(path: string, init: RequestInit = {}): Promise<{ data: T; meta: ApiMeta }> {
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
  };

  // On error, try to include any backend detail & the request id
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

// Backwards-compatible helpers (no meta)
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await requestWithMeta<T>(path, init);
  return data;
}

export const api = {
  // Health
  health: () => request<{ status: string }>("/health"),
  healthWithMeta: () => requestWithMeta<{ status: string }>("/health"),

  outline: (body: { topic?: string; text?: string; slide_count?: number }) =>
    request<Deck>("/outline", { method: "POST", body: JSON.stringify(body) }),

  outlineWithMeta: (body: { topic?: string; text?: string; slide_count?: number }) =>
    requestWithMeta<Deck>("/outline", { method: "POST", body: JSON.stringify(body) }),

  // Live JSON Schemas (handy for demo)
  schema: {
    deck: () => request<Record<string, unknown>>("/schema/deck"),
    slide: () => request<Record<string, unknown>>("/schema/slide"),
  },
};
