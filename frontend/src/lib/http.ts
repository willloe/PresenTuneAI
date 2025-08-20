import { ApiError } from "./errors";

export type HttpMeta = {
  requestId?: string | null;
  serverTiming?: string | null;
  url: string;
  status: number;
};

const API_BASE: string =
  (import.meta as any).env?.VITE_API_BASE ??
  ((import.meta as any).env?.DEV ? "http://localhost:8000/v1" : "/v1");

function join(base: string, path: string) {
  if (base.endsWith("/") && path.startsWith("/")) return base + path.slice(1);
  if (!base.endsWith("/") && !path.startsWith("/")) return base + "/" + path;
  return base + path;
}

function isJsonResponse(res: Response) {
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json");
}

async function parseErrorDetail(res: Response) {
  try {
    const clone = res.clone();
    if (isJsonResponse(clone)) {
      const j = await clone.json();
      return (j as any)?.detail ?? j;
    }
    return await clone.text();
  } catch {
    return undefined;
  }
}

/** Full response with meta (preferred for callers that need req id / timing). */
export async function requestWithMeta<T>(
  path: string,
  init: RequestInit = {}
): Promise<{ data: T; meta: HttpMeta }> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.method && init.method !== "GET") {
    headers.set("Content-Type", "application/json");
  }

  const url = join(API_BASE, path);
  const res = await fetch(url, { ...init, headers });

  const meta: HttpMeta = {
    requestId: res.headers.get("x-request-id"),
    status: res.status,
    url,
    serverTiming: res.headers.get("server-timing"),
  };

  if (!res.ok) {
    const detail = await parseErrorDetail(res);
    const message =
      (detail && typeof detail === "object" && (detail as any).message) ||
      `${res.status} ${res.statusText}${detail ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`;

    throw new ApiError(message, {
      status: res.status,
      url,
      requestId: meta.requestId,
      serverTiming: meta.serverTiming,
      detail,
    });
  }

  if (isJsonResponse(res)) {
    const data = (await res.json()) as T;
    return { data, meta };
  } else {
    const text = (await res.text()) as unknown as T;
    return { data: text, meta };
  }
}

/** Convenience wrapper when you only care about the JSON. */
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await requestWithMeta<T>(path, init);
  return data;
}
