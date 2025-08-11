export const API_BASE =
  (import.meta.env.VITE_API_BASE as string) ?? "http://localhost:8000/v1";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.method && init.method !== "GET") {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<{ status: string }>("/health"),
  outline: (body: { topic?: string; text?: string; slide_count?: number }) =>
    request<{ slides: { title: string; bullets: string[] }[] }>("/outline", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
