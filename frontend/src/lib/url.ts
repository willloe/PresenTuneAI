import { API_BASE } from "./api";

/** Returns a fully-qualifed URL for images, preserving absolute/data URLs. */
export function ensureWebUrl(u?: string | null): string | undefined {
  if (!u) return undefined;
  if (/^(?:https?:|data:)/i.test(u)) return u;      // already absolute or data:
  const base = String(API_BASE || "").replace(/\/$/, "");
  const path = String(u).replace(/^\/+/, "");
  return `${base}/${path}`;
}
