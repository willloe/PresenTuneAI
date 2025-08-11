// frontend/src/lib/api.ts
import type { Deck } from "../types/deck";

export const API_BASE =
  (import.meta.env.VITE_API_BASE as string) ?? "http://localhost:8000/v1";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);

  // Set JSON content-type for non-GET if not provided
  if (!headers.has("Content-Type") && init.method && init.method !== "GET") {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  // Nice error surface: try to include body text/detail
  if (!res.ok) {
    let detail = "";
    try {
      const maybeJson = await res.clone().json();
      detail = (maybeJson?.detail as string) ?? JSON.stringify(maybeJson);
    } catch {
      detail = await res.text();
    }
    throw new Error(`${res.status} ${res.statusText}${detail ? ` — ${detail}` : ""}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  // Health
  health: () => request<{ status: string }>("/health"),

  outline: (body: { topic?: string; text?: string; slide_count?: number }) =>
    request<Deck>("/outline", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  schema: {
    deck: () => request<Record<string, unknown>>("/schema/deck"),
    slide: () => request<Record<string, unknown>>("/schema/slide"),
  },
};
