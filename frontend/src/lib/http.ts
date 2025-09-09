import { ApiError } from "./errors";

export type HttpMeta = {
  requestId?: string | null;
  serverTiming?: string | null;
  url: string;
  status: number;
};

type Env = { VITE_API_BASE?: string; DEV?: boolean };
const ENV = import.meta.env as unknown as Env;

const API_BASE: string = ENV.VITE_API_BASE ?? (ENV.DEV ? "http://localhost:8000/v1" : "/v1");

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

type ExtraInit = RequestInit & {
  /** Abort controller signal */
  signal?: AbortSignal;
  /** Add a client-side timeout */
  timeoutMs?: number;
  /** Retries on 429/503/504 (default 2) */
  retries?: number;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const n = Number(header);
  if (!Number.isNaN(n)) return Math.max(0, n) * 1000;
  const d = Date.parse(header);
  return Number.isNaN(d) ? null : Math.max(0, d - Date.now());
}

/** Full response with meta (preferred for callers that need req id / timing). */
export async function requestWithMeta<T>(
  path: string,
  init: ExtraInit = {}
): Promise<{ data: T; meta: HttpMeta }> {
  const url = join(API_BASE, path);
  const retries = init.retries ?? 2;

  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.method && init.method !== "GET") {
    headers.set("Content-Type", "application/json");
  }

  let attempt = 0;
  let lastErr: unknown;

  while (attempt <= retries) {
    const controller = new AbortController();
    const timeout =
      typeof init.timeoutMs === "number" && init.timeoutMs > 0
        ? window.setTimeout(() => controller.abort(), init.timeoutMs)
        : null;

    try {
      const res = await fetch(url, {
        ...init,
        headers,
        signal: init.signal ?? controller.signal,
      });

      const meta: HttpMeta = {
        requestId: res.headers.get("x-request-id"),
        status: res.status,
        url,
        serverTiming: res.headers.get("server-timing"),
      };

      if (!res.ok) {
        // Retry on 429/503/504
        if ([429, 503, 504].includes(res.status) && attempt < retries) {
          const ra = parseRetryAfter(res.headers.get("retry-after"));
          const backoff = ra ?? Math.min(2000 * Math.pow(2, attempt), 8000);
          attempt += 1;
          if (timeout) clearTimeout(timeout);
          await sleep(backoff);
          continue;
        }

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
        if (timeout) clearTimeout(timeout);
        return { data, meta };
      } else {
        const text = (await res.text()) as unknown as T;
        if (timeout) clearTimeout(timeout);
        return { data: text, meta };
      }
    } catch (err: any) {
      lastErr = err;
      // Network/aborted: retry if budget remains
      if (attempt < retries && (err?.name === "AbortError" || err?.message?.includes("Network"))) {
        attempt += 1;
        const backoff = Math.min(300 * Math.pow(2, attempt), 1500);
        if (timeout) clearTimeout(timeout);
        await sleep(backoff);
        continue;
      }

      if (err instanceof ApiError) throw err;
      // Uniform network error
      throw new ApiError(err?.message || "Network request failed", {
        status: 0,
        url,
        requestId: null,
        serverTiming: null,
        detail: { kind: "network", error: String(err) },
      });
    }
  }

  // Shouldn’t reach here, but in case:
  throw lastErr instanceof Error ? lastErr : new Error("Request failed");
}

/** Convenience wrapper when you only care about the JSON. */
export async function request<T>(path: string, init: ExtraInit = {}): Promise<T> {
  const { data } = await requestWithMeta<T>(path, init);
  return data;
}
